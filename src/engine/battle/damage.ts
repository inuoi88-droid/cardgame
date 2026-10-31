/**
 * ダメージ・回復・破壊・状態異常。
 * ダメージの計算順（決定事項 #30・#138）：基本値（＋筋力・気合）→ やけど（×burnDamageRate）→ 脱力（1発の上限）→ 脆弱 → 守備力 → 最低1 → 出血 → 無効化 → シールド → HP。
 * やけど・脱力は出どころの状態で決まる：戦闘のダメージ（攻撃・反撃・格闘）はモンスター自身、効果のダメージは持ち主のプレイヤー
 */
import { BALANCE } from '../balance.ts';
import type { KeywordDef } from '../define.ts';
import { getEffect, getKeyword } from '../registry.ts';
import {
  cardKeywords,
  cardName,
  checkGameEnd,
  effectiveDefense,
  findMonster,
  log,
  monsterDormant,
  monsterLabel,
  newUid,
  playerRef,
  playRecord,
  sourceOfMonster,
  statusOf,
  targetExists,
  targetLabel,
  isEnded,
  other,
  spiritVeiled,
  traitTribe,
  tribeSetActive,
  turnLimits,
} from './core.ts';
import { allowMonsterRepeat, enqueueCardTiming, enqueueMonsters, enqueuePowers } from './triggers.ts';
import { chargePowers } from './powers.ts';
import { drawCards, unmask } from './zones.ts';
import { TRIBE_SETS, TRIBE_TRAITS } from '../tribes.ts';
import { TRIBE_LABEL, type EffectInstance } from '../types.ts';
import type { DamageKind, GameState, LogEvent, Monster, PlayerId, PlayRecord, StatusKey, TargetRef } from './types.ts';

export type { DamageKind } from './types.ts';

const B = BALANCE.battle;

export interface DamageOpts {
  kind: DamageKind;
  /** 出どころ（やけど・脱力の判定、反撃の返し先、「ダメージを受けたとき」の相手） */
  source: TargetRef | null;
  /** 出どころのやけど・脱力。出どころが場からいなくなっていても判定できるように、呼び出し側が先に調べて渡せる（反撃・格闘） */
  outgoing?: Outgoing;
  /** 基本値への加算（筋力・気合） */
  bonus?: number;
  /** 防御無視（守備力とシールドを無視） */
  pierce?: boolean;
  /** カード1回の使用の記録のキー。出血・反撃（状態）は同じ記録の同じ対象には1回しか働かない（決定事項 #70 R4） */
  playKey?: string;
  /** ログの前置き（「◯◯の反撃：」など） */
  prefix?: string;
  /** 格闘のダメージ（接死・絆魂が働く。MTG 要素バッチ2） */
  combat?: boolean;
  /** 萎縮（MTG 要素 △ バッチA）：モンスターが減らした体力のぶん、最大体力も減る */
  wither?: boolean;
  /**
   * 出どころのモンスターの接死・絆魂と持ち主。出どころが先に場を離れることがある反撃・格闘では、呼び出し側が先に調べて渡す。
   * 省略すると、出どころのモンスターが場にいればそこから読む
   */
  combatSource?: CombatSource | null;
  depth: number;
}

/** 戦闘（攻撃・反撃・貫通・格闘）のダメージで働く、出どころのモンスターのキーワード */
export interface CombatSource {
  deathtouch: boolean;
  lifelink: boolean;
  controller: PlayerId;
}

export interface DamageResult {
  /** 実際に減ったHP・体力 */
  hpLost: number;
  /** モンスターを倒して余ったダメージ */
  overflow: number;
  destroyed: boolean;
}

/** 出どころの与えるダメージの補正（決定事項 #138） */
export interface Outgoing {
  /** やけど：×burnDamageRate（切り捨て） */
  burn: boolean;
  /** 脱力：1発の上限 */
  exhaust: boolean;
}

/**
 * 出どころのやけど・脱力（決定事項 #138）。戦闘のダメージ（攻撃・反撃・格闘・同士討ち）はそのモンスター自身の状態、
 * 効果のダメージはカードの持ち主のプレイヤーの状態（モンスターの召喚時などの効果も、持ち主のプレイヤーで決まる）
 */
