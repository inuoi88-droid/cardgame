import { BALANCE } from '../../balance.ts';
import { defineKeyword } from '../../define.ts';

const B = BALANCE.keywords.reach;

// 対空：MTG #213（到達）。相手の飛行のモンスターは、このモンスターがいると対空のモンスターしか攻撃できない（飛行に効く挑発）
export default defineKeyword({
  id: 'reach',
  name: '対空',
  order: 21,
  summary: '相手の飛行のモンスターは、このモンスターがいると対空のモンスターしか攻撃できない（飛行に効く挑発。飛行でない攻撃には何もしない）',
  points: () => B.flat,
  formula: () => `${B.flat}`,
  displayName: () => '対空',
  describe: () => '相手の飛行のモンスターは、対空のモンスターしか攻撃できない',
  battle: { reach: true },
});
