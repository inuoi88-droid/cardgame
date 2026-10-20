import { BALANCE } from '../../balance.ts';
import { defineEffect, me, optionOf } from '../../define.ts';

const B = BALANCE.effects.double;
const poisonCap = BALANCE.effects.poison.maxValue;
const strengthCap = BALANCE.battle.strengthCap;
const option = {
  label: '2倍にするもの',
  choices: [
    { id: 'poison', label: '相手の毒' },
    { id: 'bleed', label: '相手の出血' },
    { id: 'strength', label: '自分の筋力' },
  ],
  default: 'poison',
};
const opponent = (rt: { opponent: 0 | 1 }) => ({ kind: 'player' as const, player: rt.opponent });
const kind = (e: { option?: string }) => optionOf({ option }, e) ?? 'poison';
const label = (e: { option?: string }) => option.choices.find((c) => c.id === kind(e))?.label ?? '';

// 倍化：MTG #414。相手の毒・出血、または自分の筋力を2倍にする（増える量に上限あり）
export default defineEffect({
  id: 'double',
  name: '倍化',
  group: 'status',
  order: 38,
  summary: `相手の毒（増えるのは最大${poisonCap}）・相手の出血（最大${B.bleedMaxAdd}）・自分の筋力（合計${strengthCap}まで）のどれかを2倍にする（レア以上）`,
  option,
  targetRule: 'self',
  minRarity: 'rare',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: (e) => {
    switch (kind(e)) {
      case 'bleed':
        return `相手の出血を2倍にする（増えるのは最大${B.bleedMaxAdd}）`;
      case 'strength':
        return `自分の筋力を2倍にする（合計${strengthCap}まで）`;
      default:
        return `相手の毒を2倍にする（増えるのは最大${poisonCap}）`;
    }
  },
  shortValue: (e) => `（${label(e)}）`,
  battle: {
    resolve(rt, e) {
      const opp = rt.player(rt.opponent).status;
      switch (kind(e)) {
        case 'bleed': {
          const add = Math.min(opp.bleed, B.bleedMaxAdd);
          if (add > 0) rt.addStatus(opponent(rt), 'bleed', add);
          else rt.log('相手に出血がないので何も起きない');
          return;
        }
        case 'strength': {
          const now = rt.player(rt.controller).status.strength;
          if (now > 0) rt.addStatus(me(rt), 'strength', now);
          else rt.log('筋力がないので何も起きない');
          return;
        }
        default: {
          const add = Math.min(opp.poison, poisonCap);
          if (add > 0) rt.addStatus(opponent(rt), 'poison', add);
          else rt.log('相手に毒がないので何も起きない');
        }
      }
    },
  },
});