export function outgoingOf(g: GameState, source: TargetRef | null, combat: boolean): Outgoing {
  if (!source) return { burn: false, exhaust: false };
  let ref: TargetRef = source;
  if (source.kind === 'monster' && !combat) {
    const m = findMonster(g, source.uid);
    if (!m) return { burn: false, exhaust: false };
    ref = playerRef(m.controller);
  }
  const s = statusOf(g, ref);
  return { burn: (s?.burn ?? 0) > 0, exhaust: (s?.weak ?? 0) > 0 };
}

/**
 * 脱力（決定事項 #138）：プレイヤーがダメージを与える効果を使う（カードを使う・起動する）ときに1つ減らし、
 * その使用の記録（PlayRecord.exhaust）に印を付ける（そのカードの効果のダメージには、減ったあとも最後まで上限が効く）。減らしたら true
 */
export function spendExhaust(g: GameState, p: PlayerId, rec: PlayRecord, effects: readonly EffectInstance[], depth: number): boolean {
  const ps = g.players[p];
  if (ps.status.weak <= 0 || !effects.some((e) => getEffect(e.id)?.isDamage)) return false;
  rec.exhaust = true;
  ps.status.weak -= 1;
  log(g, depth, `脱力：${ps.name}の脱力が1つ減った（残り${ps.status.weak}）`, 'info');
  return true;
}

/** 攻撃・ダメージ効果・モンスターの反撃：やけど・脱力・脆弱・守備力・最低1・出血が働く */
const isHitKind = (k: DamageKind) => k === 'attack' || k === 'hit' || k === 'retaliate';
const detailOf = (base: number, steps: string[]) => (steps.length ? `（基本${base} → ${steps.join(' → ')}）` : '');
/** 毒・やけど・呪縛・放射能・疲労（決定事項 #102）：シールド・無効化・聖盾を無視し、「ダメージを受けたとき」は出ない */
const isDot = (k: DamageKind) => k === 'poison' || k === 'burn' || k === 'doom' || k === 'rad' || k === 'fatigue';
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

/** モンスターの働いているキーワード：カードのキーワード＋効果で与えられたもの（封印中はなし） */
export function keywordFlags(g: GameState, m: Monster): KeywordDef['battle'] {
  const flags: KeywordDef['battle'] = {};
  if (m.sealed) return flags;
  for (const k of cardKeywords(g, m)) {
    const kd = getKeyword(k.id);
    if (kd) Object.assign(flags, kd.battle);
  }
  for (const id of [...(m.granted ?? []), ...(m.tempGranted ?? [])]) {
    const kd = getKeyword(id);
    if (kd) Object.assign(flags, kd.battle);
  }
  // 容疑（MTG 要素 △ バッチA）：挑発を失う
  if (m.suspected) flags.taunt = false;
  return flags;
}

/** モンスターと戦うとき（攻撃・反撃・格闘）だけ攻撃力に足す量（武士道。封印中は0） */
export function combatBonus(g: GameState, m: Monster): number {
  if (m.sealed) return 0;
  let n = 0;
  for (const k of cardKeywords(g, m)) n += getKeyword(k.id)?.battle.combatBonus?.(k) ?? 0;
  return n;
}

/** 相手プレイヤーを攻撃するときだけ攻撃力に足す量（猛襲。封印中は0。MTG 要素 ○ バッチB） */
export function playerBonus(g: GameState, m: Monster): number {
  if (m.sealed) return 0;
  let n = 0;
  for (const k of cardKeywords(g, m)) n += getKeyword(k.id)?.battle.playerBonus?.(k) ?? 0;
  return n;
}

/** 護法：相手のカードの「選んだ1体」にするときのコストの上乗せ（封印中は0。MTG 要素 ○ バッチB） */
export function wardTax(g: GameState, m: Monster): number {
  if (m.sealed) return 0;
  let n = 0;
  for (const k of cardKeywords(g, m)) n += getKeyword(k.id)?.battle.wardTax?.(k) ?? 0;
  return n;
}

