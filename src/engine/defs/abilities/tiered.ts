import { BALANCE } from '../../balance.ts';
import { defineAbility } from '../../define.ts';
import { round2 } from '../../math.ts';
import { MODE_LABEL, type ModeId } from '../../types.ts';

const B = BALANCE.abilities.tiered;
const rate = BALANCE.modal.otherRate;
/** 「B は+1、C は+2」 */
const surchargeText = B.surcharge
  .map((k, i) => (k > 0 ? `${MODE_LABEL[(i + 1) as ModeId]} は+${k}` : ''))
  .filter(Boolean)
  .join('、');

// 段階：MTG #391。モード選択のカードで、強い段ほど追加のエナジーを払う（B は+1、C は+2）
export default defineAbility({
  id: 'tiered',
  name: '段階',
  order: 18,
  group: 'モード',
  summary: `モード選択のカードで、モードごとに追加のエナジーを払う（${surchargeText}）。ポイントは各モードから 追加エナジー×${B.perEnergy} を引いてから、いちばん高いモード＋他のモード×${rate}`,
  payGroup: 'extra',
  requiresModes: true,
  conflicts: ['entwine', 'villain'],
  points: () => B.flat,
  formula: () => '0（モード選択の割引に含む）',
  modeValue: (_a, points) => {
    const adjusted = points.map((p, i) => Math.max(0, p - (B.surcharge[i] ?? 0) * B.perEnergy));
    const sorted = [...adjusted].sort((x, y) => y - x);
    const others = sorted.slice(1).reduce((s, v) => s + v, 0);
    return { value: (sorted[0] ?? 0) + others * rate, formula: `上乗せを引いて 高いモード${round2(sorted[0] ?? 0)}＋他${round2(others)}×${rate}` };
  },
  displayName: () => '段階',
  describe: () => `モード ${surchargeText}のエナジーを追加で払う`,
  battle: { tiered: true },
});
