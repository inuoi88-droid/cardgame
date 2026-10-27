/**
 * 盤面の評価（CPU 用）。プレイヤー me から見て、大きいほど有利。
 * 重みは CPU の強さの調整用で、ゲームのバランス数値ではないので balance.ts とは分ける（決定事項 #72）。
 *
 * 考え方：
 * - レース：「自分の次ターンの見込み打点」と「相手の次ターンの見込み打点」から、残りターン数の見込みとどちらが有利かを出す。
 *   モンスターの攻撃力は残りターン数ぶんだけ価値がある。レースが有利なら相手の HP（顔へのダメージ）を重く見る。
 *   この2つは1回の判断の中では判断の前の盤面で固定する（RaceFrame。決定事項 #81）。
 * - シールドは相手の次ターンの見込み打点まで、相手のシールドは自分がこのターンに出せる残りの打点までしか価値がない。
 * - 状態異常は実際のルールに合わせる：プレイヤーのやけど・脱力はそのプレイヤーの効果のダメージだけ、脆弱・出血は相手がそれを
 *   使える回数、反撃（状態）は相手の攻撃回数、毒・やけどは残り HP までしか効かない。
 */
import { BALANCE } from '../balance.ts';
import { attackBlockReason, attacksPerTurn, cannotAttack } from '../battle/combat.ts';
import { auraAttack, effectiveAttack, other } from '../battle/core.ts';
import { combatBonus, keywordFlags, playerBonus, wardTax } from '../battle/damage.ts';
import { effectiveCost, lifespanOf, waitingRule } from '../battle/play.ts';
import { altWinGoalOf, altWinTarget } from '../battle/powers.ts';
import { energyForTurn } from '../battle/turn.ts';
import { fatigueDamage } from '../battle/zones.ts';
import { effectPoints } from '../points.ts';
import { chapterOf } from '../options.ts';
import { getKeyword } from '../registry.ts';
import type { CardDef } from '../types.ts';
import { NOISE_CARD_ID, type GameState, type Monster, type PlayerId } from '../battle/types.ts';
import { fieldAttackBonus, fogDamage, ruleHooks } from '../battle/rules.ts';

/** HP などの量は倍率で大きくなるので、枚数・ターン・回数に付く重みにも同じ倍率を掛ける */
const S = BALANCE.amountScale;
const B = BALANCE.battle;

