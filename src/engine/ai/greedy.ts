/** 貪欲法：今できる行動をそれぞれ仮に実行して盤面を評価し、一番よい行動を選ぶ。どれも今より良くならなければターン終了 */
import { applyAction } from '../battle/apply.ts';
import { legalActions } from '../battle/legal.ts';
import type { Action, GameState, PlayerId } from '../battle/types.ts';
import type { Strategy } from './cpu.ts';
import { evaluate } from './evaluate.ts';

/** これより良くならない行動はしない */
const MIN_GAIN = 0.01;

function simulate(view: GameState, action: Action, seed: number, me: PlayerId): number | null {
  const r = applyAction({ ...view, rng: seed }, action);
  if (!r.ok) return null;
  let s = r.state;
  // 仮の実行で選択待ちになったら、最初の選択肢で進めて評価する
  for (let i = 0; i < 3 && s.pending && s.pending.player === me; i++) {
    const p = s.pending;
    const picks = p.options.slice(0, Math.max(p.min, Math.min(1, p.max))).map((o) => o.id);
    const next = applyAction(s, { type: 'choose', player: me, picks });
    if (!next.ok) break;
    s = next.state;
  }
  return evaluate(s, me);
}

function decideMulligan(view: GameState, me: PlayerId): Action {
  const ps = view.players[me];
  const cheap = ps.hand.filter((c) => (view.cards[c.cardId]?.cost ?? 99) <= 2).length;
  if (ps.mulligan.fullCount === 0 && cheap < 2) return { type: 'mulligan', player: me, mode: 'all' };
  return { type: 'mulligan', player: me, mode: 'keep' };
}

function decideChoice(view: GameState, me: PlayerId, seed: number): Action {
  const p = view.pending!;
  if (p.max > 1 || p.min === 0) {
    // 保持など複数選べるもの：コストの高いカードから残す
    const sorted = [...p.options].sort((a, b) => (view.cards[b.cardId ?? '']?.cost ?? 0) - (view.cards[a.cardId ?? '']?.cost ?? 0));
    return { type: 'choose', player: me, picks: sorted.slice(0, p.max).map((o) => o.id) };
  }
  let best: { id: string; score: number } | null = null;
  for (const o of p.options) {
    const score = simulate(view, { type: 'choose', player: me, picks: [o.id] }, seed, me);
    if (score !== null && (!best || score > best.score)) best = { id: o.id, score };
  }
  return { type: 'choose', player: me, picks: [best?.id ?? p.options[0]!.id] };
}

export const greedyStrategy: Strategy = {
  name: '貪欲法（評価値の高い行動から）',
  decide(view, me, seed) {
    const v: GameState = { ...view, log: [] };
    if (v.phase === 'mulligan') return decideMulligan(v, me);
    if (v.pending && v.pending.player === me) return decideChoice(v, me, seed);
    const base = evaluate(v, me);
    let best: { action: Action; score: number } | null = null;
    for (const action of legalActions(v, me)) {
      if (action.type === 'endTurn' || action.type === 'concede') continue;
      const score = simulate(v, action, seed, me);
      if (score !== null && (!best || score > best.score)) best = { action, score };
    }
    if (best && best.score > base + MIN_GAIN) return best.action;
    return { type: 'endTurn', player: me };
  },
};

