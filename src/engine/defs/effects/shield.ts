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
  // 対象「お互い」を選べる（MTG 要素 ○ バッチA）
  symmetric: true,
  scalable: true,
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e) => `シールド${n(e)}を得る`,
  battle: {
    resolve(rt, e) {
      rt.gainShield(rt.controller, n(e));
    },
  },
});
