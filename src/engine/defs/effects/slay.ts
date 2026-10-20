import { BALANCE } from '../../balance.ts';
import { countParam, defineEffect, n } from '../../define.ts';
import type { EffectRuntime, Monster, TargetRef } from '../../battle/types.ts';

const B = BALANCE.effects.slay;

/** 印刷コスト（トークンは0） */
const costOf = (rt: EffectRuntime, m: Monster) => (m.card.token ? 0 : (rt.cardDef(m.card.cardId)?.cost ?? 0));

// 討伐：MTG #101（マナ総量）。コストN以下の相手モンスター1体を破壊する（処刑のコスト版。トークンはコスト0）
export default defineEffect({
  id: 'slay',
  name: '討伐',
  group: 'disrupt',
  order: 63.5,
  summary: 'コストN以下の相手モンスター1体を破壊する（トークンはコスト0。不屈・聖盾は効かない。ランダムならコストN以下から選ぶ）',
  value: countParam('コスト', { min: BALANCE.card.costMin, max: B.maxValue, default: 2 }),
  targetRule: 'enemyMonsterOne',
  basePoints: (e) => B.flat + B.perCost * n(e),
  baseFormula: (e) => `${B.flat}+${n(e)}×${B.perCost}`,
  describe: (e, c) => `コスト${n(e)}以下の${c.target}を破壊する`,
  shortValue: (e) => `コスト${n(e)}以下`,
  battle: {
    resolve(rt, e) {
      let targets: TargetRef[] = rt.targets;
      // ランダム：コストN以下の相手モンスターから選び直す（いなければ不発）
      if (e.target === 'random') {
        const pool = rt.player(rt.opponent).board.filter((m) => costOf(rt, m) <= n(e));
        if (pool.length === 0) {
          rt.log(`コスト${n(e)}以下の相手モンスターがいない`);
          return;
        }
        targets = [{ kind: 'monster', uid: pool[rt.randInt(pool.length)]!.uid }];
      }
      for (const t of targets) {
        const m = rt.monster(t);
        if (!m) continue;
        const cost = costOf(rt, m);
        if (cost <= n(e)) rt.destroy(t);
        else rt.log(`「${rt.cardName(m.card.cardId)}」はコスト${cost}なので討伐できない`);
      }
    },
  },
});
