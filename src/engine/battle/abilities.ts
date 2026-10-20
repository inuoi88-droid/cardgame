/**
 * 起動と、手札から使う能力（MTG 要素 ○ バッチC1）。
 * - 起動：場のモンスター・パワーの「起動」の効果を、エナジーを払って使う（1つにつき1ターン1回）。カードを使ったことには数えない
 *   （「カードを使うたび」・封殺・使った枚数に関係しない）。召喚したターンのモンスターも使える。凍結の税・軽減効果は掛からない
 * - 手札から使う能力：サイクリング（捨てて1枚引く）・魂力（捨てて「魂力」の効果）。これもカードを使ったことには数えない
 */
import { getAbility } from '../registry.ts';
import type { AbilityInstance, CardDef, EffectInstance } from '../types.ts';
import { enqueue, log, monsterDormant, newUid } from './core.ts';
import { allyCandidates, chosenRulesOf, enemyCandidates, icedBlock, validateChosen, wardTaxFor } from './play.ts';
import { enqueueCardTiming, powerDormant } from './triggers.ts';
import { afterDiscarded, createToken, deckToDiscard, discardCard, drawCards, tokenCount } from './zones.ts';
import { BALANCE } from '../balance.ts';
import {
  HAND_ABILITY_KINDS,
  NOISE_CARD_ID,
  type CardInst,
  type Chosen,
  type DiscardAbilityKind,
  type GameState,
  type HandAbilityKind,
  type Monster,
  type PlayerId,
  type PowerInst,
  type SourceRef,
} from './types.ts';

/** 手札から使う能力の名前（定義が無いときの表示） */
const HAND_ABILITY_NAME: Record<HandAbilityKind, string> = { cycling: 'サイクリング', channel: '魂力', forecast: '予見' };

/** 起動できるもの（自分の場のモンスターか、自分のパワー） */
export interface ActivateSource {
  kind: 'monster' | 'power';
  uid: string;
  cardId: string;
  name: string;
  def: CardDef;
  ability: AbilityInstance;
  /** 起動のエナジー（護法の税を除く） */
  cost: number;
  monster?: Monster;
  power?: PowerInst;
}

/** 能力の中から、起動の能力（と、そのエナジー） */
function activateAbility(def: CardDef | undefined): { a: AbilityInstance; cost: number } | undefined {
  for (const a of def?.abilities ?? []) {
    const cost = getAbility(a.id)?.battle.activateCost?.(a);
    if (cost !== undefined) return { a, cost };
  }
  return undefined;
}

/** sourceUid が自分の場のモンスター・パワーで、起動の能力を持つなら、その情報 */
export function activateSource(g: GameState, p: PlayerId, sourceUid: string): ActivateSource | undefined {
  const ps = g.players[p];
  const m = ps.board.find((x) => x.uid === sourceUid);
  if (m) {
    const def = g.cards[m.card.cardId];
    const act = activateAbility(def);
    if (!def || !act) return undefined;
    return { kind: 'monster', uid: m.uid, cardId: m.card.cardId, name: def.name, def, ability: act.a, cost: act.cost, monster: m };
  }
  const pw = ps.powers.find((x) => x.uid === sourceUid);
  if (pw) {
    const def = g.cards[pw.cardId];
    const act = activateAbility(def);
    if (!def || !act) return undefined;
    return { kind: 'power', uid: pw.uid, cardId: pw.cardId, name: pw.name, def, ability: act.a, cost: act.cost, power: pw };
  }
  return undefined;
}

/** 自分の起動できるもの（場のモンスター → パワーの順） */
export function activateSources(g: GameState, p: PlayerId): ActivateSource[] {
  const ps = g.players[p];
  return [...ps.board.map((m) => m.uid), ...ps.powers.map((pw) => pw.uid)].flatMap((uid) => {
    const s = activateSource(g, p, uid);
    return s ? [s] : [];
  });
}

