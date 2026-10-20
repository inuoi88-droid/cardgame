/** 効果テキストの自動生成（例：「攻撃するたび、相手に毒1を与える。」） */
import { cardBase } from './classify.ts';
import { CONDITIONS, TIMINGS, targetNoun } from './options.ts';
import { effectModifiers } from './points.ts';
import { getAbility, getDrawback, getEffect, getKeyword } from './registry.ts';
import type { AbilityInstance, CardDef, CardText, DrawbackInstance, EffectInstance } from './types.ts';

/**
 * タイミングの前置き。起動・魂力（MTG 要素 ○ バッチC1）はカードの能力のエナジーを入れる（「起動（エナジー1）：」）。
 * abilities を省略するとエナジーなし
 */
export function timingPrefix(timing: EffectInstance['timing'], abilities?: CardDef['abilities']): string {
  const def = TIMINGS[timing];
  if (!def) return '';
  const id = timing === 'activated' ? 'activate' : timing === 'channel' ? 'channel' : null;
  const v = id ? (abilities ?? []).find((a) => a.id === id)?.value : undefined;
  return v === undefined ? def.textPrefix : `${def.label}（エナジー${v}）：`;
}

export function describeEffect(e: EffectInstance, card?: Pick<CardDef, 'abilities'>): string {
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
  // 遅延（次のターンに）は条件の後ろ、倍数の前に付ける。「お互い」は効果の文の先頭（MTG 要素 ○ バッチA）
  const delay = all.filter((m) => m.scope === 'delay');
  const timing = timingPrefix(e.timing, card?.abilities);
  const condition = e.condition ? (CONDITIONS[e.condition]?.textPrefix ?? '') : '';
  const before = [...delay, ...scale].map((m) => m.textPrefix).join('');
  const after = [...scale, ...delay].map((m) => m.textSuffix).join('');
  const both = e.target === 'bothPlayers' ? 'お互い、' : '';
  return `${timing}${condition}${before}${both}${body}${after}。`;
}

export function describeDrawback(d: DrawbackInstance): string {
  const def = getDrawback(d.id);
  if (!def) return `（不明なデメリット：${d.id}）`;
  const timing = d.timing ? timingPrefix(d.timing) : '';
  return `${timing}${def.describe(d)}。`;
}

export function describeCard(card: CardDef): CardText {
  const isMonster = cardBase(card) === 'monster';
  return {
    effects: card.effects.map((e) => describeEffect(e, card)),
    keywords: isMonster
      ? card.keywords.flatMap((k) => {
          const def = getKeyword(k.id);
          return def ? [{ name: def.displayName(k), text: def.describe(k) }] : [];
        })
      : [],
    drawbacks: card.drawbacks.map(describeDrawback),
    abilities: (card.abilities ?? []).flatMap((a) => {
      const def = getAbility(a.id);
      return def ? [{ name: def.displayName(a), text: describeAbility(a) }] : [];
    }),
  };
}

/** カードの能力のテキスト（MTG 要素 ○ バッチB。句点つき） */
export function describeAbility(a: AbilityInstance): string {
  const def = getAbility(a.id);
  if (!def) return `（不明な能力：${a.id}）`;
  return `${def.describe(a)}。`;
}
