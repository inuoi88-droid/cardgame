import { BALANCE } from '../../balance.ts';
import { countParam, defineDrawback, n } from '../../define.ts';

const B = BALANCE.drawbacks.lifespan;
const turns = (d: { value?: number }) => Math.max(1, n(d));
const pointsOf = (d: { value?: number }) => B.byTurns[Math.min(turns(d), B.byTurns.length) - 1]!;

// 寿命：MTG #231・#265・#312・#360。N 回目の自分のターン終了時に場から消える（出たターンも1回目に数える）
export default defineDrawback({
  id: 'lifespan',
  name: '寿命',
  order: 12,
  summary: 'N回目の自分のターン終了時に場から消える（出たターンも数える。モンスターは破壊され、パワーは消える。モンスターとパワーのカードだけ。倍率込みの固定値）',
  value: countParam('ターン', { min: 1, max: B.byTurns.length, default: 2 }),
  fixed: true,
  cardTypes: ['monster', 'power', 'powerAttack'],
  basePoints: (d) => pointsOf(d),
  baseFormula: (d) => `${pointsOf(d)}（寿命${turns(d)}・固定）`,
  describe: (d) => `寿命${turns(d)}：${turns(d)}回目の自分のターン終了時に場から消える（モンスターは破壊される）`,
  battle: { lifespan: (d) => turns(d) },
});
