/** 今できる行動の一覧（UI・CPU・サーバーの検証で共用） */
import { BALANCE } from '../balance.ts';
import { CONDITIONS, isMonsterOnlyRule } from '../options.ts';
import { getEffect } from '../registry.ts';
import type { CardDef } from '../types.ts';
import { attackBlockReason, attackTargets } from './combat.ts';
import { checkCondition } from './conditions.ts';
import { other } from './core.ts';
import { cardTargetableTaunts } from './damage.ts';
import { nextFullMulliganSize } from './mulligan.ts';
import { validateActivate, validateHandAbility } from './abilities.ts';
import {
  activateBlock,
  activatedEffects,
  activateSource,
  activateSources,
  activateTargets,
  handAbilityBlock,
  handAbilityKinds,
  handAbilityOf,
  handAbilityTargets,
} from './abilities.ts';
import {
  allyCandidates,
  chosenRules,
  costBreakdown,
  drawbackBlock,
  effectiveCost,
  enemyCandidates,
  fromDiscardAbility,
  icedBlock,
  kickerCost,
  leavesPower,
  modeName,
  playableModes,
  playTiming,
  quashMatches,
  targetKey,
  validatePlay,
  wardTaxFor,
  type CostBreakdown,
  type PlayOpts,
} from './play.ts';
import { isCurseCard } from '../classify.ts';
import { modeTexts } from '../text.ts';
import { effectsForMode } from './modes.ts';
import { tribeAllies } from './runtime.ts';
import { advanceableSagas } from './powers.ts';
import type { EffectInstance, TimingId } from '../types.ts';
import { ARMY_CARD_ID, NOISE_CARD_ID, type Action, type CardInst, type Chosen, type GameState, type HandAbilityKind, type PlayerId, type TargetRef } from './types.ts';

export interface PlayInfo {
  card: CardInst;
  cost: number;
  /** 使えない理由（使えるなら null） */
  blocked: string | null;
  enemyTargets: TargetRef[];
  allyTargets: string[];
  /**
   * 使えるが、今使っても発動しない効果があるときの注意（条件未達、対象なし、全体効果で場が空）。
   * 使用時・召喚時の効果だけを見る。空なら注意なし
   */
  warnings: string[];
  /** 相手の挑発のせいで「選んだ1体」が挑発モンスターに限られているか（決定事項 #83） */
  tauntLimited: boolean;
  /**
   * 護法（MTG 要素 ○ バッチB）：相手側の対象ごとの実コスト（キーは targetKey。護法で cost と違うものだけ）。
   * エナジーが足りない対象は落とし先にしない
   */
  targetCosts?: Record<string, number>;
  // ---- MTG 要素 ○ バッチC1
  /** 捨て札から使う（フラッシュバック・再活・脱出）ときの情報なら 'discard' */
  from?: 'discard';
  /** 印刷コスト（手札のコストの数字の色分け：下がっていれば緑、上がっていれば赤） */
  printedCost?: number;
  /** コストの内訳（対象を選ぶ前。護法は targetCosts） */
  breakdown?: CostBreakdown;
  /** キッカー：追加エナジーと、払えるか（どれかの対象で、追加込みのコストが残りのエナジー以下） */
  kicker?: { extra: number; payable: boolean };
  /** 捨て札から使う能力の名前と、追加の支払い（再活：捨てる手札の候補／脱出：除外する枚数と候補・最初に選ぶ分） */
  fromDiscard?: { name: string; discardChoices?: string[]; exileCount?: number; exileChoices?: string[]; exileDefaults?: string[]; discardDefault?: string };
  /**
   * モード選択のカード（MTG 要素 ○ バッチC2）：モードごとの情報（双呪は mode 0）。このときの enemyTargets・allyTargets は
   * 使えるモードの候補を合わせたもの、cost はいちばん安いモードのコスト。使うときは modes のどれかを選ぶ
   */
  modes?: ModeInfo[];
}

