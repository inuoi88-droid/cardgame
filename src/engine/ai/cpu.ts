/**
 * CPU。戦略（Strategy）を差し替えられる形にしておき、難易度（やさしい・ふつう・つよい）で戦略を選ぶ（決定事項 #72）。
 * CPU は viewFor() で見える情報だけを使う（相手の手札や山札の順番は見ない）。
 */
import { validateAction } from '../battle/apply.ts';
import { legalActions } from '../battle/legal.ts';
import { viewFor } from '../battle/view.ts';
import type { Action, GameState, PlayerId } from '../battle/types.ts';
import { easyStrategy, greedyStrategy, hardStrategy } from './greedy.ts';

export interface Strategy {
  name: string;
  /** 見える情報（view）から次の行動を1つ決める。seed は仮の実行に使う乱数 */
  decide(view: GameState, me: PlayerId, seed: number): Action;
}

export const CPU_LEVELS = ['easy', 'normal', 'hard'] as const;
export type CpuLevel = (typeof CPU_LEVELS)[number];

export const CPU_LEVEL_LABEL: Record<CpuLevel, string> = { easy: 'やさしい', normal: 'ふつう', hard: 'つよい' };

export function strategyFor(level: CpuLevel): Strategy {
  switch (level) {
    case 'easy':
      return easyStrategy;
    case 'hard':
      return hardStrategy;
    default:
      return greedyStrategy;
  }
}

/** CPU が行動すべき場面か（自分の手番、自分の選択待ち、マリガン中） */
export function cpuShouldAct(g: GameState, me: PlayerId): boolean {
  if (g.phase === 'ended') return false;
  if (g.phase === 'mulligan') return !g.players[me].mulligan.done;
  if (g.pending) return g.pending.player === me;
  return g.active === me;
}

export function cpuAction(g: GameState, me: PlayerId, seed: number, level: CpuLevel | Strategy = 'normal'): Action {
  const strategy = typeof level === 'string' ? strategyFor(level) : level;
  // ログは思考に使わないので、見える情報を作る前に外す（複製が軽くなる）
  const view = viewFor({ ...g, log: [] }, me);
  const action = strategy.decide(view, me, seed);
  // 念のため、本物の状態で実行できない行動ならターン終了などの安全な行動にする
  if (validateAction(g, action) === null) return action;
  const fallback = legalActions(g, me);
  return (
    fallback.find((a) => a.type === 'endTurn') ??
    fallback.find((a) => a.type === 'mulligan' && a.mode === 'keep') ??
    fallback[0] ?? { type: 'concede', player: me }
  );
}
