/** カードの種類と呪いの判定 */
import { isPowerTiming } from './options.ts';
import { getEffect } from './registry.ts';
import { RARITIES, type CardBase, type CardDef, type CardType, type Rarity } from './types.ts';

export function cardBase(card: Pick<CardDef, 'stats'>): CardBase {
  return card.stats ? 'monster' : 'spell';
}

export function isCurseCard(card: Pick<CardDef, 'drawbacks'>): boolean {
  return card.drawbacks.length > 0;
}

/** プレイヤーに永続的に残る効果（パワー用タイミングの効果・デメリット、筋力）があるか */
export function hasPlayerPermanent(card: CardDef): boolean {
  const base = cardBase(card);
  return (
    card.effects.some((e) => getEffect(e.id)?.isPlayerPermanent === true || isPowerTiming(e.timing, base)) ||
    card.drawbacks.some((d) => isPowerTiming(d.timing, base))
  );
}

/** 相手へのダメージ効果があるか（使用時・捨て札から使ったときのダメージ・連撃だけで判定する） */
export function hasOpponentDamage(card: CardDef): boolean {
  return card.effects.some((e) => getEffect(e.id)?.isDamage === true && (e.timing === 'play' || e.timing === 'fromDiscard'));
}

/** 仕様の順に判定：モンスター → パワー・アタック → パワー → アタック → スキル */
export function classifyCard(card: CardDef): CardType {
  if (card.stats) return 'monster';
  const permanent = hasPlayerPermanent(card);
  const damage = hasOpponentDamage(card);
  if (permanent && damage) return 'powerAttack';
  if (permanent) return 'power';
  if (damage) return 'attack';
  return 'skill';
}

export function rarityRank(r: Rarity): number {
  return RARITIES.indexOf(r);
}
