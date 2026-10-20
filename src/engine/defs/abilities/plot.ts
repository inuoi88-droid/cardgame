import { BALANCE } from '../../balance.ts';
import { defineAbility } from '../../define.ts';

const B = BALANCE.abilities.plot;

// 計画：MTG #378。自分のターンに今の実コストを払って、このカードを表向きで待機させる。後のターンに無料で使える
export default defineAbility({
  id: 'plot',
  name: '計画',
  order: 51,
  group: '待機ゾーン',
  summary: `自分のターンに今の実コスト（凍結・軽減は掛かる）を払って、このカードを表向きで待機ゾーンに置ける。後の自分のターンに無料で使える（護法は払う。X は0）。ポイントは固定${B.flat}`,
  points: () => B.flat,
  formula: () => `${B.flat}`,
  displayName: () => '計画',
  describe: () => '今払って待機させ、後のターンに無料で使う',
  battle: { setAside: { kind: 'plot', free: true } },
});
