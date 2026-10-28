import { BALANCE } from '../../balance.ts';
import { countParam, defineAbility, n } from '../../define.ts';
import { ceilPoints } from '../../math.ts';
import type { CardDef } from '../../types.ts';

const B = BALANCE.abilities.prototype;
const C = BALANCE.card;
const S = BALANCE.stats;

/** 試作版の値（対戦の zones.ts の halve と同じ：半分を量の刻みに切り捨て、体力は最低 刻みか元の体力の小さいほう） */
const halve = (v: number, min: number) => Math.max(min, Math.floor(v / 2 / Math.max(1, Math.floor(B.step))) * Math.max(1, Math.floor(B.step)));

/** 下がるコストの価値（コストの差し引きの差。0まで下がるならコスト0の上限の引き下げも） */
function costValue(cost: number, k: number): number {
  const to = Math.max(0, cost - k);
  return (C.costPoints[cost] ?? 0) - (C.costPoints[to] ?? 0) + (to === 0 && cost > 0 ? C.cost0CapPenalty : 0);
}

/** 半分になって失う攻撃力・体力の価値 */
function lostStats(stats: CardDef['stats']): number {
  if (!stats) return 0;
  const step = Math.max(1, Math.floor(B.step));
  const atk = halve(stats.attack, 0);
  const hp = halve(stats.hp, Math.min(step, Math.max(1, stats.hp)));
  return (stats.attack - atk) * S.attackPoints + (stats.hp - hp) * S.hpPoints;
}

/**
 * ポイント：max(perCost×K, 下がるコストの価値 − 失う攻撃力・体力の価値)。
 * 攻撃力・体力の低いモンスターは半分になっても失うものが無く、ほぼ無料でコストだけ下がった（報告 #17。ユーザー回答）
 */
function points(a: { value?: number }, card: { stats?: CardDef['stats']; cost?: number }): number {
  const k = n(a);
  return Math.max(B.perCost * k, ceilPoints(costValue(card.cost ?? 0, k) - lostStats(card.stats ?? null)));
}

// 試作：MTG #368。モンスター：コストを −K して、攻撃力と体力が半分の試作版として出してもよい
export default defineAbility({
  id: 'prototype',
  name: '試作',
  order: 22,
  group: '追加の支払い',
  summary: `モンスター：コスト−K（印刷コスト未満）で、攻撃力と体力が半分の試作版として出してもよい（キーワード・効果はそのまま）。ポイントは max(${B.perCost}×K, 下がるコストの価値−半分で失う攻撃力・体力の価値)`,
  value: countParam('軽減', { min: 1, max: B.maxCut, default: 1 }),
  cardTypes: ['monster'],
  payGroup: 'extra',
  points: (a, ctx) => points(a, ctx.card),
  formula: (a, ctx) => {
    const k = n(a);
    return `max(${B.perCost}×${k}, コスト${costValue(ctx.card.cost ?? 0, k)}−ステータス${lostStats(ctx.card.stats ?? null)})`;
  },
  displayName: (a) => `試作−${n(a)}`,
  describe: (a) => `コスト−${n(a)}で出すと、攻撃力・体力が半分になる`,
  battle: { alt: { kind: 'prototype', cost: (a, printed) => Math.max(0, printed - n(a)) } },
});
