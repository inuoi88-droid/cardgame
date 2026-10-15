import { BALANCE } from '../../balance.ts';
import { defineEffect, n } from '../../define.ts';

const B = BALANCE.effects.burn;
const turns = (e: { value?: number }) => BALANCE.battle.burnTurns + n(e);

export default defineEffect({
  id: 'burn',
  name: 'やけど',
  group: 'status',
  order: 31,
  summary: `やけどを与える（${BALANCE.battle.burnTurns}ターンの間、ターン終了時に${BALANCE.battle.burnDamage}ダメージ。回復量半分）`,
  value: { label: '延長ターン', min: 0, max: B.maxExtraTurns, default: 0 },
  targetRule: 'enemyAny',
  basePoints: (e) => B.flat + B.perExtraTurn * n(e),
  baseFormula: (e) => (n(e) > 0 ? `${B.flat}+${n(e)}×${B.perExtraTurn}` : `${B.flat}`),
  describe: (e, c) => `${c.target}にやけど（${turns(e)}ターン）を与える`,
  shortValue: (e) => (n(e) > 0 ? `${turns(e)}ターン` : ''),
});