/** モード選択のカードの1つのモードの情報（MTG 要素 ○ バッチC2） */
export interface ModeInfo {
  /** 1〜3（0 は双呪：すべてのモード） */
  mode: number;
  /** 「A」「B」「すべて（双呪）」 */
  label: string;
  /** そのモードの効果の文 */
  text: string;
  cost: number;
  blocked: string | null;
  enemyTargets: TargetRef[];
  allyTargets: string[];
  warnings: string[];
  targetCosts?: Record<string, number>;
}

/** 起動（MTG 要素 ○ バッチC1）の情報。PlayInfo と同じ形（UI のドラッグ・CPU が使う） */
export interface ActivateInfo {
  sourceUid: string;
  kind: 'monster' | 'power';
  cardId: string;
  name: string;
  /** 起動のエナジー（護法の税を除く） */
  cost: number;
  blocked: string | null;
  enemyTargets: TargetRef[];
  allyTargets: string[];
  warnings: string[];
  tauntLimited: boolean;
  targetCosts?: Record<string, number>;
}

/** 手札から使う能力（サイクリング・魂力。MTG 要素 ○ バッチC1）の情報。PlayInfo と同じ形 */
export interface HandAbilityInfo {
  card: CardInst;
  ability: HandAbilityKind;
  /** 能力の名前（サイクリング・魂力） */
  name: string;
  cost: number;
  blocked: string | null;
  enemyTargets: TargetRef[];
  allyTargets: string[];
  warnings: string[];
  tauntLimited: boolean;
  targetCosts?: Record<string, number>;
}

export const WARN_NO_TARGET = '対象がいません';
export const WARN_NO_ENEMY_MONSTER = '相手の場にモンスターがいません';
export const WARN_NO_MONSTER = '場にモンスターがいません';
const WARN_POWER_CAP_HEAD = 'パワーが';
/** 封殺で無効になる注意の書き出し（MTG 要素 ○ バッチB） */
export const WARN_QUASH = '封殺：このカードは無効になります（コストは払い、何も起きません）';
/** 対象選びの案内（確認ダイアログは出さない） */
export const NOTE_TAUNT_LIMITED = '挑発がいるので、挑発のモンスターしか選べません';

/** パワーの上限の注意（「発動しない」ではなく「古いパワーが消える」注意）か */
export function isPowerCapWarning(w: string): boolean {
  return w.startsWith(WARN_POWER_CAP_HEAD);
}

/** 今使っても発動しない効果の注意（使用時・召喚時の効果が対象。捨て札から使うなら timing は「捨て札から使ったとき」のことも） */
export function playWarnings(
  g: GameState,
  p: PlayerId,
  def: CardDef,
  allyTargets: string[],
  timing: TimingId = def.stats ? 'summon' : 'play',
  mode?: number,
  /** GameState.cards のキー（種族の注意に使う。省略は def.id） */
  cardId: string = def.id,
): string[] {
  const out: string[] = [];
  const powers = g.players[p].powers;
  if (powers.length >= BALANCE.battle.maxPowers && leavesPower(def)) {
    out.push(`${WARN_POWER_CAP_HEAD}${BALANCE.battle.maxPowers}つあるので『${powers[0]!.name}』が消えます`);
  }
  if (quashMatches(g, p, def)) out.push(WARN_QUASH);
  // 召喚するモンスターのカードは、出たモンスター自身も「自分のモンスター」に数える（魂力・起動では数えない）
  const summoning = def.stats !== null && (timing === 'summon' || timing === 'fromDiscard');
  for (const w of effectWarnings(g, p, effectsForMode(def.effects, timing, mode), allyTargets, summoning, cardId)) if (!out.includes(w)) out.push(w);
  return out;
}