export const WEIGHTS = {
  win: 100000,
  hp: 1,
  /** レースが有利なとき、相手の HP をこの倍率で重く見る（顔へのダメージを優先する） */
  raceFaceBonus: 1.25,
  /** 自分のシールド（相手の次ターンの見込み打点まで） */
  shield: 0.8,
  /** 相手のシールド（自分がこのターンに出せる残りの打点まで。相手のターン開始時に消える） */
  shieldStale: 0.5,
  /** モンスターの攻撃力 1 につき、残りターン 1 あたり */
  monsterAttack: 0.8,
  monsterHp: 0.7,
  monsterDefense: 1.2,
  taunt: 2 * S,
  flying: 1.5 * S,
  trample: 1 * S,
  undying: 2 * S,
  stealth: 1 * S,
  sealed: 1.5 * S,
  /** 混乱したモンスターの攻撃力はこの割合だけ価値がある（対象がランダム） */
  confusedFactor: 0.3,
  poison: 0.9,
  burn: 0.8,
  weak: 1,
  /** 脱力の見込みで数える使用の回数（それより多い分は先のことなので数えない） */
  exhaustUses: 2,
  vulnerable: 0.8,
  monsterVulnerable: 1 * S,
  bleed: 0.8,
  strength: 0.8,
  focus: 0.6,
  regen: 0.7,
  counter: 0.7,
  nullify: 4 * S,
  power: 2.5 * S,
  nextEnergy: 2.5 * S,
  nextDraw: 2 * S,
  discount: 2.5 * S,
  handCard: 0.5 * S,
  oppHandCard: 0.3 * S,
  noiseInDeck: 1 * S,
  noiseInHand: 0.5 * S,
  frozen: 1.5 * S,
  /** エナジー 1 につき、カードで出せる顔へのダメージの見込み */
  cardDamagePerEnergy: 3 * S,
  /** 残りターン数の見込みの範囲 */
  turnsLeftMin: 1,
  turnsLeftMax: 4,
  /** 評価値の差がこれ未満なら同点とみなし、タイブレークで決める */
  tieEpsilon: 0.25 * S,
  /** 「やさしい」の評価のゆらぎ（標準偏差） */
  easyNoiseSigma: 3 * S,
  // ---- MTG 要素バッチ2
  deathtouch: 2 * S,
  hexproof: 1 * S,
  firstStrike: 0.5 * S,
  /** 絆魂：攻撃力1につき（回復のぶん） */
  lifelink: 0.4,
  /** 武士道：上昇量1につき */
  bushido: 0.5,
  divineShield: 1.5 * S,
  /** 呪縛：残りの見込みターン（固定）× 量 × 毒の重み */
  doomTurns: 4,
  /** このターンだけの攻撃力（一時強化）と、再行動で増えた攻撃：このターンに残っている攻撃1回につき */
  readyAttack: 0.8,
  /** 寿命の残り1ターンにつき、モンスターの価値に掛ける割合（残り1なら 0.25+0.25＝半分） */
  lifespanBase: 0.25,
  lifespanPerTurn: 0.25,
  // ---- MTG 要素 ○ バッチA
  /** 消耗で次のターンに攻撃できないモンスターの打点の割合 */
  exertFactor: 0.5,
  /**
   * 予約した効果（次のターンに）：効果のポイント ÷ pointsPerHp を HP に換算し、この割合だけ価値がある
   * （ダメージ1が3pt なので、ポイント3で HP1 くらい）
   */
  delayed: 0.8,
  pointsPerHp: 3,
  // ---- MTG 要素 ○ バッチB
  /** 借用中のモンスター：借りた側の価値に掛ける割合 */
  borrowedFactor: 0.5,
  /** 護法：追加コスト1につき */
  ward: 1 * S,
  /** 威圧・一撃離脱・分身（まだ使っていない） */
  menace: 1 * S,
  hitAndRun: 0.5 * S,
  doubleTeam: 1.5 * S,
  /** 封殺を掛けられている（次に使うカードが無効になる） */
  quashed: 3 * S,
  /** 恩恵：上乗せ×回数に、筋力の重みのこの割合 */
  boonFactor: 0.5,
  /** 装備しているカード1枚（場を離れると手札に戻る） */
  equipment: 0.5 * S,
  /** 懸賞（掛けた側が引く1枚） */
  bounty: 1 * S,
  /**
   * 見える情報では山札が隠れていて仮の実行で価値が出ない効果の見込み（sim.ts の hiddenDeckBonus）：
   * 続唱はコスト1につき、抽出は1枚
   */
  cascadePerCost: 2 * S,
  seekCard: 1.5 * S,
  // ---- MTG 要素 ○ バッチC2
  /** 速度1につき（最高速度の条件に近づく。小さく） */
  speed: 0.5 * S,
  /** 王冠：残りターンの見込み1につき（ターン開始時に1枚多く引く。相手が持っていれば相手が引く） */
  crown: 2 * S,
  // ---- MTG 要素 △ バッチA
  /** 卵：孵化したときの攻撃力の価値に掛ける割合 */
  eggFactor: 0.5,
  /** 休眠：打点に掛ける割合（1ターンおきに休む） */
  dormantFactor: 0.5,
  /** 守護（不壊・加護）がかかっている */
  guard: 1.5 * S,
  /** 経験1につき（経験1につきのカードの数値が上がる。小さく） */
  exp: 0.5 * S,
  /** 放射能：1につき見込むダメージの割合（モンスター以外がめくれる見込み） */
  radHitRate: 0.6,
  /** 氷結を掛けられている（次のターンに凍る手札1枚） */
  iced: 0.8 * S,
  // ---- MTG 要素 △ バッチC
  /** 待機ゾーンのカード：手札1枚の価値に、払い済み・安くなるエナジー1につき足す */
  waitingPerEnergy: 0.6 * S,
  /** 追加ターンが控えている：自分の次ターンの見込み打点に掛ける割合 */
  extraTurn: 1,
  /** 特殊勝利の進み（割合）に掛ける重み（相手のものは減点：解除を優先する） */
  altWin: 30 * S,
  /** 忠誠1につき・Lv1につき（パワー）・紋章1つ */
  loyalty: 0.8 * S,
  powerLevel: 1 * S,
  emblem: 4 * S,
  // ---- MTG 要素 △ バッチD（フィールド：両者に効くので、どちらに得かの差だけを見る）
  /** 闘技場：手札のモンスターカード1枚につき（出したターンに攻撃できる） */
  fieldArena: 1 * S,
  /** 霧：相手の次ターンの盤面の打点と自分の打点の差に掛ける割合（守る側が得をする） */
  fieldFog: 0.3,
  /** 疲労（決定事項 #102）：次の自分のターンに引けない分の疲労ダメージの見込み（HP 1あたり。毒と同じ） */
  fatigue: 0.9,
} as const;

