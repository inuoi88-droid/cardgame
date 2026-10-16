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
  battle: {
    choose(rt) {
      return {
        prompt: '捨て札から手札に加えるカードを選んでください',
        options: rt
          .player(rt.controller)
          .discard.filter((c) => rt.cardDef(c.cardId))
          .map((c) => ({ id: c.uid, label: rt.cardName(c.cardId), cardId: c.cardId })),
        min: 1,
        max: 1,
      };
    },
    resolve(rt, _e, picks) {
      if (picks?.[0]) rt.takeFromDiscard(rt.controller, picks[0]);
    },
  },
});
