import { BALANCE } from '../../balance.ts';
import { cardBase } from '../../classify.ts';
import { defineDrawback, type PointCard } from '../../define.ts';
import { isPowerTiming } from '../../options.ts';
import { effectPoints } from '../../points.ts';

const B = BALANCE.drawbacks.dormant;

/** パワーとして残る効果のポイントの合計 */
function powerEffectPoints(card: PointCard): number {
  let sum = 0;
  for (const e of card.effects ?? []) if (isPowerTiming(e.timing, 'spell')) sum += effectPoints(e, card).value;
  return sum;
}

const pointsOf = (card: PointCard): number =>
  cardBase(card) === 'monster' ? Math.max(B.min, (card.stats?.attack ?? 0) * B.perAttack) : powerEffectPoints(card) * B.powerRate;

const formulaOf = (card: PointCard): string =>
  cardBase(card) === 'monster'
    ? `max(${B.min}, 攻撃力${card.stats?.attack ?? 0}×${B.perAttack})（固定）`
    : `パワーの効果${powerEffectPoints(card)}×${B.powerRate}（固定）`;

// 休眠：MTG #224（フェイジング）のアレンジ。1ターンおきに休む：休眠中のターンは攻撃できず、効果も出ない（場には残り、反撃はする）
export default defineDrawback({
  id: 'dormant',
  name: '休眠',
  order: 21,
  summary: `1ターンおきに休む（出た次の自分のターンと、その次の相手のターンが休眠中。休眠中は攻撃できず、場にいる間のタイミングの効果・起動が出ない。召喚時・破壊されたとき・反撃は普通どおり）。モンスターは max(${B.min}, 攻撃力×${B.perAttack})、パワーはパワーの効果のポイント×${B.powerRate}（倍率込みの固定値）`,
  fixed: true,
  cardTypes: ['monster', 'power', 'powerAttack'],
  basePoints: (_d, card) => pointsOf(card),
  baseFormula: (_d, card) => formulaOf(card),
  describe: () => '休眠（1ターンおきに、攻撃できず効果も出ない）',
  battle: { dormant: true },
});
