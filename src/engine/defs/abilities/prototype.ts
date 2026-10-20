import { BALANCE } from '../../balance.ts';
import { countParam, defineAbility, n } from '../../define.ts';

const B = BALANCE.abilities.prototype;

// 試作：MTG #368。モンスター：コストを −K して、攻撃力と体力が半分の試作版として出してもよい
export default defineAbility({
  id: 'prototype',
  name: '試作',
  order: 22,
  group: '追加の支払い',
  summary: `モンスター：コスト−K（印刷コスト未満）で、攻撃力と体力が半分の試作版として出してもよい（キーワード・効果はそのまま）。ポイントは${B.perCost}×K`,
  value: countParam('軽減', { min: 1, max: B.maxCut, default: 1 }),
  cardTypes: ['monster'],
  payGroup: 'extra',
  points: (a) => B.perCost * n(a),
  formula: (a) => `${B.perCost}×${n(a)}`,
  displayName: (a) => `試作−${n(a)}`,
  describe: (a) => `コスト−${n(a)}で出すと、攻撃力・体力が半分になる`,
  battle: { alt: { kind: 'prototype', cost: (a, printed) => Math.max(0, printed - n(a)) } },
});