const W = WEIGHTS;

/** ポイント計算に渡す「モンスターでないカード」（予約した効果の価値に使う） */
const NO_CARD = { stats: null, keywords: [] };

/** 毎ターン keepRate 倍（切り捨て）に減りながら効く量 n の合計（毒・再生：n + ⌊n/2⌋ + ⌊n/4⌋ + …） */
export function decayingTotal(n: number, keepRate: number): number {
  let total = 0;
  for (let v = Math.max(0, Math.floor(n)); v > 0; v = Math.floor(v * keepRate)) total += v;
  return total;
}

/** 速攻を持つモンスターカードか（召喚したターンに攻撃できる） */
export function hasHaste(def: CardDef): boolean {
  return def.stats !== null && def.keywords.some((k) => getKeyword(k.id)?.battle.haste === true);
}

/** モンスターカードの1ターンの攻撃回数（二回攻撃なら2） */
export function defAttacksPerTurn(def: CardDef): number {
  let n = 1;
  for (const k of def.keywords) n = Math.max(n, getKeyword(k.id)?.battle.attacksPerTurn ?? 1);
  return n;
}

/**
 * 使用時・召喚時にこのカードが顔（相手プレイヤー）に出せるダメージ（条件・エナジーは見ない）。
 * onlyChosen なら「選んだ1体」の分だけ（挑発がいると顔に届かない分：決定事項 #83）
 */
export function cardFaceDamage(def: CardDef, onlyChosen = false): number {
  let v = 0;
  const timing = def.stats ? 'summon' : 'play';
  for (const e of def.effects) {
    if (e.timing !== timing || e.target === 'self' || e.target === 'enemyMonsters' || e.target === 'board') continue;
    if (onlyChosen && e.target !== 'chosen') continue;
    if (e.id === 'damage') v += e.value ?? 0;
    else if (e.id === 'multiHit') v += (e.value ?? 0) * (e.hits ?? 0);
  }
  return v;
}

/** 手札のうち、今のエナジーで使えるカードの顔への打点（安い順に詰める：上限寄りの見込み） */
export function handFaceDamage(g: GameState, p: PlayerId): number {
  const ps = g.players[p];
  const list: { cost: number; dmg: number }[] = [];
  for (const c of ps.hand) {
    const def = g.cards[c.cardId];
    if (!def) continue;
    const dmg = cardFaceDamage(def) + (def.stats && hasHaste(def) ? def.stats.attack * defAttacksPerTurn(def) : 0);
    if (dmg > 0) list.push({ cost: effectiveCost(g, p, c), dmg });
  }
  list.sort((a, b) => b.dmg / Math.max(1, b.cost) - a.dmg / Math.max(1, a.cost));
  let energy = ps.energy;
  let total = 0;
  for (const x of list) {
    if (x.cost > energy) continue;
    energy -= x.cost;
    total += x.dmg;
  }
  return total;
}

/** 次の自分のターンに出せそうな打点の見込み */
export interface Threat {
  /** 場のモンスターの攻撃（攻撃力 × 回数） */
  board: number;
  /** 攻撃の回数 */
  attacks: number;
  /** カードで出せそうなダメージ（次のターンのエナジーから） */
  cards: number;
  total: number;
}

/** 次の自分のターンのエナジー（成長表＋貯金・反動） */
export function nextEnergy(g: GameState, p: PlayerId): number {
  const ps = g.players[p];
  const penalty = p === g.first && ps.turnsTaken + 1 === 1 ? B.firstPlayerFirstTurnPenalty : 0;
  const carried = ps.next.energy > 0 ? Math.min(ps.next.energy, B.maxEnergyGainPerTurn) : ps.next.energy;
  // リーダー「錬金術師」（MTG 要素 △ バッチD）：次のターンが倍数のターンなら+1
  const A = BALANCE.leaders.alchemist;
  const alchemy = ps.leader === 'alchemist' && (ps.turnsTaken + 1) % A.everyTurns === 0 ? A.energy : 0;
  return Math.max(0, energyForTurn(ps.turnsTaken + 1) - penalty + carried + (ps.energyBonus ?? 0) + alchemy);
}

