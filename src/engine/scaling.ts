/**
 * 量の倍率（インフレ倍率×予算倍率。決定事項 #65・#66）に合わせたカードの数値の変換。
 * カードには、値を書いたときの倍率（scale。省略は1）を持たせる。今の倍率と違うカードを読み込んだら、
 * 「量」（ステータスと、量の入力欄を持つ効果・キーワード・デメリットの値）に倍率の比を掛けて今の倍率にそろえる。
 */
import { BALANCE } from './balance.ts';
import { getDrawback, getEffect, getKeyword } from './registry.ts';
import type { CardDef } from './types.ts';

const SCALE = BALANCE.amountScale;

const mul = (v: number | undefined, f: number): number | undefined => (v === undefined ? undefined : Math.round(v * f));

/** 今の倍率の印を付ける（倍率1なら印は付けない） */
export function stampScale(card: CardDef): CardDef {
  const { scale: _old, ...rest } = card;
  return SCALE === 1 ? rest : { ...rest, scale: SCALE };
}

/** カードの「量」に f を掛ける（印は変えない） */
export function scaleCardValues(card: CardDef, f: number): CardDef {
  if (f === 1) return card;
  return {
    ...card,
    stats: card.stats && {
      attack: mul(card.stats.attack, f)!,
      hp: mul(card.stats.hp, f)!,
      defense: mul(card.stats.defense, f)!,
    },
    keywords: card.keywords.map((k) => (getKeyword(k.id)?.value?.scaled ? { ...k, value: mul(k.value, f) } : k)),
    effects: card.effects.map((e) => (getEffect(e.id)?.value?.scaled ? { ...e, value: mul(e.value, f) } : e)),
    drawbacks: card.drawbacks.map((d) => (getDrawback(d.id)?.value?.scaled ? { ...d, value: mul(d.value, f) } : d)),
  };
}

/** 倍率1の数字で書いたカード（プリセット・作成例）を今の倍率にする */
export function fromBaseScale(card: CardDef): CardDef {
  return stampScale(scaleCardValues(card, SCALE));
}

/** 読み込んだカードを今の倍率にそろえる（古いデータは倍率1として扱う） */
export function toCurrentScale(card: CardDef): CardDef {
  const from = card.scale ?? 1;
  return stampScale(scaleCardValues(card, SCALE / from));
}
