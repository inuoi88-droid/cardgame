import { BALANCE } from '../../balance.ts';
import { defineEffect, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.siege;
const S = BALANCE.battle;

// 砦を築く：MTG #2・#51（バトル・包囲戦）。相手の場に「砦」（攻撃力0・体力N。攻撃も反撃もしない）を置く。破壊すると「砦を落としたとき」の報酬
export default defineEffect({
  id: 'siege',
  name: '砦を築く',
  group: 'resource',
  order: 94,
  summary: `相手の場に「${S.siegeName}」（攻撃力0・体力N。攻撃も反撃もしない・挑発なし。相手のトークンの上限に数えない）を置く。どちらの原因でも砦が破壊されたら、このカードの「砦を落としたとき」の効果が出る（バウンス・奪取では報酬なしで消える）。1人が築ける砦は同時に${S.maxSieges}つまで。呪文の使用時だけ`,
  value: valueParam('砦の体力', { min: B.minValue, max: B.maxValue, default: 3 }),
  targetRule: 'self',
  timings: ['play'],
  bases: ['spell'],
  noDelay: true,
  noCopy: true,
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}（報酬は「砦を落としたとき」の倍率）`,
  describe: (e) => `相手の場に体力${n(e)}の${S.siegeName}を置く`,
  battle: {
    resolve(rt, e) {
      rt.buildSiege(n(e));
    },
  },
});
