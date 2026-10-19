/**
 * リーサル探索（決定事項 #72 A1）：このターンのカード使用・攻撃の並びで勝てるかを深さ優先で調べる。
 * 相手の HP＋シールドに対して「出せる打点の上限」が届かない盤面では探索しない（枝刈り）。
 * ランダムな対象のカードは、結果が確定するとき（相手の場が空など）だけ使う。
 * 相手の毒が HP 以上なら、ターンを終えるだけで勝てる（毒はシールド・無効化を貫通し、ターン開始時に最初に働く）。
 */
import { attackBlockReason, attacksPerTurn } from '../battle/combat.ts';
import { other } from '../battle/core.ts';
import { keywordFlags, targetableTaunts } from '../battle/damage.ts';
import { legalActions } from '../battle/legal.ts';
import { effectiveCost } from '../battle/play.ts';
import { BALANCE } from '../balance.ts';
import type { Action, GameState, PlayerId } from '../battle/types.ts';
import { cardFaceDamage, defAttacksPerTurn, hasHaste } from './evaluate.ts';
import { orderForSearch, signature, simulate, usesRandom } from './sim.ts';

export interface LethalOptions {
  /** 探索する行動の数（深さ） */
  maxDepth?: number;
  /** 調べる盤面の数の上限 */
  maxNodes?: number;
}

const DEFAULTS: Required<LethalOptions> = { maxDepth: 8, maxNodes: 200 };

/** 倒すのに要るダメージ（シールド込み。毒の分は差し引く） */
function needed(g: GameState, opp: PlayerId): number {
  const ps = g.players[opp];
  return ps.hp + ps.shield - ps.status.poison;
}

/**
 * このターンに顔へ出せる打点の上限（楽観的な見積もり）。
 * 攻撃できるモンスターの残り攻撃回数、手札のダメージカード（エナジーの範囲。エナジー効果の分は増やす）、
 * 攻撃力上昇、筋力・気合、出血、脆弱の倍率を足し合わせる。
 * 相手に選べる挑発モンスターがいると、飛行でない攻撃とカードの「選んだ1体」のダメージは挑発の体力を超えた分しか届かない
 */