/** 消耗（MTG 要素 ○ バッチA）で、次の持ち主のターンに攻撃できないか */
function exertedNextTurn(g: GameState, m: Monster): boolean {
  return m.counters.exertTurn !== undefined && m.counters.exertTurn === g.players[m.controller].turnsTaken + 1;
}

export function nextTurnThreat(g: GameState, p: PlayerId): Threat {
  const ps = g.players[p];
  let board = 0;
  let attacks = 0;
  for (const m of ps.board) {
    if (m.betraying || m.status.freezePending || cannotAttack(g, m)) continue;
    // 消耗：次の自分のターンは攻撃できない
    if (exertedNextTurn(g, m)) continue;
    // 応召の一時トークン・一時蘇生（MTG 要素 △ バッチB）は次のターンにはいない
    if (m.card.token?.temp || m.unearthed) continue;
    // 卵・次のターンに休眠するモンスターは攻撃しない（MTG 要素 △ バッチA）
    if (m.card.token?.egg && ps.turnsTaken + 1 < m.card.token.egg.hatchAt) continue;
    if (m.counters.dormantFrom !== undefined && (ps.turnsTaken + 1 - m.counters.dormantFrom) % 2 === 1) continue;
    const n = attacksPerTurn(g, m);
    // 激励・猛襲（相手プレイヤーへの攻撃）も見込む
    // フィールド「火山」・「霧」（MTG 要素 △ バッチD）も見込む
    let atk = m.attack + auraAttack(g, m) + playerBonus(g, m) + fieldAttackBonus(g);
    // やけど（半減）・脱力（1発の上限）：決定事項 #137
    if (m.status.burn > 0) atk = Math.floor(atk * B.burnDamageRate);
    if (m.status.weak > 0) atk = Math.min(atk, B.exhaustCap);
    atk = fogDamage(g, atk);
    if (m.status.confusePending) atk *= W.confusedFactor;
    board += atk * n;
    attacks += n;
  }
  const cards = nextEnergy(g, p) * W.cardDamagePerEnergy + ps.status.strength;
  return { board, attacks, cards, total: board + cards };
}

/** このターンにまだ出せる打点（手番のプレイヤーだけ。攻撃できるモンスターと、使えるカード） */
export function remainingPotential(g: GameState, p: PlayerId): { damage: number; attacks: number; hits: number } {
  if (g.phase !== 'main' || g.active !== p) return { damage: 0, attacks: 0, hits: 0 };
  const ps = g.players[p];
  let damage = 0;
  let attacks = 0;
  for (const m of ps.board) {
    if (attackBlockReason(g, m)) continue;
    const left = attacksPerTurn(g, m) - m.attacksUsed;
    damage += effectiveAttack(g, m) * left;
    attacks += left;
  }
  const cards = handFaceDamage(g, p);
  let hits = attacks;
  for (const c of ps.hand) {
    const def = g.cards[c.cardId];
    if (def && cardFaceDamage(def) > 0 && effectiveCost(g, p, c) <= ps.energy) hits += 1;
  }
  return { damage: damage + cards + (cards > 0 ? ps.status.strength + ps.status.focus : 0), attacks, hits };
}

/** 評価の前提（レースの見込み） */
export interface RaceContext {
  me: PlayerId;
  threat: [Threat, Threat];
  remaining: [ReturnType<typeof remainingPotential>, ReturnType<typeof remainingPotential>];
  /** 自分が相手を倒すまでのターン数の見込み / 相手が自分を倒すまで */
  myTurns: number;
  oppTurns: number;
  turnsLeft: number;
  raceFavor: boolean;
}

/**
 * レースの見込みのうち、評価の重みを切り替えるもの（相手の HP を重く見るか・残りターン数）。
 * どちらも盤面の階段状の関数なので、1回の判断の中で候補ごとに計算し直すと、たまたまレースの判定をまたぐ行動
 * （相手のモンスターを1体倒して「有利」に変わるなど）に、相手の HP 全体の 25% といった大きな加点が付いてしまう。
 * そこで判断の前の盤面（根）で1回だけ計算し、その判断で比べるすべての盤面に同じものを使う（決定事項 #81）
 */
export interface RaceFrame {
  myTurns: number;
  oppTurns: number;
  turnsLeft: number;
  raceFavor: boolean;
}

function threats(g: GameState): [Threat, Threat] {
  return [nextTurnThreat(g, 0), nextTurnThreat(g, 1)];
}

