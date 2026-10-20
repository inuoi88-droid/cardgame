import { BALANCE } from '../../balance.ts';
import { defineAbility } from '../../define.ts';

const B = BALANCE.abilities.pitch;

// 代替コスト：MTG #607（ピッチスペル）。同じ種類の手札1枚を除外すれば、エナジーを払わずに使える（1ターンに1回）
export default defineAbility({
  id: 'pitch',
  name: '代替コスト',
  order: 33,
  group: 'コスト',
  summary: `手札から使うとき、同じ種類（モンスター・アタック・スキル・パワー）の手札1枚を除外すれば、カードのコストの分のエナジーを払わない（護法・追加の支払いは払う。1ターン${BALANCE.battle.maxPitchPerTurn}回。レア以上）`,
  minRarity: 'rare',
  points: () => B.flat,
  formula: () => `${B.flat}（固定）`,
  displayName: () => '代替コスト',
  describe: () => '同じ種類の手札1枚を除外すれば、エナジーなしで使える',
  battle: { pitch: true },
});
