import { BALANCE } from '../../balance.ts';
import { defineAbility } from '../../define.ts';

const B = BALANCE.abilities.convoke;

// 召集：MTG #253。使うとき、まだ攻撃できる自分のモンスターを休ませると、1体につきコスト−1（最大−3）
export default defineAbility({
  id: 'convoke',
  name: '召集',
  order: 30,
  group: 'コスト',
  summary: `手札から使うとき、まだ攻撃できる自分のモンスターを休ませる（このターン攻撃できなくなる）と、1体につきコスト−1（最大−${B.max}）。印刷コスト${B.minCost}以上のカードだけ`,
  minPrintedCost: B.minCost,
  points: () => B.flat,
  formula: () => `${B.flat}（固定）`,
  displayName: () => '召集',
  describe: () => `まだ攻撃できる自分のモンスターを休ませると、1体につきコスト−1（最大−${B.max}）`,
  battle: { convoke: { max: B.max } },
});
