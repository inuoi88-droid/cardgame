/** 今できる行動の一覧（UI・CPU・サーバーの検証で共用） */
import { BALANCE } from '../balance.ts';
import { CONDITIONS, isMonsterOnlyRule } from '../options.ts';
import { getAbility, getEffect } from '../registry.ts';
import type { CardDef } from '../types.ts';
import { attackBlockReason, attackTargets, enlistOptions } from './combat.ts';
import { checkCondition } from './conditions.ts';
import { effectiveAttack, other } from './core.ts';
import { cardTargetableTaunts } from './damage.ts';
import { nextFullMulliganSize } from './mulligan.ts';
import { validateActivate, validateDiscardAbility, validateHandAbility } from './abilities.ts';
import {
  activateBlock,
  activatedEffects,
  activateSource,
  activateSources,
  activateTargets,
  discardAbilityBlock,
  discardAbilityKinds,
  discardAbilityOf,
  discardAbilityTargets,
  handAbilityBlock,
  handAbilityKinds,
  handAbilityOf,
  handAbilityTargets,
} from './abilities.ts';
import {
  allyCandidates,
  altsOf,
  canTap,
  chosenRules,
  convokeMax,
  costBreakdown,
  delveMax,
  emergeCut,
  extraPayOf,
  hasPitch,
  lifePayMax,
  overloadedDef,
  pitchMatches,
  sacrificeOf,
  drawbackBlock,
  effectiveCost,
  enemyCandidates,
  fromDiscardAbility,
  icedBlock,
  kickerCost,
  waitingPlayBlock,
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
import { cardModes, effectsForMode, isVillain, spreeCost, tieredSurcharge } from './modes.ts';
import { tribeAllies } from './runtime.ts';
import { advanceableSagas } from './powers.ts';
import { setAsideBlock, setAsideCost, setAsideKinds, setAsideOf, waitingFull } from './waiting.ts';
import { levelOf, revealBlock, revealSource, revealTargets, validateReveal } from './abilities.ts';
import type { EffectInstance, TimingId } from '../types.ts';
import {
  ARMY_CARD_ID,
  NOISE_CARD_ID,
  type Action,
  type ActivateUse,
  type AltPlay,
  type CardInst,
  type Chosen,
  type DiscardAbilityKind,
  type ExtraPayKind,
  type GameState,
  type HandAbilityKind,
  type Monster,
  type PlayerId,
  type SacrificeKind,
  type SetAsideKind,
  type TargetRef,
} from './types.ts';

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
  /** 捨て札から使う（フラッシュバック・再活・脱出）ときの情報なら 'discard'、待機ゾーンから（MTG 要素 △ バッチC）なら 'waiting' */
  from?: 'discard' | 'waiting';
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
  // ---- MTG 要素 △ バッチB
  /** 追加の支払い・代わりの使い方・差し出す・払い方（選べるものがあるときだけ） */
  pay?: PayOptions;
  /** 放題：2つ以上のモードの組み合わせごとの情報（modes に組み合わせ） */
  modeCombos?: ModeInfo[];
  /** 最悪の二択：モードは相手が選ぶ（使う人は選ばない） */
  villain?: boolean;
}

/**
 * 追加の支払いと払い方（MTG 要素 △ バッチB）。UI の支払いのシートと CPU はこれだけを使う。
 * minCost は、選べる払い方（現出・召集・探査・調和・代替コスト・血の支払い）をすべて使ったときの最小のコスト
 */
export interface PayOptions {
  /** 追加の支払い（切除・奮励・分隊）：1回のエナジーと回数の上限 */
  extra?: { kind: ExtraPayKind; name: string; unit: number; max: number };
  /** 代わりの使い方（試作・想起・超過・解鎖） */
  alts?: AltInfo[];
  /** 差し出す（現出・犠牲・協約）：候補（現出は下がるコスト、協約はパワーも）と、CPU が選ぶもの */
  sacrifice?: { kind: SacrificeKind; name: string; options: { uid: string; cut: number; power?: boolean }[]; best?: string };
  /** 休ませる（召集・調和）：候補（下がるコスト）と上限 */
  tap?: { kind: 'convoke' | 'harmonize'; name: string; options: { uid: string; cut: number }[]; max: number };
  /** 探査：除外できる捨て札と上限、CPU が先に選ぶ順 */
  delve?: { max: number; options: string[]; order: string[] };
  /** 代替コスト：除外できる手札と、CPU が選ぶもの */
  pitch?: { options: string[]; best?: string };
  /** 血の支払い：HP で払える数（今の HP で払える分まで）と1つあたりの HP */
  lifePay?: { max: number; hpPer: number };
  minCost: number;
}

