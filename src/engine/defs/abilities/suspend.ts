import { BALANCE } from '../../balance.ts';
import { countParam, defineAbility, n } from '../../define.ts';

const B = BALANCE.abilities.suspend;
const COSTS = Array.from({ length: B.maxCost + 1 }, (_, i) => ({ id: String(i), label: `エナジー${i}` }));
/** 待機させるエナジー K（選択肢の数字） */
export const suspendCost = (a: { option?: string }): number => {
  const k = Number(a.option ?? '1');
  return Number.isInteger(k) && k >= 0 && k <= B.maxCost ? k : 1;
};

/** 浮くエナジー：印刷コスト−K（0未満にしない） */
const saved = (a: { option?: string }, cost: number | undefined): number => Math.max(0, (cost ?? 0) - suspendCost(a));
/** 待つターン数による割引 */
const delay = (a: { value?: number }): number => B.delayRate[Math.min(Math.max(n(a), 1), B.delayRate.length) - 1]!;

// 待機：MTG #264・#384（待機・兆候）。エナジー K でこのカードを待機させ、N ターン後の自分のターン開始時に無料で使う（モンスターは疾走）
export default defineAbility({
  id: 'suspend',
  name: '待機',
  order: 52,
  group: '待機ゾーン',
  summary: `自分のターンにエナジーK（印刷コスト未満）を払って、このカードを表向きで待機ゾーンに置ける（残りN）。自分のターン開始時に残りが1ずつ減り、0になったら無料で使われる（対象・モードは選ぶ。モンスターは疾走を持つ＝兆候）。ポイントは${B.flat}＋(印刷コスト−K)×${B.perSaved}×（N＝1・2・3 で ${B.delayRate.join('・')}）`,
  value: countParam('ターン', { min: 1, max: B.maxTurns, default: 2 }),
  option: { label: '待機させるエナジー', choices: COSTS, default: '1' },
  belowPrintedCost: 'option',
  points: (a, ctx) => B.flat + saved(a, ctx.card.cost) * B.perSaved * delay(a),
  formula: (a, ctx) => `${B.flat}＋浮くエナジー${saved(a, ctx.card.cost)}×${B.perSaved}×${delay(a)}（${n(a)}ターン後）`,
  displayName: (a) => `待機${n(a)}—${suspendCost(a)}`,
  describe: (a) => `エナジー${suspendCost(a)}で待機させ、${n(a)}ターン後の自分のターン開始時に無料で使う`,
  battle: { setAside: { kind: 'suspend', setCost: (a) => suspendCost(a), time: (a) => n(a) } },
});
