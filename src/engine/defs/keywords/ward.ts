import { BALANCE } from '../../balance.ts';
import { countParam, defineKeyword, n } from '../../define.ts';

const B = BALANCE.keywords.ward;

// 護法：MTG #218。相手がカードでこのモンスターを「選んだ1体」にするとき、そのカードのコストが+N
export default defineKeyword({
  id: 'ward',
  name: '護法',
  order: 17,
  summary: '相手がカードでこのモンスターを「選んだ1体」にするとき、そのカードのコストが+N（ランダム・全体・攻撃では払わない）',
  value: countParam('追加コスト', { min: 1, max: B.maxValue, default: 1 }),
  points: (k) => B.perValue * n(k),
  formula: (k) => `${n(k)}×${B.perValue}`,
  displayName: (k) => `護法${n(k)}`,
  describe: (k) => `相手のカードの対象にするとコスト+${n(k)}`,
  battle: { wardTax: (k) => n(k) },
});
