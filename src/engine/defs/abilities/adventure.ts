import { BALANCE } from '../../balance.ts';
import { countParam, defineAbility, n } from '../../define.ts';

const B = BALANCE.abilities.adventure;

// 出来事：MTG #60。モンスターのカードに小さな呪文（出来事）を付ける。先に出来事として使うと待機ゾーンに置かれ、後のターンにモンスターとして出せる
export default defineAbility({
  id: 'adventure',
  name: '出来事',
  order: 54,
  group: '待機ゾーン',
  summary: `モンスター：エナジーKで「出来事」の効果を呪文として使ってもよい（スキルとして数える）。使ったあとカードは待機ゾーンに置かれ、後の自分のターンにモンスターとして出せる（手札から普通に出したら出来事は使えない）。ポイントは「出来事」の効果×${B.rate}（タイミングの倍率に含む。能力は0pt）`,
  value: countParam('エナジー', { min: 0, max: B.maxCost, default: 1 }),
  cardTypes: ['monster'],
  payGroup: 'extra',
  requiresTiming: 'adventure',
  points: () => B.flat,
  formula: () => `0（「出来事」の効果の倍率×${B.rate}に含む）`,
  displayName: (a) => `出来事${n(a)}`,
  describe: (a) => `エナジー${n(a)}で「出来事」の効果を使い、あとでモンスターとして出せる`,
  battle: { alt: { kind: 'adventure', cost: (a) => n(a) } },
});
