import { BALANCE } from '../../balance.ts';
import { defineEffect, n, countParam } from '../../define.ts';

const B = BALANCE.effects.weak;

export default defineEffect({
  id: 'weak',
  name: '脱力',
  group: 'status',
  order: 33,
  // id は weak のまま（保存したカードが参照する）。前は「弱体：Nターンの間、与えるダメージ−25%」（決定事項 #138 で作り直し）
  summary: `脱力をN個与える（与えるダメージが1発${BALANCE.battle.exhaustCap}まで：モンスターは攻撃・反撃、プレイヤーは自分の効果のダメージ。モンスターが攻撃するたび・プレイヤーがダメージのカードを使うたびに1つ減る）`,
  value: countParam('個数', { default: 1, max: B.maxValue }),
  targetRule: 'enemyAny',
  basePoints: (e) => B.perValue * n(e),
  baseFormula: (e) => `${n(e)}×${B.perValue}`,
  describe: (e, c) => `${c.target}に脱力${n(e)}を与える`,
  shortValue: (e) => `${n(e)}個`,
  battle: {
    resolve(rt, e) {
      for (const t of rt.targets) rt.addStatus(t, 'weak', n(e));
    },
  },
});
