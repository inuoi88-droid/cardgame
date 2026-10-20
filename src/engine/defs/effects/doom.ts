import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.doom;
const cap = BALANCE.battle.doomCap;

// 呪縛：MTG #31。相手のターン開始時に N ダメージ（毒と違って減らない。浄化で消える。合計に上限）
export default defineEffect({
  id: 'doom',
  name: '呪縛',
  group: 'status',
  order: 39,
  summary: `相手に呪縛Nを与える（相手のターン開始時にNダメージ。シールド・無効化を通り、減らない。浄化で消える。合計${cap}まで）`,
  value: valueParam('量', { default: 1, max: B.maxValue }),
  targetRule: 'enemyPlayer',
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e) => `相手に呪縛${n(e)}を与える（相手のターン開始時に${n(e)}ダメージ。減らず、浄化で消える）`,
  battle: {
    resolve(rt, e) {
      for (const t of rt.targets) rt.addStatus(t, 'doom', n(e));
    },
  },
});
