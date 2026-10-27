/**
 * 起動と、手札から使う能力（MTG 要素 ○ バッチC1）。
 * - 起動：場のモンスター・パワーの「起動」の効果を、エナジーを払って使う（1つにつき1ターン1回）。カードを使ったことには数えない
 *   （「カードを使うたび」・封殺・使った枚数に関係しない）。召喚したターンのモンスターも使える。凍結の税・軽減効果は掛からない
 * - 手札から使う能力：サイクリング（捨てて1枚引く）・魂力（捨てて「魂力」の効果）。これもカードを使ったことには数えない
 */
import { getAbility, getDrawback, getEffect } from '../registry.ts';
import type { AbilityInstance, CardDef, EffectInstance, TimingId } from '../types.ts';
import { enqueue, log, monsterDormant, newUid, playRecord } from './core.ts';
import { destroyMonster, spendExhaust } from './damage.ts';
import { allyCandidates, chosenRulesOf, enemyCandidates, icedBlock, validateChosen, wardTaxFor } from './play.ts';
import { enqueueCardTiming, powerDormant } from './triggers.ts';
import { afterDiscarded, createToken, deckToDiscard, discardCard, drawCards, tokenCount } from './zones.ts';
import { BALANCE } from '../balance.ts';
import {
  ACTIVATE_USES,
  HAND_ABILITY_KINDS,
  NOISE_CARD_ID,
  type ActivateUse,
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

/** 起動できるもの（自分の場のモンスターか、自分のパワー）。use は Lvアップ・忠誠+1・忠誠−K（MTG 要素 △ バッチC。省略は能力「起動」） */
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
  use?: ActivateUse;
}

/** 起動の使い方の名前 */
export const ACTIVATE_USE_LABEL: Record<ActivateUse | 'activate', string> = { activate: '起動', level: 'Lvアップ', plus: '忠誠+1', minus: '忠誠−K' };

/** 使い方ごとの、出る効果のタイミング */
export const activateTiming = (use: ActivateUse | undefined): TimingId => (use === 'level' ? 'leveledUp' : use === 'plus' ? 'loyaltyPlus' : use === 'minus' ? 'loyaltyMinus' : 'activated');

/** 能力の中から、起動の能力（と、そのエナジー） */
function activateAbility(def: CardDef | undefined, use?: ActivateUse): { a: AbilityInstance; cost: number } | undefined {
  for (const a of def?.abilities ?? []) {
    const b = getAbility(a.id)?.battle;
    if (!b) continue;
    if (use === undefined && b.activateCost) return { a, cost: b.activateCost(a) };
    if (use === 'level' && b.levelUp) return { a, cost: b.levelUp.cost(a) };
    if ((use === 'plus' || use === 'minus') && b.loyalty) return { a, cost: 0 };
  }
  return undefined;
}

/** sourceUid が自分の場のモンスター・パワーで、その使い方の能力を持つなら、その情報（忠誠はパワーだけ） */
export function activateSource(g: GameState, p: PlayerId, sourceUid: string, use?: ActivateUse): ActivateSource | undefined {
  const ps = g.players[p];
  const m = ps.board.find((x) => x.uid === sourceUid);
  if (m) {
    if (use === 'plus' || use === 'minus') return undefined;
    const def = g.cards[m.card.cardId];
    const act = activateAbility(def, use);
    if (!def || !act) return undefined;
    return { kind: 'monster', uid: m.uid, cardId: m.card.cardId, name: def.name, def, ability: act.a, cost: act.cost, monster: m, ...(use ? { use } : {}) };
  }
  const pw = ps.powers.find((x) => x.uid === sourceUid);
  if (pw) {
    const def = g.cards[pw.cardId];
    const act = activateAbility(def, use);
    if (!def || !act) return undefined;
    return { kind: 'power', uid: pw.uid, cardId: pw.cardId, name: pw.name, def, ability: act.a, cost: act.cost, power: pw, ...(use ? { use } : {}) };
  }
  return undefined;
}

