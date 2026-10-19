/**
 * 盤面の評価（CPU 用）。プレイヤー me から見て、大きいほど有利。
 * 重みは CPU の強さの調整用で、ゲームのバランス数値ではないので balance.ts とは分ける（決定事項 #72）。
 *
 * 考え方：
 * - レース：「自分の次ターンの見込み打点」と「相手の次ターンの見込み打点」から、残りターン数の見込みとどちらが有利かを出す。
 *   モンスターの攻撃力は残りターン数ぶんだけ価値がある。レースが有利なら相手の HP（顔へのダメージ）を重く見る。
 *   この2つは1回の判断の中では判断の前の盤面で固定する（RaceFrame。決定事項 #81）。
 * - シールドは相手の次ターンの見込み打点まで、相手のシールドは自分がこのターンに出せる残りの打点までしか価値がない。
 * - 状態異常は実際のルールに合わせる：プレイヤーの弱体はそのプレイヤーのカードのダメージだけ、脆弱・出血は相手がそれを
 *   使える回数、反撃（状態）は相手の攻撃回数、毒・やけどは残り HP までしか効かない。
 */
import { BALANCE } from '../balance.ts';
import { attackBlockReason, attacksPerTurn } from '../battle/combat.ts';
import { other } from '../battle/core.ts';
import { keywordFlags } from '../battle/damage.ts';
import { effectiveCost } from '../battle/play.ts';
import { energyForTurn } from '../battle/turn.ts';
import { getKeyword } from '../registry.ts';
import type { CardDef } from '../types.ts';
import { NOISE_CARD_ID, type GameState, type Monster, type PlayerId } from '../battle/types.ts';

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
} as const;

const W = WEIGHTS;

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

/** 使用時・召喚時にこのカードが顔（相手プレイヤー）に出せるダメージ（条件・エナジーは見ない） */
export function cardFaceDamage(def: CardDef): number {
  let v = 0;
  const timing = def.stats ? 'summon' : 'play';
  for (const e of def.effects) {
    if (e.timing !== timing || e.target === 'self' || e.target === 'enemyMonsters' || e.target === 'board') continue;
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
  return Math.max(0, energyForTurn(ps.turnsTaken + 1) - penalty + carried);
}

export function nextTurnThreat(g: GameState, p: PlayerId): Threat {
  const ps = g.players[p];
  let board = 0;
  let attacks = 0;
  for (const m of ps.board) {
    if (m.betraying || m.status.freezePending) continue;
    const n = attacksPerTurn(g, m);
    let atk = m.attack;
    if (m.status.weak > 0) atk = Math.floor(atk * (1 - B.weakRate));
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
    damage += m.attack * left;
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
  const k = keywordFlags(g, m);
  const n = attacksPerTurn(g, m);
  const T = ctx.turnsLeft;
  let attackTurns = T;
  if (m.status.freezePending || m.status.freezeActive) attackTurns -= 1;
  if (m.status.weak > 0) attackTurns -= Math.min(m.status.weak, attackTurns) * B.weakRate;
  let attackVal = m.attack * n * W.monsterAttack * Math.max(0, attackTurns);
  if (m.status.confusePending || m.status.confuseActive) attackVal *= W.confusedFactor;
  let v = attackVal + m.hp * W.monsterHp + m.defense * W.monsterDefense;
  if (k.taunt) v += W.taunt;
  if (k.flying) v += W.flying;
  if (k.trample) v += W.trample;
  if (k.undying && !m.undyingUsed) v += W.undying;
  if (m.stealth) v += W.stealth;
  if (m.sealed) v -= W.sealed;
  v -= Math.min(decayingTotal(m.status.poison, B.poisonKeepRate), m.hp) * W.poison;
  v -= Math.min(m.status.burn * B.burnDamage, m.hp) * W.burn;
  if (m.status.vulnerable > 0) v -= W.monsterVulnerable;
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
  // 弱体：そのプレイヤーのカードのダメージだけ減る
  v -= s.weak * ctx.threat[p].cards * B.weakRate * W.weak;
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

  for (const pw of ps.powers) v += pw.effects.filter((x) => !x.removed).length * W.power;
  v += ps.next.energy * W.nextEnergy + ps.next.draw * W.nextDraw + ps.discount * W.discount;
  v -= ps.deck.filter((c) => c.cardId === NOISE_CARD_ID).length * W.noiseInDeck;
  for (const m of ps.board) v += monsterValue(g, m, ctx);

  const noiseInHand = ps.hand.filter((c) => c.cardId === NOISE_CARD_ID).length;
  const cards = ps.hand.length - noiseInHand;
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