/** 効果の一覧の「今使っても発動しない」注意（使う・起動・魂力で共通）。summoning：出るモンスター自身を自分のモンスターに数える */
export function effectWarnings(
  g: GameState,
  p: PlayerId,
  effects: readonly EffectInstance[],
  allyTargets: string[],
  summoning: boolean,
  cardId?: string,
): string[] {
  const oppMonsters = g.players[other(p)].board.length;
  const myMonsters = g.players[p].board.length + (summoning ? 1 : 0);
  const out: string[] = [];
  const add = (s: string) => {
    if (!out.includes(s)) out.push(s);
  };
  for (const e of effects) {
    const ed = getEffect(e.id);
    if (!ed) continue;
    // 濫用は使ってから選ぶので、生け贄にできるモンスターがいれば満たせる。キッカーは払うかどうかを使うときに選ぶ
    if (e.condition === 'kicked') continue;
    const unmet = e.condition === 'exploit' ? myMonsters === 0 : e.condition !== null && !checkCondition(g, p, e.condition, cardId ? { cardId } : {});
    if (e.condition && unmet) add(`条件を満たしていません：${CONDITIONS[e.condition].label}`);
    const rule = ed.targetRule;
    const monsterOnly = isMonsterOnlyRule(rule);
    // MTG 要素 ○ バッチB：効果ごとの「今は何も起きない」
    const special = specialWarning(g, p, e.id, e.value ?? 0);
    if (special) add(special);
    // 対象がいなくても処理する効果（探検）は「対象がいない」の注意を出さない
    if (ed.resolveWithoutTargets) continue;
    if (rule === 'fight') {
      // 格闘：自分のモンスターと相手モンスターの両方が要る
      const enemies = e.target === 'chosen' ? enemyCandidates(g, p, [rule]).length : oppMonsters;
      const allies = e.target === 'chosen' ? allyTargets.length : myMonsters;
      if (enemies === 0 || allies === 0) add(WARN_NO_TARGET);
      continue;
    }
    switch (e.target) {
      case 'chosen':
        if (rule === 'allyMonsterOne') {
          if (allyTargets.length === 0) add(WARN_NO_TARGET);
        } else if (enemyCandidates(g, p, [rule]).length === 0) {
          add(WARN_NO_TARGET);
        }
        break;
      case 'random':
        if (rule === 'allyMonsterOne' ? myMonsters === 0 : monsterOnly && oppMonsters === 0) add(WARN_NO_TARGET);
        break;
      case 'enemyMonsters':
        if (oppMonsters === 0) add(WARN_NO_ENEMY_MONSTER);
        break;
      case 'everyone':
        if (monsterOnly && oppMonsters === 0 && myMonsters === 0) add(WARN_NO_MONSTER);
        break;
      case 'board':
        if (oppMonsters === 0 && myMonsters === 0) add(WARN_NO_MONSTER);
        break;
      case 'allyMonsters':
      case 'weakestAlly':
        if (myMonsters === 0) add(WARN_NO_TARGET);
        break;
      case 'otherAllies':
        // 召喚時：出たモンスター自身は含まない（起動：このモンスター自身は含まない）
        if (g.players[p].board.length - (summoning ? 0 : 1) <= 0) add(WARN_NO_TARGET);
        break;
      case 'tribeAllies':
        // 同じ種族の自分のモンスター（MTG 要素 ○ バッチC2。召喚するモンスター自身も数える）
        if (cardId && tribeAllies(g, p, cardId).length === 0 && !(summoning && g.cards[cardId]?.tribe)) add(WARN_NO_TARGET);
        break;
      default:
        break;
    }
  }
  return out;
}

/** 護法（MTG 要素 ○ バッチB）：エナジーが足りる相手側の対象だけ（ドラッグで光らせる・落とせる対象。使う・起動・魂力で共通） */
export function payableEnemyTargets(info: Pick<PlayInfo, 'enemyTargets' | 'targetCosts' | 'cost'>, energy: number): TargetRef[] {
  if (!info.targetCosts) return info.enemyTargets;
  return info.enemyTargets.filter((t) => (info.targetCosts![targetKey(t)] ?? info.cost) <= energy);
}