/** 自分の起動できるもの（場のモンスター → パワーの順。1つにつき 起動 → Lvアップ → 忠誠+1 → 忠誠−K） */
export function activateSources(g: GameState, p: PlayerId): ActivateSource[] {
  const ps = g.players[p];
  const uses: (ActivateUse | undefined)[] = [undefined, ...ACTIVATE_USES];
  return [...ps.board.map((m) => m.uid), ...ps.powers.map((pw) => pw.uid)].flatMap((uid) =>
    uses.flatMap((use) => {
      const s = activateSource(g, p, uid, use);
      return s ? [s] : [];
    }),
  );
}

/** 起動で出る効果（モンスターは封印中なし、パワーは解除されていないもの） */
export function activatedEffects(src: ActivateSource): EffectInstance[] {
  const timing = activateTiming(src.use);
  if (src.monster) return src.monster.sealed ? [] : src.def.effects.filter((e) => e.timing === timing);
  return (src.power?.effects ?? []).filter((x) => !x.removed && x.effect.timing === timing).map((x) => x.effect);
}

/** このターンもう起動したか（Lvアップ・忠誠はそれぞれ別に1ターン1回） */
export function activatedThisTurn(g: GameState, src: ActivateSource): boolean {
  const t =
    src.use === 'level'
      ? src.monster
        ? src.monster.counters.levelTurn
        : src.power?.levelTurn
      : src.use === 'plus' || src.use === 'minus'
        ? src.power?.loyaltyTurn
        : src.monster
          ? src.monster.counters.activatedTurn
          : src.power?.activatedTurn;
  return t === g.turnIndex;
}

/** 起動の「選んだ1体」の候補 */
export function activateTargets(g: GameState, p: PlayerId, src: ActivateSource) {
  const rules = chosenRulesOf(activatedEffects(src), activateTiming(src.use));
  return { enemy: enemyCandidates(g, p, rules.enemy), ally: rules.ally ? g.players[p].board.map((m) => m.uid) : [] };
}

/** 今の Lv（無ければ1） */
export const levelOf = (src: Pick<ActivateSource, 'monster' | 'power'>): number => (src.monster ? (src.monster.counters.level ?? 1) : (src.power?.level ?? 1));

/** 忠誠−K の K */
function loyaltyCut(src: ActivateSource): number {
  return getAbility(src.ability.id)?.battle.loyalty?.cut(src.ability) ?? 0;
}

/** 起動できない理由（対象・護法の税を除く）。できるなら null */
export function activateBlock(g: GameState, p: PlayerId, src: ActivateSource): string | null {
  if (g.phase !== 'main' || g.active !== p || g.pending) return '今は起動できません';
  if (src.monster?.sealed) return '封印されているので起動できません';
  if (src.monster?.faceDown) return '裏向きのモンスターは起動できません';
  // 休眠（MTG 要素 △ バッチA）
  if ((src.monster && monsterDormant(g, src.monster)) || (src.power && powerDormant(g, p, src.power))) return '休眠中なので起動できません';
  const label = ACTIVATE_USE_LABEL[src.use ?? 'activate'];
  if (src.use === 'level') {
    // Lvアップ（MTG 要素 △ バッチC）：効果が無くても上げられる（モンスターは強くなる）
    if (levelOf(src) >= BALANCE.battle.maxLevel) return `Lvはもう最大（${BALANCE.battle.maxLevel}）です`;
  } else if (activatedEffects(src).length === 0) {
    return src.use ? `「${label}」の効果がありません（解除された）` : '起動の効果がありません（解除された）';
  }
  if (activatedThisTurn(g, src)) return src.use === 'plus' || src.use === 'minus' ? '忠誠の能力はこのターンもう使いました（+1・−K で1ターン1回）' : `このターンはもう${label}しました（1ターン1回）`;
  if (src.use === 'minus' && (src.power?.loyalty ?? 0) < loyaltyCut(src)) return `忠誠が足りません（−${loyaltyCut(src)}、忠誠${src.power?.loyalty ?? 0}）`;
  if (g.players[p].energy < src.cost) return `エナジーが足りません（${label}にエナジー${src.cost}）`;
  return null;
}

