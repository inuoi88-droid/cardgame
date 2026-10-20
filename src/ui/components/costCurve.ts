/**
 * コスト分布（MTG 要素 △ バッチD：#629 マナカーブ）の計算（純粋関数）。デッキ構築・準備画面・ドラフト戦で使う。
 * 一言のしきい値は表示用の目安で、ゲームのバランスの数値ではない。
 */
import { BALANCE, type CardDef, type Deck } from '../../engine/index.ts';

export interface CurveBar {
  cost: number;
  monster: number;
  other: number;
}

export interface CostCurveData {
  bars: CurveBar[];
  total: number;
  /** 平均コスト（カードが無ければ 0） */
  average: number;
  /** 一言（「軽いカードが少ない」など。無ければ null） */
  advice: string | null;
}

/** 表示用の目安：軽いカード（コスト0〜1）がこの割合より少ない／重いカード（4以上）がこの割合より多い */
const LIGHT_MIN_RATE = 0.2;
const HEAVY_MAX_RATE = 0.3;
const LIGHT_MAX_COST = 1;
const HEAVY_MIN_COST = 4;

export function costCurve(deck: Pick<Deck, 'entries'>, cards: readonly CardDef[]): CostCurveData {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const bars: CurveBar[] = [];
  for (let cost = BALANCE.card.costMin; cost <= BALANCE.card.costMax; cost++) bars.push({ cost, monster: 0, other: 0 });
  let total = 0;
  let sum = 0;
  for (const e of deck.entries) {
    const def = byId.get(e.cardId);
    if (!def) continue;
    const bar = bars.find((b) => b.cost === def.cost);
    if (!bar) continue;
    if (def.stats) bar.monster += e.count;
    else bar.other += e.count;
    total += e.count;
    sum += def.cost * e.count;
  }
  const average = total > 0 ? sum / total : 0;
  const light = bars.filter((b) => b.cost <= LIGHT_MAX_COST).reduce((n, b) => n + b.monster + b.other, 0);
  const heavy = bars.filter((b) => b.cost >= HEAVY_MIN_COST).reduce((n, b) => n + b.monster + b.other, 0);
  let advice: string | null = null;
  if (total > 0 && light < total * LIGHT_MIN_RATE) advice = `軽いカード（コスト${LIGHT_MAX_COST}以下）が少なめ。序盤に使えるカードがないターンが出やすい`;
  else if (total > 0 && heavy > total * HEAVY_MAX_RATE) advice = `重いカード（コスト${HEAVY_MIN_COST}以上）が多め。エナジーが増えるまで手札で止まりやすい`;
  return { bars, total, average, advice };
}
