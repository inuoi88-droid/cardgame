/**
 * ダメージ・回復・破壊・状態異常。
 * ダメージの計算順（決定事項 #30）：基本値（＋筋力・気合）→ 弱体 → 脆弱 → 守備力 → 最低1 → 出血 → 無効化 → シールド → HP
 */
import { BALANCE } from '../balance.ts';
import type { KeywordDef } from '../define.ts';
import { getKeyword } from '../registry.ts';
import {
  cardName,
  checkGameEnd,
  findMonster,
  log,
  monsterLabel,
  playRecord,
  sourceOfMonster,
  statusOf,
  targetExists,
  targetLabel,
  isEnded,
} from './core.ts';
import { enqueueCardTiming } from './triggers.ts';
import type { DamageKind, GameState, Monster, PlayerId, StatusKey, TargetRef } from './types.ts';

export type { DamageKind } from './types.ts';

const B = BALANCE.battle;

export interface DamageOpts {
  kind: DamageKind;
  /** 出どころ（弱体の判定、反撃の返し先、「ダメージを受けたとき」の相手） */
  source: TargetRef | null;
  /** 出どころが弱体か。出どころが場からいなくなっていても判定できるように、呼び出し側が先に調べて渡せる */
  sourceWeak?: boolean;
  /** 基本値への加算（筋力・気合） */
  bonus?: number;
  /** 防御無視（守備力とシールドを無視） */
  pierce?: boolean;
  /** カード1回の使用の記録のキー。出血・反撃（状態）は同じ記録の同じ対象には1回しか働かない（決定事項 #70 R4） */
  playKey?: string;
  /** ログの前置き（「◯◯の反撃：」など） */
  prefix?: string;
  depth: number;
}

export interface DamageResult {
  /** 実際に減ったHP・体力 */
  hpLost: number;
  /** モンスターを倒して余ったダメージ */
  overflow: number;
  destroyed: boolean;
}

/** 攻撃・ダメージ効果・モンスターの反撃：弱体・脆弱・守備力・最低1・出血が働く */
const isHitKind = (k: DamageKind) => k === 'attack' || k === 'hit' || k === 'retaliate';
const detailOf = (base: number, steps: string[]) => (steps.length ? `（基本${base} → ${steps.join(' → ')}）` : '');
const isDot = (k: DamageKind) => k === 'poison' || k === 'burn';
const targetKey = (t: TargetRef) => (t.kind === 'player' ? `p${t.player}` : t.uid);

/** 同じカードの使用で、この対象にもう働いたか（記録して true/false を返す。記録のキーがなければ毎回働く） */
function onceFor(g: GameState, playKey: string | undefined, field: 'bleedHit' | 'counterHit', target: TargetRef): boolean {
  if (!playKey) return true;
  const rec = playRecord(g, playKey);
  const list = (rec[field] ??= []);
  const key = targetKey(target);
  if (list.includes(key)) return false;
  list.push(key);
  return true;
}

export function keywordFlags(g: GameState, m: Monster): KeywordDef['battle'] {
  const flags: KeywordDef['battle'] = {};
  if (m.sealed) return flags;
  const def = g.cards[m.card.cardId];
  for (const k of def?.keywords ?? []) {
    const kd = getKeyword(k.id);
    if (kd) Object.assign(flags, kd.battle);
  }
  return flags;
}

/**
 * 選べる挑発モンスター（隠密は数えない）。相手のモンスターの攻撃と、カードの「選んだ1体」は、
 * これが1体でもいる間はこの中からしか選べない（決定事項 #83）
 */
export function targetableTaunts(g: GameState, owner: PlayerId): Monster[] {
  return g.players[owner].board.filter((m) => !m.stealth && keywordFlags(g, m).taunt);
}

const KIND_LABEL: Partial<Record<DamageKind, string>> = { poison: '毒で', burn: 'やけどで', counter: '反撃で' };

