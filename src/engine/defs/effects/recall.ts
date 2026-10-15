import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.recall;

export default defineEffect({
  id: 'recall',
  name: '回収',
  group: 'resource',
  order: 55,
  summary: '捨て札から1枚を選んで手札に加える',
  targetRule: 'self',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: () => '捨て札から1枚を選んで手札に加える',
});
