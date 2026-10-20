/** カードの使用とノイズの除外 */
import { BALANCE } from '../balance.ts';
import { classifyCard } from '../classify.ts';
import { TIMINGS, isPowerTiming, type TargetRule } from '../options.ts';
import { getAbility, getDrawback, getEffect } from '../registry.ts';
import type { CardDef } from '../types.ts';
import { cardName, enqueue, findMonster, log, newUid, other, playerRef, playRecord } from './core.ts';
import { enqueueCardTiming, enqueueMonsters, enqueuePowers } from './triggers.ts';
import { cardTargetable, cardTargetableTaunts, wardTax } from './damage.ts';
import { randInt } from './rng.ts';
import { discardCard, summon } from './zones.ts';
import {
  NOISE_CARD_ID,
  type CardInst,
  type Chosen,
  type DelayedEffect,
  type GameState,
  type PlayerId,
  type PowerInst,
  type Step,
  type TargetRef,
} from './types.ts';

/** 護法（MTG 要素 ○ バッチB）：「選んだ1体」の相手モンスターが護法なら、そのぶんのコストの上乗せ */
export function wardTaxFor(g: GameState, p: PlayerId, chosen?: Chosen): number {
  const t = chosen?.enemy;
  if (!t || t.kind !== 'monster') return 0;
  const m = findMonster(g, t.uid);
  if (!m || m.controller === p) return 0;
  return wardTax(g, m);
}

/** 実際に払うコスト（凍結の+1、軽減の−、護法の+N。護法は「選んだ1体」を渡したときだけ） */
export function effectiveCost(g: GameState, p: PlayerId, card: CardInst, ctx: { chosen?: Chosen } = {}): number {
  const def = g.cards[card.cardId];
  if (!def) return 0;
  const ps = g.players[p];
  const tax = ps.turn.freezeTax ? BALANCE.battle.freezeCostIncrease : 0;
  return Math.max(0, def.cost + tax - ps.discount * BALANCE.battle.discountAmount) + wardTaxFor(g, p, ctx.chosen);
}

/** 対象の印（PlayInfo.targetCosts・選択肢の ID）：プレイヤーは `player:0`、モンスターは uid */
export const targetKey = (t: TargetRef): string => (t.kind === 'player' ? `player:${t.player}` : t.uid);
export function parseTargetKey(key: string): TargetRef {
  const m = /^player:([01])$/.exec(key);
  return m ? { kind: 'player', player: Number(m[1]) as PlayerId } : { kind: 'monster', uid: key };
}

/** 使用時・召喚時の「選んだ1体」が必要な効果の作用先 */
export function chosenRules(def: CardDef): { enemy: TargetRule[]; ally: boolean } {
  const timing = def.stats ? 'summon' : 'play';
  const enemy: TargetRule[] = [];
  let ally = false;
  for (const e of def.effects) {
    if (e.timing !== timing || e.target !== 'chosen' || TIMINGS[timing].chosen !== 'manual') continue;
    const rule = getEffect(e.id)?.targetRule;
    if (rule === 'allyMonsterOne') ally = true;
    else if (rule === 'fight') {
      // 格闘：自分のモンスターと相手モンスターの両方を選ぶ
      ally = true;
      enemy.push(rule);
    } else if (rule) enemy.push(rule);
  }
  return { enemy, ally };
}

/**
 * 相手側の「選んだ1体」の候補（隠密・呪禁は選べない）。
 * 相手に選べる挑発モンスターがいる間は、その挑発モンスターしか選べない（相手プレイヤーも選べない：決定事項 #83）。
 * 呪禁の挑発は数えない（呪禁の挑発しかいなければ、呪禁でないモンスターとプレイヤーから自由に選べる）
 */
export function enemyCandidates(g: GameState, p: PlayerId, rules: TargetRule[]): TargetRef[] {
  if (rules.length === 0) return [];
  const opp = other(p);
  const taunts = cardTargetableTaunts(g, opp);
  if (taunts.length > 0) return taunts.map((m): TargetRef => ({ kind: 'monster', uid: m.uid }));
  const monsters = g.players[opp].board.filter((m) => cardTargetable(g, m)).map((m): TargetRef => ({ kind: 'monster', uid: m.uid }));
  const allowPlayer = rules.some((r) => r === 'enemyAny');
  return [...(allowPlayer ? [playerRef(opp)] : []), ...monsters];
}