/** 効果ごとの「今使っても何も起きない」注意（MTG 要素 ○ バッチB） */
function specialWarning(g: GameState, p: PlayerId, id: string, n: number): string | null {
  const opp = g.players[other(p)];
  const me = g.players[p];
  switch (id) {
    case 'slay':
      return opp.board.some((m) => (m.card.token ? 0 : (g.cards[m.card.cardId]?.cost ?? 0)) <= n) ? null : `コスト${n}以下の相手モンスターがいません`;
    case 'infight':
      return opp.board.length >= 2 ? null : '相手のモンスターが2体以上いません';
    case 'populate':
      return me.board.some((m) => m.card.token && m.card.cardId !== ARMY_CARD_ID) ? null : '自分のトークンがいません';
    case 'ramp':
      return (me.energyBonus ?? 0) >= BALANCE.battle.rampCap ? '最大エナジーはもう増やせません' : null;
    // MTG 要素 △ バッチA
    case 'advanceSaga':
      return advanceableSagas(g, p).length > 0 ? null : '進められる英雄譚がありません';
    case 'perpetual':
      return me.hand.some((c) => c.cardId !== NOISE_CARD_ID && g.cards[c.cardId]?.stats) ? null : '手札にモンスターカードがありません';
    case 'fateseal':
    case 'exileMill':
      return opp.deck.length > 0 ? null : '相手の山札がありません';
    default:
      return null;
  }
}

/** 護法（MTG 要素 ○ バッチB）：対象ごとの実コスト（基本のコストと違うものだけ）。無ければ undefined */
function wardCosts(targets: TargetRef[], base: number, costOf: (chosen: Chosen) => number): Record<string, number> | undefined {
  let out: Record<string, number> | undefined;
  for (const t of targets) {
    const c = costOf({ enemy: t });
    if (c !== base) (out ??= {})[targetKey(t)] = c;
  }
  return out;
}

/** どの対象でもエナジーが足りないか（護法のせいで払えない） */
function noPayableTarget(targets: TargetRef[], costs: Record<string, number> | undefined, base: number, energy: number): boolean {
  return costs !== undefined && targets.length > 0 && targets.every((t) => (costs[targetKey(t)] ?? base) > energy);
}

/**
 * 手札のカードを使うときの情報（コスト、対象の候補、使えない理由、発動しない効果の注意）。
 * opts.from が 'discard' なら、捨て札のカードを捨て札から使うときの情報（MTG 要素 ○ バッチC1）
 */
