import { BALANCE } from '../../balance.ts';
import { countParam, defineEffect, n, optionOf, valueParam } from '../../define.ts';

const B = BALANCE.effects.token;
const S = BALANCE.effects.tokenSpawn;
const name = BALANCE.battle.tokenName;
const count = (e: { hits?: number }) => e.hits ?? 1;
const option = {
  label: '出し方',
  choices: [
    { id: 'normal', label: '通常' },
    { id: 'mobilize', label: '応召（速攻・ターン終了時に消える）' },
    { id: 'spawn', label: '落とし子（破壊されるとエナジー+1）' },
  ],
  default: 'normal',
};
/** 応召（MTG #389。○ バッチB）：速攻つきで出て、持ち主のターン終了時に消える */
const mobilize = (e: { option?: string }) => optionOf({ option }, e) === 'mobilize';
/** 落とし子（MTG #181。△ バッチA）：破壊されると持ち主のエナジー+1 */
const spawn = (e: { option?: string }) => optionOf({ option }, e) === 'spawn';
/** 応召ならポイントに掛ける割合 */
const rateOf = (e: { option?: string }) => (mobilize(e) ? B.mobilizeRate : B.normalRate);
/** 落とし子の1体ぶんの上乗せ */
const spawnOf = (e: { option?: string }) => (spawn(e) ? S.perToken : 0);

// トークン生成：MTG #604・#124・#168・#411・#343・#163。攻撃力N・体力Nのトークンを M 体、自分の場に出す
export default defineEffect({
  id: 'token',
  name: 'トークン生成',
  group: 'buff',
  order: 45,
  summary: `攻撃力N・体力Nの${name}（トークン）をM体出す。トークンは場を離れると消える（場に${BALANCE.battle.maxTokens}体まで）。応召なら速攻つきで、ターン終了時に消える（ポイント×${B.mobilizeRate}）。落とし子なら破壊されると持ち主のエナジー+1（1体につき+${S.perToken}pt）`,
  value: valueParam('強さ', { default: 1, max: B.maxValue }),
  hits: countParam('体数', { min: 1, max: B.maxTokens, default: 1 }),
  option,
  targetRule: 'self',
  basePoints: (e) => (B.perValue * n(e) + B.perToken + spawnOf(e)) * count(e) * rateOf(e),
  baseFormula: (e) =>
    spawn(e)
      ? `(${n(e)}×${B.perValue}+${B.perToken}+${S.perToken}（落とし子）)×${count(e)}`
      : `(${n(e)}×${B.perValue}+${B.perToken})×${count(e)}${mobilize(e) ? `×${B.mobilizeRate}（応召）` : ''}`,
  describe: (e) =>
    mobilize(e)
      ? `攻撃力${n(e)}・体力${n(e)}の速攻の${name}を${count(e)}体出す（ターン終了時に消える）`
      : spawn(e)
        ? `攻撃力${n(e)}・体力${n(e)}の${name}（落とし子：破壊されるとエナジー+1）を${count(e)}体出す`
        : `攻撃力${n(e)}・体力${n(e)}の${name}を${count(e)}体出す`,
  shortValue: (e) => `${n(e)}/${n(e)}×${count(e)}${mobilize(e) ? '（応召）' : spawn(e) ? '（落とし子）' : ''}`,
  battle: {
    resolve(rt, e) {
      for (let i = 0; i < count(e); i++) {
        if (!rt.createToken(rt.controller, null, { attack: n(e), hp: n(e), ...(mobilize(e) ? { temp: true } : {}), ...(spawn(e) ? { spawn: true } : {}) })) return;
      }
    },
  },
});