export function validateActivate(g: GameState, p: PlayerId, sourceUid: string, chosen: Chosen | undefined, use?: ActivateUse): string | null {
  if (use !== undefined && !ACTIVATE_USES.includes(use)) return '知らない起動の使い方です';
  const src = activateSource(g, p, sourceUid, use);
  if (!src) return use ? `そのモンスター・パワーには「${ACTIVATE_USE_LABEL[use]}」がありません` : 'そのモンスター・パワーは起動できません';
  const block = activateBlock(g, p, src);
  if (block) return block;
  const t = activateTargets(g, p, src);
  const reason = validateChosen(t.enemy, t.ally, chosen);
  if (reason) return reason;
  const ward = wardTaxFor(g, p, chosen);
  if (src.cost + ward > g.players[p].energy) return `エナジーが足りません（${ACTIVATE_USE_LABEL[use ?? 'activate']}にエナジー${src.cost}、護法で+${ward}）`;
  return null;
}

export function activate(g: GameState, p: PlayerId, sourceUid: string, chosen: Chosen, use?: ActivateUse): void {
  const ps = g.players[p];
  const src = activateSource(g, p, sourceUid, use)!;
  const ward = wardTaxFor(g, p, chosen);
  const cost = src.cost + ward;
  const before = ps.energy;
  ps.energy -= cost;
  const energy = `エナジー${cost}${ward ? `：護法で+${ward}` : ''}、エナジー ${before}→${ps.energy}`;
  if (use === 'level') return levelUp(g, p, src, energy);
  if (use === 'plus' || use === 'minus') return useLoyalty(g, p, src, use, chosen, energy);
  if (src.monster) src.monster.counters.activatedTurn = g.turnIndex;
  if (src.power) src.power.activatedTurn = g.turnIndex;
  log(g, 0, `${ps.name}は${src.kind === 'power' ? 'パワー' : ''}「${src.name}」を起動した（${energy}）`, 'action', undefined, { kind: 'activate', player: p, uid: src.uid, cardId: src.cardId, amount: cost });
  if (src.monster) {
    const ref: SourceRef = { kind: 'monster', uid: src.uid, cardId: src.cardId, name: src.name, controller: p, ...(src.monster.card.token ? { token: true } : {}) };
    // 脱力（決定事項 #138）：ダメージの効果を起動したら1つ減る（そのときだけ記録のキーを付ける）
    const effects = activatedEffects(src);
    if (ps.status.weak > 0 && effects.some((e) => getEffect(e.id)?.isDamage)) {
      const protectKey = newUid(g, 'pk');
      spendExhaust(g, p, playRecord(g, protectKey), effects, 1);
      enqueueCardTiming(g, ref, src.def, 'activated', chosen, 1, { protectKey });
      return;
    }
    enqueueCardTiming(g, ref, src.def, 'activated', chosen, 1, {});
    return;
  }
  const ref: SourceRef = { kind: 'power', uid: src.uid, cardId: src.cardId, name: src.name, controller: p };
  const protectKey = newUid(g, 'pk');
  spendExhaust(g, p, playRecord(g, protectKey), activatedEffects(src), 1);
  for (const effect of activatedEffects(src)) {
    enqueue(g, { t: 'effect', src: ref, effect, timing: 'activated', chosen, attackCard: false, protectKey, depth: 1 });
  }
}