/** 自分のモンスターの「選んだ1体」の候補（モンスターカードなら自分自身も選べる） */
export function allyCandidates(g: GameState, p: PlayerId, card: CardInst): string[] {
  const def = g.cards[card.cardId];
  return [...g.players[p].board.map((m) => m.uid), ...(def?.stats ? [card.uid] : [])];
}

const sameRef = (a: TargetRef, b: TargetRef) =>
  a.kind === 'player' ? b.kind === 'player' && a.player === b.player : b.kind === 'monster' && a.uid === b.uid;

export function validatePlay(g: GameState, p: PlayerId, cardUid: string, chosen: Chosen | undefined): string | null {
  const ps = g.players[p];
  const card = ps.hand.find((c) => c.uid === cardUid);
  if (!card) return 'そのカードは手札にありません';
  if (card.cardId === NOISE_CARD_ID) return 'ノイズは使えません（コストを払って除外はできます）';
  const def = g.cards[card.cardId];
  if (!def) return 'カードの定義が見つかりません';
  const cost = effectiveCost(g, p, card, { chosen });
  if (cost > ps.energy) {
    const ward = wardTaxFor(g, p, chosen);
    return `エナジーが足りません（必要${cost}${ward ? `、護法で+${ward}` : ''}、残り${ps.energy}）`;
  }
  const reason = drawbackBlock(g, p, card);
  if (reason) return reason;
  const rules = chosenRules(def);
  const enemies = enemyCandidates(g, p, rules.enemy);
  if (enemies.length > 0) {
    if (!chosen?.enemy) return '対象を選んでください';
    if (!enemies.some((t) => sameRef(t, chosen.enemy!))) return 'その対象は選べません';
  } else if (chosen?.enemy) {
    return '対象は選べません';
  }
  const allies = rules.ally ? allyCandidates(g, p, card) : [];
  if (allies.length > 0) {
    if (!chosen?.ally) return '自分のモンスターを選んでください';
    if (!allies.includes(chosen.ally)) return 'そのモンスターは選べません';
  } else if (chosen?.ally) {
    return '自分のモンスターは選べません';
  }
  return null;
}

/** デメリットのせいで使えない理由（生け贄にするモンスターがいない など）。使えるなら null */
export function drawbackBlock(g: GameState, p: PlayerId, card: CardInst): string | null {
  for (const d of g.cards[card.cardId]?.drawbacks ?? []) {
    const reason = getDrawback(d.id)?.battle.canPlay?.(g, p, card) ?? null;
    if (reason) return reason;
  }
  return null;
}

/** カードのデメリットの寿命（あれば最短のもの） */
export function lifespanOf(def: CardDef | undefined): number | undefined {
  let life: number | undefined;
  for (const d of def?.drawbacks ?? []) {
    const n = getDrawback(d.id)?.battle.lifespan?.(d);
    if (n !== undefined) life = life === undefined ? n : Math.min(life, n);
  }
  return life;
}

export function playCard(g: GameState, p: PlayerId, cardUid: string, chosen: Chosen): void {
  const ps = g.players[p];
  const index = ps.hand.findIndex((c) => c.uid === cardUid);
  const card = ps.hand[index]!;
  const def = g.cards[card.cardId]!;
  const cost = effectiveCost(g, p, card, { chosen });
  const ward = wardTaxFor(g, p, chosen);
  const before = ps.energy;
  ps.energy -= cost;
  const notes: string[] = [];
  if (ps.turn.freezeTax) notes.push('凍結で+1');
  if (ps.discount > 0) notes.push(`軽減で−${ps.discount}`);
  if (ward > 0) notes.push(`護法で+${ward}`);
  ps.turn.freezeTax = false;
  ps.discount = 0;
  ps.turn.cardsPlayed += 1;
  ps.hand.splice(index, 1);
  log(
    g,
    0,
    `${ps.name}は「${def.name}」を使った（コスト${cost}${notes.length ? `：${notes.join('、')}` : ''}、エナジー ${before}→${ps.energy}）`,
    'action',
    undefined,
    { kind: 'play', player: p, cardId: card.cardId, uid: card.uid },
  );
  resolvePlay(g, p, card, chosen, { from: 'hand', depth: 1 });
}

