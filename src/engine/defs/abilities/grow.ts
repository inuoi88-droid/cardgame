import { BALANCE } from '../../balance.ts';
import { defineAbility, n, valueParam } from '../../define.ts';
import { getEffect } from '../../registry.ts';
import type { EffectInstance } from '../../types.ts';

const B = BALANCE.abilities.grow;

/** 使用時のダメージ効果の数（連撃は回数） */
export function growHits(effects: readonly EffectInstance[]): number {
  let hits = 0;
  for (const e of effects) {
    if (e.timing !== 'play' || !getEffect(e.id)?.isDamage) continue;
    hits += getEffect(e.id)?.hits ? (e.hits ?? 1) : 1;
  }
  return hits;
}

// 成長：MTG #554（強度）。このカードを使うたび、このカード（個体）のダメージ・連撃の数値が+N（対戦中ずっと。上限あり）
export default defineAbility({
  id: 'grow',
  name: '成長',
  order: 4,
  group: '使い終わり',
  summary: `使うたび、このカード（この1枚）の使用時のダメージ・連撃の数値が+N（対戦中ずっと。上乗せは${B.maxGrow}まで）。使用時のダメージ効果が要る`,
  value: valueParam('量', { default: 1, max: B.maxValue }),
  cardTypes: ['attack', 'powerAttack'],
  points: (a, ctx) => B.perValue * n(a) * growHits(ctx.card.effects),
  formula: (a, ctx) => `${n(a)}×${B.perValue}×${growHits(ctx.card.effects)}`,
  displayName: (a) => `成長${n(a)}`,
  describe: (a) => `使うたび、このカードのダメージ+${n(a)}（この1枚だけ。上乗せは${B.maxGrow}まで）`,
  battle: { grow: (a) => n(a) },
});
