import { BALANCE } from '../../balance.ts';
import { defineEffect, me, optionOf } from '../../define.ts';

const B = BALANCE.effects.double;
const T = BALANCE.effects.doubleTriple;
const poisonCap = BALANCE.effects.poison.maxValue;
const strengthCap = BALANCE.battle.strengthCap;
type Kind = 'poison' | 'bleed' | 'strength';
const KIND_LABEL: Record<Kind, string> = { poison: '相手の毒', bleed: '相手の出血', strength: '自分の筋力' };
const KINDS: Kind[] = ['poison', 'bleed', 'strength'];
const option = {
  label: '倍にするもの',
  choices: [
    ...KINDS.map((k) => ({ id: k, label: KIND_LABEL[k] })),
    // 3倍（MTG #415。△ バッチA）：レジェンドだけ
    ...KINDS.map((k) => ({ id: `${k}3`, label: `${KIND_LABEL[k]}を3倍（レジェンド）` })),
  ],
  default: 'poison',
};
const opponent = (rt: { opponent: 0 | 1 }) => ({ kind: 'player' as const, player: rt.opponent });
const optionId = (e: { option?: string }) => optionOf({ option }, e) ?? 'poison';
const kind = (e: { option?: string }): Kind => {
  const k = optionId(e).replace(/3$/, '');
  return (KINDS as string[]).includes(k) ? (k as Kind) : 'poison';
};
/** 3倍か（レジェンドだけ：validate の OPTION_RARITY） */
const triple = (e: { option?: string }) => optionId(e).endsWith('3');
/** 増える量の倍数（2倍なら1、3倍なら2） */
const extra = (e: { option?: string }) => (triple(e) ? 2 : 1);
const times = (e: { option?: string }) => (triple(e) ? '3倍' : '2倍');

// 倍化：MTG #414・#415（2倍・3倍にする）。相手の毒・出血、または自分の筋力を2倍（3倍はレジェンド）にする（増える量に上限あり）
export default defineEffect({
  id: 'double',
  name: '倍化',
  group: 'status',
  order: 38,
  summary: `相手の毒（増えるのは最大${poisonCap}）・相手の出血（最大${B.bleedMaxAdd}）・自分の筋力（合計${strengthCap}まで）のどれかを2倍にする（レア以上）。3倍はレジェンドだけ（上限は同じ。+${T.flat}pt）`,
  option,
  optionMinRarity: Object.fromEntries(KINDS.map((k) => [`${k}3`, 'legend'])),
  targetRule: 'self',
  minRarity: 'rare',
  basePoints: (e) => (triple(e) ? B.flat + T.flat : B.flat),
  baseFormula: (e) => (triple(e) ? `${B.flat}+${T.flat}（3倍）` : `${B.flat}`),
  describe: (e) => {
    switch (kind(e)) {
      case 'bleed':
        return `相手の出血を${times(e)}にする（増えるのは最大${B.bleedMaxAdd}）`;
      case 'strength':
        return `自分の筋力を${times(e)}にする（合計${strengthCap}まで）`;
      default:
        return `相手の毒を${times(e)}にする（増えるのは最大${poisonCap}）`;
    }
  },
  shortValue: (e) => `（${KIND_LABEL[kind(e)]}${triple(e) ? '・3倍' : ''}）`,
  battle: {
    resolve(rt, e) {
      const opp = rt.player(rt.opponent).status;
      switch (kind(e)) {
        case 'bleed': {
          const add = Math.min(opp.bleed * extra(e), B.bleedMaxAdd);
          if (add > 0) rt.addStatus(opponent(rt), 'bleed', add);
          else rt.log('相手に出血がないので何も起きない');
          return;
        }
        case 'strength': {
          const now = rt.player(rt.controller).status.strength;
          if (now > 0) rt.addStatus(me(rt), 'strength', now * extra(e));
          else rt.log('筋力がないので何も起きない');
          return;
        }
        default: {
          const add = Math.min(opp.poison * extra(e), poisonCap);
          if (add > 0) rt.addStatus(opponent(rt), 'poison', add);
          else rt.log('相手に毒がないので何も起きない');
        }
      }
    },
  },
});
