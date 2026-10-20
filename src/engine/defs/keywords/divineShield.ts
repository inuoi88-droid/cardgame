import { BALANCE } from '../../balance.ts';
import { defineKeyword } from '../../define.ts';

const B = BALANCE.keywords.divineShield;

// 聖盾：MTG #143。最初に受けるダメージ1回を0にする（毒・やけど・呪縛は防がない）
export default defineKeyword({
  id: 'divineShield',
  name: '聖盾',
  order: 14,
  summary: '最初に受けるダメージ1回を0にする（毒・やけど・呪縛は防がない）',
  points: () => B.flat,
  formula: () => `${B.flat}`,
  displayName: () => '聖盾',
  describe: () => '最初に受けるダメージ1回を0にする（毒・やけど・呪縛は防がない）',
  battle: { divineShield: true },
});