/** 代わりの使い方の情報（PlayInfo と同じ形の対象・コスト） */
export interface AltInfo {
  alt: AltPlay;
  /** 能力の名前（「試作」など） */
  name: string;
  /** 短い説明（「コスト−1・攻撃力と体力が半分」など） */
  note: string;
  cost: number;
  blocked: string | null;
  enemyTargets: TargetRef[];
  allyTargets: string[];
  warnings: string[];
  targetCosts?: Record<string, number>;
}

/** 捨て札のカードの能力（相続・発掘・不朽。MTG 要素 △ バッチB）の情報。PlayInfo と同じ形 */
export interface DiscardAbilityInfo {
  card: CardInst;
  ability: DiscardAbilityKind;
  name: string;
  cost: number;
  blocked: string | null;
  enemyTargets: TargetRef[];
  allyTargets: string[];
  warnings: string[];
  tauntLimited: boolean;
  targetCosts?: Record<string, number>;
}

/** モード選択のカードの1つのモードの情報（MTG 要素 ○ バッチC2） */
export interface ModeInfo {
  /** 1〜3（0 は双呪：すべてのモード） */
  mode: number;
  /** 放題（MTG 要素 △ バッチB）で選ぶモードの組み合わせ（2つ以上）。このとき mode は最初のモード */
  modes?: number[];
  /** 段階（MTG 要素 △ バッチB）の追加のエナジー */
  surcharge?: number;
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
  /** Lvアップ・忠誠+1・忠誠−K（MTG 要素 △ バッチC。省略は能力「起動」） */
  use?: ActivateUse;
  /** ボタンの名前（「起動」「Lvアップ」「+1」「−3」） */
  label?: string;
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
  // 昼と夜（MTG 要素 △ バッチD）：「昼なら」と「夜なら」の両方を持つカード（日暮／夜明の両面）は、どちらかは必ず発動しないので注意しない。
  // まだ始まっていなければ、使ったときに昼で始まる
  const twoFaced = effects.some((e) => e.condition === 'isDay') && effects.some((e) => e.condition === 'isNight');
  const dayNow = (g.dayNight ?? 'day') === 'day';
  for (const e of effects) {
    const ed = getEffect(e.id);
    if (!ed) continue;
    // 濫用は使ってから選ぶので、生け贄にできるモンスターがいれば満たせる。キッカーは払うかどうかを使うときに選ぶ
    if (e.condition === 'kicked') continue;
    const dayNight = e.condition === 'isDay' || e.condition === 'isNight';
    if (dayNight && twoFaced) continue;
    const unmet =
      e.condition === 'exploit'
        ? myMonsters === 0
        : dayNight
          ? (e.condition === 'isDay') !== dayNow
          : e.condition !== null && !checkCondition(g, p, e.condition, cardId ? { cardId } : {});
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
    // MTG 要素 △ バッチC
    case 'heist':
      return opp.deck.length > 0 ? null : '相手の山札がありません';
    case 'manifest':
      return me.deck.length > 0 ? null : '山札がありません';
    case 'extraTurn':
      return me.extraTurnUsed ? '追加ターンはこの試合でもう得ました（1試合1回）' : null;
    case 'siege': {
      const mine = [...g.players[0].board, ...g.players[1].board].filter((m) => m.siege?.player === p).length;
      return mine >= BALANCE.battle.maxSieges ? `砦は1人${BALANCE.battle.maxSieges}つまでです` : null;
    }
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
export function playInfo(g: GameState, p: PlayerId, card: CardInst, opts: { from?: 'discard' | 'waiting' } = {}): PlayInfo {
  const def = g.cards[card.cardId];
  if (card.cardId === NOISE_CARD_ID || !def) {
    return { card, cost: BALANCE.battle.noiseRemoveCost, blocked: 'ノイズ', enemyTargets: [], allyTargets: [], warnings: [], tauntLimited: false };
  }
  const fromDiscard = opts.from === 'discard';
  const fromWaiting = opts.from === 'waiting';
  const from = fromDiscard ? 'discard' : fromWaiting ? 'waiting' : 'hand';
  const timing = playTiming(def, fromDiscard ? 'discard' : 'hand');
  const rules = chosenRules(def, timing);
  const enemyTargets = enemyCandidates(g, p, rules.enemy);
  const allyTargets = rules.ally ? allyCandidates(g, p, card, timing) : [];
  const breakdown = costBreakdown(g, p, card, { from });
  const cost = breakdown.total;
  const energy = g.players[p].energy;
  const ps = g.players[p];
  // 追加の支払いと払い方（MTG 要素 △ バッチB）：払い方を使えば下がるコスト。待機ゾーンから使うときは無し（MTG 要素 △ バッチC）
  const pay = fromWaiting ? undefined : payOptions(g, p, card, def, fromDiscard ? 'discard' : 'hand', timing);
  const reach = pay ? Math.max(0, cost - pay.minCost) : 0;
  let blocked: string | null = null;
  const fd = fromDiscard ? fromDiscardAbility(def) : undefined;
  if (g.phase !== 'main' || g.active !== p || g.pending) blocked = '今は使えません';
  else if (fromWaiting) blocked = waitingPlayBlock(g, p, card.uid);
  else if (fromDiscard && !fd) blocked = '捨て札から使えません';
  else if (fromDiscard && !ps.discard.some((c) => c.uid === card.uid)) blocked = '捨て札にありません';
  else if (!fromDiscard && !fromWaiting && icedBlock(g, card)) blocked = icedBlock(g, card);
  else if (fd?.rule.oncePerTurn && card.retraceTurn === g.turnIndex) blocked = `${fd.name}：このカードはこのターンもう使いました`;
  else if (fd?.rule.onlyIfDiscardedThisTurn && card.discardedTurn !== g.turnIndex) blocked = `${fd.name}：このターンに捨てられていません`;
  else if (cost - reach > energy && !(pay?.alts ?? []).some((x) => !x.blocked)) blocked = 'エナジーが足りません';
  else blocked = drawbackBlock(g, p, card);
  // 捨て札から使うときの追加の支払い（再活・回顧：手札を1枚／脱出：他の捨て札を N 枚）
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
  if (!blocked && reach === 0 && noPayableTarget(enemyTargets, targetCosts, cost, energy) && !(pay?.alts ?? []).some((x) => !x.blocked)) blocked = 'エナジーが足りません（護法）';
  const info: PlayInfo = { card, cost, blocked, enemyTargets, allyTargets, warnings: playWarnings(g, p, def, allyTargets, timing, undefined, card.cardId), tauntLimited };
  if (targetCosts) info.targetCosts = targetCosts;
  // モード選択（MTG 要素 ○ バッチC2）：モードごとの情報。どのモードも使えなければ使えない
  const modes = playableModes(def, timing);
  if (modes.length > 0) applyModes(g, p, card, def, timing, from, modes, blocked, info, reach);
  // 最悪の二択（MTG 要素 △ バッチB）：モードは相手が選ぶ
  if (isVillain(def) && cardModes(def, timing).length > 0) info.villain = true;
  info.printedCost = def.cost;
  info.breakdown = breakdown;
  if (fromDiscard) info.from = 'discard';
  if (fromWaiting) info.from = 'waiting';
  if (fromInfo) info.fromDiscard = fromInfo;
  if (pay) info.pay = pay;
  const k = kickerCost(def);
  if (k > 0) {
    const costs = enemyTargets.length > 0 ? enemyTargets.map((t) => targetCosts?.[targetKey(t)] ?? cost) : [cost];
    info.kicker = { extra: k, payable: costs.some((c) => c + k - reach <= energy) };
  }
  return info;
}

/** 現出・犠牲・協約で差し出す候補の手放してよい順（トークン → 寿命の残り少ない → 攻撃力×3＋体力×1.5 の低い順） */
function sacrificeRank(g: GameState, m: Monster): number {
  const value = effectiveAttack(g, m) * 3 + m.hp * 1.5;
  return (m.card.token ? 0 : m.counters.life !== undefined ? 1e6 : 2e6) + value;
}

/**
 * 追加の支払いと払い方（MTG 要素 △ バッチB）。選べるものが無ければ undefined。
 * 無料で使う（続唱）・待機では使わない（PlayInfo は手札・捨て札から使うときだけ）
 */
export function payOptions(g: GameState, p: PlayerId, card: CardInst, def: CardDef, from: 'hand' | 'discard', timing: TimingId): PayOptions | undefined {
  const ps = g.players[p];
  const energy = ps.energy;
  const hand = from === 'hand';
  const out: Omit<PayOptions, 'minCost'> = {};
  const extra = extraPayOf(def);
  if (extra && (extra.kind !== 'squad' || hand)) out.extra = extra;
  // 代わりの使い方：それぞれのコスト・対象（超過は選ばない）
  const alts = altsOf(def);
  if (alts.length > 0) {
    // 待機ゾーン・裏向きの使い方（ワープ・出来事・変装。MTG 要素 △ バッチC）は手札からだけ
    out.alts = alts.filter((x) => hand || (x.kind !== 'warp' && x.kind !== 'adventure' && x.kind !== 'faceDown')).map((x): AltInfo => {
      const altDef = x.kind === 'overload' ? overloadedDef(def, timing) : def;
      const t = x.kind === 'adventure' ? 'adventure' : timing;
      const rules = x.kind === 'faceDown' ? { enemy: [], ally: false } : chosenRules(altDef, t);
      const enemyTargets = enemyCandidates(g, p, rules.enemy);
      const allyTargets = rules.ally ? allyCandidates(g, p, card, t) : [];
      const cost = effectiveCost(g, p, card, { from, alt: x.kind });
      const targetCosts = wardCosts(enemyTargets, cost, (chosen) => effectiveCost(g, p, card, { chosen, from, alt: x.kind }));
      let blocked: string | null = cost > energy ? 'エナジーが足りません' : null;
      if (!blocked && noPayableTarget(enemyTargets, targetCosts, cost, energy)) blocked = 'エナジーが足りません（護法）';
      const v = x.a.value ?? 0;
      const note =
        x.kind === 'prototype'
          ? `コスト−${v}・攻撃力と体力が半分`
          : x.kind === 'evoke'
            ? `エナジー${v}・召喚時の効果のあと破壊`
            : x.kind === 'overload'
              ? `+${v}・「選んだ1体」が全体になる`
              : x.kind === 'warp'
                ? `エナジー${v}・ターン終了時に待機ゾーンへ`
                : x.kind === 'adventure'
                  ? `エナジー${v}・出来事の効果を使い、あとでモンスターとして出す`
                  : x.kind === 'faceDown'
                    ? `エナジー${cost}・裏向き（攻撃力・体力${BALANCE.battle.faceDownStats}）。あとで表にする`
                    : `攻撃力+${v}・反撃しない`;
      const info: AltInfo = {
        alt: x.kind,
        name: x.name,
        note,
        cost,
        blocked,
        enemyTargets,
        allyTargets,
        warnings: x.kind === 'faceDown' ? [] : playWarnings(g, p, altDef, allyTargets, t, undefined, card.cardId),
      };
      // 出来事のあとは待機ゾーンへ（いっぱいなら捨て札）
      if (x.kind === 'adventure' && waitingFull(g, p)) info.warnings.push('待機ゾーンがいっぱいなので、出来事のあとカードは捨て札に置かれます');
      if (targetCosts) info.targetCosts = targetCosts;
      return info;
    });
    if (out.alts.length === 0) delete out.alts;
  }
  // 差し出す
  const sac = sacrificeOf(def);
  if (sac && (sac.kind !== 'emerge' || hand)) {
    let options: { uid: string; cut: number; power?: boolean }[] = [];
    if (sac.kind === 'emerge') options = ps.board.map((m) => ({ uid: m.uid, cut: emergeCut(g, m) }));
    if (sac.kind === 'casualty') options = ps.board.filter((m) => effectiveAttack(g, m) >= sac.minAttack).map((m) => ({ uid: m.uid, cut: 0 }));
    if (sac.kind === 'bargain') {
      options = [
        ...ps.board.filter((m) => m.card.token).map((m) => ({ uid: m.uid, cut: 0 })),
        ...ps.powers.map((pw) => ({ uid: pw.uid, cut: 0, power: true })),
      ];
    }
    if (options.length > 0) {
      const monster = (uid: string) => ps.board.find((m) => m.uid === uid);
      const ranked = [...options].sort((a, b) => {
        if (sac.kind === 'emerge' && a.cut !== b.cut) return b.cut - a.cut;
        if (sac.kind === 'bargain') {
          // 応召・落とし子のトークン → 寿命の残り少ないパワー → 古いパワー
          const rank = (o: { uid: string; power?: boolean }) => {
            if (!o.power) {
              const tk = monster(o.uid)?.card.token;
              return tk?.temp || tk?.spawn ? 0 : 1;
            }
            const pw = ps.powers.find((x) => x.uid === o.uid);
            return pw?.life !== undefined ? 2 + pw.life : 10;
          };
          return rank(a) - rank(b);
        }
        return sacrificeRank(g, monster(a.uid)!) - sacrificeRank(g, monster(b.uid)!);
      });
      out.sacrifice = { kind: sac.kind, name: sac.name, options, ...(ranked[0] ? { best: ranked[0].uid } : {}) };
    }
  }
  // 休ませる（召集・調和）
  const tapOne = from === 'discard' ? fromDiscardAbility(def)?.rule.tapOne : undefined;
  if (hand && convokeMax(def) > 0) {
    const options = ps.board.filter((m) => canTap(g, m)).map((m) => ({ uid: m.uid, cut: 1 }));
    if (options.length > 0) out.tap = { kind: 'convoke', name: '召集', options, max: convokeMax(def) };
  } else if (tapOne) {
    const options = ps.board
      .filter((m) => canTap(g, m))
      .map((m) => ({ uid: m.uid, cut: Math.min(tapOne.maxCut, Math.floor(effectiveAttack(g, m) / Math.max(1, tapOne.perEnergy))) }));
    if (options.length > 0) out.tap = { kind: 'harmonize', name: fromDiscardAbility(def)!.name, options, max: 1 };
  }
  // 探査
  if (hand && delveMax(def) > 0 && ps.discard.length > 0) {
    out.delve = { max: delveMax(def), options: ps.discard.map((c) => c.uid), order: exilePreference(g, p, card, ps.discard.length) };
  }
  // 代替コスト
  if (hand && hasPitch(def) && (ps.turn.pitched ?? 0) < BALANCE.battle.maxPitchPerTurn) {
    const options = ps.hand.filter((c) => pitchMatches(g, card, c));
    if (options.length > 0) {
      const best = discardPreference(g, p, options)[0];
      out.pitch = { options: options.map((c) => c.uid), ...(best ? { best: best.uid } : {}) };
    }
  }
  // 血の支払い（払ったあと HP が1以上残る分まで）
  const lp = lifePayMax(def);
  if (lp > 0) {
    const hpPer = BALANCE.abilities.lifePay.hpPerEnergy;
    const max = Math.min(lp, Math.floor((ps.hp - 1) / hpPer));
    if (max > 0) out.lifePay = { max, hpPer };
  }
  if (Object.keys(out).length === 0) return undefined;
  // 払い方をすべて使ったときの最小のコスト
  const sacUid = out.sacrifice?.kind === 'emerge' ? out.sacrifice.best : undefined;
  const taps = (out.tap?.options ?? [])
    .filter((o) => o.uid !== sacUid)
    .sort((a, b) => b.cut - a.cut)
    .slice(0, out.tap?.max ?? 0)
    .map((o) => o.uid);
  const minCost = effectiveCost(g, p, card, {
    from,
    ...(sacUid ? { sacrificeUid: sacUid } : {}),
    ...(taps.length > 0 ? { tapUids: taps } : {}),
    ...(out.delve ? { exileUids: out.delve.order.slice(0, out.delve.max) } : {}),
    ...(out.pitch?.best ? { pitchUid: out.pitch.best } : {}),
    ...(out.lifePay ? { lifePay: out.lifePay.max } : {}),
  });
  return { ...out, minCost };
}

/**
 * モード選択のカードの PlayInfo を、モードごとの情報で作り直す（MTG 要素 ○ バッチC2）。
 * common はモードに関係しない使えない理由（今は使えない・デメリット・捨て札の支払いなど）。reach は払い方で下げられるコスト
 */
function applyModes(
  g: GameState,
  p: PlayerId,
  card: CardInst,
  def: CardDef,
  timing: TimingId,
  from: 'hand' | 'discard' | 'waiting',
  modes: number[],
  common: string | null,
  info: PlayInfo,
  reach = 0,
): void {
  const energy = g.players[p].energy;
  const texts = new Map(modeTexts(def, timing).map((m) => [m.mode as number, m.text]));
  const make = (sel: number | number[]): ModeInfo => {
    const mode = typeof sel === 'number' ? sel : sel[0]!;
    const ctxMode = typeof sel === 'number' ? { mode: sel } : { modes: sel };
    const rules = chosenRules(def, timing, sel);
    const enemyTargets = enemyCandidates(g, p, rules.enemy);
    const allyTargets = rules.ally ? allyCandidates(g, p, card, timing) : [];
    const cost = effectiveCost(g, p, card, { from, ...ctxMode });
    const targetCosts = wardCosts(enemyTargets, cost, (chosen) => effectiveCost(g, p, card, { chosen, from, ...ctxMode }));
    // 「エナジーが足りません」以外の共通の理由はそのまま。エナジーはモードごとに見直す
    let blocked = common && !common.startsWith('エナジーが足りません') ? common : null;
    if (!blocked && cost - reach > energy) blocked = 'エナジーが足りません';
    if (!blocked && reach === 0 && noPayableTarget(enemyTargets, targetCosts, cost, energy)) blocked = 'エナジーが足りません（護法）';
    const surcharge = tieredSurcharge(def, sel, BALANCE.abilities.tiered.surcharge);
    const m: ModeInfo = {
      mode,
      label: typeof sel === 'number' ? modeName(sel) : sel.map((x) => modeName(x)).join('+'),
      text: typeof sel === 'number' ? (sel === 0 ? [...texts.values()].join(' ／ ') : (texts.get(sel) ?? '')) : sel.map((x) => texts.get(x) ?? '').join(' ／ '),
      cost,
      blocked,
      enemyTargets,
      allyTargets,
      warnings: playWarnings(g, p, def, allyTargets, timing, typeof sel === 'number' ? sel : undefined, card.cardId),
    };
    if (typeof sel !== 'number') m.modes = [...sel];
    if (surcharge > 0) m.surcharge = surcharge;
    if (targetCosts) m.targetCosts = targetCosts;
    return m;
  };
  const list: ModeInfo[] = modes.map((mode) => make(mode));
  // 放題（MTG 要素 △ バッチB）：2つ以上の組み合わせ
  if (spreeCost(def) > 0) {
    const single = modes.filter((m) => m > 0);
    const combos: number[][] = [];
    for (let mask = 1; mask < 1 << single.length; mask++) {
      const set = single.filter((_, i) => mask & (1 << i));
      if (set.length >= 2) combos.push(set);
    }
    info.modeCombos = combos.map((c) => make(c));
  }
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

/** 起動（MTG 要素 ○ バッチC1）の情報。起動の能力が無いものは null。use は Lvアップ・忠誠+1・忠誠−K（MTG 要素 △ バッチC） */
export function activateInfo(g: GameState, p: PlayerId, sourceUid: string, use?: ActivateUse): ActivateInfo | null {
  const src = activateSource(g, p, sourceUid, use);
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
  if (use) {
    info.use = use;
    const cut = getAbility(src.ability.id)?.battle.loyalty?.cut(src.ability) ?? 0;
    info.label = use === 'level' ? `Lv${levelOf(src)}→${levelOf(src) + 1}` : use === 'plus' ? '+1' : `−${cut}`;
  }
  return info;
}

/** 自分の起動できるもの（場のモンスター → パワー。起動・Lvアップ・忠誠+1／−K）の情報。起動できないものも理由つき */
export function activateInfos(g: GameState, p: PlayerId): ActivateInfo[] {
  return activateSources(g, p).flatMap((s) => {
    const info = activateInfo(g, p, s.uid, s.use);
    return info ? [info] : [];
  });
}

// ---------------------------------------------------------------- MTG 要素 △ バッチC：待機ゾーン・裏向き

/** 手札のカードを待機させる（予顕・計画・待機）ときの情報 */
export interface SetAsideInfo {
  card: CardInst;
  kind: SetAsideKind;
  /** 能力の名前（予顕・計画・待機） */
  name: string;
  /** 置くときに払うエナジー */
  cost: number;
  blocked: string | null;
  /** 短い説明（「エナジー2で伏せ、後のターンにコスト−1」など） */
  note: string;
}

/** 手札のカードを待機させるときの情報（このカードの待機の能力ごと。無ければ空） */
export function setAsideInfo(g: GameState, p: PlayerId, card: CardInst): SetAsideInfo[] {
  const def = g.cards[card.cardId];
  if (!def || card.cardId === NOISE_CARD_ID) return [];
  return setAsideKinds(def).map((kind) => {
    const x = setAsideOf(def, kind)!;
    const cost = setAsideCost(g, p, card, kind);
    const sa = x.ad.battle.setAside!;
    const note =
      kind === 'foretell'
        ? `エナジー${cost}で伏せ、後のターンにコスト−${sa.cut?.(x.a) ?? 0}で使う`
        : kind === 'plot'
          ? `今エナジー${cost}を払い、後のターンに無料で使う`
          : `エナジー${cost}で待機させ、${sa.time?.(x.a) ?? 1}ターン後に無料で使う`;
    return { card, kind, name: x.ad.name, cost, blocked: setAsideBlock(g, p, card, kind), note };
  });
}

/** 自分の手札のうち、待機させられるカードの情報（使えないものも理由つき） */
export function setAsideInfos(g: GameState, p: PlayerId): SetAsideInfo[] {
  return g.players[p].hand.flatMap((c) => setAsideInfo(g, p, c));
}

/** 待機ゾーンのカードを使うときの情報（PlayInfo。待機のカードは自動で使われるので出さない） */
export function waitingPlayInfos(g: GameState, p: PlayerId): PlayInfo[] {
  return (g.players[p].waiting ?? []).filter((w) => w.kind !== 'suspend').map((w) => playInfo(g, p, w.card, { from: 'waiting' }));
}

/** 裏向きの自分のモンスターを表にするときの情報（PlayInfo と同じ形の対象・コスト） */
export interface RevealInfo {
  uid: string;
  /** 本当のカード（持ち主にだけ見える） */
  cardId: string;
  name: string;
  cost: number;
  blocked: string | null;
  enemyTargets: TargetRef[];
  allyTargets: string[];
  warnings: string[];
  tauntLimited: boolean;
  targetCosts?: Record<string, number>;
}

export function revealInfo(g: GameState, p: PlayerId, uid: string): RevealInfo | null {
  const m = g.players[p].board.find((x) => x.uid === uid);
  const card = m?.faceDown?.card;
  if (!m || !card) return null;
  const def = g.cards[card.cardId];
  const src = revealSource(g, p, uid);
  const t = src ? revealTargets(g, p, src.def) : { enemy: [], ally: [] };
  const cost = src?.cost ?? 0;
  let blocked = revealBlock(g, p, uid);
  const targetCosts = wardCosts(t.enemy, cost, (chosen) => cost + wardTaxFor(g, p, chosen));
  if (!blocked && noPayableTarget(t.enemy, targetCosts, cost, g.players[p].energy)) blocked = 'エナジーが足りません（護法）';
  const info: RevealInfo = {
    uid,
    cardId: card.cardId,
    name: def?.name ?? '？',
    cost,
    blocked,
    enemyTargets: t.enemy,
    allyTargets: t.ally,
    warnings: def ? effectWarnings(g, p, def.effects.filter((e) => e.timing === 'revealed'), t.ally, false) : [],
    tauntLimited: t.enemy.length > 0 && cardTargetableTaunts(g, other(p)).length > 0,
  };
  if (targetCosts) info.targetCosts = targetCosts;
  return info;
}

/** 自分の裏向きのモンスターを表にするときの情報（表にできないものも理由つき） */
export function revealInfos(g: GameState, p: PlayerId): RevealInfo[] {
  return g.players[p].board.flatMap((m) => {
    const info = m.faceDown ? revealInfo(g, p, m.uid) : null;
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
    warnings: ability === 'cycling' ? [] : effectWarnings(g, p, def.effects.filter((e) => e.timing === ability), t.ally, false),
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

/**
 * 追加の支払い・払い方の組（MTG 要素 △ バッチB。CPU 用に絞る）：払わない／追加払い 1〜上限／差し出す・代替コストは手放してよい先頭／
 * 足りないときは召集・調和・探査・血の支払いを払えるまで（少ない順）
 */
function payVariants(g: GameState, p: PlayerId, info: PlayInfo, base: number): PlayOpts[] {
  const pay = info.pay;
  const out: PlayOpts[] = [{}];
  if (!pay) return out;
  const ps = g.players[p];
  if (pay.extra) for (let n = 1; n <= pay.extra.max; n++) out.push({ extra: n });
  if (pay.sacrifice?.best) out.push({ sacrificeUid: pay.sacrifice.best });
  if (pay.pitch?.best) out.push({ pitchUid: pay.pitch.best });
  // 足りない分を払い方で埋める
  let need = base - ps.energy;
  if (need > 0) {
    const cheap: PlayOpts = {};
    if (pay.tap) {
      const order = [...pay.tap.options].sort((a, b) => b.cut - a.cut || tapRank(g, a.uid) - tapRank(g, b.uid));
      const taps: string[] = [];
      for (const o of order) {
        if (need <= 0 || taps.length >= pay.tap.max) break;
        taps.push(o.uid);
        need -= o.cut;
      }
      if (taps.length > 0) cheap.tapUids = taps;
    }
    if (need > 0 && pay.delve) {
      const ids = pay.delve.order.slice(0, Math.min(pay.delve.max, need));
      if (ids.length > 0) cheap.exileUids = ids;
      need -= ids.length;
    }
    // 血の支払いは HP が半分より多いときだけ
    if (need > 0 && pay.lifePay && ps.hp > ps.maxHp / 2) {
      cheap.lifePay = Math.min(pay.lifePay.max, need);
      need -= cheap.lifePay;
    }
    if (Object.keys(cheap).length > 0) out.push(cheap);
  }
  return out;
}

/** 召集で休ませてよい順（小さいほど先）：召喚酔い → 攻撃できない（防衛・消耗）→ 攻撃力の低い順 */
function tapRank(g: GameState, uid: string): number {
  const m = g.players[g.active].board.find((x) => x.uid === uid);
  if (!m) return 1e9;
  const reason = attackBlockReason(g, m);
  return (reason ? 0 : 1e6) + effectiveAttack(g, m);
}

/** カードを使う行動をすべて（キッカーを払える組は払う／払わないの両方。モード選択のカードはモードごと：MTG 要素 ○ バッチC2） */
function playActions(g: GameState, p: PlayerId, info: PlayInfo, extra: PlayOpts): Action[] {
  const out: Action[] = [];
  const kicks = info.kicker?.payable ? [false, true] : [false];
  const variants: { mode?: number; modes?: number[]; enemy: TargetRef[]; ally: string[]; cost: number; alt?: AltPlay }[] = info.modes
    ? [...info.modes, ...(info.modeCombos ?? [])]
        .filter((m) => !m.blocked)
        .map((m) => ({ ...(m.modes ? { modes: m.modes } : { mode: m.mode }), enemy: m.enemyTargets, ally: m.allyTargets, cost: m.cost }))
    : [{ enemy: info.enemyTargets, ally: info.allyTargets, cost: info.cost }];
  // 代わりの使い方（MTG 要素 △ バッチB）は、それぞれの対象で
  for (const alt of info.pay?.alts ?? []) {
    if (!alt.blocked) variants.push({ alt: alt.alt, enemy: alt.enemyTargets, ally: alt.allyTargets, cost: alt.cost });
  }
  for (const v of variants) {
    const pays = v.alt ? [{}] : payVariants(g, p, info, v.cost);
    for (const chosen of chosenCombos(v.enemy, v.ally)) {
      for (const kick of kicks) {
        for (const pay of pays) {
          const opts: PlayOpts = {
            ...extra,
            ...pay,
            ...(kick ? { kick: true } : {}),
            ...(v.mode !== undefined ? { mode: v.mode } : {}),
            ...(v.modes !== undefined ? { modes: v.modes } : {}),
            ...(v.alt !== undefined ? { alt: v.alt } : {}),
          };
          if (validatePlay(g, p, info.card.uid, chosen, opts) !== null) continue;
          out.push({ type: 'playCard', player: p, cardUid: info.card.uid, chosen, ...opts });
        }
      }
    }
  }
  return out;
}

/** 捨て札のカードの能力（相続・発掘・不朽。MTG 要素 △ バッチB）の情報。その能力が無ければ null */
export function discardAbilityInfo(g: GameState, p: PlayerId, card: CardInst, ability: DiscardAbilityKind): DiscardAbilityInfo | null {
  const def = g.cards[card.cardId];
  const d = discardAbilityOf(def, ability);
  if (!def || !d || card.cardId === NOISE_CARD_ID) return null;
  const t = discardAbilityTargets(g, p, card, ability);
  const energy = g.players[p].energy;
  let blocked = discardAbilityBlock(g, p, card, ability);
  const targetCosts = wardCosts(t.enemy, d.cost, (chosen) => d.cost + wardTaxFor(g, p, chosen));
  if (!blocked && noPayableTarget(t.enemy, targetCosts, d.cost, energy)) blocked = 'エナジーが足りません（護法）';
  const info: DiscardAbilityInfo = {
    card,
    ability,
    name: d.name,
    cost: d.cost,
    blocked,
    enemyTargets: t.enemy,
    allyTargets: t.ally,
    warnings: ability === 'renew' ? effectWarnings(g, p, def.effects.filter((e) => e.timing === 'renew'), t.ally, false) : [],
    tauntLimited: t.enemy.length > 0 && cardTargetableTaunts(g, other(p)).length > 0,
  };
  if (targetCosts) info.targetCosts = targetCosts;
  return info;
}

/** 自分の捨て札のカードの能力（相続・発掘・不朽）の情報。使えないものも理由つき */
export function discardAbilityInfos(g: GameState, p: PlayerId): DiscardAbilityInfo[] {
  return g.players[p].discard.flatMap((c) =>
    discardAbilityKinds(g.cards[c.cardId]).flatMap((k) => {
      const info = discardAbilityInfo(g, p, c, k);
      return info ? [info] : [];
    }),
  );
}

/** 後援（MTG 要素 △ バッチB）で CPU が休ませるもの：いちばん攻撃力の高い、休ませてよいモンスター（無ければ undefined） */
export function bestEnlist(g: GameState, m: Monster): string | undefined {
  const opts = enlistOptions(g, m);
  return [...opts].sort((a, b) => effectiveAttack(g, b) - effectiveAttack(g, a))[0]?.uid;
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
  // 捨て札のカードの能力（MTG 要素 △ バッチB：相続・発掘・不朽）
  for (const info of discardAbilityInfos(g, p)) {
    if (info.blocked) continue;
    for (const chosen of chosenCombos(info.enemyTargets, info.allyTargets)) {
      if (validateDiscardAbility(g, p, info.card.uid, info.ability, chosen) === null) {
        out.push({ type: 'discardAbility', player: p, cardUid: info.card.uid, ability: info.ability, chosen });
      }
    }
  }
  // 起動（MTG 要素 ○ バッチC1。Lvアップ・忠誠：△ バッチC）
  for (const info of activateInfos(g, p)) {
    if (info.blocked) continue;
    for (const chosen of chosenCombos(info.enemyTargets, info.allyTargets)) {
      if (validateActivate(g, p, info.sourceUid, chosen, info.use) === null) {
        out.push({ type: 'activate', player: p, sourceUid: info.sourceUid, chosen, ...(info.use ? { use: info.use } : {}) });
      }
    }
  }
  // MTG 要素 △ バッチC：待機ゾーンから使う・待機させる・表にする
  for (const info of waitingPlayInfos(g, p)) {
    if (!info.blocked) out.push(...playActions(g, p, info, { from: 'waiting' }));
  }
  for (const info of setAsideInfos(g, p)) {
    if (!info.blocked) out.push({ type: 'setAside', player: p, cardUid: info.card.uid, kind: info.kind });
  }
  for (const info of revealInfos(g, p)) {
    if (info.blocked) continue;
    for (const chosen of chosenCombos(info.enemyTargets, info.allyTargets)) {
      if (validateReveal(g, p, info.uid, chosen) === null) out.push({ type: 'reveal', player: p, uid: info.uid, chosen });
    }
  }
  for (const m of ps.board) {
    if (attackBlockReason(g, m)) continue;
    // 後援（MTG 要素 △ バッチB）：いちばん攻撃力の高い味方を休ませる攻撃も
    const enlist = bestEnlist(g, m);
    for (const target of attackTargets(g, m)) {
      out.push({ type: 'attack', player: p, attackerUid: m.uid, target });
      if (enlist) out.push({ type: 'attack', player: p, attackerUid: m.uid, target, enlistUid: enlist });
    }
  }
  out.push({ type: 'endTurn', player: p });
  return out;
}
