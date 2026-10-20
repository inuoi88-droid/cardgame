import { BALANCE } from '../../balance.ts';
import { defineAbility } from '../../define.ts';

const B = BALANCE.abilities.bargain;

// 協約：MTG #374。使うとき自分のトークンかパワー1つを差し出してよい。差し出したら条件「協約したなら」の効果が出る
export default defineAbility({
  id: 'bargain',
  name: '協約',
  order: 28,
  group: '追加の支払い',
  summary: `使うとき自分のトークン（モンスター）かパワー1つを差し出してよい。差し出したら条件「協約したなら」の効果が出る（その効果の倍率は×${BALANCE.condition.bargained}）。条件「協約したなら」の効果が要る`,
  payGroup: 'sacrifice',
  points: () => B.flat,
  formula: () => '0（「協約したなら」の倍率に含む）',
  displayName: () => '協約',
  describe: () => 'トークンかパワーを差し出せば、「協約したなら」の効果も出る',
  battle: { sacrifice: { kind: 'bargain' } },
});
