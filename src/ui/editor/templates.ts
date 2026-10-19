/**
 * 「テンプレートから作る」の雛形。数値は倍率1で書き、fromBaseScale で今の倍率にする。
 * すべて analyzeCard().valid になること（tests/templates.test.ts で確認する）。
 */
import { fromBaseScale, newCard, type CardDef } from '../../engine/index.ts';

export interface CardTemplate {
  id: string;
  title: string;
  description: string;
  build(id: string): CardDef;
}

type Base = Omit<CardDef, 'v' | 'id' | 'scale'>;

const make = (id: string, base: Base): CardDef => fromBaseScale({ ...newCard(id), ...base });

export const TEMPLATES: readonly CardTemplate[] = [
  {
    id: 'aggro',
    title: '速攻モンスター',
    description: '出したターンから殴る。序盤の押し込み役',
    build: (id) =>
      make(id, {
        name: '突撃ウルフ',
        icon: '🐺',
        rarity: 'common',
        cost: 1,
        stats: { attack: 2, hp: 2, defense: 0 },
        keywords: [{ id: 'haste' }],
        effects: [],
        drawbacks: [],
      }),
  },
  {
    id: 'wall',
    title: '壁モンスター',
    description: '挑発で攻撃を引き受ける。守備力で削りに強い',
    build: (id) =>
      make(id, {
        name: '岩の守り手',
        icon: '🪨',
        rarity: 'common',
        cost: 2,
        stats: { attack: 1, hp: 6, defense: 1 },
        keywords: [{ id: 'taunt' }],
        effects: [],
        drawbacks: [],
      }),
  },
  {
    id: 'burn',
    title: 'やけどの呪文',
    description: 'すぐのダメージと、数ターン続くやけど',
    build: (id) =>
      make(id, {
        name: '火の玉',
        icon: '🔥',
        rarity: 'common',
        cost: 1,
        stats: null,
        keywords: [],
        effects: [
          { id: 'damage', value: 2, timing: 'play', target: 'chosen', condition: null },
          { id: 'burn', value: 0, timing: 'play', target: 'chosen', condition: null },
        ],
        drawbacks: [],
      }),
  },
  {
    id: 'poison',
    title: '毒の呪文',
    description: '守備力やシールドを無視してじわじわ削る',
    build: (id) =>
      make(id, {
        name: '毒の霧',
        icon: '☠️',
        rarity: 'common',
        cost: 1,
        stats: null,
        keywords: [],
        effects: [
          { id: 'poison', value: 3, timing: 'play', target: 'chosen', condition: null },
          { id: 'draw', value: 1, timing: 'play', target: 'self', condition: null },
        ],
        drawbacks: [],
      }),
  },
  {
    id: 'tempo',
    title: 'ドロー・エナジーのスキル',
    description: '手札とエナジーを増やして、次の一手につなぐ',
    build: (id) =>
      make(id, {
        name: '加速の詠唱',
        icon: '⚡',
        rarity: 'common',
        cost: 1,
        stats: null,
        keywords: [],
        effects: [
          { id: 'draw', value: 1, timing: 'play', target: 'self', condition: null },
          { id: 'energy', value: 1, timing: 'play', target: 'self', condition: null },
        ],
        drawbacks: [],
      }),
  },
  {
    id: 'curse',
    title: '呪いのアタック',
    description: '自分も痛むかわりに、コストのわりに大きなダメージ',
    build: (id) =>
      make(id, {
        name: '血の代償',
        icon: '🩸',
        rarity: 'rare',
        cost: 1,
        stats: null,
        keywords: [],
        effects: [{ id: 'damage', value: 10, timing: 'play', target: 'chosen', condition: null }],
        drawbacks: [{ id: 'selfDamage', value: 6, timing: 'play' }],
      }),
  },
];
