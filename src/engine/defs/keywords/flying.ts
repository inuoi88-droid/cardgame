import { BALANCE } from '../../balance.ts';
import { defineKeyword } from '../../define.ts';

const B = BALANCE.keywords.flying;

export default defineKeyword({
  id: 'flying',
  name: '飛行',
  order: 3,
  summary: '挑発を無視して攻撃できる',
  points: () => B.flat,
  formula: () => `${B.flat}`,
  displayName: () => '飛行',
  describe: () => '挑発を無視して攻撃できる',
});