/**
 * モンスターが場を離れるときの後始末（MTG 要素 ○ バッチB）：装備していたカードは、カードの持ち主の手札に戻る。
 * 懸賞は、破壊されたときだけ掛けた人が引く（バウンス・一撃離脱・トークンの消滅では引けずに消える）
 */
export function onLeaveBoard(g: GameState, m: Monster, depth: number, destroyed: boolean): void {
  const equipment = m.equipment ?? [];
  delete m.equipment;
  for (const card of equipment) {
    // 捨て札から使ったフラッシュバック・再活の装備（MTG 要素 ○ バッチC1）は除外へ
    if (card.exileOnLeave) {
      g.players[card.owner].exile.push(card);
      log(g, depth, `装備していた「${cardName(g, card.cardId)}」は除外された（捨て札から使ったため）`);
      continue;
    }
    g.players[card.owner].hand.push(card);
    log(g, depth, `装備していた「${cardName(g, card.cardId)}」は${g.players[card.owner].name}の手札に戻った`);
  }
  const bounty = m.bounty ?? [];
  delete m.bounty;
  if (!destroyed) return;
  // 落とし子（MTG 要素 △ バッチA）：破壊されたら今の持ち主のエナジー+1（手番ならこのターン、そうでなければ次のターン）
  if (m.card.token?.spawn) spawnEnergy(g, m.controller, depth);
  for (const b of bounty) {
    if (isEnded(g)) return;
    log(g, depth, `懸賞：${g.players[b.player].name}がカードを${b.draw}枚引く`);
    drawCards(g, b.player, b.draw, depth + 1);
  }
}

/** 落とし子のエナジー：手番ならこのターン（1ターンに増やせるエナジーの上限に数える）、そうでなければ次のターンに+1 */
function spawnEnergy(g: GameState, p: PlayerId, depth: number): void {
  const ps = g.players[p];
  if (g.phase === 'main' && g.active === p) {
    const limits = turnLimits(g, ps);
    const gain = Math.max(0, Math.min(1, B.maxEnergyGainPerTurn - limits.energyGained));
    limits.energyGained += gain;
    ps.energy += gain;
    log(g, depth, gain > 0 ? `落とし子：${ps.name}はエナジーを1得た（エナジー${ps.energy}）` : `落とし子：${ps.name}はこのターンもうエナジーを増やせない`, 'info');
    return;
  }
  ps.next.energy += 1;
  log(g, depth, `落とし子：${ps.name}の次のターンのエナジー+1`, 'info');
}

/** 戦闘のダメージで働く接死・絆魂（出どころのモンスターから読む） */
export function combatSourceOf(g: GameState, m: Monster): CombatSource {
  const k = keywordFlags(g, m);
  return { deathtouch: k.deathtouch === true, lifelink: k.lifelink === true, controller: m.controller };
}

/**
 * 選べる挑発モンスター（隠密は数えない）。相手のモンスターの攻撃と、カードの「選んだ1体」は、
 * これが1体でもいる間はこの中からしか選べない（決定事項 #83）
 */
export function targetableTaunts(g: GameState, owner: PlayerId): Monster[] {
  return g.players[owner].board.filter((m) => !m.stealth && keywordFlags(g, m).taunt);
}

/** カードの「選んだ1体」で選べる相手のモンスターか（隠密・呪禁・守護の加護は選べない。MTG 要素バッチ2・△ バッチA） */
export function cardTargetable(g: GameState, m: Monster): boolean {
  return !m.stealth && !keywordFlags(g, m).hexproof && !guarded(m, 'protection');
}

/** 守護（MTG 要素 △ バッチA）が今かかっているか（kind を渡すとその種類だけ） */
export function guarded(m: Monster, kind?: 'indestructible' | 'protection'): boolean {
  return m.guard !== undefined && (kind === undefined || m.guard.kind === kind);
}

/** カードの「選んだ1体」を縛る挑発モンスター（呪禁の挑発は数えない。呪禁の挑発しかいなければ自由に選べる） */
export function cardTargetableTaunts(g: GameState, owner: PlayerId): Monster[] {
  return targetableTaunts(g, owner).filter((m) => cardTargetable(g, m));
}

const KIND_LABEL: Partial<Record<DamageKind, string>> = { poison: '毒で', burn: 'やけどで', doom: '呪縛で', counter: '反撃で' };