function frameFrom(g: GameState, me: PlayerId, threat: [Threat, Threat]): RaceFrame {
  const opp = other(me);
  const effHp = (p: PlayerId) => Math.max(1, g.players[p].hp - g.players[p].status.poison);
  const myTurns = Math.ceil(effHp(opp) / Math.max(1, threat[me].total));
  const oppTurns = Math.ceil(effHp(me) / Math.max(1, threat[opp].total));
  const turnsLeft = Math.min(W.turnsLeftMax, Math.max(W.turnsLeftMin, Math.min(myTurns, oppTurns)));
  return { myTurns, oppTurns, turnsLeft, raceFavor: myTurns <= oppTurns };
}

/** 判断の前の盤面からレースの見込みを固定する（その判断の中の評価はすべてこれを使う） */
export function raceFrame(g: GameState, me: PlayerId): RaceFrame {
  return frameFrom(g, me, threats(g));
}

/** frame を渡すと、重みの切り替え（有利・残りターン）はそれに固定し、打点の見込みだけを g から計算する */
export function raceContext(g: GameState, me: PlayerId, frame?: RaceFrame): RaceContext {
  const threat = threats(g);
  const remaining: [ReturnType<typeof remainingPotential>, ReturnType<typeof remainingPotential>] = [
    remainingPotential(g, 0),
    remainingPotential(g, 1),
  ];
  return { me, threat, remaining, ...(frame ?? frameFrom(g, me, threat)) };
}

function monsterValue(g: GameState, m: Monster, ctx: RaceContext): number {
  if (m.betraying) return -m.attack * W.monsterAttack * 2;
  // 砦（MTG 要素 △ バッチC）は持ち主の戦力ではない（壊すと相手が報酬を得る）
  if (m.siege) return 0;
  const def = g.cards[m.card.cardId];
  // 腐乱：攻撃したターンの終わりに破壊される
  if (m.counters.attackedTurn === g.turnIndex && def?.drawbacks.some((d) => d.id === 'decay')) return 0;
  const k = keywordFlags(g, m);
  const n = attacksPerTurn(g, m);
  const T = ctx.turnsLeft;
  // 卵（MTG 要素 △ バッチA）：体力と、孵化したときの攻撃力の半分
  if (m.card.token?.egg) return m.hp * W.monsterHp + m.card.token.egg.attack * W.monsterAttack * ctx.turnsLeft * W.eggFactor;
  // 応召の一時トークン・一時蘇生（MTG 要素 △ バッチB）：このターンに残っている攻撃のぶんだけ価値がある（ターン終了時に消える）
  if (m.card.token?.temp || m.unearthed) {
    const canAttack = g.phase === 'main' && g.active === m.controller && !attackBlockReason(g, m);
    return canAttack ? effectiveAttack(g, m) * (n - m.attacksUsed) * W.readyAttack : 0;
  }
  let attackTurns = T;
  if (m.status.freezePending || m.status.freezeActive) attackTurns -= 1;
  // やけど（半減）・脱力（1発の上限。攻撃するたび1つ減る）：決定事項 #137
  const atkNow = m.attack + auraAttack(g, m) + fieldAttackBonus(g);
  if (m.status.burn > 0) attackTurns -= Math.min(m.status.burn, attackTurns) * (1 - B.burnDamageRate);
  if (m.status.weak > 0 && atkNow > B.exhaustCap) attackTurns -= Math.min(m.status.weak, Math.max(0, attackTurns)) * (1 - B.exhaustCap / atkNow);
  // 防衛：攻撃しないので打点として数えない
  // 激励で上がっている分も打点（激励を持つモンスターの価値は、味方の攻撃力の上がり方に出る）
  let attackVal = cannotAttack(g, m) ? 0 : (m.attack + auraAttack(g, m) + fieldAttackBonus(g)) * n * W.monsterAttack * Math.max(0, attackTurns);
  if (m.status.confusePending || m.status.confuseActive) attackVal *= W.confusedFactor;
  // 消耗：次の自分のターンは攻撃できないので、打点を半分に数える
  if (exertedNextTurn(g, m)) attackVal *= W.exertFactor;
  // 休眠（MTG 要素 △ バッチA）：1ターンおきにしか攻撃できない
  if (m.counters.dormantFrom !== undefined) attackVal *= W.dormantFactor;
  let v = attackVal + m.hp * W.monsterHp + m.defense * W.monsterDefense;
  // 一時強化・再行動：このターンに残っている攻撃のぶん（自分のターン中だけ）
  if (g.phase === 'main' && g.active === m.controller && !attackBlockReason(g, m)) {
    const left = attacksPerTurn(g, m) - m.attacksUsed;
    const readied = m.counters.readyTurn === g.turnIndex;
    v += ((m.tempAttack ?? 0) + (readied ? m.attack : 0)) * left * W.readyAttack;
  }
  if (k.deathtouch) v += W.deathtouch;
  if (k.hexproof) v += W.hexproof;
  if (k.firstStrike) v += W.firstStrike;
  if (k.lifelink) v += m.attack * W.lifelink * Math.max(1, attackTurns);
  if (k.divineShield && !m.shieldUsed) v += W.divineShield;
  v += combatBonus(g, m) * W.bushido * Math.max(1, attackTurns);
  if (k.taunt) v += W.taunt;
  if (k.flying) v += W.flying;
  if (k.trample) v += W.trample;
  if (k.undying && !m.undyingUsed) v += W.undying;
  if (m.stealth) v += W.stealth;
  if (m.sealed) v -= W.sealed;
  // 守護（MTG 要素 △ バッチA）
  if (m.guard) v += W.guard;
  // MTG 要素 ○ バッチB
  if (!m.sealed) v += wardTax(g, m) * W.ward;
  if (k.noRetaliation) v += W.menace;
  if (k.returnAfterAttack) v += W.hitAndRun;
  if (k.doubleTeam && !m.card.token) v += W.doubleTeam;
  v += (m.equipment?.length ?? 0) * W.equipment;
  v -= Math.min(decayingTotal(m.status.poison, B.poisonKeepRate), m.hp) * W.poison;
  v -= Math.min(m.status.burn * B.burnDamage, m.hp) * W.burn;
  if (m.status.vulnerable > 0) v -= W.monsterVulnerable;
  // 寿命：残りが短いほど価値が下がる
  const life = m.counters.life ?? lifespanOf(def);
  if (life !== undefined) v *= Math.min(1, W.lifespanBase + W.lifespanPerTurn * life);
  // 借用中：期限で元の持ち主に戻る
  if (m.counters.borrowLeft !== undefined) v *= W.borrowedFactor;
  return v;
}

