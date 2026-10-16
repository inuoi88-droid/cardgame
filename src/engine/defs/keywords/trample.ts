import { BALANCE } from '../../balance.ts';
import { defineKeyword } from '../../define.ts';

const B = BALANCE.keywords.trample;

export default defineKeyword({
  id: 'trample',
  name: '貫通',
  order: 4,
  summary: 'モンスターを倒して余ったダメージが、相手プレイヤーに通る',
  points: () => B.flat,
  formula: () => `${B.flat}`,
  displayName: () => '貫通',
  describe: () => 'モンスターを倒して余ったダメージが相手プレイヤーに通る',
  battle: { trample: true },
});
