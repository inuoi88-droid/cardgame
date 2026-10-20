import { BALANCE } from '../../balance.ts';
import { countParam, defineEffect, n } from '../../define.ts';

const B = BALANCE.effects.harness;

// 動力化：MTG #471（水の技を行う）。まだ攻撃していない自分のモンスター1体を、このターン攻撃できなくして、エナジー+N
export default defineEffect({
  id: 'harness',
  name: '動力化',
  group: 'resource',
  order: 51.5,
  summary: `まだ攻撃できる自分のモンスター1体を、このターン攻撃できなくして、エナジー+N（召喚酔い・凍結中でもよい。使用時・召喚時だけ。1ターンに増やせるエナジー${BALANCE.battle.maxEnergyGainPerTurn}に数える）`,
  value: countParam('エナジー', { default: 1, max: B.maxValue }),
  targetRule: 'allyMonsterOne',
  timings: ['play', 'summon'],
  excludeTargets: ['allyMonsters', 'otherAllies', 'thisMonster', 'weakestAlly'],
  noDelay: true,
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e, c) => `${c.target}をこのターン攻撃できなくし、エナジーを${n(e)}得る`,
  battle: {
    resolve(rt, e) {
      const t = rt.targets[0];
      if (t && rt.exhaustForEnergy(t)) rt.gainEnergy(rt.controller, n(e));
    },
  },
});