/** 出どころの持ち主（プレイヤーならそのプレイヤー、モンスターならその今の持ち主。分からなければ undefined） */
function sourceOwner(g: GameState, source: TargetRef | null): PlayerId | undefined {
  if (!source) return undefined;
  return source.kind === 'player' ? source.player : findMonster(g, source.uid)?.controller;
}

/** 戦闘のダメージ（接死・絆魂が働く）か */
const isCombat = (opts: DamageOpts) => opts.kind === 'attack' || opts.kind === 'retaliate' || opts.kind === 'trample' || opts.combat === true;

/** 絆魂：減らしたぶん、出どころのモンスターの持ち主が回復する */
function lifelink(g: GameState, src: CombatSource | null, hpLost: number, depth: number): void {
  if (!src?.lifelink || hpLost <= 0 || isEnded(g)) return;
  log(g, depth, `絆魂：${g.players[src.controller].name}が与えたダメージ${hpLost}ぶん回復`);
  heal(g, { kind: 'player', player: src.controller }, hpLost, depth, { keywordId: 'lifelink' });
}

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
  const combatHit = opts.kind === 'attack' || opts.kind === 'retaliate' || opts.combat === true;
  const out = hit ? (opts.outgoing ?? outgoingOf(g, opts.source, combatHit)) : { burn: false, exhaust: false };
  // 脱力を使ったカードの効果は、使ったあとに脱力が無くなっても最後まで上限が効く
  const exhaust = out.exhaust || (opts.playKey !== undefined && g.protect[opts.playKey]?.exhaust === true);

  if (hit && opts.bonus) {
    amount += opts.bonus;
    steps.push(`筋力・気合+${opts.bonus}で${amount}`);
  }
  if (hit && out.burn) {
    amount = Math.floor(amount * B.burnDamageRate);
    steps.push(`やけどで${amount}`);
  }
  if (hit && exhaust && amount > B.exhaustCap) {
    amount = B.exhaustCap;
    steps.push(`脱力で${amount}`);
  }
  if (hit && status.vulnerable > 0) {
    amount = Math.floor(amount * (1 + B.vulnerableRate));
    steps.push(`脆弱で${amount}`);
  }
  // 精霊の特性「霊体」（決定事項 #143）：相手のカードの効果のダメージ（戦闘・格闘でない hit）を減らす
  if (monster && opts.kind === 'hit' && !opts.combat && amount > 0 && spiritVeiled(g, monster) && sourceOwner(g, opts.source) === other(monster.controller)) {
    amount = Math.floor(amount * BALANCE.tribes.spirit.trait.damageRate);
    steps.push(`${TRIBE_TRAITS.spirit.name}で${amount}`);
  }
  // 守備力は種族の揃い「連結」を含む（決定事項 #143）
  const defense = monster ? effectiveDefense(g, monster) : 0;
  // 守備力以下のダメージは0（最低ダメージは無い：決定事項 #148）
  if (monster && !opts.pierce && mitigated && defense > 0) {
    amount = Math.max(0, amount - defense);
    steps.push(`守備力−${defense}で${amount}`);
  }
  // 出血：1枚のカード（1回の攻撃）につき1回だけ（決定事項 #70 R4）。守備力で0になった攻撃には乗らない（#148）
  if (hit && amount > 0 && status.bleed > 0 && onceFor(g, opts.playKey, 'bleedHit', target)) {
    amount += status.bleed;
    steps.push(`出血+${status.bleed}で${amount}`);
  }
  if (opts.pierce) steps.push('防御無視');

  const prefix = opts.prefix ?? '';
  const kindLabel = KIND_LABEL[opts.kind] ?? '';
  /** 接死・絆魂（戦闘のダメージだけ） */
  const combatSrc: CombatSource | null = !isCombat(opts)
    ? null
    : opts.combatSource !== undefined
      ? opts.combatSource
      : opts.source?.kind === 'monster'
        ? (() => {
            const sm = findMonster(g, opts.source.uid);
            return sm ? combatSourceOf(g, sm) : null;
          })()
        : null;
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
    // このターンの記録：手番のプレイヤーが相手のHPを減らした（出どころは問わない。条件「このターン相手にダメージを与えた」）。
    // 疲労（山札切れ。決定事項 #102）は引いた本人のルール上のダメージなので数えない（速度・蓄積も上がらない）
    if (result.hpLost > 0 && g.phase === 'main' && target.player !== g.active && opts.kind !== 'fatigue') {
      const turn = g.players[g.active].turn;
      turn.enemyDamaged = true;
      // 合計（条件「このターン相手に合計6以上のダメージを与えた」。MTG 要素 ○ バッチA）
      turn.enemyDamageTotal = (turn.enemyDamageTotal ?? 0) + result.hpLost;
      // 速度ゲージ（MTG 要素 ○ バッチC2）：自分のターンに相手のHPを減らすと1ターン1回+1。蓄積「相手のHPを減らすたび」
      speedUp(g, g.active, opts.depth + 1);
      chargePowers(g, g.active, 'enemyDamaged', opts.depth + 1);
    }
    if (checkGameEnd(g)) return result;
    lifelink(g, combatSrc, result.hpLost, opts.depth + 1);
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
  // 守護の加護（MTG 要素 △ バッチA）：すべてのダメージを0にする（聖盾より先）
  if (amount > 0 && guarded(m, 'protection')) {
    log(g, opts.depth, `${prefix}${label}への${amount}ダメージ${detail}を加護が防いだ`, 'damage', undefined, { kind: 'status', target, status: 'protection', amount: 0 });
    return none;
  }
  // 聖盾：最初に受けるダメージ1回を0にする（毒・やけど・呪縛・自傷は防がない）
  if (amount > 0 && (hit || opts.kind === 'counter') && !m.shieldUsed && keywordFlags(g, m).divineShield) {
    m.shieldUsed = true;
    log(g, opts.depth, `${prefix}${label}への${amount}ダメージ${detail}を聖盾が防いだ（聖盾は消えた）`, 'damage', undefined, {
      kind: 'status',
      target,
      status: 'divineShield',
      keywordId: 'divineShield',
      amount: 0,
      ...(opts.source ? { source: opts.source } : {}),
    });
    return none;
  }
  let result: DamageResult;
  /** 生き残って、ダメージを受けたときが発動しうる（不屈で踏みとどまったときは発動しない） */
  let damagedTrigger = false;
  /** 守護の不壊（MTG 要素 △ バッチA）：体力が1未満にならない（不屈より先） */
  const floor = guarded(m, 'indestructible') ? Math.min(before, B.indestructibleHp) : 0;
  if (before - amount <= 0 && floor > 0) {
    m.hp = floor;
    log(g, opts.depth, `${prefix}${label}に${kindLabel}${amount}ダメージ${detail}：不壊で体力${m.hp}で踏みとどまった`, 'damage', undefined, ev(amount));
    result = { hpLost: before - m.hp, overflow: 0, destroyed: false };
    damagedTrigger = result.hpLost > 0;
  } else if (before - amount <= 0 && keywordFlags(g, m).undying && !m.undyingUsed) {
    m.undyingUsed = true;
    m.hp = Math.min(before, BALANCE.battle.undyingHp);
    log(g, opts.depth, `${prefix}${label}に${kindLabel}${amount}ダメージ${detail}：不屈で体力${m.hp}で踏みとどまった`, 'damage', undefined, { ...ev(amount), keywordId: 'undying' });
    result = { hpLost: before - m.hp, overflow: 0, destroyed: false };
  } else if (before - amount <= 0) {
    m.hp = 0;
    log(g, opts.depth, `${prefix}${label}に${kindLabel}${amount}ダメージ${detail}：体力 ${before}→0`, 'damage', undefined, ev(amount));
    destroyMonster(g, m, opts.depth + 1);
    result = { hpLost: before, overflow: amount - before, destroyed: true };
  } else {
    m.hp = before - amount;
    log(g, opts.depth, `${prefix}${label}に${kindLabel}${amount}ダメージ${detail}：体力 ${before}→${m.hp}`, 'damage', undefined, ev(amount));
    result = { hpLost: amount, overflow: 0, destroyed: false };
    damagedTrigger = true;
  }
  // 萎縮（MTG 要素 △ バッチA）：生き残ったら、減った体力のぶん最大体力も減る（不屈・不壊で踏みとどまったら、その体力まで）
  if (opts.wither && !result.destroyed && result.hpLost > 0 && findMonster(g, m.uid)) {
    const maxBefore = m.maxHp;
    m.maxHp = Math.max(m.hp, m.maxHp - result.hpLost);
    if (m.maxHp < maxBefore) {
      // 表示用：萎縮で減った最大体力の合計
      m.counters.withered = (m.counters.withered ?? 0) + (maxBefore - m.maxHp);
      log(g, opts.depth + 1, `萎縮：${label}の最大体力 ${maxBefore}→${m.maxHp}`, 'info');
    }
  }
  // 接死：攻撃・反撃・格闘で体力を減らしたら、生き残っても破壊する（不屈は効かない。貫通の余りはプレイヤーなので関係ない）
  if (!result.destroyed && combatSrc?.deathtouch && opts.kind !== 'trample' && amount > 0 && findMonster(g, m.uid)) {
    log(g, opts.depth + 1, `接死：${label}は破壊される`, 'effect', undefined, { kind: 'keyword', keywordId: 'deathtouch', target, ...(opts.source ? { source: opts.source } : {}) });
    destroyMonster(g, m, opts.depth + 1);
    result = { ...result, destroyed: !findMonster(g, m.uid) };
    damagedTrigger = false;
  }
  lifelink(g, combatSrc, result.hpLost, opts.depth + 1);
  // ダメージを受けたとき（生き残ったときだけ。毒・やけどでは発動しない：決定事項 #70 R5。休眠中は出ない：MTG 要素 △ バッチA）
  if (damagedTrigger && amount > 0 && !m.sealed && !monsterDormant(g, m) && !isDot(opts.kind) && findMonster(g, m.uid)) {
    const def = g.cards[m.card.cardId];
    const enemy = opts.source && targetExists(g, opts.source) ? opts.source : undefined;
    // 1体につき1ターン maxRepeatTriggersPerTurn 回まで（報告 #15）。効果もデメリットも無ければ数えない
    const any = def && (def.effects.some((e) => e.timing === 'damaged') || def.drawbacks.some((d) => d.timing === 'damaged'));
    if (def && any && allowMonsterRepeat(g, m, 'damaged', def.name, opts.depth + 1)) {
      enqueueCardTiming(g, sourceOfMonster(g, m), def, 'damaged', enemy ? { enemy } : {}, opts.depth + 1, {});
    }
  }
  return result;
}

