/**
 * ターン内のビーム探索（決定事項 #72 A4。「つよい」用）：行動の並びを幅優先で広げ、各段で評価の高い盤面だけを残す。
 * 並びの終わり（＝ターン終了直前）の評価で比べ、一番よい並びの最初の行動を返す。
 * 順序に意味がある組み合わせ（気合→ダメージ、脆弱→バースト、召喚→号令）を1手読みより正しく扱える。
 */
import { legalActions } from '../battle/legal.ts';
import type { Action, GameState, PlayerId } from '../battle/types.ts';
import { evaluate, raceFrame, WEIGHTS } from './evaluate.ts';
import { better, orderForSearch, outcome, scoreAction, signature, type Candidate } from './sim.ts';

export interface BeamOptions {
  /** 並びの長さの上限 */
  maxDepth?: number;
  /** 各段で残す盤面の数 */
  width?: number;
  /** 仮の実行の回数の上限（時間の安全装置） */
  maxSims?: number;
}

const DEFAULTS: Required<BeamOptions> = { maxDepth: 6, width: 8, maxSims: 120 };

interface Node {
  state: GameState;
  /** 並びの最初の行動（根では null＝ターン終了） */
  first: Candidate | null;
  score: number;
}

/** ビーム探索で、このターンの最初の行動を決める。何もしないのが一番ならターン終了 */
export function beamSearch(view: GameState, me: PlayerId, seed: number, opts: BeamOptions = {}): Action {
  const o = { ...DEFAULTS, ...opts };
  const endTurn: Action = { type: 'endTurn', player: me };
  // 並びの途中の盤面もすべて根（このターンの判断の前）で固定したレースの見込みで評価する（決定事項 #81）
  const frame = raceFrame(view, me);
  const root: Node = { state: view, first: null, score: evaluate(view, me, frame) };
  let best: Node = root;
  let beam: Node[] = [root];
  let sims = 0;
  const seen = new Set<string>([signature(view)]);
  for (let depth = 0; depth < o.maxDepth && beam.length > 0 && sims < o.maxSims; depth++) {
    const children: Node[] = [];
    for (const node of beam) {
      if (node.state.phase !== 'main' || node.state.pending) continue;
      for (const action of orderForSearch(node.state, legalActions(node.state, me))) {
        if (sims >= o.maxSims) break;
        sims += 1;
        const c = scoreAction(node.state, action, seed, me, frame);
        if (!c || !c.state) continue;
        if (c.state.result?.winner === me) return node.first ? node.first.action : action;
        if (c.state.result) continue;
        const key = signature(c.state);
        if (seen.has(key)) continue;
        seen.add(key);
        // 並びの最初の行動には、根からの結果（タイブレーク用の情報）を持たせる
        const first: Candidate = node.first ?? { ...c, ...outcome(view, c.state, action, me) };
        children.push({ state: c.state, first, score: c.score });
      }
    }
    if (children.length === 0) break;
    children.sort((a, b) => b.score - a.score);
    beam = children.slice(0, o.width);
    for (const child of beam) if (prefer(child, best)) best = child;
  }
  return best.first ? best.first.action : endTurn;
}

/** a の並びが b より良いか。評価がほぼ同じなら最初の行動のタイブレーク（除去 → コスト → 顔） */
function prefer(a: Node, b: Node): boolean {
  const eps = WEIGHTS.tieEpsilon;
  if (a.score > b.score + eps) return true;
  if (b.score > a.score + eps) return false;
  if (!a.first) return false;
  if (!b.first) return true;
  return better({ ...a.first, score: a.score }, { ...b.first, score: b.score });
}