function playerValue(g: GameState, p: PlayerId, ctx: RaceContext): number {
  const ps = g.players[p];
  const isMe = p === ctx.me;
  const user = other(p);
  const s = ps.status;
  const active = g.active === p && g.phase === 'main';
  const hpW = isMe || !ctx.raceFavor ? W.hp : W.hp * W.raceFaceBonus;
  let v = ps.hp * hpW;

  // シールド：自分のターンに得たものは相手の次ターンの打点まで、相手のターン中のものは相手がこのターンに出せる打点まで
  if (active) v += Math.min(ps.shield, ctx.threat[user].total) * W.shield;
  else v += Math.min(ps.shield, ctx.remaining[user].damage) * W.shieldStale;

  // 毒・やけど（残り HP までしか効かない）
  v -= Math.min(decayingTotal(s.poison, B.poisonKeepRate), ps.hp) * W.poison;
  v -= Math.min(s.burn * B.burnDamage, ps.hp) * W.burn;
  // 呪縛：減らずに毎ターン効く（見込みのターン数ぶん）
  v -= Math.min((s.doom ?? 0) * W.doomTurns, ps.hp) * W.poison;
  // やけど・脱力（決定事項 #137）：そのプレイヤーの効果のダメージが半減・1発の上限まで（脱力はダメージのカードを使うたび1つ減る）
  if (s.burn > 0) v -= ctx.threat[p].cards * (1 - B.burnDamageRate) * W.weak;
  if (s.weak > 0) v -= Math.max(0, ctx.threat[p].cards - B.exhaustCap) * Math.min(s.weak, W.exhaustUses) * W.weak;
  // 脆弱：相手がそのターンに出す打点が増える（残りターンは持ち主のターン終了時に減る）
  if (s.vulnerable > 0) {
    const later = Math.max(0, s.vulnerable - 1) * ctx.threat[user].total;
    const now = active ? 0 : ctx.remaining[user].damage;
    v -= (now + later) * B.vulnerableRate * W.vulnerable;
  }
  // 出血：相手の攻撃・ダメージ1回ごとに加算（1枚・1回の攻撃につき1回）。持ち主のターン終了時に半分
  if (s.bleed > 0) {
    const now = active ? 0 : ctx.remaining[user].hits;
    const later = ctx.threat[user].attacks + 1;
    v -= (s.bleed * now + Math.floor(s.bleed / 2) * later) * W.bleed;
  }
  v += s.strength * (1 + ctx.turnsLeft) * W.strength;
  if (active) v += s.focus * W.focus;
  v += Math.min(decayingTotal(s.regen, B.regenKeepRate), ps.maxHp - ps.hp) * W.regen;
  // 反撃（状態）：自分のターン開始時に消える。自分のターン中に得たなら相手の次ターンの攻撃回数、相手のターン中なら残りの攻撃回数
  if (s.counter > 0) {
    const uses = active ? Math.min(ctx.threat[user].attacks + 1, 4) : Math.min(ctx.remaining[user].attacks, 3);
    v += s.counter * uses * W.counter;
  }
  v += s.nullify * W.nullify;
  if (s.freezePending || (s.freezeActive && ps.turn.freezeTax)) v -= W.frozen;

  for (const pw of [...ps.powers, ...(ps.emblems ?? [])]) {
    const life = pw.life === undefined ? 1 : Math.min(1, W.lifespanBase + W.lifespanPerTurn * pw.life);
    // 英雄譚（MTG 要素 ○ バッチC2）：まだ出ていない章の効果だけ
    const live = pw.effects.filter((x) => !x.removed && (pw.chapter === undefined || chapterOf(x.effect.timing) > pw.chapter));
    v += live.length * W.power * life;
    // MTG 要素 △ バッチC：忠誠・Lv・特殊勝利の進み
    v += (pw.loyalty ?? 0) * W.loyalty + ((pw.level ?? 1) - 1) * W.powerLevel;
    const goal = altWinGoalOf(g.cards[pw.cardId]);
    if (goal) v += Math.min(1, (pw.progress ?? 0) / altWinTarget(goal)) * W.altWin;
  }
  v += (ps.emblems?.length ?? 0) * W.emblem;
  // 待機ゾーン（MTG 要素 △ バッチC）：手札と同じく1枚ずつ価値があり、払い済み（計画・待機）・安くなる（予顕）エナジーのぶん上乗せ
  for (const w of ps.waiting ?? []) {
    const def = g.cards[w.card.cardId];
    const saved = !def ? 0 : w.kind === 'plot' || w.kind === 'suspend' ? def.cost : w.kind === 'foretell' ? (waitingRule(def, w.kind)?.cut ?? 0) : 0;
    v += (isMe ? W.handCard : W.oppHandCard) + saved * W.waitingPerEnergy;
  }
  // 追加ターン（MTG 要素 △ バッチC）：相手の手番を1回飛ばす
  if (ps.extraTurnPending) v += ctx.threat[p].total * W.extraTurn;
  // 速度・王冠（MTG 要素 ○ バッチC2）
  v += (ps.speed ?? 0) * W.speed;
  // MTG 要素 △ バッチA：経験・放射能（残り HP まで）・氷結（次のターンに凍る手札）
  v += (ps.exp ?? 0) * W.exp;
  v -= Math.min((s.rad ?? 0) * B.radDamage * W.radHitRate, ps.hp) * W.poison;
  v -= (ps.ice ?? 0) * W.iced;
  // 疲労（決定事項 #102）：山札と捨て札が細って次のターンに引けない分（ふつうは0。除外・パワーで細らせすぎない）。
  // 相手の山札・捨て札は仮の実行の盤面（leanView）では外してあるので、自分の分だけ見る
  if (isMe) v -= Math.min(fatigueOutlook(g, p), ps.hp) * W.fatigue;
  // 王冠は持っている間ずっと1枚多く引く（残りターンの見込みぶん）
  if (g.crown === p) v += W.crown * Math.max(1, ctx.turnsLeft);
  // フィールド（MTG 要素 △ バッチD）：両者に効くので、どちらに得かが分かるものだけ
  v += fieldValue(g, p, ctx, isMe);
  v += ps.next.energy * W.nextEnergy + ps.next.draw * W.nextDraw + ps.discount * W.discount;
  // 予約した効果（次のターンに）：効果のポイントを HP に換算して足す（そうしないと、予約するカードを使う意味がないと判断してしまう）。
  // 反復はカードの使用時の効果すべて
  for (const d of ps.delayed ?? []) {
    for (const e of d.rebound?.effects ?? [d.effect]) v += (effectPoints(e, NO_CARD).raw / W.pointsPerHp) * W.delayed;
  }
  // MTG 要素 ○ バッチB：封殺・恩恵・最大エナジー増加・懸賞（相手のモンスターに掛けた分）
  if (ps.quash && g.turnIndex <= ps.quash.until) v -= W.quashed;
  v += (s.boon ?? 0) * (s.boonUses ?? 0) * W.strength * W.boonFactor;
  v += (ps.energyBonus ?? 0) * W.cardDamagePerEnergy * (1 + ctx.turnsLeft);
  for (const m of g.players[user].board) for (const b of m.bounty ?? []) if (b.player === p) v += b.draw * W.bounty;
  v -= ps.deck.filter((c) => c.cardId === NOISE_CARD_ID).length * W.noiseInDeck;
  for (const m of ps.board) v += monsterValue(g, m, ctx);

  const noiseInHand = ps.hand.filter((c) => c.cardId === NOISE_CARD_ID).length;
  // 凍った手札（MTG 要素 △ バッチA）はこのターン使えないので数えない
  const icedInHand = ps.hand.filter((c) => c.iced === g.turnIndex).length;
  const cards = ps.hand.length - noiseInHand - icedInHand;
  if (isMe) {
    // 手札は（中身が隠れていても）1枚ずつ価値がある。保持で残せる分は上乗せ
    v += cards * W.handCard + Math.min(ps.turn.retain, cards) * W.handCard;
    v -= noiseInHand * W.noiseInHand;
  } else {
    v += cards * W.oppHandCard;
  }
  return v;
}