/** モンスターを破壊する（不屈は効かない）。カードは元の持ち主の捨て札へ（残らないコピーは除外） */
/** 速度ゲージ（MTG 要素 ○ バッチC2）：ゲージがあって最大でなく、このターンまだ上がっていなければ+1 */
export function speedUp(g: GameState, p: PlayerId, depth: number): void {
  const ps = g.players[p];
  const speed = ps.speed ?? 0;
  if (speed < 1 || speed >= BALANCE.speed.max || ps.turn.speedUp) return;
  ps.turn.speedUp = true;
  ps.speed = speed + 1;
  log(g, depth, `${ps.name}の速度${ps.speed}${ps.speed >= BALANCE.speed.max ? '（最高速度）' : ''}`, 'info', undefined, { kind: 'speed', player: p, amount: ps.speed });
}

/** 王冠（MTG 要素 ○ バッチC2）を p に移す（もう持っていれば何もしない）。how はログの言い方 */
export function setCrown(g: GameState, p: PlayerId, depth: number, how: 'take' | 'steal'): void {
  if (g.crown === p) return;
  g.crown = p;
  const name = g.players[p].name;
  log(g, depth, how === 'take' ? `👑${name}は王冠を得た` : `👑王冠が${name}に移った`, 'effect', undefined, { kind: 'crown', player: p });
}

