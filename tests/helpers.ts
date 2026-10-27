import type { CardDef } from '../src/engine/index.ts';

/** テスト用のカードを作る。指定しなかった項目は空のコモン（コスト1）になる */
export function card(partial: Partial<CardDef>): CardDef {
  return {
    v: 1,
    id: partial.id ?? `test-${partial.name ?? 'card'}`,
    name: 'テストカード',
    icon: '🃏',
    rarity: 'common',
    cost: 1,
    stats: null,
    keywords: [],
    effects: [],
    drawbacks: [],
    ...partial,
  };
}

/** 仕様の「作成例」4枚 */
export const EXAMPLES = {
  hinoko: card({
    id: 'ex-hinoko',
    name: '火の粉',
    icon: '🔥',
    rarity: 'common',
    cost: 1,
    effects: [
      { id: 'damage', value: 1, timing: 'play', target: 'chosen', condition: null },
      { id: 'burn', value: 0, timing: 'play', target: 'chosen', condition: null },
    ],
  }),
  dokugaNezumi: card({
    id: 'ex-nezumi',
    name: '毒牙ネズミ',
    icon: '🐀',
    rarity: 'common',
    cost: 1,
    stats: { attack: 1, hp: 2, defense: 0 },
    effects: [{ id: 'poison', value: 1, timing: 'attack', target: 'chosen', condition: null }],
  }),
  todome: card({
    id: 'ex-todome',
    name: 'とどめの一撃',
    icon: '🗡️',
    rarity: 'rare',
    cost: 2,
    effects: [{ id: 'damage', value: 20, timing: 'play', target: 'chosen', condition: 'enemyPoisoned' }],
  }),
  kyosenshi: card({
    id: 'ex-kyosenshi',
    name: '狂戦士の契約',
    icon: '💀',
    rarity: 'legend',
    cost: 1,
    effects: [{ id: 'strength', value: 5, timing: 'play', target: 'self', condition: null }],
    drawbacks: [{ id: 'selfDamage', value: 4, timing: 'turnStart' }],
  }),
} satisfies Record<string, CardDef>;

/** 違反コードの一覧 */
export function codes(violations: { code: string }[]): string[] {
  return violations.map((v) => v.code);
}
