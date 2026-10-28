import { BALANCE } from '../../balance.ts';
import { defineKeyword } from '../../define.ts';

const B = BALANCE.keywords.rush;

// 突進（ユーザー指示。決定事項 #146）：召喚したターンは相手のモンスター（トークンを含む）だけを攻撃できる。相手プレイヤーは攻撃できない
export default defineKeyword({
  id: 'rush',
  name: '突進',
  order: 1.5,
  summary: `召喚したターンから、相手のモンスター（トークンを含む）だけを攻撃できる（そのターンは相手プレイヤーを攻撃できず、二回攻撃でも1回だけ。ポイントは攻撃力に比例。攻撃力は最低${BALANCE.stats.keywordMinAttack}として数える）`,
  points: (_k, s) => B.perAttack * s.attack,
  formula: (_k, s) => `攻撃力${s.attack}×${B.perAttack}`,
  displayName: () => '突進',
  describe: () => '召喚したターンから、相手のモンスターだけを攻撃できる',
  battle: { rush: true },
});