/** 起動で出る効果（モンスターは封印中なし、パワーは解除されていないもの） */
export function activatedEffects(src: ActivateSource): EffectInstance[] {
  if (src.monster) return src.monster.sealed ? [] : src.def.effects.filter((e) => e.timing === 'activated');
  return (src.power?.effects ?? []).filter((x) => !x.removed && x.effect.timing === 'activated').map((x) => x.effect);
}

/** このターンもう起動したか */
export function activatedThisTurn(g: GameState, src: ActivateSource): boolean {
  const t = src.monster ? src.monster.counters.activatedTurn : src.power?.activatedTurn;
  return t === g.turnIndex;
}

/** 起動の「選んだ1体」の候補 */
export function activateTargets(g: GameState, p: PlayerId, src: ActivateSource) {
  const rules = chosenRulesOf(activatedEffects(src), 'activated');
  return { enemy: enemyCandidates(g, p, rules.enemy), ally: rules.ally ? g.players[p].board.map((m) => m.uid) : [] };
}

/** 起動できない理由（対象・護法の税を除く）。できるなら null */
export function activateBlock(g: GameState, p: PlayerId, src: ActivateSource): string | null {
  if (g.phase !== 'main' || g.active !== p || g.pending) return '今は起動できません';
  if (src.monster?.sealed) return '封印されているので起動できません';
  // 休眠（MTG 要素 △ バッチA）
  if ((src.monster && monsterDormant(g, src.monster)) || (src.power && powerDormant(g, p, src.power))) return '休眠中なので起動できません';
  if (activatedEffects(src).length === 0) return '起動の効果がありません（解除された）';
  if (activatedThisTurn(g, src)) return 'このターンはもう起動しました（1ターン1回）';
  if (g.players[p].energy < src.cost) return `エナジーが足りません（起動にエナジー${src.cost}）`;
  return null;
}

export function validateActivate(g: GameState, p: PlayerId, sourceUid: string, chosen: Chosen | undefined): string | null {
  const src = activateSource(g, p, sourceUid);
  if (!src) return 'そのモンスター・パワーは起動できません';
  const block = activateBlock(g, p, src);
  if (block) return block;
  const t = activateTargets(g, p, src);
  const reason = validateChosen(t.enemy, t.ally, chosen);
  if (reason) return reason;
  const ward = wardTaxFor(g, p, chosen);
  if (src.cost + ward > g.players[p].energy) return `エナジーが足りません（起動にエナジー${src.cost}、護法で+${ward}）`;
  return null;
}

export function activate(g: GameState, p: PlayerId, sourceUid: string, chosen: Chosen): void {
  const ps = g.players[p];
  const src = activateSource(g, p, sourceUid)!;
  const ward = wardTaxFor(g, p, chosen);
  const cost = src.cost + ward;
  const before = ps.energy;
  ps.energy -= cost;
  if (src.monster) src.monster.counters.activatedTurn = g.turnIndex;
  if (src.power) src.power.activatedTurn = g.turnIndex;
  log(
    g,
    0,
    `${ps.name}は${src.kind === 'power' ? 'パワー' : ''}「${src.name}」を起動した（エナジー${cost}${ward ? `：護法で+${ward}` : ''}、エナジー ${before}→${ps.energy}）`,
    'action',
    undefined,
    { kind: 'activate', player: p, uid: src.uid, cardId: src.cardId, amount: cost },
  );
  if (src.monster) {
    const ref: SourceRef = { kind: 'monster', uid: src.uid, cardId: src.cardId, name: src.name, controller: p, ...(src.monster.card.token ? { token: true } : {}) };
    enqueueCardTiming(g, ref, src.def, 'activated', chosen, 1, {});
    return;
  }
  const ref: SourceRef = { kind: 'power', uid: src.uid, cardId: src.cardId, name: src.name, controller: p };
  const protectKey = newUid(g, 'pk');
  for (const effect of activatedEffects(src)) {
    enqueue(g, { t: 'effect', src: ref, effect, timing: 'activated', chosen, attackCard: false, protectKey, depth: 1 });
  }
}

// ---------------------------------------------------------------- 手札から使う能力