/**
 * モンスターを破壊する。守護の不壊（MTG 要素 △ バッチA）のモンスターは破壊されない（force：生け贄・濫用・衰弱で体力0・寿命は止めない）。
 * 消滅の印のモンスターは捨て札ではなく除外へ
 */
export function destroyMonster(g: GameState, m: Monster, depth: number, force = false): void {
  const board = g.players[m.controller].board;
  const i = board.findIndex((x) => x.uid === m.uid);
  if (i < 0) return;
  if (!force && guarded(m, 'indestructible')) {
    log(g, depth, `${monsterLabel(g, m)}は不壊なので破壊されない`, 'effect', undefined, { kind: 'status', target: { kind: 'monster', uid: m.uid }, status: 'indestructible', amount: 0 });
    return;
  }
  // 裏向き（MTG 要素 △ バッチC）は公開してから捨て札へ。裏向きの間は効果が無いので「破壊されたとき」は出ない
  const wasFaceDown = m.faceDown !== undefined;
  // 種族の揃い「怨嗟」（決定事項 #143）：破壊される前に、このモンスターを含めて不死が揃っていたか
  const grudge = traitTribe(g, m) === 'undead' && tribeSetActive(g, m.controller, 'undead');
  unmask(g, m, depth);
  board.splice(i, 1);
  const owner = g.players[m.card.owner];
  const finality = m.finality === true && !m.card.token;
  // トークンはどこにも行かずに消える
  if (m.card.token) {
    // 何もしない
  } else if (m.card.copy === 'temp' || m.card.exileOnLeave || finality) owner.exile.push(m.card);
  else owner.discard.push(m.card);
  const note = m.card.token ? '（トークンは消える）' : finality ? '（消滅の印で除外された）' : '';
  log(g, depth, `${g.players[m.controller].name}の「${cardName(g, m.card.cardId)}」が破壊された${note}`, 'effect', undefined, {
    kind: 'destroy',
    player: m.controller,
    cardId: m.card.cardId,
    uid: m.uid,
  });
  onLeaveBoard(g, m, depth + 1, true);
  if (grudge && !isEnded(g)) {
    const p = m.controller;
    log(g, depth + 1, `${TRIBE_SETS.undead.name}：${g.players[p].name}の${TRIBE_LABEL.undead}が倒れた`, 'effect', undefined, { kind: 'tribe', tribe: 'undead', status: 'set', player: p });
    dealDamage(g, playerRef(other(p)), BALANCE.tribes.undead.set.onDeath, { kind: 'hit', source: playerRef(p), depth: depth + 2 });
    if (isEnded(g)) return;
  }
  // このターンの記録（手番のプレイヤーの記録に、敵味方どちらのモンスターも数える）
  if (g.phase === 'main') {
    const turn = g.players[g.active].turn;
    turn.monstersDestroyed = (turn.monstersDestroyed ?? 0) + 1;
  }
  if (!m.sealed && !wasFaceDown) {
    const def = g.cards[m.card.cardId];
    if (def) enqueueCardTiming(g, sourceOfMonster(g, m), def, 'destroyed', {}, depth + 1, {});
  }
  // 砦（MTG 要素 △ バッチC）：築いた人が「砦を落としたとき」の報酬を得る（持ち主側の「破壊されるたび」は出ない）
  if (m.siege) {
    const def = g.cards[m.siege.cardId];
    if (def && def.effects.some((e) => e.timing === 'siegeWon')) {
      const p = m.siege.player;
      log(g, depth + 1, `${g.players[p].name}は砦を落とした：「${def.name}」の報酬`, 'effect', undefined, { kind: 'status', player: p, cardId: m.siege.cardId, status: 'siegeWon' });
      const src = { kind: 'card' as const, uid: newUid(g, 'sw'), cardId: m.siege.cardId, name: def.name, controller: p };
      enqueueCardTiming(g, src, def, 'siegeWon', {}, depth + 1, {});
    }
    return;
  }
  // 自分の他のモンスターが破壊されるたび：破壊されたときの持ち主のパワー → 場に残っているモンスター（左から）
  enqueuePowers(g, m.controller, 'allyDestroyed', depth + 1);
  chargePowers(g, m.controller, 'allyDestroyed', depth + 1);
  enqueueMonsters(g, m.controller, 'allyDestroyed', depth + 1);
}

