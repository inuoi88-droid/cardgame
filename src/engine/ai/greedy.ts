/**
 * CPU の戦略（決定事項 #72）。
 * - 貪欲法：今できる行動をそれぞれ仮に実行して盤面を評価し、一番よい行動を選ぶ。どれも今より良くならなければターン終了。
 *   評価値がほぼ同じなら「攻撃してくるモンスターの除去 → コストの高いカード → 顔へのダメージ」の順で決める。
 * - リーサル探索：このターンに勝てる並びがあれば必ずそれを選ぶ。
 * - 難易度：やさしい＝貪欲法に評価のゆらぎ、リーサル探索なし／ふつう＝リーサル探索＋貪欲法／
 *   つよい＝リーサル探索＋ターン内のビーム探索。
 */
import { legalActions } from '../battle/legal.ts';
import { usesX } from '../battle/play.ts';
import type { Action, GameState, PlayerId } from '../battle/types.ts';
import { beamSearch, type BeamOptions } from './beam.ts';
import type { Strategy } from './cpu.ts';
import { evaluate, raceFrame, WEIGHTS } from './evaluate.ts';
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
  const frame = raceFrame(view, me);
  let best: { picks: string[]; score: number } | null = null;
  const candidates: string[][] = p.min === 0 ? [[]] : [];
  for (const o of p.options) candidates.push([o.id]);
  for (const picks of candidates) {
    const s = simulate(view, { type: 'choose', player: me, picks }, seed, me);
    if (!s) continue;
    const score = evaluate(s, me, frame);
    if (!best || score > best.score) best = { picks, score };
  }
  return { type: 'choose', player: me, picks: best?.picks ?? chooseFor(view, p, me) };
}

/** 貪欲法で1手選ぶ */
function decideGreedy(view: GameState, me: PlayerId, seed: number, noiseSigma: number): Action {
  // 比べる盤面はすべて、この判断の前の盤面で固定したレースの見込みで評価する（決定事項 #81）
  const frame = raceFrame(view, me);
  const base = evaluate(view, me, frame);
  let best: Candidate | null = null;
  /** X（全力）を使わない行動のうち一番よいもの */
  let bestNoX: Candidate | null = null;
  let index = 0;
  for (const action of dedupeActions(view, legalActions(view, me))) {
    if (action.type === 'endTurn' || action.type === 'concede') continue;
    const c = scoreAction(view, action, seed, me, frame);
    index += 1;
    if (!c) continue;
    if (noiseSigma > 0) c.score += gaussian(seed, index, noiseSigma);
    if (!best || better(c, best)) best = c;
    if (!isXPlay(view, action) && (!bestNoX || better(c, bestNoX))) bestNoX = c;
  }
  const threshold = base + WEIGHTS.tieEpsilon * 0.1;
  // X のカードは残りのエナジーをすべて使うので、ほかに得になる行動があれば先にそちらを選ぶ（X は最後に使う）
  if (best && isXPlay(view, best.action) && bestNoX && bestNoX.score > threshold) return bestNoX.action;
  if (best && best.score > threshold) return best.action;
  return { type: 'endTurn', player: me };
}

/** X（全力）のカードを使う行動か */
function isXPlay(view: GameState, action: Action): boolean {
  if (action.type !== 'playCard') return false;
  const card = view.players[action.player].hand.find((c) => c.uid === action.cardUid);
  const def = card ? view.cards[card.cardId] : undefined;
  return def ? usesX(def) : false;
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
