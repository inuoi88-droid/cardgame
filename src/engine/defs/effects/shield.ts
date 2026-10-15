import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.shield;

export default defineEffect({
  id: 'shield',
  name: 'シールド',
  group: 'defense',
  order: 20,
  summary: 'シールドNを得る（受けるダメージを先に肩代わりし、次の自分のターン開始時に消える）',
  value: valueParam('シールド', { default: 3 }),
  targetRule: 'self',
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e) => `シールド${n(e)}を得る`,
});