export function playInfo(g: GameState, p: PlayerId, card: CardInst, opts: { from?: 'discard' } = {}): PlayInfo {
  const def = g.cards[card.cardId];
  if (card.cardId === NOISE_CARD_ID || !def) {
    return { card, cost: BALANCE.battle.noiseRemoveCost, blocked: 'ノイズ', enemyTargets: [], allyTargets: [], warnings: [], tauntLimited: false };
  }
  const fromDiscard = opts.from === 'discard';
  const from = fromDiscard ? 'discard' : 'hand';
  const timing = playTiming(def, from);
  const rules = chosenRules(def, timing);
  const enemyTargets = enemyCandidates(g, p, rules.enemy);
  const allyTargets = rules.ally ? allyCandidates(g, p, card, timing) : [];
  const breakdown = costBreakdown(g, p, card, { from });
  const cost = breakdown.total;
  const energy = g.players[p].energy;
  const ps = g.players[p];
  let blocked: string | null = null;
  const fd = fromDiscard ? fromDiscardAbility(def) : undefined;
  if (g.phase !== 'main' || g.active !== p || g.pending) blocked = '今は使えません';
  else if (fromDiscard && !fd) blocked = '捨て札から使えません';
  else if (fromDiscard && !ps.discard.some((c) => c.uid === card.uid)) blocked = '捨て札にありません';
  else if (!fromDiscard && icedBlock(g, card)) blocked = icedBlock(g, card);
  else if (cost > energy) blocked = 'エナジーが足りません';
  else blocked = drawbackBlock(g, p, card);
  // 捨て札から使うときの追加の支払い（再活：手札を1枚／脱出：他の捨て札を N 枚）
  let fromInfo: PlayInfo['fromDiscard'];
  if (fd) {
    fromInfo = { name: fd.name };
    if (fd.rule.needsHandDiscard) {
      fromInfo.discardChoices = ps.hand.map((c) => c.uid);
      const pref = discardPreference(g, p, ps.hand);
      if (pref[0]) fromInfo.discardDefault = pref[0].uid;
      if (!blocked && ps.hand.length === 0) blocked = `${fd.name}：捨てる手札がありません`;
    }
    const n = fd.rule.exileOthers?.(fd.a) ?? 0;
    if (n > 0) {
      const others = ps.discard.filter((c) => c.uid !== card.uid);
      fromInfo.exileCount = n;
      fromInfo.exileChoices = others.map((c) => c.uid);
      fromInfo.exileDefaults = exilePreference(g, p, card, n);
      if (!blocked && others.length < n) blocked = `${fd.name}：他の捨て札が${n}枚ありません`;
    }
  }
  const tauntLimited = enemyTargets.length > 0 && cardTargetableTaunts(g, other(p)).length > 0;
  // 護法：対象ごとのコスト。どの対象もエナジーが足りなければ使えない
  const targetCosts = wardCosts(enemyTargets, cost, (chosen) => effectiveCost(g, p, card, { chosen, from }));
  if (!blocked && noPayableTarget(enemyTargets, targetCosts, cost, energy)) blocked = 'エナジーが足りません（護法）';
  const info: PlayInfo = { card, cost, blocked, enemyTargets, allyTargets, warnings: playWarnings(g, p, def, allyTargets, timing, undefined, card.cardId), tauntLimited };
  if (targetCosts) info.targetCosts = targetCosts;
  // モード選択（MTG 要素 ○ バッチC2）：モードごとの情報。どのモードも使えなければ使えない
  const modes = playableModes(def, timing);
  if (modes.length > 0) applyModes(g, p, card, def, timing, from, modes, blocked, info);
  info.printedCost = def.cost;
  info.breakdown = breakdown;
  if (fromDiscard) info.from = 'discard';
  if (fromInfo) info.fromDiscard = fromInfo;
  const k = kickerCost(def);
  if (k > 0) {
    const costs = enemyTargets.length > 0 ? enemyTargets.map((t) => targetCosts?.[targetKey(t)] ?? cost) : [cost];
    info.kicker = { extra: k, payable: costs.some((c) => c + k <= energy) };
  }
  return info;
}

/**
 * モード選択のカードの PlayInfo を、モードごとの情報で作り直す（MTG 要素 ○ バッチC2）。
 * common はモードに関係しない使えない理由（今は使えない・デメリット・捨て札の支払いなど）
 */
