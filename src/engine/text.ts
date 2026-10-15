/** 効果テキストの自動生成（例：「攻撃するたび、相手に毒1を与える。」） */
import { cardBase } from './classify.ts';
import { CONDITIONS, TIMINGS, targetNoun } from './options.ts';
import { getDrawback, getEffect, getKeyword, getModifier } from './registry.ts';
import type { CardDef, CardText, DrawbackInstance, EffectInstance } from './types.ts';

export function describeEffect(e: EffectInstance): string {
  const def = getEffect(e.id);
  if (!def) return `（不明な効果：${e.id}）`;
  const mods = def.allowsMods ? [...new Set(e.mods ?? [])].map((m) => getModifier(m)).filter((m) => m !== undefined) : [];
  const body = def.describe(e, {
    target: TIMINGS[e.timing] ? targetNoun(e.target, def.targetRule, e.timing) : '相手',
    modPrefix: mods.map((m) => m.textPrefix).join(''),
    modSuffix: mods.map((m) => m.textSuffix).join(''),
  });
  const timing = TIMINGS[e.timing]?.textPrefix ?? '';
  const condition = e.condition ? (CONDITIONS[e.condition]?.textPrefix ?? '') : '';
  return `${timing}${condition}${body}。`;
}

export function describeDrawback(d: DrawbackInstance): string {
  const def = getDrawback(d.id);
  if (!def) return `（不明なデメリット：${d.id}）`;
  const timing = d.timing ? (TIMINGS[d.timing]?.textPrefix ?? '') : '';
  return `${timing}${def.describe(d)}。`;
}

export function describeCard(card: CardDef): CardText {
  const isMonster = cardBase(card) === 'monster';
  return {
    effects: card.effects.map(describeEffect),
    keywords: isMonster
      ? card.keywords.flatMap((k) => {
          const def = getKeyword(k.id);
          return def ? [{ name: def.displayName(k), text: def.describe(k) }] : [];
        })
      : [],
    drawbacks: card.drawbacks.map(describeDrawback),
  };
}