/** extra は演出の出来事に足すもの（絆魂の keywordId、再生の status など。決定事項 #126） */
export function heal(g: GameState, target: TargetRef, amount: number, depth: number, extra?: Partial<LogEvent>): number {
  if (isEnded(g) || !targetExists(g, target) || amount <= 0) return 0;
  // やけどで回復量が半分になる決まりはやめた（決定事項 #138）
  const n = amount;
  const note = '';
  if (target.kind === 'player') {
    const ps = g.players[target.player];
    const before = ps.hp;
    ps.hp = Math.min(ps.maxHp, ps.hp + n);
    log(g, depth, `${ps.name}のHPが${n}回復${note}：HP ${before}→${ps.hp}`, 'effect', undefined, { ...extra, kind: 'heal', target, amount: ps.hp - before });
    // このターンの記録：手番のプレイヤーが回復した（条件「このターン自分が回復した」。MTG 要素 ○ バッチA）
    if (ps.hp > before && g.phase === 'main' && target.player === g.active) ps.turn.healed = true;
    return ps.hp - before;
  }
  const m = findMonster(g, target.uid)!;
  const before = m.hp;
  m.hp = Math.min(m.maxHp, m.hp + n);
  log(g, depth, `${monsterLabel(g, m)}の体力が${n}回復${note}：体力 ${before}→${m.hp}`, 'effect', undefined, { ...extra, kind: 'heal', target, amount: m.hp - before });
  return m.hp - before;
}