/** 封殺（MTG 要素 ○ バッチB）がこのカードに当たるか。パワーアタックはアタックにもパワーにも当たる */
export function quashMatches(g: GameState, p: PlayerId, def: CardDef): boolean {
  const q = g.players[p].quash;
  if (!q || g.turnIndex > q.until) return false;
  if (q.kind === 'any') return true;
  const type = classifyCard(def);
  if (type === 'powerAttack') return q.kind === 'attack' || q.kind === 'power';
  return type === q.kind;
}

/**
 * 使ったカードの処理（手札から・無料で使う共通）：封殺 → X → 英雄的 → 召喚／効果 → 使い終わり。
 * コストの支払い・使った枚数・使ったログは呼び出し側で済ませておく
 */
function resolvePlay(g: GameState, p: PlayerId, card: CardInst, chosen: Chosen, opts: { from: 'hand' | 'free'; depth: number; freeDepth?: number }): void {
  const ps = g.players[p];
  const def = g.cards[card.cardId]!;
  const depth = opts.depth;
  // 封殺：コストは払い、使った枚数にも数えるが、カードは捨て札へ行き、何も起きない
  if (quashMatches(g, p, def)) {
    delete ps.quash;
    log(g, depth, `封殺：「${def.name}」は無効になった`, 'effect', undefined, { kind: 'status', player: p, cardId: card.cardId, uid: card.uid, status: 'quash' });
    discardCard(g, card);
    return;
  }
  const protectKey = newUid(g, 'pk');
  if (opts.freeDepth !== undefined) playRecord(g, protectKey).freeDepth = opts.freeDepth;
  // X（全力）：使用時・召喚時の効果に X があれば、残りのエナジーをすべて使う（このカードの X の効果はすべて同じ X）。無料で使ったときは0
  if (usesX(def)) {
    const x = opts.from === 'free' ? 0 : ps.energy;
    if (opts.from !== 'free') ps.energy = 0;
    playRecord(g, protectKey).x = x;
    log(g, depth, `X＝${x}${opts.from === 'free' ? '（無料で使ったので0）' : '（エナジーをすべて使った）'}`, 'info', undefined, { kind: 'energy', player: p, amount: ps.energy });
  }
  // 自分のカードの対象になるたび（英雄的。MTG 要素 ○ バッチA）：選んだ自分のモンスターの効果を、カードの効果より先に積む
  if (chosen.ally && chosenRules(def).ally && ps.board.some((m) => m.uid === chosen.ally)) {
    enqueueMonsters(g, p, 'targeted', depth, { onlyUid: chosen.ally });
  }
  if (def.stats) {
    summon(g, p, card, chosen, depth, protectKey);
  } else {
    const type = classifyCard(def);
    const attackCard = type === 'attack' || type === 'powerAttack';
    // 筋力・気合（＋恩恵）は使った時点の値を記録し、このカードの最初の1発にだけ乗せる（このカード自身が付けた分は乗らない：決定事項 #70 R3）
    if (attackCard) playRecord(g, protectKey).bonus = ps.status.strength + ps.status.focus + useBoon(g, p, depth);
    const src = { kind: 'card' as const, uid: card.uid, cardId: card.cardId, name: def.name, controller: p };
    enqueueCardTiming(g, src, def, 'play', chosen, depth, { attackCard, protectKey, ...(card.grow ? { grow: card.grow } : {}) });
  }
  enqueue(g, { t: 'cardDone', player: p, card, protectKey, depth, ...(opts.from === 'free' ? { from: 'free' as const } : {}) });
}