export function dealDamage(g: GameState, target: TargetRef, base: number, opts: DamageOpts): DamageResult {
  const none: DamageResult = { hpLost: 0, overflow: 0, destroyed: false };
  if (isEnded(g) || !targetExists(g, target)) return none;
  const status = statusOf(g, target)!;
  const monster = target.kind === 'monster' ? findMonster(g, target.uid) : undefined;
  /** 基本値からの変化（ログ用） */
  const steps: string[] = [];
  let amount = Math.max(0, base);
  const hit = isHitKind(opts.kind);
  const mitigated = hit || opts.kind === 'counter';
  const sourceWeak = opts.sourceWeak ?? (opts.source ? (statusOf(g, opts.source)?.weak ?? 0) > 0 : false);

  if (hit && opts.bonus) {
    amount += opts.bonus;
    steps.push(`筋力・気合+${opts.bonus}で${amount}`);
  }
  if (hit && sourceWeak) {
    amount = Math.floor(amount * (1 - B.weakRate));
    steps.push(`弱体で${amount}`);
  }
  if (hit && status.vulnerable > 0) {
    amount = Math.floor(amount * (1 + B.vulnerableRate));
    steps.push(`脆弱で${amount}`);
  }
  if (monster && !opts.pierce && mitigated && monster.defense > 0) {
    amount -= monster.defense;
    steps.push(`守備力−${monster.defense}で${amount}`);
  }
  if (mitigated && base > 0 && amount < B.minMonsterDamage) {
    amount = B.minMonsterDamage;
    steps.push(`最低${amount}`);
  }
  // 出血：1枚のカード（1回の攻撃）につき1回だけ（決定事項 #70 R4）
  if (hit && status.bleed > 0 && onceFor(g, opts.playKey, 'bleedHit', target)) {
    amount += status.bleed;
    steps.push(`出血+${status.bleed}で${amount}`);
  }
  if (opts.pierce) steps.push('防御無視');

  const prefix = opts.prefix ?? '';
  const kindLabel = KIND_LABEL[opts.kind] ?? '';
  const ev = (amount: number) => ({
    kind: opts.kind === 'retaliate' ? ('retaliate' as const) : ('damage' as const),
    target,
    ...(opts.source ? { source: opts.source } : {}),
    amount,
    damageKind: opts.kind,
  });

  let shieldUsed = 0;
  if (target.kind === 'player') {
    const ps = g.players[target.player];
    if (!isDot(opts.kind) && ps.status.nullify > 0 && amount > 0) {
      ps.status.nullify -= 1;
      steps.push('無効化で0');
      amount = 0;
    }
    if (!isDot(opts.kind) && !opts.pierce && ps.shield > 0 && amount > 0) {
      shieldUsed = Math.min(ps.shield, amount);
      ps.shield -= shieldUsed;
      steps.push(`シールドが${shieldUsed}を防いだ`);
    }
    const dmg = amount - shieldUsed;
    const before = ps.hp;
    ps.hp = Math.max(0, ps.hp - dmg);
    log(
      g,
      opts.depth,
      `${prefix}${ps.name}に${kindLabel}${amount}ダメージ${detailOf(base, steps)}：HP ${before}→${ps.hp}`,
      'damage',
      undefined,
      ev(amount),
    );
    const result: DamageResult = { hpLost: before - ps.hp, overflow: 0, destroyed: false };
    if (checkGameEnd(g)) return result;
    // 反撃（状態）：攻撃を受けたら、攻撃してきた相手に返す。1枚のカード（1回の攻撃）につき1回
    if (hit && ps.status.counter > 0 && opts.source && targetExists(g, opts.source) && onceFor(g, opts.playKey, 'counterHit', target)) {
      dealDamage(g, opts.source, ps.status.counter, {
        kind: 'counter',
        source: { kind: 'player', player: target.player },
        depth: opts.depth + 1,
      });
    }
    return result;
  }

  // モンスター
  const m = monster!;
  const before = m.hp;
  const label = monsterLabel(g, m);
  const detail = detailOf(base, steps);
  if (before - amount <= 0) {
    if (keywordFlags(g, m).undying && !m.undyingUsed) {
      m.undyingUsed = true;
      m.hp = Math.min(before, BALANCE.battle.undyingHp);
      log(g, opts.depth, `${prefix}${label}に${kindLabel}${amount}ダメージ${detail}：不屈で体力${m.hp}で踏みとどまった`, 'damage', undefined, ev(amount));
      return { hpLost: before - m.hp, overflow: 0, destroyed: false };
    }
    m.hp = 0;
    log(g, opts.depth, `${prefix}${label}に${kindLabel}${amount}ダメージ${detail}：体力 ${before}→0`, 'damage', undefined, ev(amount));
    destroyMonster(g, m, opts.depth + 1);
    return { hpLost: before, overflow: amount - before, destroyed: true };
  }
  m.hp = before - amount;
  log(g, opts.depth, `${prefix}${label}に${kindLabel}${amount}ダメージ${detail}：体力 ${before}→${m.hp}`, 'damage', undefined, ev(amount));
  // ダメージを受けたとき（生き残ったときだけ。毒・やけどでは発動しない：決定事項 #70 R5）
  if (amount > 0 && !m.sealed && !isDot(opts.kind)) {
    const def = g.cards[m.card.cardId];
    const enemy = opts.source && targetExists(g, opts.source) ? opts.source : undefined;
    if (def) enqueueCardTiming(g, sourceOfMonster(g, m), def, 'damaged', enemy ? { enemy } : {}, opts.depth + 1, {});
  }
  return { hpLost: amount, overflow: 0, destroyed: false };
}

