/**
 * CPU の戦略（決定事項 #72）。
 * - 貪欲法：今できる行動をそれぞれ仮に実行して盤面を評価し、一番よい行動を選ぶ。どれも今より良くならなければターン終了。
 *   評価値がほぼ同じなら「攻撃してくるモンスターの除去 → コストの高いカード → 顔へのダメージ」の順で決める。
 * - リーサル探索：このターンに勝てる並びがあれば必ずそれを選ぶ。
 * - 難易度：やさしい＝貪欲法に評価のゆらぎ、リーサル探索なし／ふつう＝リーサル探索＋貪欲法／
 *   つよい＝リーサル探索＋ターン内のビーム探索。
 */
import { legalActions } from '../battle/legal.ts';
import type { Action, GameState, PlayerId } from '../battle/types.ts';
import { beamSearch, type BeamOptions } from './beam.ts';
import type { Strategy } from './cpu.ts';
import { evaluate, WEIGHTS } from './evaluate.ts';
import { findLethal, type LethalOptions } from './lethal.ts';
import { decideMulligan } from './mulligan.ts';
import { gaussian } from './noise.ts';
import { better, chooseFor, dedupeActions, leanView, scoreAction, simulate, type Candidate } from './sim.ts';

export interface GreedyOptions {
  /** 評価のゆらぎ（標準偏差）。0 ならなし */
  noiseSigma: number;
  lethal: boolean;
  beam: boolean;
  lethalOptions?: LethalOptions;
  beamOptions?: BeamOptions;
}

/** 選択待ち：カードを選ぶものは価値で、それ以外（解除など）は仮に実行して評価で決める */
function decideChoice(view: GameState, me: PlayerId, seed: number): Action {
  const p = view.pending!;
  const effectId = p.step.t === 'effect' ? p.step.effect.id : p.step.t;
  const byValue = effectId === 'retain' || p.options.every((o) => o.cardId);
  if (byValue || p.max > 1) return { type: 'choose', player: me, picks: chooseFor(view, p, me) };
  let best: { picks: string[]; score: number } | null = null;
  const candidates: string[][] = p.min === 0 ? [[]] : [];
  for (const o of p.options) candidates.push([o.id]);
  for (const picks of candidates) {
    const s = simulate(view, { type: 'choose', player: me, picks }, seed, me);
    if (!s) continue;
    const score = evaluate(s, me);
    if (!best || score > best.score) best = { picks, score };
  }
  return { type: 'choose', player: me, picks: best?.picks ?? chooseFor(view, p, me) };
}

/** 貪欲法で1手選ぶ */
function decideGreedy(view: GameState, me: PlayerId, seed: number, noiseSigma: number): Action {
  const base = evaluate(view, me);
  let best: Candidate | null = null;
  let index = 0;
  for (const action of dedupeActions(view, legalActions(view, me))) {
    if (action.type === 'endTurn' || action.type === 'concede') continue;
    const c = scoreAction(view, action, seed, me);
    index += 1;
    if (!c) continue;
    if (noiseSigma > 0) c.score += gaussian(seed, index, noiseSigma);
    if (!best || better(c, best)) best = c;
  }
  if (best && best.score > base + WEIGHTS.tieEpsilon * 0.1) return best.action;
  return { type: 'endTurn', player: me };
}

export function makeStrategy(name: string, opts: GreedyOptions): Strategy {
  return {
    name,
    decide(view, me, seed) {
      if (view.phase === 'mulligan') return decideMulligan(view, me);
      const v = leanView(view, me);
      if (v.pending && v.pending.player === me) return decideChoice(v, me, seed);
      if (opts.lethal) {
        const plan = findLethal(v, me, seed, opts.lethalOptions);
        if (plan && plan.length > 0) return plan[0]!;
      }
      if (opts.beam) return beamSearch(v, me, seed, opts.beamOptions);
      return decideGreedy(v, me, seed, opts.noiseSigma);
    },
  };
}

export const easyStrategy: Strategy = makeStrategy('やさしい（貪欲法＋ゆらぎ）', { noiseSigma: WEIGHTS.easyNoiseSigma, lethal: false, beam: false });
export const greedyStrategy: Strategy = makeStrategy('ふつう（リーサル探索＋貪欲法）', { noiseSigma: 0, lethal: true, beam: false });
export const hardStrategy: Strategy = makeStrategy('つよい（リーサル探索＋ビーム探索）', { noiseSigma: 0, lethal: true, beam: true });
