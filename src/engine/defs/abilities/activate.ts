import { BALANCE } from '../../balance.ts';
import { countParam, defineAbility, n } from '../../define.ts';

const B = BALANCE.abilities.activate;
const T = BALANCE.timing;

// 起動：MTG #108・#406・#638（起動型能力・起動する・マナ・シンク）。場のモンスター・パワーの「起動」の効果を、エナジー N を払って使う（1ターン1回）
export default defineAbility({
  id: 'activate',
  name: '起動',
  order: 8,
  summary: `場にいる間（モンスター・パワー）、自分のターンにエナジーNを払って「起動」の効果を使える（1つにつき1ターン1回。召喚したターンも使える）。ポイントは「起動」の効果のタイミングの倍率（モンスター ×${T.activatedMonster.join('／')}、パワー ×${T.activatedPower.join('／')}。N＝${B.minCost}〜${B.maxCost}）`,
  value: countParam('エナジー', { min: B.minCost, max: B.maxCost, default: B.minCost }),
  requiresTiming: 'activated',
  points: () => B.flat,
  formula: () => '0（「起動」の効果の倍率に含む）',
  displayName: (a) => `起動（エナジー${n(a)}）`,
  describe: (a) => `場にいる間、自分のターンにエナジー${n(a)}を払って「起動」の効果を使える（1ターン1回）`,
  battle: { activateCost: (a) => n(a) },
});