/** カードの、手札から使う能力（サイクリング・魂力）とそのエナジー */
export function handAbilityOf(def: CardDef | undefined, kind: HandAbilityKind): { a: AbilityInstance; cost: number; name: string } | undefined {
  for (const a of def?.abilities ?? []) {
    const ad = getAbility(a.id);
    const h = ad?.battle.handAbility;
    if (ad && h && h.kind === kind) return { a, cost: h.cost(a), name: ad.name };
  }
  return undefined;
}

/** このカードが持つ、手札から使う能力の種類 */
export function handAbilityKinds(def: CardDef | undefined): HandAbilityKind[] {
  return HAND_ABILITY_KINDS.filter((k) => handAbilityOf(def, k) !== undefined);
}

/** 手札から使う能力の効果のタイミング（魂力・予見。サイクリングは効果なし） */
export const handAbilityTiming = (kind: HandAbilityKind): 'channel' | 'forecast' | null => (kind === 'channel' ? 'channel' : kind === 'forecast' ? 'forecast' : null);

/** 魂力・予見の「選んだ1体」の候補（カードは手札にあるので、場のモンスターだけ） */
export function handAbilityTargets(g: GameState, p: PlayerId, card: CardInst, kind: HandAbilityKind) {
  const def = g.cards[card.cardId];
  const timing = handAbilityTiming(kind);
  if (!timing || !def) return { enemy: [], ally: [] };
  const rules = chosenRulesOf(def.effects, timing);
  return { enemy: enemyCandidates(g, p, rules.enemy), ally: rules.ally ? allyCandidates(g, p, card, timing) : [] };
}

/** 使えない理由（対象・護法の税を除く）。使えるなら null */
export function handAbilityBlock(g: GameState, p: PlayerId, card: CardInst, kind: HandAbilityKind): string | null {
  if (g.phase !== 'main' || g.active !== p || g.pending) return '今は使えません';
  const h = handAbilityOf(g.cards[card.cardId], kind);
  if (!h) return `このカードには${HAND_ABILITY_NAME[kind]}がありません`;
  const ice = icedBlock(g, card);
  if (ice) return ice;
  // 予見（MTG 要素 △ バッチB）：1枚につき1ターン1回
  if (kind === 'forecast' && card.forecastTurn === g.turnIndex) return 'このターンはもう予見しました（1ターン1回）';
  if (g.players[p].energy < h.cost) return `エナジーが足りません（${h.name}にエナジー${h.cost}）`;
  return null;
}

export function validateHandAbility(g: GameState, p: PlayerId, cardUid: string, kind: HandAbilityKind, chosen: Chosen | undefined): string | null {
  if (!HAND_ABILITY_KINDS.includes(kind)) return '知らない能力です';
  const card = g.players[p].hand.find((c) => c.uid === cardUid);
  if (!card || card.cardId === NOISE_CARD_ID) return 'そのカードは手札にありません';
  const block = handAbilityBlock(g, p, card, kind);
  if (block) return block;
  const t = handAbilityTargets(g, p, card, kind);
  const reason = validateChosen(t.enemy, t.ally, chosen);
  if (reason) return reason;
  const h = handAbilityOf(g.cards[card.cardId], kind)!;
  const ward = wardTaxFor(g, p, chosen);
  if (h.cost + ward > g.players[p].energy) return `エナジーが足りません（${h.name}にエナジー${h.cost}、護法で+${ward}）`;
  return null;
}

