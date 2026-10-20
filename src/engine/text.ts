/** 効果テキストの自動生成（例：「攻撃するたび、相手に毒1を与える。」） */
import { cardBase } from './classify.ts';
import { CONDITIONS, TIMINGS, targetNoun } from './options.ts';
import { effectModifiers } from './points.ts';
import { getDrawback, getEffect, getKeyword } from './registry.ts';
import type { CardDef, CardText, DrawbackInstance, EffectInstance } from './types.ts';

export function describeEffect(e: EffectInstance): string {
  const def = getEffect(e.id);
  if (!def) return `（不明な効果：${e.id}）`;
  const all = effectModifiers(e);
  // 防御無視・吸収は効果の文の中、数値の倍数（X など）は効果の文の前後に付ける
  const mods = all.filter((m) => m.scope === 'damage');
  const scale = all.filter((m) => m.scope === 'scale');
  const body = def.describe(e, {
    target: TIMINGS[e.timing] ? targetNoun(e.target, def.targetRule, e.timing) : '相手',
    modPrefix: mods.map((m) => m.textPrefix).join(''),
    modSuffix: mods.map((m) => m.textSuffix).join(''),
  });
  const timing = TIMINGS[e.timing]?.textPrefix ?? '';
  const condition = e.condition ? (CONDITIONS[e.condition]?.textPrefix ?? '') : '';
  const before = scale.map((m) => m.textPrefix).join('');
  const after = scale.map((m) => m.textSuffix).join('');
  return `${timing}${condition}${before}${body}${after}。`;
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