/**
 * 疲労（決定事項 #102）の見込み：次の自分のターン開始時に引く枚数のうち、山札と捨て札（手番なら、ターン終了時に捨て札へ行く手札も）で
 * 足りない分の疲労ダメージの合計。山札の中身は隠れていても枚数は見える（仮の実行で山札を外したプレイヤー＝noFatigue は0）
 */
export function fatigueOutlook(g: GameState, p: PlayerId): number {
  const ps = g.players[p];
  if (ps.noFatigue) return 0;
  const active = g.active === p && g.phase === 'main';
  const pool = ps.deck.length + ps.discard.length + (active ? ps.hand.filter((c) => c.copy !== 'temp').length : 0);
  // 1ターン目は配った手札を使うので引かない（決定事項 #47）
  const draws = Math.min(B.maxDrawPerTurn, Math.max(0, (ps.turnsTaken === 0 ? 0 : B.drawPerTurn) + ps.next.draw));
  let dmg = 0;
  for (let k = 1; k <= draws - pool; k++) dmg += fatigueDamage((ps.fatigue ?? 0) + k);
  return dmg;
}

/**
 * フィールド（MTG 要素 △ バッチD）の、プレイヤー p にとっての価値（火山・大図書館・市場はどちらにも同じなので0。火山の攻撃力は monsterValue が見る）。
 * 聖域は減っている HP まで、闘技場は手札のモンスターカード（見える自分の手札だけ）、霧は相手の盤面の打点が大きいほど得
 */