function applyModes(
  g: GameState,
  p: PlayerId,
  card: CardInst,
  def: CardDef,
  timing: TimingId,
  from: 'hand' | 'discard',
  modes: number[],
  common: string | null,
  info: PlayInfo,
): void {
  const energy = g.players[p].energy;
  const texts = new Map(modeTexts(def, timing).map((m) => [m.mode as number, m.text]));
  const list: ModeInfo[] = modes.map((mode) => {
    const rules = chosenRules(def, timing, mode);
    const enemyTargets = enemyCandidates(g, p, rules.enemy);
    const allyTargets = rules.ally ? allyCandidates(g, p, card, timing) : [];
    const cost = effectiveCost(g, p, card, { from, mode });
    const targetCosts = wardCosts(enemyTargets, cost, (chosen) => effectiveCost(g, p, card, { chosen, from, mode }));
    // 「エナジーが足りません」以外の共通の理由はそのまま。エナジーはモードごとに見直す
    let blocked = common && !common.startsWith('エナジーが足りません') ? common : null;
    if (!blocked && cost > energy) blocked = 'エナジーが足りません';
    if (!blocked && noPayableTarget(enemyTargets, targetCosts, cost, energy)) blocked = 'エナジーが足りません（護法）';
    const m: ModeInfo = {
      mode,
      label: modeName(mode),
      text: mode === 0 ? [...texts.values()].join(' ／ ') : (texts.get(mode) ?? ''),
      cost,
      blocked,
      enemyTargets,
      allyTargets,
      warnings: playWarnings(g, p, def, allyTargets, timing, mode, card.cardId),
    };
    if (targetCosts) m.targetCosts = targetCosts;
    return m;
  });
  const open = list.filter((m) => !m.blocked);
  const usable = open.length > 0 ? open : list;
  const sameRefKey = new Map<string, TargetRef>();
  for (const m of usable) for (const t of m.enemyTargets) sameRefKey.set(targetKey(t), t);
  info.enemyTargets = [...sameRefKey.values()];
  info.allyTargets = [...new Set(usable.flatMap((m) => m.allyTargets))];
  info.cost = Math.min(...usable.map((m) => m.cost));
  info.blocked = open.length > 0 ? null : (list[0]?.blocked ?? common);
  // 対象ごとの最安のコスト（ドラッグで光らせる対象。護法）
  let targetCosts: Record<string, number> | undefined;
  for (const t of info.enemyTargets) {
    const k = targetKey(t);
    const c = Math.min(...usable.filter((m) => m.enemyTargets.some((x) => targetKey(x) === k)).map((m) => m.targetCosts?.[k] ?? m.cost));
    if (c !== info.cost) (targetCosts ??= {})[k] = c;
  }
  if (targetCosts) info.targetCosts = targetCosts;
  else delete info.targetCosts;
  // 注意はどのモードにも出るもの（パワーの上限・封殺）だけ
  info.warnings = list.length > 0 ? list[0]!.warnings.filter((w) => list.every((m) => m.warnings.includes(w))) : info.warnings;
  info.modes = list;
}

/** 捨て札から使えるカード（捨て札から使う能力を持つもの）の情報。使えないものも理由つきで返す */
export function discardPlayInfos(g: GameState, p: PlayerId): PlayInfo[] {
  return g.players[p].discard.filter((c) => fromDiscardAbility(g.cards[c.cardId]) !== undefined).map((c) => playInfo(g, p, c, { from: 'discard' }));
}

/**
 * 手放してよい順（再活で捨てる手札・CPU の手札整理と同じ考え方）：ノイズ → 呪い → 捨てられたときの効果があるもの（MTG 要素 △ バッチA）→
 * このターン払えないコストの重いもの → 軽いもの
 */
export function discardPreference(g: GameState, p: PlayerId, cards: readonly CardInst[]): CardInst[] {
  const energy = g.players[p].energy;
  const key = (c: CardInst): number => {
    if (c.cardId === NOISE_CARD_ID) return 3000;
    const def = g.cards[c.cardId];
    if (!def) return 3000;
    if (isCurseCard(def)) return 2000;
    if (def.effects.some((e) => e.timing === 'discarded')) return 1500;
    return def.cost > energy ? 100 + def.cost : 10 - def.cost;
  };
  return [...cards].sort((a, b) => key(b) - key(a));
}

/** 脱出で除外する捨て札の既定（ノイズ・呪いを先に、次に古い順。捨て札から使えるカードは最後）。n 枚に足りなければあるだけ */
export function exilePreference(g: GameState, p: PlayerId, card: CardInst, n: number): string[] {
  const others = g.players[p].discard.map((c, i) => ({ c, i })).filter((x) => x.c.uid !== card.uid);
  const rank = (c: CardInst): number => {
    if (c.cardId === NOISE_CARD_ID) return 0;
    const def = g.cards[c.cardId];
    if (!def) return 0;
    if (isCurseCard(def)) return 1;
    return fromDiscardAbility(def) ? 3 : 2;
  };
  return others
    .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
    .slice(0, n)
    .map((x) => x.c.uid);
}

