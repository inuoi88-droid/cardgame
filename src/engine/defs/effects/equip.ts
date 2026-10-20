import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.equip;

// 装備：MTG #21（装備品）。自分のモンスター1体の攻撃力+N。このカードはそのモンスターに付き、モンスターが場を離れると手札に戻る
export default defineEffect({
  id: 'equip',
  name: '装備',
  group: 'buff',
  order: 42.5,
  summary: '自分のモンスター1体の攻撃力+N。このカードはそのモンスターに付き、モンスターが場を離れると持ち主の手札に戻る（使用時だけ）',
  value: valueParam('攻撃力', { default: 1, max: B.maxValue }),
  targetRule: 'allyMonsterOne',
  timings: ['play'],
  excludeTargets: ['allyMonsters', 'thisMonster', 'otherAllies', 'tribeAllies'],
  // 予約すると付けるカードが無くなるので、遅延は付けられない
  noDelay: true,
  basePoints: (e) => B.perValue * n(e) + B.flat,
  baseFormula: (e) => `${n(e)}×${B.perValue}+${B.flat}`,
  describe: (e, c) => `${c.target}に装備する：攻撃力+${n(e)}（そのモンスターが場を離れると、このカードは手札に戻る）`,
  battle: {
    resolve(rt, e) {
      const t = rt.targets[0];
      if (!t) return;
      rt.changeAttack(t, n(e));
      rt.equipTo(t);
    },
  },
});
