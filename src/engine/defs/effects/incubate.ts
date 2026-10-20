import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.incubate;
const turns = BALANCE.battle.eggHatchTurns;

// 培養：MTG #173・#457（培養器・培養を行う）。「卵」（攻撃力0・体力N、攻撃できない）を出す。2回目の自分のターン開始時に孵化して攻撃力+N
export default defineEffect({
  id: 'incubate',
  name: '培養',
  group: 'buff',
  order: 74.5,
  summary: `「${BALANCE.battle.eggName}」（攻撃力0・体力N、攻撃できない。トークン）を1体出す。${turns}回目の自分のターン開始時に孵化し、攻撃力+Nの${BALANCE.battle.tokenName}になる（反撃はする。トークンの上限に数える）`,
  value: valueParam('強さ', { default: 2, max: B.maxValue }),
  targetRule: 'self',
  basePoints: (e) => B.perValue * n(e) + B.base,
  baseFormula: (e) => `${n(e)}×${B.perValue}+${B.base}`,
  describe: (e) => `攻撃力0・体力${n(e)}の${BALANCE.battle.eggName}を出す（${turns}ターン後に孵化して攻撃力${n(e)}）`,
  battle: {
    resolve(rt, e) {
      const hatchAt = rt.player(rt.controller).turnsTaken + turns;
      rt.createToken(rt.controller, null, { attack: 0, hp: n(e), egg: { hatchAt, attack: n(e) } });
    },
  },
});