/** 起動（MTG 要素 ○ バッチC1）の情報。起動の能力が無いものは null */
export function activateInfo(g: GameState, p: PlayerId, sourceUid: string): ActivateInfo | null {
  const src = activateSource(g, p, sourceUid);
  if (!src) return null;
  const t = activateTargets(g, p, src);
  const energy = g.players[p].energy;
  let blocked = activateBlock(g, p, src);
  const targetCosts = wardCosts(t.enemy, src.cost, (chosen) => src.cost + wardTaxFor(g, p, chosen));
  if (!blocked && noPayableTarget(t.enemy, targetCosts, src.cost, energy)) blocked = 'エナジーが足りません（護法）';
  const info: ActivateInfo = {
    sourceUid,
    kind: src.kind,
    cardId: src.cardId,
    name: src.name,
    cost: src.cost,
    blocked,
    enemyTargets: t.enemy,
    allyTargets: t.ally,
    warnings: effectWarnings(g, p, activatedEffects(src), t.ally, false),
    tauntLimited: t.enemy.length > 0 && cardTargetableTaunts(g, other(p)).length > 0,
  };
  if (targetCosts) info.targetCosts = targetCosts;
  return info;
}

/** 自分の起動できるもの（場のモンスター → パワー）の情報。起動できないものも理由つき */
export function activateInfos(g: GameState, p: PlayerId): ActivateInfo[] {
  return activateSources(g, p).flatMap((s) => {
    const info = activateInfo(g, p, s.uid);
    return info ? [info] : [];
  });
}

/** 手札から使う能力（サイクリング・魂力。MTG 要素 ○ バッチC1）の情報。その能力が無ければ null */
export function handAbilityInfo(g: GameState, p: PlayerId, card: CardInst, ability: HandAbilityKind): HandAbilityInfo | null {
  const def = g.cards[card.cardId];
  const h = handAbilityOf(def, ability);
  if (!def || !h || card.cardId === NOISE_CARD_ID) return null;
  const t = handAbilityTargets(g, p, card, ability);
  const energy = g.players[p].energy;
  let blocked = handAbilityBlock(g, p, card, ability);
  const targetCosts = wardCosts(t.enemy, h.cost, (chosen) => h.cost + wardTaxFor(g, p, chosen));
  if (!blocked && noPayableTarget(t.enemy, targetCosts, h.cost, energy)) blocked = 'エナジーが足りません（護法）';
  const info: HandAbilityInfo = {
    card,
    ability,
    name: h.name,
    cost: h.cost,
    blocked,
    enemyTargets: t.enemy,
    allyTargets: t.ally,
    warnings: ability === 'channel' ? effectWarnings(g, p, def.effects.filter((e) => e.timing === 'channel'), t.ally, false) : [],
    tauntLimited: t.enemy.length > 0 && cardTargetableTaunts(g, other(p)).length > 0,
  };
  if (targetCosts) info.targetCosts = targetCosts;
  return info;
}

/** このカードの手札から使う能力の情報（無ければ空） */
export function handAbilityInfos(g: GameState, p: PlayerId, card: CardInst): HandAbilityInfo[] {
  return handAbilityKinds(g.cards[card.cardId]).flatMap((k) => {
    const info = handAbilityInfo(g, p, card, k);
    return info ? [info] : [];
  });
}

/** 「選んだ1体」の組をすべて（相手側 × 自分側。どちらも無ければ空の1組） */
function chosenCombos(enemyTargets: TargetRef[], allyTargets: string[]): Chosen[] {
  const enemies: (TargetRef | undefined)[] = enemyTargets.length ? enemyTargets : [undefined];
  const allies: (string | undefined)[] = allyTargets.length ? allyTargets : [undefined];
  const out: Chosen[] = [];
  for (const enemy of enemies) for (const ally of allies) out.push({ ...(enemy ? { enemy } : {}), ...(ally ? { ally } : {}) });
  return out;
}

