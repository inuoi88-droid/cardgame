import { BALANCE } from '../../balance.ts';
import { defineKeyword } from '../../define.ts';

const B = BALANCE.keywords.hitAndRun;

// 一撃離脱：MTG #86（戦闘終了ステップ）。攻撃したあと（反撃の後）、場に残っていれば持ち主の手札に戻る
export default defineKeyword({
  id: 'hitAndRun',
  name: '一撃離脱',
  order: 15,
  summary: '攻撃したあと（反撃・攻撃するたびの効果の後）、場に残っていれば持ち主の手札に戻る（トークンは戻らずに場に残る）',
  points: () => B.flat,
  formula: () => `${B.flat}（固定）`,
  displayName: () => '一撃離脱',
  describe: () => '攻撃したあと、持ち主の手札に戻る',
  battle: { returnAfterAttack: true },
});
