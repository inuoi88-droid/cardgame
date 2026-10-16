import { BALANCE } from '../../balance.ts';
import { defineKeyword, n, valueParam } from '../../define.ts';

const B = BALANCE.keywords.selfRepair;

export default defineKeyword({
  id: 'selfRepair',
  name: '自己修復',
  order: 8,
  summary: '自分のターン開始時に体力をN回復する',
  value: valueParam('回復量', { default: 1 }),
  points: (k) => B.perValue * n(k),
  formula: (k) => `${n(k)}×${B.perValue}`,
  displayName: (k) => `自己修復${n(k)}`,
  describe: (k) => `自分のターン開始時に体力を${n(k)}回復する`,
  battle: {
    onTurnStart(rt, k, m) {
      rt.heal({ kind: 'monster', uid: m.uid }, n(k));
    },
  },
});
