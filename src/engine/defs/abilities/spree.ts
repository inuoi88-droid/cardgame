import { BALANCE } from '../../balance.ts';
import { countParam, defineAbility, n } from '../../define.ts';
import { round2 } from '../../math.ts';

const B = BALANCE.abilities.spree;
const rate = (a: { value?: number }) => B.otherRate[Math.min(Math.max(n(a) - 1, 0), B.otherRate.length - 1)]!;

// 放題：MTG #323・#380（増呪・放題）。モード選択のカードで、モードを好きな数だけ選べる。2つ目からは1つにつきエナジー K を追加で払う
export default defineAbility({
  id: 'spree',
  name: '放題',
  order: 17,
  group: 'モード',
  summary: `モード選択のカードで、モードを好きな数だけ選べる。2つ目からは1つにつきエナジーKを追加で払う（増呪・放題）。ポイントはいちばん高いモード＋他のモード×${B.otherRate.join('／')}（K＝1／2）`,
  value: countParam('追加エナジー', { min: 1, max: B.maxCost, default: 1 }),
  payGroup: 'extra',
  requiresModes: true,
  conflicts: ['entwine', 'villain'],
  points: () => B.flat,
  formula: () => '0（モード選択の割引に含む）',
  modeValue: (a, points) => {
    const sorted = [...points].sort((x, y) => y - x);
    const others = sorted.slice(1).reduce((s, v) => s + v, 0);
    return { value: (sorted[0] ?? 0) + others * rate(a), formula: `高いモード${round2(sorted[0] ?? 0)}＋他${round2(others)}×${rate(a)}` };
  },
  displayName: (a) => `放題+${n(a)}`,
  describe: (a) => `モードを好きな数だけ選べる（2つ目から1つにつきエナジー+${n(a)}）`,
  battle: { spreeCost: (a) => n(a) },
});