export function useHandAbility(g: GameState, p: PlayerId, cardUid: string, kind: HandAbilityKind, chosen: Chosen): void {
  const ps = g.players[p];
  const i = ps.hand.findIndex((c) => c.uid === cardUid);
  const card = ps.hand[i]!;
  const def = g.cards[card.cardId]!;
  const h = handAbilityOf(def, kind)!;
  const ward = kind === 'cycling' ? 0 : wardTaxFor(g, p, chosen);
  const cost = h.cost + ward;
  const before = ps.energy;
  ps.energy -= cost;
  // 予見（MTG 要素 △ バッチB）：カードを見せて効果を使う。カードは手札に残る（1ターン1回）
  if (kind === 'forecast') {
    card.forecastTurn = g.turnIndex;
    log(
      g,
      0,
      `${ps.name}は手札の「${def.name}」を見せて${h.name}した（エナジー${cost}${ward ? `：護法で+${ward}` : ''}、エナジー ${before}→${ps.energy}）`,
      'action',
      undefined,
      { kind: 'handAbility', player: p, cardId: card.cardId, uid: card.uid, status: kind, amount: cost },
    );
    const src: SourceRef = { kind: 'card', uid: card.uid, cardId: card.cardId, name: def.name, controller: p };
    enqueueCardTiming(g, src, def, 'forecast', chosen, 1, {});
    return;
  }
  ps.hand.splice(i, 1);
  discardCard(g, card);
  log(
    g,
    0,
    `${ps.name}は${h.name}で「${def.name}」を捨てた（エナジー${cost}${ward ? `：護法で+${ward}` : ''}、エナジー ${before}→${ps.energy}）`,
    'action',
    undefined,
    { kind: 'handAbility', player: p, cardId: card.cardId, uid: card.uid, status: kind, amount: cost },
  );
  if (kind === 'cycling') {
    drawCards(g, p, 1, 1);
    // 捨てられたとき（MTG 要素 △ バッチA）
    afterDiscarded(g, p, card, 1);
    return;
  }
  const src: SourceRef = { kind: 'card', uid: card.uid, cardId: card.cardId, name: def.name, controller: p };
  enqueueCardTiming(g, src, def, 'channel', chosen, 1, {});
  afterDiscarded(g, p, card, 1);
}

// ---------------------------------------------------------------- 捨て札のカードの能力（MTG 要素 △ バッチB：相続・発掘・不朽）

/** カードの、捨て札のカードの能力とそのエナジー */
export function discardAbilityOf(def: CardDef | undefined, kind: DiscardAbilityKind): { a: AbilityInstance; cost: number; name: string } | undefined {
  for (const a of def?.abilities ?? []) {
    const ad = getAbility(a.id);
    const d = ad?.battle.discardAbility;
    if (ad && d && d.kind === kind) return { a, cost: d.cost(a), name: ad.name };
  }
  return undefined;
}

/** このカードが持つ、捨て札のカードの能力の種類 */
export function discardAbilityKinds(def: CardDef | undefined): DiscardAbilityKind[] {
  return (['renew', 'dredge', 'embalm'] as const).filter((k) => discardAbilityOf(def, k) !== undefined);
}

/** 相続の「選んだ1体」の候補（カードは捨て札にあるので、場のモンスターだけ） */
export function discardAbilityTargets(g: GameState, p: PlayerId, card: CardInst, kind: DiscardAbilityKind) {
  const def = g.cards[card.cardId];
  if (kind !== 'renew' || !def) return { enemy: [], ally: [] };
  const rules = chosenRulesOf(def.effects, 'renew');
  return { enemy: enemyCandidates(g, p, rules.enemy), ally: rules.ally ? allyCandidates(g, p, card, 'renew') : [] };
}

/** 捨て札のカードの能力を使えない理由（対象・護法の税を除く）。使えるなら null */
export function discardAbilityBlock(g: GameState, p: PlayerId, card: CardInst, kind: DiscardAbilityKind): string | null {
  if (g.phase !== 'main' || g.active !== p || g.pending) return '今は使えません';
  const ps = g.players[p];
  const def = g.cards[card.cardId];
  const d = discardAbilityOf(def, kind);
  if (!def || !d) return 'このカードにはその能力がありません';
  if (!ps.discard.some((c) => c.uid === card.uid)) return '捨て札にありません';
  if (ps.energy < d.cost) return `エナジーが足りません（${d.name}にエナジー${d.cost}）`;
  if (kind === 'dredge') {
    const n = d.a.value ?? 0;
    if ((ps.turn.dredged ?? 0) >= BALANCE.battle.maxDredgePerTurn) return `${d.name}は1ターン${BALANCE.battle.maxDredgePerTurn}回までです`;
    if (ps.deck.length < n) return `${d.name}：山札が${n}枚ありません`;
  }
  if (kind === 'embalm' && tokenCount(g, p) >= BALANCE.battle.maxTokens) return `トークンは${BALANCE.battle.maxTokens}体までなので、${d.name}できません`;
  return null;
}

