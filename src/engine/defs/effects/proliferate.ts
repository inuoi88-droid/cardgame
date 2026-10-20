import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';
import type { TargetRef } from '../../battle/types.ts';

const B = BALANCE.effects.proliferate;

// 増殖：MTG #439（増殖を行う）。相手の毒・出血・呪縛を+N、やけど・弱体・脆弱を+1ターン、自分の筋力・再生を+N（持っているものだけ）
export default defineEffect({
  id: 'proliferate',
  name: '増殖',
  group: 'status',
  order: 38.5,
  summary: '相手プレイヤーの毒・出血・呪縛を+N、やけど・弱体・脆弱を1ターン延ばし、自分の筋力・再生を+N（すでにあるものだけ）',
  value: valueParam('量', { default: 1, max: B.maxValue }),
  targetRule: 'self',
  scalable: true,
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e) => `相手の毒・出血・呪縛を+${n(e)}、やけど・弱体・脆弱を1ターン延ばし、自分の筋力・再生を+${n(e)}する（すでにあるものだけ）`,
  battle: {
    resolve(rt, e) {
      const N = n(e);
      const opp: TargetRef = { kind: 'player', player: rt.opponent };
      const me: TargetRef = { kind: 'player', player: rt.controller };
      const os = rt.player(rt.opponent).status;
      const ms = rt.player(rt.controller).status;
      let any = false;
      const add = (t: TargetRef, key: Parameters<typeof rt.addStatus>[1], amount: number, has: boolean) => {
        if (!has) return;
        any = true;
        rt.addStatus(t, key, amount);
      };
      add(opp, 'poison', N, os.poison > 0);
      add(opp, 'bleed', N, os.bleed > 0);
      add(opp, 'doom', N, (os.doom ?? 0) > 0);
      add(opp, 'burn', 1, os.burn > 0);
      add(opp, 'weak', 1, os.weak > 0);
      add(opp, 'vulnerable', 1, os.vulnerable > 0);
      add(me, 'strength', N, ms.strength > 0);
      add(me, 'regen', N, ms.regen > 0);
      if (!any) rt.log('増やせる状態がない');
    },
  },
});
