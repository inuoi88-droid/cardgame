/**
 * 対戦のオプション（MTG 要素 △ バッチD：リーダー・フィールド・昼と夜）の効き目を1か所で決める。
 * ターン開始時・実効攻撃力・コスト・攻撃のダメージ・場に出たときの処理は、ここの `ruleHooks(g, p)` だけを読む。
 * （このファイルは balance.ts と型だけを読む：core.ts から使うので循環させない）
 */
import { BALANCE } from '../balance.ts';
import type { FieldId } from '../fields.ts';
import type { LeaderId } from '../leaders.ts';
import type { GameState, PlayerId } from './types.ts';

const L = BALANCE.leaders;
const F = BALANCE.fields;

export interface RuleHooks {
  leader: LeaderId;
  field: FieldId | null;
  /** すべてのモンスターの攻撃力に足す量（火山） */
  attackBonus: number;
  /** このプレイヤーの今のターン開始時に多く引く枚数（大図書館・賢者の合計） */
  extraDraw: number;
  fieldDraw: number;
  leaderDraw: number;
  /** このプレイヤーの今のターン開始時に増えるエナジー（錬金術師） */
  extraEnergy: number;
  /** このプレイヤーのターン開始時の回復（聖域） */
  startHeal: number;
  /** モンスターは出たターンから攻撃できる（闘技場） */
  noSummoningSickness: boolean;
  /** このターン最初に使うカードのコスト軽減（市場） */
  firstCardDiscount: number;
  /** モンスターの攻撃で相手プレイヤーに与えるダメージを減らす割合（霧） */
  playerAttackCut: number;
  /** このプレイヤーのモンスターが場に出るたびの体力・最大体力の上乗せ（召喚士） */
  summonHp: number;
  /** 最大HP・HP の上乗せ（騎士。対戦の開始時だけ） */
  bonusHp: number;
  /** 最初の手札の上乗せ（魔術師。配るときだけ） */
  firstHand: number;
}

/** turnsTaken が every の倍数（1以上）か */
const everyNth = (turnsTaken: number, every: number) => every > 0 && turnsTaken > 0 && turnsTaken % every === 0;

/** プレイヤー p についてのリーダーとフィールドの効き目（ターンの数え方は p の turnsTaken） */
export function ruleHooks(g: GameState, p: PlayerId): RuleHooks {
  const ps = g.players[p];
  const leader: LeaderId = ps?.leader ?? 'none';
  const field: FieldId | null = g.field?.id ?? null;
  const turns = ps?.turnsTaken ?? 0;
  const fieldDraw = field === 'library' ? F.library.draw : 0;
  const leaderDraw = leader === 'scholar' && everyNth(turns, L.scholar.everyTurns) ? L.scholar.draw : 0;
  return {
    leader,
    field,
    attackBonus: field === 'volcano' ? F.volcano.attack : 0,
    extraDraw: fieldDraw + leaderDraw,
    fieldDraw,
    leaderDraw,
    extraEnergy: leader === 'alchemist' && everyNth(turns, L.alchemist.everyTurns) ? L.alchemist.energy : 0,
    startHeal: field === 'sanctuary' ? F.sanctuary.heal : 0,
    noSummoningSickness: field === 'arena',
    firstCardDiscount: field === 'market' ? F.market.discount : 0,
    playerAttackCut: field === 'fog' ? F.fog.rate : 0,
    summonHp: leader === 'summoner' ? L.summoner.hp : 0,
    bonusHp: leader === 'knight' ? L.knight.hp : 0,
    firstHand: leader === 'mage' ? L.mage.firstHand : 0,
  };
}

/** フィールドの攻撃力の上乗せ（どのプレイヤーでも同じ） */
export function fieldAttackBonus(g: GameState): number {
  return g.field?.id === 'volcano' ? F.volcano.attack : 0;
}

/** 霧：モンスターの攻撃で相手プレイヤーに与えるダメージ（切り捨て） */
export function fogDamage(g: GameState, amount: number): number {
  if (g.field?.id !== 'fog' || amount <= 0) return amount;
  return Math.floor(amount * (1 - F.fog.rate));
}
