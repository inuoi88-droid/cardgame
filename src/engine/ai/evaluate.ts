/**
 * 盤面の評価（CPU 用）。プレイヤー me から見て、大きいほど有利。
 * 重みは CPU の強さの調整用で、ゲームのバランス数値ではないので balance.ts とは分ける。
 */
import { BALANCE } from '../balance.ts';
import { keywordFlags } from '../battle/damage.ts';
import { other } from '../battle/core.ts';
import { HIDDEN_CARD_ID } from '../battle/view.ts';
import { NOISE_CARD_ID, type GameState, type Monster, type PlayerId, type PlayerState } from '../battle/types.ts';

export const WEIGHTS = {
  win: 100000,
  hp: 1,
  shield: 0.7,
  monsterAttack: 1.6,
  monsterHp: 0.9,
  monsterDefense: 1.2,
  taunt: 2,
  flying: 1.5,
  doubleAttack: 1.2,
  trample: 1,
  undying: 2,
  poisonPerDamage: 0.8,
  burnPerDamage: 0.8,
  weakPerTurn: 1.5,
  vulnerablePerTurn: 2,
  bleed: 1,
  strength: 3,
  regenPerHeal: 0.8,
  counter: 0.4,
  nullify: 3,
  power: 3,
  nextEnergy: 2.5,
  nextDraw: 2,
  discount: 2.5,
  handCard: 0.5,
  noiseInDeck: 1,
  frozen: 1.5,
} as const;

const W = WEIGHTS;

function monsterValue(g: GameState, m: Monster): number {
  const k = keywordFlags(g, m);
  let v = m.attack * W.monsterAttack + m.hp * W.monsterHp + m.defense * W.monsterDefense;
  if (k.taunt) v += W.taunt;
  if (k.flying) v += W.flying;
  if (k.trample) v += W.trample;
  if (k.undying && !m.undyingUsed) v += W.undying;
  if ((k.attacksPerTurn ?? 1) > 1) v += m.attack * W.doubleAttack;
  if (m.status.freezePending || m.status.freezeActive) v -= W.frozen;
  v -= statusBurden(m.status.poison, m.status.burn);
  return m.betraying ? -m.attack * W.monsterAttack * 2 : v;
}

/** 毒・やけどでこの先受けるダメージの見込み */
function statusBurden(poison: number, burn: number): number {
  return ((poison * (poison + 1)) / 2) * W.poisonPerDamage + burn * BALANCE.battle.burnDamage * W.burnPerDamage;
}

function playerValue(g: GameState, ps: PlayerState, isMe: boolean): number {
  const s = ps.status;
  let v = ps.hp * W.hp;
  v += (isMe ? ps.shield : ps.shield * 0.5) * W.shield;
  v -= statusBurden(s.poison, s.burn);
  v -= s.weak * W.weakPerTurn + s.vulnerable * W.vulnerablePerTurn + s.bleed * W.bleed;
  v += s.strength * W.strength + ((s.regen * (s.regen + 1)) / 2) * W.regenPerHeal;
  v += s.counter * W.counter + s.nullify * W.nullify;
  v += ps.powers.length * W.power;
  v += ps.next.energy * W.nextEnergy + ps.next.draw * W.nextDraw + ps.discount * W.discount;
  v -= ps.deck.filter((c) => c.cardId === NOISE_CARD_ID).length * W.noiseInDeck;
  if (s.freezePending) v -= W.frozen;
  for (const m of ps.board) v += monsterValue(g, m);
  if (isMe) v += ps.hand.filter((c) => c.cardId !== NOISE_CARD_ID && c.cardId !== HIDDEN_CARD_ID).length * W.handCard;
  return v;
}

export function evaluate(g: GameState, me: PlayerId): number {
  if (g.result) {
    if (g.result.winner === me) return W.win;
    if (g.result.winner === null) return 0;
    return -W.win;
  }
  return playerValue(g, g.players[me], true) - playerValue(g, g.players[other(me)], false);
}