/** 恩恵（MTG 要素 ○ バッチB）：アタックを使うたび1回ぶん使い、上乗せの量を返す（回数が尽きたら消える） */
function useBoon(g: GameState, p: PlayerId, depth: number): number {
  const s = g.players[p].status;
  if (!s.boonUses || s.boonUses <= 0 || !s.boon) return 0;
  const n = s.boon;
  s.boonUses -= 1;
  log(g, depth, `恩恵：このアタックの最初の1発+${n}（残り${s.boonUses}回）`, 'info');
  if (s.boonUses <= 0) {
    s.boon = 0;
    s.boonUses = 0;
  }
  return n;
}

/**
 * 無料で使う（続唱。MTG 要素 ○ バッチB）：コストを払わずに使う。「選んだ1体」が要れば相手側 → 自分側の順に選ぶ（候補が1つなら選ばない）。
 * デメリットで使えない（生け贄にするモンスターがいない など）なら手札に加える
 */
export function executeFreePlay(g: GameState, step: Extract<Step, { t: 'freePlay' }>): void {
  const p = step.player;
  const card = step.card;
  const def = g.cards[card.cardId];
  if (!def) return;
  const chosen: Chosen = { ...(step.chosen ?? {}) };
  const pick = step.picks?.[0];
  if (step.stage === 'enemy' && pick) chosen.enemy = parseTargetKey(pick);
  if (step.stage === 'ally' && pick) chosen.ally = pick;
  const rules = chosenRules(def);
  const ask = (stage: 'enemy' | 'ally', prompt: string, options: { id: string; label: string; cardId?: string }[]) => {
    g.pending = { player: p, prompt, options, min: 1, max: 1, step: { ...step, chosen, stage, picks: undefined } as Step };
  };
  if (step.stage === undefined && rules.enemy.length > 0) {
    const cands = enemyCandidates(g, p, rules.enemy);
    if (cands.length === 1) chosen.enemy = cands[0];
    else if (cands.length > 1) {
      return ask(
        'enemy',
        `無料で使う「${def.name}」の対象を選んでください`,
        cands.map((t) => ({ id: targetKey(t), label: t.kind === 'player' ? g.players[t.player].name : cardName(g, findMonster(g, t.uid)?.card.cardId ?? '') })),
      );
    }
  }
  if (step.stage !== 'ally' && rules.ally) {
    const cands = allyCandidates(g, p, card);
    if (cands.length === 1) chosen.ally = cands[0];
    else if (cands.length > 1) {
      return ask(
        'ally',
        `無料で使う「${def.name}」で選ぶ自分のモンスターを選んでください`,
        cands.map((uid) => ({ id: uid, label: uid === card.uid ? `${def.name}（このカード）` : cardName(g, findMonster(g, uid)?.card.cardId ?? '') })),
      );
    }
  }
  const ps = g.players[p];
  const reason = drawbackBlock(g, p, card);
  if (reason) {
    ps.hand.push(card);
    log(g, step.depth, `${reason}：「${def.name}」は使えないので手札に加えた`);
    return;
  }
  ps.turn.cardsPlayed += 1;
  log(g, step.depth, `${ps.name}は「${def.name}」を無料で使った`, 'action', undefined, { kind: 'play', player: p, cardId: card.cardId, uid: card.uid });
  resolvePlay(g, p, card, chosen, { from: 'free', depth: step.depth, freeDepth: step.freeDepth });
}

/** 使用時・召喚時の効果に X（全力）があるか */
export function usesX(def: CardDef): boolean {
  const timing = def.stats ? 'summon' : 'play';
  return def.effects.some((e) => e.timing === timing && (e.mods ?? []).includes('xEnergy') && getEffect(e.id)?.scalable === true);
}

/** このカードを使うと場にパワーが残るか（パワー用タイミングの効果かデメリットがある、パワー・パワー攻撃のカード） */
export function leavesPower(def: CardDef): boolean {
  if (def.stats) return false;
  const type = classifyCard(def);
  if (type !== 'power' && type !== 'powerAttack') return false;
  return def.effects.some((e) => isPowerTiming(e.timing, 'spell')) || def.drawbacks.some((d) => isPowerTiming(d.timing, 'spell'));
}