export function damageUpperBound(g: GameState, me: PlayerId): number {
  const ps = g.players[me];
  const opp = g.players[other(me)];
  let attacksLeft = 0;
  /** 飛行の攻撃（挑発を無視できる）と、それ以外の攻撃 */
  let flying = 0;
  let ground = 0;
  for (const m of ps.board) {
    if (attackBlockReason(g, m)) continue;
    const left = attacksPerTurn(g, m) - m.attacksUsed;
    attacksLeft += left;
    let dmg = m.attack * left;
    const def = g.cards[m.card.cardId];
    if (def && !m.sealed) {
      for (const e of def.effects) {
        if (e.timing !== 'attack') continue;
        if (e.id === 'damage') dmg += (e.value ?? 0) * left;
        if (e.id === 'multiHit') dmg += (e.value ?? 0) * (e.hits ?? 0) * left;
      }
    }
    if (keywordFlags(g, m).flying) flying += dmg;
    else ground += dmg;
  }
  let energy = ps.energy;
  let attackUp = 0;
  let bonus = ps.status.strength + ps.status.focus;
  let attackCards = 0;
  let removal = false;
  let vulnerable = opp.status.vulnerable > 0;
  /** dmg：顔へのダメージ、chosen：そのうち「選んだ1体」の分（挑発がいると顔に届かない：決定事項 #83） */
  const costs: { cost: number; dmg: number; chosen: number }[] = [];
  for (const c of ps.hand) {
    const def = g.cards[c.cardId];
    if (!def) continue;
    const timing = def.stats ? 'summon' : 'play';
    for (const e of def.effects) {
      if (e.timing !== timing) continue;
      if (e.id === 'energy' && e.target === 'self') energy += Math.min(e.value ?? 0, BALANCE.battle.maxEnergyGainPerTurn);
      if (e.id === 'attackUp') attackUp += e.value ?? 0;
      if (e.id === 'focus' || e.id === 'strength') bonus += e.value ?? 0;
      if (e.id === 'vulnerable' && e.target !== 'self') vulnerable = true;
      if (REMOVAL.has(e.id)) removal = true;
    }
    let dmg = cardFaceDamage(def);
    const chosen = cardFaceDamage(def, true);
    if (def.stats && hasHaste(def)) dmg += def.stats.attack * defAttacksPerTurn(def);
    if (dmg > 0) {
      attackCards += 1;
      costs.push({ cost: effectiveCost(g, me, c), dmg, chosen });
    }
  }
  // エナジーの範囲で出せるカードのダメージの上限（コストあたりのダメージが大きい順に、端数も入れる）
  costs.sort((a, b) => b.dmg / Math.max(0.5, b.cost) - a.dmg / Math.max(0.5, a.cost));
  let cards = 0;
  let cardsChosen = 0;
  for (const x of costs) {
    if (energy <= 0 && x.cost > 0) break;
    if (x.cost <= energy) {
      energy -= x.cost;
      cards += x.dmg;
      cardsChosen += x.chosen;
    } else {
      cards += Math.ceil((x.dmg * energy) / x.cost);
      cardsChosen += Math.ceil((x.chosen * energy) / x.cost);
      energy = 0;
    }
  }
  // 挑発：飛行でない攻撃と、カードの「選んだ1体」のダメージ（決定事項 #83）は、挑発モンスターを倒した残りしか顔に届かない
  // （除去カードがあれば倒せるものとして見る）
  const taunts = removal ? [] : targetableTaunts(g, other(me));
  let tauntHp = 0;
  for (const m of taunts) tauntHp += m.hp + m.defense;
  let blocked = 0;
  if (taunts.length > 0) {
    blocked = Math.min(cardsChosen, cards);
    cards -= blocked;
  }
  const boardFace = flying + Math.max(0, ground + attackUp * Math.max(attacksLeft, 1) + blocked - tauntHp);
  let total = boardFace + cards + bonus * Math.min(attackCards, 2);
  total += opp.status.bleed * (attacksLeft + Math.min(attackCards, 2));
  if (vulnerable) total = Math.floor(total * (1 + BALANCE.battle.vulnerableRate));
  return total;
}

/** 挑発モンスターをダメージ以外で退かせる効果 */
const REMOVAL: ReadonlySet<string> = new Set(['execute', 'bounce', 'steal', 'wipe', 'seal']);

interface Search {
  me: PlayerId;
  seed: number;
  nodes: number;
  maxNodes: number;
  seen: Set<string>;
}

function dfs(g: GameState, depth: number, s: Search): Action[] | null {
  if (g.phase === 'ended') return g.result?.winner === s.me ? [] : null;
  if (g.pending) return null;
  const opp = other(s.me);
  // 相手の毒が HP 以上：ターンを終えれば相手のターン開始時の毒で倒せる
  if (g.players[opp].status.poison >= g.players[opp].hp) return [{ type: 'endTurn', player: s.me }];
  if (depth === 0 || s.nodes >= s.maxNodes) return null;
  if (damageUpperBound(g, s.me) < needed(g, opp)) return null;
  const oppBoardEmpty = g.players[opp].board.length === 0;
  for (const a of orderForSearch(g, legalActions(g, s.me))) {
    if (a.type === 'removeNoise') continue;
    if (usesRandom(g, a) && !oppBoardEmpty) continue;
    s.nodes += 1;
    const next = simulate(g, a, s.seed, s.me);
    if (!next) continue;
    if (next.phase === 'ended') {
      if (next.result?.winner === s.me) return [a];
      continue;
    }
    const key = signature(next);
    if (s.seen.has(key)) continue;
    s.seen.add(key);
    const rest = dfs(next, depth - 1, s);
    if (rest) return [a, ...rest];
    if (s.nodes >= s.maxNodes) return null;
  }
  return null;
}

/** このターンに勝てる行動の並び。なければ null */
export function findLethal(view: GameState, me: PlayerId, seed: number, opts: LethalOptions = {}): Action[] | null {
  if (view.phase !== 'main' || view.active !== me || view.pending) return null;
  const o = { ...DEFAULTS, ...opts };
  const s: Search = { me, seed, nodes: 0, maxNodes: o.maxNodes, seen: new Set() };
  return dfs(view, o.maxDepth, s);
}
