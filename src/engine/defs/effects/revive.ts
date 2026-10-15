import { BALANCE } from '../../balance.ts';
import { defineEffect, n } from '../../define.ts';

const B = BALANCE.effects.revive;

export default defineEffect({
  id: 'revive',
  name: '蘇生',
  group: 'special',
  order: 70,
  summary: '捨て札にあるコストN以下のモンスターを1体場に戻す（エピック以上）',
  value: { label: 'コスト', min: BALANCE.card.costMin, max: BALANCE.card.costMax, default: 1 },
  targetRule: 'self',
  minRarity: 'epic',
  basePoints: (e) => B.flat + B.perValue * n(e),
  baseFormula: (e) => `${B.flat}+${n(e)}×${B.perValue}`,
  describe: (e) => `捨て札からコスト${n(e)}以下のモンスターを1体場に戻す`,
  shortValue: (e) => `コスト${n(e)}以下`,
});
