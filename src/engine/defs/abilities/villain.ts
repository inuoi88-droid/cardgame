import { BALANCE } from '../../balance.ts';
import { defineAbility } from '../../define.ts';
import { round2 } from '../../math.ts';

const B = BALANCE.abilities.villain;

// 最悪の二択：MTG #459。モード選択（2つ）のカードで、どちらのモードにするかを相手が選ぶ
export default defineAbility({
  id: 'villain',
  name: '最悪の二択',
  order: 34,
  group: 'モード',
  summary: `モードがちょうど2つのカードで、どちらのモードにするかを相手が選ぶ（どちらのモードも相手に作用する効果にする）。対象は使う人が先に選ぶ。ポイントは低いモード＋高いモード×${B.highRate}`,
  requiresModes: true,
  conflicts: ['entwine', 'spree', 'tiered'],
  points: () => B.flat,
  formula: () => '0（モード選択の割引に含む）',
  modeValue: (_a, points) => {
    const sorted = [...points].sort((x, y) => x - y);
    const low = sorted[0] ?? 0;
    const high = sorted.slice(1).reduce((s, v) => s + v, 0);
    return { value: low + high * B.highRate, formula: `低いモード${round2(low)}＋高いモード${round2(high)}×${B.highRate}` };
  },
  displayName: () => '最悪の二択',
  describe: () => '相手が A か B を選ぶ',
  battle: { villain: true },
});
