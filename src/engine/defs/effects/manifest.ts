import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.manifest;
const S = BALANCE.battle;

// 予示：MTG #445（予示する）。自分の山札の一番上を、裏向きのモンスター（攻撃力・体力2）として場に出す
export default defineEffect({
  id: 'manifest',
  name: '予示',
  group: 'resource',
  order: 90,
  summary: `自分の山札の一番上を、裏向きのモンスター（${S.faceDownName}：攻撃力${S.faceDownStats}・体力${S.faceDownStats}。正体は自分だけに見える）として場に出す。それがモンスターカードなら、その印刷コストで表にできる（山札が無ければ不発。トークンではない）`,
  targetRule: 'self',
  noDelay: true,
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: () => '山札の一番上を裏向きのモンスターとして出す',
  battle: {
    resolve(rt) {
      rt.manifest(rt.controller);
    },
  },
});
