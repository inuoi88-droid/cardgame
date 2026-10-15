import type { CardType, Rarity } from './types.ts';

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'コモン',
  rare: 'レア',
  epic: 'エピック',
  legend: 'レジェンド',
};

export const CARD_TYPE_LABEL: Record<CardType, string> = {
  monster: 'モンスター',
  powerAttack: 'パワー・アタック',
  power: 'パワー',
  attack: 'アタック',
  skill: 'スキル',
};

export const CURSE_LABEL = '呪い';

/** 倍率の表示（1.0 / 0.8 / 2.5 など、小数1桁以上） */
export function formatMultiplier(m: number): string {
  const s = String(m);
  return s.includes('.') ? s : `${s}.0`;
}

/** ポイントの表示（負の数は全角マイナスではなく「−」を使う） */
export function formatPoints(n: number): string {
  return n < 0 ? `−${-n}` : String(n);
}
