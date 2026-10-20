import { BALANCE } from '../../balance.ts';
import { defineKeyword, n, valueParam } from '../../define.ts';

const B = BALANCE.keywords.inspire;

// 激励：MTG #110（常在型能力）。場にいる間、自分の他のモンスターの攻撃力+N（毎回計算し直す。封印されると止まる）
export default defineKeyword({
  id: 'inspire',
  name: '激励',
  order: 16,
  summary: '場にいる間、自分の他のモンスターの攻撃力+N（重ねがけは合計。封印されると止まる）',
  value: valueParam('上昇量', { default: 1, max: B.maxValue }),
  points: (k) => B.perValue * n(k),
  formula: (k) => `${n(k)}×${B.perValue}`,
  displayName: (k) => `激励${n(k)}`,
  describe: (k) => `自分の他のモンスターの攻撃力+${n(k)}（場にいる間）`,
  battle: { auraAttack: (k) => n(k) },
});