/**
 * パワーを場に置く。すでに上限（BALANCE.battle.maxPowers）なら、先にいちばん古いパワーを消す（決定事項 #80）。
 * 消えたパワーのカードは使ったときに除外済みなので、パワーが場から消えるだけ（誘発なし）
 */
export function addPower(g: GameState, p: PlayerId, power: PowerInst, depth: number): void {
  const ps = g.players[p];
  const max = BALANCE.battle.maxPowers;
  while (ps.powers.length >= max) {
    const old = ps.powers.shift()!;
    log(g, depth, `パワーは${max}つまで：『${old.name}』が消えた`, 'effect', undefined, {
      kind: 'destroy',
      player: p,
      cardId: old.cardId,
      uid: old.uid,
    });
  }
  ps.powers.push(power);
}

/**
 * カードの処理が終わったあと：捨て札・除外・パワーとして残す、そして「カードを使うたび」。
 * 呪文の行き先（MTG 要素 ○ バッチB）：装備したモンスター ＞ 反復（手札から使ったとき）＞ 再利用（1ターン1回）＞ 循環 ＞ 廃棄 ＞ 捨て札
 */
export function finishCard(g: GameState, p: PlayerId, card: CardInst, protectKey: string, depth: number, from: 'hand' | 'free' = 'hand'): void {
  const ps = g.players[p];
  const def = g.cards[card.cardId];
  const equipTo = g.protect[protectKey]?.equipTo;
  delete g.protect[protectKey];
  // 成長：使うたび、このカード（個体）のダメージ・連撃の数値が増える（上限あり）
  if (def) growCard(g, card, def, depth);
  let newPower: PowerInst | undefined;
  if (def && !def.stats) {
    const type = classifyCard(def);
    if (type === 'power' || type === 'powerAttack') {
      newPower = {
        uid: newUid(g, 'pw'),
        cardId: card.cardId,
        name: def.name,
        effects: def.effects.filter((e) => isPowerTiming(e.timing, 'spell')).map((effect) => ({ effect, removed: false })),
        drawbacks: def.drawbacks.filter((d) => isPowerTiming(d.timing, 'spell')),
      };
      if (newPower.effects.length > 0 || newPower.drawbacks.length > 0) {
        const life = lifespanOf(def);
        if (life !== undefined) newPower.life = life;
        addPower(g, p, newPower, depth);
        log(g, depth, `「${def.name}」はパワーとして場に残り、カードは除外された${life !== undefined ? `（寿命${life}）` : ''}`);
      } else {
        log(g, depth, `「${def.name}」は除外された`);
      }
      ps.exile.push(card);
    } else {
      spellDestination(g, p, card, def, depth, from, equipTo);
    }
  }
  enqueuePowers(g, p, 'cardPlayed', depth, { excludeUid: newPower?.uid });
  // 自分がパワー／スキルを使うたび：パワー（いま置いたものを除く）→ 場のモンスター（左から）
  const type = def ? classifyCard(def) : null;
  const timing = type === 'power' || type === 'powerAttack' ? 'powerPlayed' : type === 'skill' ? 'skillPlayed' : null;
  if (timing) {
    enqueuePowers(g, p, timing, depth, { excludeUid: newPower?.uid });
    enqueueMonsters(g, p, timing, depth);
  }
  // コスト3以上のカードを使うたび（演目。MTG 要素 ○ バッチA）：印刷コストで判定。いま置いたパワー・いま出たモンスター自身は除く
  if (def && def.cost >= BALANCE.timingParams.bigCardCost) {
    enqueuePowers(g, p, 'bigCardPlayed', depth, { excludeUid: newPower?.uid });
    enqueueMonsters(g, p, 'bigCardPlayed', depth, def.stats ? { excludeUid: card.uid } : {});
  }
}

/** カードの能力のうち、使ったあとの行き先を決めるもの */
function afterUseOf(def: CardDef): 'shuffle' | 'hand' | 'rebound' | undefined {
  for (const a of def.abilities ?? []) {
    const after = getAbility(a.id)?.battle.afterUse;
    if (after) return after;
  }
  return undefined;
}

