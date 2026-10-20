import { BALANCE } from '../../balance.ts';
import { countParam, defineAbility, n } from '../../define.ts';

const B = BALANCE.abilities.disguise;
const S = BALANCE.battle;

// 変装：MTG #376。モンスター：エナジー2で裏向き（攻撃力・体力2・護法1）で出せる。自分のターンにエナジー K で表にできる
export default defineAbility({
  id: 'disguise',
  name: '変装',
  order: 55,
  group: '追加の支払い',
  summary: `モンスター：エナジー${B.playCost}で裏向き（名前・効果・キーワードなし、攻撃力${S.faceDownStats}・体力${S.faceDownStats}・護法${S.faceDownWard}）で出してもよい（相手には正体が見えない）。自分のターンにエナジーKを払えばいつでも表にできる（出したターンでもよい。「表になったとき」の効果が出る。召喚時の効果は出ない）。ポイントは固定${B.flat}`,
  value: countParam('表にするエナジー', { min: 0, max: B.maxCost, default: 2 }),
  cardTypes: ['monster'],
  payGroup: 'extra',
  points: () => B.flat,
  formula: () => `${B.flat}`,
  displayName: (a) => `変装${n(a)}`,
  describe: (a) => `エナジー${B.playCost}で裏向きに出し、エナジー${n(a)}で表にする`,
  battle: { alt: { kind: 'faceDown', cost: () => B.playCost }, revealCost: (a) => n(a) },
});