function fieldValue(g: GameState, p: PlayerId, ctx: RaceContext, isMe: boolean): number {
  const h = ruleHooks(g, p);
  const ps = g.players[p];
  let v = 0;
  if (h.startHeal > 0) v += Math.min(h.startHeal, ps.maxHp - ps.hp) * W.regen * Math.max(1, ctx.turnsLeft);
  if (h.noSummoningSickness && isMe) v += ps.hand.filter((c) => g.cards[c.cardId]?.stats).length * W.fieldArena;
  if (h.playerAttackCut > 0) v += (ctx.threat[other(p)].board - ctx.threat[p].board) * W.fieldFog;
  return v;
}

/**
 * 盤面の評価。1回の判断で複数の盤面を比べるときは、判断の前の盤面の raceFrame を frame に渡す
 * （渡さなければ g 自身から計算する）
 */
export function evaluate(g: GameState, me: PlayerId, frame?: RaceFrame): number {
  if (g.result) {
    if (g.result.winner === me) return W.win;
    if (g.result.winner === null) return 0;
    return -W.win;
  }
  const ctx = raceContext(g, me, frame);
  return playerValue(g, me, ctx) - playerValue(g, other(me), ctx);
}

/** 手札の候補（サーチ・回収・蘇生・複製）を選ぶときのカードの価値：すぐ使えるコストを優先し、高いカードほど強い */
export function cardPickScore(g: GameState, p: PlayerId, def: CardDef): number {
  const energy = Math.max(g.players[p].energy, nextEnergy(g, p));
  return (def.cost <= energy ? 2 * S : 0) + def.cost * 0.5 * S + (def.stats ? 0.2 * S : 0);
}