/** Lvアップ（MTG 要素 △ バッチC）：Lv を1上げ（モンスターは攻撃力・体力+N）、「Lvが上がったとき」の効果を積む。カードを使ったことには数えない */
function levelUp(g: GameState, p: PlayerId, src: ActivateSource, energy: string): void {
  const ps = g.players[p];
  const level = levelOf(src) + 1;
  const amount = src.monster ? (getAbility(src.ability.id)?.battle.levelUp?.amount(src.ability) ?? 0) : 0;
  if (src.monster) {
    src.monster.counters.level = level;
    src.monster.counters.levelTurn = g.turnIndex;
    if (amount > 0) {
      src.monster.attack += amount;
      src.monster.maxHp += amount;
      src.monster.hp += amount;
    }
  }
  if (src.power) {
    src.power.level = level;
    src.power.levelTurn = g.turnIndex;
  }
  const stat = src.monster && amount > 0 ? `：攻撃力${src.monster.attack}・体力${src.monster.hp}` : '';
  log(g, 0, `${ps.name}は「${src.name}」をLv${level}に上げた（${energy}）${stat}`, 'action', undefined, { kind: 'level', player: p, uid: src.uid, cardId: src.cardId, amount: level });
  if (src.monster) {
    const ref: SourceRef = { kind: 'monster', uid: src.uid, cardId: src.cardId, name: src.name, controller: p, ...(src.monster.card.token ? { token: true } : {}) };
    enqueueCardTiming(g, ref, src.def, 'leveledUp', {}, 1, { sealed: src.monster.sealed });
    return;
  }
  const ref: SourceRef = { kind: 'power', uid: src.uid, cardId: src.cardId, name: src.name, controller: p };
  const protectKey = newUid(g, 'pk');
  for (const effect of activatedEffects(src)) enqueue(g, { t: 'effect', src: ref, effect, timing: 'leveledUp', chosen: {}, attackCard: false, protectKey, depth: 1 });
}

/** 忠誠+1／−K（MTG 要素 △ バッチC）：忠誠を増減し、その効果を積む。−K で0になったら、効果のあとパワーは消える */
function useLoyalty(g: GameState, p: PlayerId, src: ActivateSource, use: 'plus' | 'minus', chosen: Chosen, energy: string): void {
  const ps = g.players[p];
  const power = src.power!;
  const before = power.loyalty ?? 0;
  power.loyalty = use === 'plus' ? Math.min(BALANCE.battle.loyaltyMax, before + 1) : before - loyaltyCut(src);
  power.loyaltyTurn = g.turnIndex;
  const label = use === 'plus' ? '+1' : `−${loyaltyCut(src)}`;
  log(g, 0, `${ps.name}はパワー「${src.name}」の${label}を使った（忠誠 ${before}→${power.loyalty}${energy.startsWith('エナジー0') ? '' : `、${energy}`}）`, 'action', undefined, {
    kind: 'loyalty',
    player: p,
    uid: src.uid,
    cardId: src.cardId,
    amount: power.loyalty,
    status: use,
  });
  const ref: SourceRef = { kind: 'power', uid: src.uid, cardId: src.cardId, name: src.name, controller: p };
  const protectKey = newUid(g, 'pk');
  const timing = activateTiming(use);
  for (const effect of activatedEffects(src)) enqueue(g, { t: 'effect', src: ref, effect, timing, chosen, attackCard: false, protectKey, depth: 1 });
  if (power.loyalty <= 0) enqueue(g, { t: 'powerGone', player: p, powerUid: power.uid, depth: 1, why: 'loyalty' });
}

// ---------------------------------------------------------------- 裏向きのモンスターを表にする（MTG 要素 △ バッチC：変装・予示）

/** 表にできる裏向きの自分のモンスター（uid）の、本当のカードの定義と表にするエナジー */
export function revealSource(g: GameState, p: PlayerId, uid: string): { m: Monster; card: CardInst; def: CardDef; cost: number } | undefined {
  const m = g.players[p].board.find((x) => x.uid === uid);
  const card = m?.faceDown?.card;
  const def = card ? g.cards[card.cardId] : undefined;
  if (!m || !card || !def || !def.stats || m.faceDown!.revealCost === null) return undefined;
  return { m, card, def, cost: m.faceDown!.revealCost };
}

