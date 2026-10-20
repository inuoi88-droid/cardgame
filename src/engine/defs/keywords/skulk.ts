import { BALANCE } from '../../balance.ts';
import { defineKeyword } from '../../define.ts';

const B = BALANCE.keywords.skulk;

// 潜伏：MTG #321。挑発のモンスターがすべてこのモンスターより攻撃力が高いなら、挑発を無視して攻撃できる
export default defineKeyword({
  id: 'skulk',
  name: '潜伏',
  order: 22,
  summary: '相手の挑発のモンスターがすべてこのモンスターより攻撃力が高いなら、挑発を無視して攻撃できる（判定は攻撃する時点の攻撃力）',
  points: () => B.flat,
  formula: () => `${B.flat}`,
  displayName: () => '潜伏',
  describe: () => '挑発がすべてこのモンスターより攻撃力が高ければ、挑発を無視して攻撃できる',
  battle: { skulk: true },
});
