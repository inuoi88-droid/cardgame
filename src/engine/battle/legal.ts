/** 今できる行動の一覧（UI・CPU・サーバーの検証で共用） */
import { BALANCE } from '../balance.ts';
import { attackBlockReason, attackTargets } from './combat.ts';
import { nextFullMulliganSize } from './mulligan.ts';
import { allyCandidates, chosenRules, effectiveCost, enemyCandidates, validatePlay } from './play.ts';
import { NOISE_CARD_ID, type Action, type CardInst, type GameState, type PlayerId, type TargetRef } from './types.ts';

export interface PlayInfo {
  card: CardInst;
  cost: number;
  /** 使えない理由（使えるなら null） */
  blocked: string | null;
  enemyTargets: TargetRef[];
  allyTargets: string[];
}

/** 手札のカードを使うときの情報（コスト、対象の候補、使えない理由） */
export function playInfo(g: GameState, p: PlayerId, card: CardInst): PlayInfo {
  const def = g.cards[card.cardId];
  if (card.cardId === NOISE_CARD_ID || !def) {
    return { card, cost: BALANCE.battle.noiseRemoveCost, blocked: 'ノイズ', enemyTargets: [], allyTargets: [] };
  }
  const rules = chosenRules(def);
  const enemyTargets = enemyCandidates(g, p, rules.enemy);
  const allyTargets = rules.ally ? allyCandidates(g, p, card) : [];
  const cost = effectiveCost(g, p, card);
  let blocked: string | null = null;
  if (g.phase !== 'main' || g.active !== p || g.pending) blocked = '今は使えません';
  else if (cost > g.players[p].energy) blocked = 'エナジーが足りません';
  return { card, cost, blocked, enemyTargets, allyTargets };
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
    if (info.blocked) continue;
    const enemies: (TargetRef | undefined)[] = info.enemyTargets.length ? info.enemyTargets : [undefined];
    const allies: (string | undefined)[] = info.allyTargets.length ? info.allyTargets : [undefined];
    for (const enemy of enemies) {
      for (const ally of allies) {
        const chosen = { ...(enemy ? { enemy } : {}), ...(ally ? { ally } : {}) };
        if (validatePlay(g, p, card.uid, chosen) === null) out.push({ type: 'playCard', player: p, cardUid: card.uid, chosen });
      }
    }
  }
  for (const m of ps.board) {
    if (attackBlockReason(g, m)) continue;
    for (const target of attackTargets(g, m)) out.push({ type: 'attack', player: p, attackerUid: m.uid, target });
  }
  out.push({ type: 'endTurn', player: p });
  return out;
}
