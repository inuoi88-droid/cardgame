import { BALANCE } from '../../balance.ts';
import { countParam, defineEffect, n } from '../../define.ts';

const B = BALANCE.effects.bounty;

// 懸賞：MTG #162（賞金カウンター）。相手モンスター1体に懸賞を掛ける。そのモンスターが破壊されたら、自分がカードをN枚引く
export default defineEffect({
  id: 'bounty',
  name: '懸賞',
  group: 'resource',
  order: 53.5,
  summary: '相手モンスター1体に懸賞を掛ける。そのモンスターが破壊されたら（どちらのターンでも）、自分がカードをN枚引く（バウンスなど破壊でなく場を離れたら消える）',
  value: countParam('枚数', { default: 1, max: B.maxValue }),
  targetRule: 'enemyMonsterOne',
  basePoints: (e) => B.flat + B.perValue * n(e),
  baseFormula: (e) => `${B.flat}+${n(e)}×${B.perValue}`,
  describe: (e, c) => `${c.target}に懸賞を掛ける（破壊されたら、カードを${n(e)}枚引く）`,
  battle: {
    resolve(rt, e) {
      for (const t of rt.targets) rt.addBounty(t, rt.controller, n(e));
    },
  },
});
