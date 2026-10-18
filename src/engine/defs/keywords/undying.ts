import { BALANCE } from '../../balance.ts';
import { defineKeyword } from '../../define.ts';

const B = BALANCE.keywords.undying;

export default defineKeyword({
  id: 'undying',
  name: '不屈',
  order: 7,
  summary: `一度だけ、体力${BALANCE.battle.undyingHp}で踏みとどまる`,
  points: () => B.flat,
  formula: () => `${B.flat}`,
  displayName: () => '不屈',
  describe: () => `一度だけ体力${BALANCE.battle.undyingHp}で踏みとどまる`,
  battle: { undying: true },
});
