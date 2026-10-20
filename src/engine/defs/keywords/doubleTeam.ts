import { BALANCE } from '../../balance.ts';
import { defineKeyword } from '../../define.ts';
import { ceilPoints } from '../../math.ts';
import type { Stats } from '../../types.ts';

const B = BALANCE.keywords.doubleTeam;
const S = BALANCE.stats;
const statPoints = (s: Stats) => s.attack * S.attackPoints + s.hp * S.hpPoints + s.defense * S.defensePoints;

// 分身：MTG #558（二体掛り）。初めて攻撃したとき、このカードのコピー（分身を持たない）を手札に加える。元のモンスターも分身を失う
export default defineKeyword({
  id: 'doubleTeam',
  name: '分身',
  order: 20,
  summary: '初めて攻撃したとき、このカードのコピー（分身を持たない。この試合のデッキに残る）を手札に加える。元のモンスターも分身を失う（トークンでは働かない）',
  points: (_k, s) => ceilPoints(B.rate * statPoints(s)),
  formula: (_k, s) => `${B.rate}×ステータス${statPoints(s)}`,
  displayName: () => '分身',
  describe: () => '初めて攻撃したとき、分身を失ったこのカードのコピーを手札に加える',
  battle: { doubleTeam: true },
});