/** カードを使う行動をすべて（キッカーを払える組は払う／払わないの両方。モード選択のカードはモードごと：MTG 要素 ○ バッチC2） */
function playActions(g: GameState, p: PlayerId, info: PlayInfo, extra: PlayOpts): Action[] {
  const out: Action[] = [];
  const kicks = info.kicker?.payable ? [false, true] : [false];
  const variants: { mode?: number; enemy: TargetRef[]; ally: string[] }[] = info.modes
    ? info.modes.filter((m) => !m.blocked).map((m) => ({ mode: m.mode, enemy: m.enemyTargets, ally: m.allyTargets }))
    : [{ enemy: info.enemyTargets, ally: info.allyTargets }];
  for (const v of variants) {
    for (const chosen of chosenCombos(v.enemy, v.ally)) {
      for (const kick of kicks) {
        const opts: PlayOpts = { ...extra, ...(kick ? { kick: true } : {}), ...(v.mode !== undefined ? { mode: v.mode } : {}) };
        if (validatePlay(g, p, info.card.uid, chosen, opts) !== null) continue;
        out.push({ type: 'playCard', player: p, cardUid: info.card.uid, chosen, ...opts });
      }
    }
  }
  return out;
}

export function legalActions(g: GameState, p: PlayerId): Action[] {
  if (g.phase === 'ended') return [];
  const ps = g.players[p];
  if (g.phase === 'mulligan') {
    if (ps.mulligan.done) return [];
    const out: Action[] = [{ type: 'mulligan', player: p, mode: 'keep' }];
    if (nextFullMulliganSize(g, p) >= BALANCE.battle.mulliganMinHand) out.push({ type: 'mulligan', player: p, mode: 'all' });
    return out;
  }
  if (g.pending) {
    if (g.pending.player !== p) return [];
    const out: Action[] = [];
    if (g.pending.min === 0) out.push({ type: 'choose', player: p, picks: [] });
    for (const o of g.pending.options) out.push({ type: 'choose', player: p, picks: [o.id] });
    return out;
  }
  if (g.active !== p) return [];
  const out: Action[] = [];
  for (const card of ps.hand) {
    if (card.cardId === NOISE_CARD_ID) {
      if (ps.energy >= BALANCE.battle.noiseRemoveCost) out.push({ type: 'removeNoise', player: p, cardUid: card.uid });
      continue;
    }
    const info = playInfo(g, p, card);
    if (!info.blocked) out.push(...playActions(g, p, info, {}));
    // 手札から使う能力（サイクリング・魂力。MTG 要素 ○ バッチC1）
    for (const h of handAbilityInfos(g, p, card)) {
      if (h.blocked) continue;
      for (const chosen of chosenCombos(h.enemyTargets, h.allyTargets)) {
        const a: Action = { type: 'handAbility', player: p, cardUid: card.uid, ability: h.ability, chosen };
        if (validateHandAbility(g, p, card.uid, h.ability, chosen) === null) out.push(a);
      }
    }
  }
  // 捨て札から使う（MTG 要素 ○ バッチC1）：再活で捨てる手札・脱出で除外する捨て札は既定の1通り（手放してよい順）
  for (const info of discardPlayInfos(g, p)) {
    if (info.blocked) continue;
    const extra: PlayOpts = { from: 'discard' };
    if (info.fromDiscard?.discardDefault) extra.discardUid = info.fromDiscard.discardDefault;
    if (info.fromDiscard?.exileDefaults) extra.exileUids = info.fromDiscard.exileDefaults;
    out.push(...playActions(g, p, info, extra));
  }
  // 起動（MTG 要素 ○ バッチC1）
  for (const info of activateInfos(g, p)) {
    if (info.blocked) continue;
    for (const chosen of chosenCombos(info.enemyTargets, info.allyTargets)) {
      if (validateActivate(g, p, info.sourceUid, chosen) === null) out.push({ type: 'activate', player: p, sourceUid: info.sourceUid, chosen });
    }
  }
  for (const m of ps.board) {
    if (attackBlockReason(g, m)) continue;
    for (const target of attackTargets(g, m)) out.push({ type: 'attack', player: p, attackerUid: m.uid, target });
  }
  out.push({ type: 'endTurn', player: p });
  return out;
}
