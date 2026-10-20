import { BALANCE } from '../../balance.ts';
import { countParam, defineEffect, n, valueParam } from '../../define.ts';

const B = BALANCE.effects.token;
const name = BALANCE.battle.tokenName;
const count = (e: { hits?: number }) => e.hits ?? 1;

// トークン生成：MTG #604・#124・#168・#411・#343・#163。攻撃力N・体力Nのトークンを M 体、自分の場に出す
export default defineEffect({
  id: 'token',
  name: 'トークン生成',
  group: 'buff',
  order: 45,
  summary: `攻撃力N・体力Nの${name}（トークン）をM体出す。トークンは場を離れると消える（場に${BALANCE.battle.maxTokens}体まで）`,
  value: valueParam('強さ', { default: 1, max: B.maxValue }),
  hits: countParam('体数', { min: 1, max: B.maxTokens, default: 1 }),
  targetRule: 'self',
  basePoints: (e) => (B.perValue * n(e) + B.perToken) * count(e),
  baseFormula: (e) => `(${n(e)}×${B.perValue}+${B.perToken})×${count(e)}`,
  describe: (e) => `攻撃力${n(e)}・体力${n(e)}の${name}を${count(e)}体出す`,
  shortValue: (e) => `${n(e)}/${n(e)}×${count(e)}`,
  battle: {
    resolve(rt, e) {
      rt.createTokens(rt.controller, n(e), n(e), count(e));
    },
  },
});
