import { BALANCE } from '../../balance.ts';
import { countParam, defineAbility, n } from '../../define.ts';

const B = BALANCE.abilities.lifePay;

// 血の支払い：MTG #98（ファイレクシア・マナ）。コストのエナジーのうち K 個までを、1つにつき HP で払える
export default defineAbility({
  id: 'lifePay',
  name: '血の支払い',
  order: 32,
  group: 'コスト',
  summary: `コストのエナジーのうちK個までを、1つにつきHP${B.hpPerEnergy}で払える（ダメージではない。払ったあとHPが1未満になるなら使えない）。ポイントは${B.perEnergy}×K`,
  value: countParam('HPで払える数', { min: 1, max: B.max, default: 1 }),
  points: (a) => B.perEnergy * n(a),
  formula: (a) => `${B.perEnergy}×${n(a)}`,
  displayName: (a) => `血の支払い${n(a)}`,
  describe: (a) => `エナジー${n(a)}つまでを、1つにつきHP${B.hpPerEnergy}で払える`,
  battle: { lifePay: (a) => n(a) },
});