/** 「表になったとき」の「選んだ1体」の候補 */
export function revealTargets(g: GameState, p: PlayerId, def: CardDef) {
  const rules = chosenRulesOf(def.effects, 'revealed');
  return { enemy: enemyCandidates(g, p, rules.enemy), ally: rules.ally ? g.players[p].board.map((m) => m.uid) : [] };
}

/** 表にできない理由（対象・護法の税を除く）。できるなら null */
export function revealBlock(g: GameState, p: PlayerId, uid: string): string | null {
  if (g.phase !== 'main' || g.active !== p || g.pending) return '今は表にできません';
  const m = g.players[p].board.find((x) => x.uid === uid);
  if (!m?.faceDown) return 'そのモンスターは裏向きではありません';
  const src = revealSource(g, p, uid);
  if (!src) return 'このモンスターは表にできません（モンスターでないカード）';
  if (g.players[p].energy < src.cost) return `エナジーが足りません（表にするのにエナジー${src.cost}）`;
  return null;
}

export function validateReveal(g: GameState, p: PlayerId, uid: string, chosen: Chosen | undefined): string | null {
  const block = revealBlock(g, p, uid);
  if (block) return block;
  const src = revealSource(g, p, uid)!;
  const t = revealTargets(g, p, src.def);
  const reason = validateChosen(t.enemy, t.ally, chosen);
  if (reason) return reason;
  const ward = wardTaxFor(g, p, chosen);
  if (src.cost + ward > g.players[p].energy) return `エナジーが足りません（表にするのにエナジー${src.cost}、護法で+${ward}）`;
  return null;
}

/**
 * 裏向きのモンスターを表にする：攻撃力・体力・守備力は印刷（＋永久強化）に、裏向きの間の強化はそのまま足し、受けたダメージは引き継ぐ。
 * キーワード・効果が働き始め、「表になったとき」の効果を積む（召喚時の効果ではない）。カードを使ったことには数えない
 */
export function reveal(g: GameState, p: PlayerId, uid: string, chosen: Chosen): void {
  const ps = g.players[p];
  const { m, card, def, cost: base } = revealSource(g, p, uid)!;
  const ward = wardTaxFor(g, p, chosen);
  const cost = base + ward;
  const before = ps.energy;
  ps.energy -= cost;
  const S = BALANCE.battle;
  const perm = card.perm;
  const damage = Math.max(0, m.maxHp - m.hp);
  const stats = def.stats!;
  m.attack = Math.max(0, stats.attack + (perm?.attack ?? 0) + (m.attack - S.faceDownStats));
  m.maxHp = stats.hp + (perm?.hp ?? 0) + (m.maxHp - S.faceDownStats);
  m.hp = m.maxHp - damage;
  m.defense = Math.min(BALANCE.stats.defenseMax, stats.defense + m.defense);
  m.card = card;
  delete m.faceDown;
  // 休眠（MTG 要素 △ バッチA）のデメリットは表になったときから数える
  if (def.drawbacks.some((d) => getDrawback(d.id)?.battle.dormant)) m.counters.dormantFrom = ps.turnsTaken;
  log(g, 0, `${ps.name}は裏向きのモンスターを表にした：「${def.name}」（攻撃力${m.attack}・体力${m.hp}。エナジー${cost}${ward ? `：護法で+${ward}` : ''}、エナジー ${before}→${ps.energy}）`, 'action', undefined, {
    kind: 'reveal',
    player: p,
    uid: m.uid,
    cardId: card.cardId,
    amount: cost,
  });
  if (m.hp <= 0) {
    destroyMonster(g, m, 1, true);
    return;
  }
  const ref: SourceRef = { kind: 'monster', uid: m.uid, cardId: card.cardId, name: def.name, controller: p };
  enqueueCardTiming(g, ref, def, 'revealed', chosen, 1, { sealed: m.sealed });
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
