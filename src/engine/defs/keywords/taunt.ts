import { BALANCE } from '../../balance.ts';
import { defineKeyword } from '../../define.ts';

const B = BALANCE.keywords.taunt;

export default defineKeyword({
  id: 'taunt',
  name: '挑発',
  order: 2,
  summary: 'このモンスターがいる限り、相手のモンスターはこのモンスターしか攻撃できない（アタックカードの対象には影響しない）',
  points: () => B.flat,
  formula: () => `${B.flat}`,
  displayName: () => '挑発',
  describe: () => '相手のモンスターはこのモンスターしか攻撃できない',
});