export function validateDiscardAbility(g: GameState, p: PlayerId, cardUid: string, kind: DiscardAbilityKind, chosen: Chosen | undefined): string | null {
  if (kind !== 'renew' && kind !== 'dredge' && kind !== 'embalm') return '知らない能力です';
  const card = g.players[p].discard.find((c) => c.uid === cardUid);
  if (!card || card.cardId === NOISE_CARD_ID) return 'そのカードは捨て札にありません';
  const block = discardAbilityBlock(g, p, card, kind);
  if (block) return block;
  const t = discardAbilityTargets(g, p, card, kind);
  const reason = validateChosen(t.enemy, t.ally, chosen);
  if (reason) return reason;
  const d = discardAbilityOf(g.cards[card.cardId], kind)!;
  const ward = wardTaxFor(g, p, chosen);
  if (d.cost + ward > g.players[p].energy) return `エナジーが足りません（${d.name}にエナジー${d.cost}、護法で+${ward}）`;
  return null;
}

/** 捨て札のカードの能力を使う（カードを使ったことには数えない。封殺に掛からない） */
export function useDiscardAbility(g: GameState, p: PlayerId, cardUid: string, kind: DiscardAbilityKind, chosen: Chosen): void {
  const ps = g.players[p];
  const i = ps.discard.findIndex((c) => c.uid === cardUid);
  const card = ps.discard[i]!;
  const def = g.cards[card.cardId]!;
  const d = discardAbilityOf(def, kind)!;
  const ward = kind === 'renew' ? wardTaxFor(g, p, chosen) : 0;
  const cost = d.cost + ward;
  const before = ps.energy;
  ps.energy -= cost;
  const ev = { kind: 'discardAbility' as const, player: p, cardId: card.cardId, uid: card.uid, status: kind, amount: cost };
  if (kind === 'dredge') {
    const n = d.a.value ?? 0;
    ps.turn.dredged = (ps.turn.dredged ?? 0) + 1;
    log(g, 0, `${ps.name}は捨て札の「${def.name}」を${d.name}した（山札の上${n}枚を捨て札に置く）`, 'action', undefined, ev);
    deckToDiscard(g, p, ps.deck.slice(0, n).map((c) => c.uid), d.name, 1);
    const j = ps.discard.findIndex((c) => c.uid === cardUid);
    if (j >= 0) {
      const [x] = ps.discard.splice(j, 1);
      ps.hand.push(x!);
      log(g, 1, `${d.name}：「${def.name}」を手札に戻した`, 'info');
    }
    return;
  }
  // 相続・不朽：カードを除外してから
  ps.discard.splice(i, 1);
  ps.exile.push(card);
  log(
    g,
    0,
    `${ps.name}は捨て札の「${def.name}」を${d.name}で除外した（エナジー${cost}${ward ? `：護法で+${ward}` : ''}、エナジー ${before}→${ps.energy}）`,
    'action',
    undefined,
    ev,
  );
  if (kind === 'renew') {
    const src: SourceRef = { kind: 'card', uid: card.uid, cardId: card.cardId, name: def.name, controller: p };
    enqueueCardTiming(g, src, def, 'renew', chosen, 1, {});
    return;
  }
  // 不朽：コピー（トークン）を出す。永遠なら攻撃力・体力が決まった値
  const stats = def.stats!;
  const eternal = d.a.option === 'eternal';
  const s = eternal ? BALANCE.abilities.embalm.eternalStats : undefined;
  createToken(g, p, card.cardId, { attack: s ?? stats.attack, hp: s ?? stats.hp, defense: stats.defense, copy: true }, 1);
}
