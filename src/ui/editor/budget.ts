/**
 * ポイントの「予算」モデル（決定事項 #67 の計算を、見せ方だけ変える）。
 *   予算 = レアリティ上限 + コストの差し引き（コストを上げると予算が増える）
 *   使用 = ステータス + キーワード + 効果 − デメリットで相殺した分
 *   あと = 予算 − 使用（engine の remaining と同じ値）
 * 計算そのものは engine の calculatePoints。ここでは表示用に並べ替えるだけ。
 */
import { BALANCE, costPoints, type CardAnalysis, type CardDef } from '../../engine/index.ts';

export interface BudgetModel {
  /** 予算（上限＋コスト分） */
  budget: number;
  /** レアリティ上限（コスト0なら下がった値） */
  cap: number;
  /** コストで増える予算 */
  costBonus: number;
  /** ステータス＋キーワード＋効果（相殺前） */
  gross: number;
  /** デメリットで相殺した分 */
  offset: number;
  /** 使用（相殺後） */
  used: number;
  /** あと（負なら超過） */
  remaining: number;
  /** 超過分（0 以上） */
  over: number;
  segments: { stat: number; keyword: number; effect: number };
  /** デメリットの合計 */
  drawbackTotal: number;
  /** 相殺に使える上限 */
  offsetLimit: number;
  /** 呪いカードか */
  curse: boolean;
  /** 呪いに必要なデメリット合計（＝上限） */
  curseNeed: number;
}

export function budgetOf(a: CardAnalysis, card: CardDef): BudgetModel {
  const p = a.points;
  const segments = { stat: 0, keyword: 0, effect: 0 };
  for (const l of p.lines) {
    if (l.kind === 'stat' || l.kind === 'keyword' || l.kind === 'effect') segments[l.kind] += l.value;
    // カードの能力（MTG 要素 ○ バッチB）は効果の帯に含める
    if (l.kind === 'ability') segments.effect += l.value;
  }
  const costBonus = costPoints(card.cost);
  const budget = p.cap + costBonus;
  // 合計 = 粗計 − コスト − 相殺 なので、使用 = 合計 + コスト（engine の remaining とぴったり合う）
  const used = p.total + costBonus;
  const C = BALANCE.curse;
  const offsetLimit = card.cost < C.minCostForOffset ? 0 : Math.floor(p.cap * C.maxOffsetRate);
  return {
    budget,
    cap: p.cap,
    costBonus,
    gross: used + p.drawbackOffset,
    offset: p.drawbackOffset,
    used,
    remaining: p.remaining,
    over: Math.max(0, -p.remaining),
    segments,
    drawbackTotal: p.drawbackTotal,
    offsetLimit,
    curse: a.isCurse,
    curseNeed: p.cap,
  };
}