/** 成長：カードの成長の能力の量だけ、この個体の grow を増やす（上限 abilities.grow.maxGrow） */
function growCard(g: GameState, card: CardInst, def: CardDef, depth: number): void {
  let add = 0;
  for (const a of def.abilities ?? []) add += getAbility(a.id)?.battle.grow?.(a) ?? 0;
  if (add <= 0) return;
  const before = card.grow ?? 0;
  const after = Math.min(before + add, BALANCE.abilities.grow.maxGrow);
  if (after === before) return;
  card.grow = after;
  log(g, depth, `成長：「${def.name}」のダメージ+${after}（この1枚だけ）`, 'info');
}

/** モンスター・パワー以外のカードの行き先 */
function spellDestination(g: GameState, p: PlayerId, card: CardInst, def: CardDef, depth: number, from: 'hand' | 'free', equipTo: string | undefined): void {
  const ps = g.players[p];
  // 装備：そのモンスターがまだ場にいれば、カードはモンスターに付く
  const host = equipTo ? findMonster(g, equipTo) : undefined;
  if (host) {
    (host.equipment ??= []).push(card);
    log(g, depth, `「${def.name}」を${g.players[host.controller].name}の「${cardName(g, host.card.cardId)}」に装備した`);
    return;
  }
  const after = afterUseOf(def);
  const keepable = card.copy !== 'temp';
  if (after === 'rebound' && from === 'hand') {
    const max = BALANCE.battle.maxDelayedPerPlayer;
    const list = ps.delayed ?? [];
    const effects = def.effects.filter((e) => e.timing === 'play');
    if (effects.length > 0 && list.length < max) {
      const entry: DelayedEffect = {
        id: newUid(g, 'dl'),
        src: { kind: 'card', uid: card.uid, cardId: card.cardId, name: def.name, controller: p },
        effect: effects[0]!,
        timing: 'play',
        chosen: {},
        label: `${def.name}：反復（使用時の効果がもう一度発動）`,
        rebound: { card, effects },
      };
      ps.delayed = [...list, entry];
      log(g, depth, `反復：「${def.name}」は除外され、次の自分のターン開始時に使用時の効果がもう一度発動する`, 'effect', undefined, {
        kind: 'status',
        player: p,
        status: 'delayed',
        amount: ps.delayed.length,
      });
      return;
    }
    if (list.length >= max) log(g, depth, `予約は${max}件までなので、反復できない`);
  }
  if (after === 'hand' && keepable && card.buybackTurn !== g.turnIndex) {
    card.buybackTurn = g.turnIndex;
    ps.hand.push(card);
    log(g, depth, `再利用：「${def.name}」は手札に戻った（同じカードは1ターン1回）`);
    return;
  }
  if (after === 'shuffle' && keepable) {
    const deck = g.players[card.owner].deck;
    deck.splice(randInt(g, deck.length + 1), 0, card);
    log(g, depth, `循環：「${def.name}」は山札に混ざった`);
    return;
  }
  if (def.drawbacks.some((d) => getDrawback(d.id)?.battle.exhaust)) {
    // 廃棄：捨て札ではなく除外へ
    g.players[card.owner].exile.push(card);
    log(g, depth, `廃棄：「${def.name}」は除外された`);
    return;
  }
  discardCard(g, card);
}

/** ノイズの除外（カードを使ったことには数えない：決定事項 #45） */
export function validateRemoveNoise(g: GameState, p: PlayerId, cardUid: string): string | null {
  const ps = g.players[p];
  const card = ps.hand.find((c) => c.uid === cardUid);
  if (!card || card.cardId !== NOISE_CARD_ID) return 'そのノイズは手札にありません';
  if (ps.energy < BALANCE.battle.noiseRemoveCost) return 'エナジーが足りません';
  return null;
}

export function removeNoise(g: GameState, p: PlayerId, cardUid: string): void {
  const ps = g.players[p];
  const i = ps.hand.findIndex((c) => c.uid === cardUid);
  const [card] = ps.hand.splice(i, 1);
  ps.energy -= BALANCE.battle.noiseRemoveCost;
  ps.exile.push(card!);
  log(g, 0, `${ps.name}はエナジー${BALANCE.battle.noiseRemoveCost}を払ってノイズを除外した`, 'action');
}