/** モンスターを破壊する（不屈は効かない）。カードは元の持ち主の捨て札へ（残らないコピーは除外） */
export function destroyMonster(g: GameState, m: Monster, depth: number): void {
  const board = g.players[m.controller].board;
  const i = board.findIndex((x) => x.uid === m.uid);
  if (i < 0) return;
  board.splice(i, 1);
  const owner = g.players[m.card.owner];
  if (m.card.copy === 'temp') owner.exile.push(m.card);
  else owner.discard.push(m.card);
  log(g, depth, `${g.players[m.controller].name}の「${cardName(g, m.card.cardId)}」が破壊された`, 'effect', undefined, {
    kind: 'destroy',
    player: m.controller,
    cardId: m.card.cardId,
    uid: m.uid,
  });
  if (!m.sealed) {
    const def = g.cards[m.card.cardId];
    if (def) enqueueCardTiming(g, sourceOfMonster(g, m), def, 'destroyed', {}, depth + 1, {});
  }
}

export function heal(g: GameState, target: TargetRef, amount: number, depth: number): number {
  if (isEnded(g) || !targetExists(g, target) || amount <= 0) return 0;
  const status = statusOf(g, target)!;
  let n = amount;
  let note = '';
  if (status.burn > 0) {
    n = Math.floor(amount * B.burnHealRate);
    note = `（やけどで${amount}→${n}）`;
  }
  if (target.kind === 'player') {
    const ps = g.players[target.player];
    const before = ps.hp;
    ps.hp = Math.min(ps.maxHp, ps.hp + n);
    log(g, depth, `${ps.name}のHPが${n}回復${note}：HP ${before}→${ps.hp}`, 'effect', undefined, { kind: 'heal', target, amount: ps.hp - before });
    return ps.hp - before;
  }
  const m = findMonster(g, target.uid)!;
  const before = m.hp;
  m.hp = Math.min(m.maxHp, m.hp + n);
  log(g, depth, `${monsterLabel(g, m)}の体力が${n}回復${note}：体力 ${before}→${m.hp}`, 'effect', undefined, { kind: 'heal', target, amount: m.hp - before });
  return m.hp - before;
}

const STATUS_LABEL: Record<StatusKey, string> = {
  poison: '毒',
  burn: 'やけど',
  weak: '弱体',
  vulnerable: '脆弱',
  bleed: '出血',
  freeze: '凍結',
  confuse: '混乱',
  counter: '反撃',
  nullify: '無効化',
  regen: '再生',
  strength: '筋力',
  focus: '気合',
};

/** プレイヤーにしか付かない状態 */
const PLAYER_ONLY: ReadonlySet<StatusKey> = new Set(['counter', 'nullify', 'regen', 'strength', 'focus']);

export function addStatus(g: GameState, target: TargetRef, key: StatusKey, amount: number, depth: number): void {
  if (isEnded(g) || !targetExists(g, target)) return;
  if (target.kind === 'monster' && PLAYER_ONLY.has(key)) return;
  if (target.kind === 'player' && key === 'confuse') return;
  const s = statusOf(g, target)!;
  const name = targetLabel(g, target);
  const ev = (n: number) => ({ kind: 'status' as const, target, status: key, amount: n });
  switch (key) {
    case 'freeze':
      s.freezePending = true;
      log(g, depth, `${name}を凍結させた（次のターンに発効）`, 'effect', undefined, ev(1));
      return;
    case 'confuse':
      s.confusePending = true;
      log(g, depth, `${name}を混乱させた（次の持ち主のターンに発効）`, 'effect', undefined, ev(1));
      return;
    case 'burn':
    case 'weak':
    case 'vulnerable':
      s[key] += amount;
      log(g, depth, `${name}に${STATUS_LABEL[key]}（${amount}ターン）：残り${s[key]}ターン`, 'effect', undefined, ev(amount));
      return;
    case 'strength': {
      // 筋力の合計には上限がある（決定事項 #70 R9）
      const gained = Math.max(0, Math.min(amount, B.strengthCap - s.strength));
      s.strength += gained;
      const capNote = gained < amount ? `（上限${B.strengthCap}）` : '';
      log(g, depth, `${name}に筋力${gained}${capNote}：合計${s.strength}`, 'effect', undefined, ev(gained));
      return;
    }
    default:
      s[key] += amount;
      log(g, depth, `${name}に${STATUS_LABEL[key]}${amount}：合計${s[key]}`, 'effect', undefined, ev(amount));
  }
}

/** 浄化：状態異常をすべて解除。protect の分の毒・やけどは残す（同じカードのデメリットで付いたもの） */
export function cleanse(g: GameState, p: PlayerId, protect: { poison: number; burn: number } | undefined, depth: number): void {
  const s = g.players[p].status;
  s.poison = Math.min(s.poison, protect?.poison ?? 0);
  s.burn = Math.min(s.burn, protect?.burn ?? 0);
  s.weak = 0;
  s.vulnerable = 0;
  s.bleed = 0;
  s.freezePending = false;
  s.freezeActive = false;
  g.players[p].turn.freezeTax = false;
  const kept = s.poison + s.burn > 0 ? '（このカードのデメリットで付いた分は残る）' : '';
  log(g, depth, `${g.players[p].name}の状態異常をすべて解除した${kept}`);
}