const STATUS_LABEL: Record<StatusKey, string> = {
  poison: '毒',
  burn: 'やけど',
  weak: '脱力',
  vulnerable: '脆弱',
  bleed: '出血',
  freeze: '凍結',
  confuse: '混乱',
  counter: '反撃',
  nullify: '無効化',
  regen: '再生',
  strength: '筋力',
  focus: '気合',
  doom: '呪縛',
  rad: '放射能',
};

/** プレイヤーにしか付かない状態 */
const PLAYER_ONLY: ReadonlySet<StatusKey> = new Set(['counter', 'nullify', 'regen', 'strength', 'focus', 'doom', 'rad']);

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
    case 'weak':
      // 脱力（決定事項 #138）：個数。モンスターは攻撃するたび、プレイヤーはダメージの効果のカードを使うたびに1つ減る
      s.weak += amount;
      log(g, depth, `${name}に脱力${amount}：合計${s.weak}`, 'effect', undefined, ev(amount));
      return;
    case 'burn':
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
    case 'rad': {
      // 放射能の合計には上限がある（MTG 要素 △ バッチA。枚数なので倍率は掛けない）
      const now = s.rad ?? 0;
      const gained = Math.max(0, Math.min(amount, B.radCap - now));
      s.rad = now + gained;
      const capNote = gained < amount ? `（上限${B.radCap}）` : '';
      log(g, depth, `${name}に放射能${gained}${capNote}：合計${s.rad}`, 'effect', undefined, ev(gained));
      return;
    }
    case 'doom': {
      // 呪縛の合計には上限がある（MTG 要素バッチ2）
      const now = s.doom ?? 0;
      const gained = Math.max(0, Math.min(amount, B.doomCap - now));
      s.doom = now + gained;
      const capNote = gained < amount ? `（上限${B.doomCap}）` : '';
      log(g, depth, `${name}に呪縛${gained}${capNote}：合計${s.doom}`, 'effect', undefined, ev(gained));
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
  if (s.doom) s.doom = 0;
  // 放射能・まだ凍っていない氷結（MTG 要素 △ バッチA）
  if (s.rad) s.rad = 0;
  if (g.players[p].ice) g.players[p].ice = 0;
  g.players[p].turn.freezeTax = false;
  // 封殺（MTG 要素 ○ バッチB）も解除する
  if (g.players[p].quash) {
    delete g.players[p].quash;
    log(g, depth, `${g.players[p].name}の封殺が解けた`);
  }
  const kept = s.poison + s.burn > 0 ? '（このカードのデメリットで付いた分は残る）' : '';
  log(g, depth, `${g.players[p].name}の状態異常をすべて解除した${kept}`, 'effect', undefined, { kind: 'status', target: { kind: 'player', player: p }, status: 'cleanse' });
}
