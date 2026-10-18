/**
 * CPU 用のプリセットデッキ3つ（毒中心・モンスター中心・呪いカード中心）。すべてカード作成ルールとデッキルールを守る（テストで確認）。
 * 数値は倍率1（元の仕様）の大きさで書き、読み込み時にインフレ倍率を掛ける（決定事項 #65）。
 */
import { fromBaseScale, type CardDef, type Deck, type EffectInstance, type Rarity, type Stats } from './engine/index.ts';

const fx = (e: Partial<EffectInstance> & { id: string }): EffectInstance => ({
  timing: 'play',
  target: 'chosen',
  condition: null,
  ...e,
});

function c(
  id: string,
  name: string,
  icon: string,
  rarity: Rarity,
  cost: number,
  rest: { stats?: Stats; keywords?: CardDef['keywords']; effects?: EffectInstance[]; drawbacks?: CardDef['drawbacks'] } = {},
): CardDef {
  return fromBaseScale({
    v: 1,
    id: `preset-${id}`,
    name,
    icon,
    rarity,
    cost,
    stats: rest.stats ?? null,
    keywords: rest.keywords ?? [],
    effects: rest.effects ?? [],
    drawbacks: rest.drawbacks ?? [],
  });
}

export interface PresetDeck {
  id: string;
  name: string;
  description: string;
  cards: CardDef[];
  deck: Deck;
}

function preset(id: string, name: string, description: string, list: [CardDef, number][]): PresetDeck {
  return {
    id,
    name,
    description,
    cards: list.map(([card]) => card),
    deck: { v: 1, id: `preset-deck-${id}`, name, entries: list.map(([card, count]) => ({ cardId: card.id, count })) },
  };
}

// ---------------------------------------------------------------- 毒中心
const poison = preset('poison', '毒沼の魔女', '毒をばらまき、毒状態の相手にとどめを刺す', [
  [c('dokubari', '毒針', '🗡️', 'common', 1, { effects: [fx({ id: 'damage', value: 1 }), fx({ id: 'poison', value: 3 })] }), 8],
  [c('dokugiri', '毒霧', '🌫️', 'common', 1, { effects: [fx({ id: 'poison', value: 2, target: 'enemyAll' })] }), 5],
  [
    c('nezumi', '毒牙ネズミ', '🐀', 'common', 1, {
      stats: { attack: 1, hp: 2, defense: 0 },
      effects: [fx({ id: 'poison', value: 1, timing: 'attack' })],
    }),
    4,
  ],
  [
    c('hebi', '腐食の蛇', '🐍', 'common', 2, {
      stats: { attack: 2, hp: 3, defense: 0 },
      effects: [fx({ id: 'poison', value: 2, timing: 'attack' })],
    }),
    4,
  ],
  [c('gedoku', '解毒の薬', '🧪', 'common', 1, { effects: [fx({ id: 'shield', value: 6, target: 'self' }), fx({ id: 'heal', value: 2, target: 'self' })] }), 3],
  [c('todome', 'とどめの一撃', '⚔️', 'rare', 2, { effects: [fx({ id: 'damage', value: 20, condition: 'enemyPoisoned' })] }), 3],
  [c('numachi', '毒の沼地', '🫧', 'rare', 1, { effects: [fx({ id: 'poison', value: 2, timing: 'turnStart', target: 'enemyPlayer' })] }), 2],
  [c('dokuyaiba', '毒の刃', '🔪', 'epic', 2, { effects: [fx({ id: 'damage', value: 8 }), fx({ id: 'poison', value: 5 })] }), 1],
]);

// ---------------------------------------------------------------- モンスター中心
const beasts = preset('beasts', '獣の群れ', 'モンスターを並べて数で押し切る', [
  [c('inu', '野良犬', '🐕', 'common', 1, { stats: { attack: 2, hp: 2, defense: 0 } }), 6],
  [c('taka', '鷹', '🦅', 'common', 1, { stats: { attack: 1, hp: 1, defense: 0 }, keywords: [{ id: 'flying' }] }), 4],
  [c('tate', '盾の兵士', '🛡️', 'common', 2, { stats: { attack: 1, hp: 5, defense: 1 }, keywords: [{ id: 'taunt' }] }), 4],
  [c('ookami', '狼', '🐺', 'common', 2, { stats: { attack: 3, hp: 3, defense: 0 }, keywords: [{ id: 'haste' }] }), 6],
  [c('gourei', '号令', '📯', 'common', 0, { effects: [fx({ id: 'attackUp', value: 1 })] }), 3],
  [c('kuma', '大熊', '🐻', 'rare', 3, { stats: { attack: 5, hp: 6, defense: 1 }, keywords: [{ id: 'trample' }] }), 4],
  [
    c('osa', '群れの長', '🦁', 'epic', 2, {
      stats: { attack: 2, hp: 4, defense: 0 },
      effects: [fx({ id: 'attackUp', value: 2, timing: 'summon' }), fx({ id: 'attackUp', value: 1, timing: 'turnStart', target: 'random' })],
    }),
    2,
  ],
  [c('ryu', '竜', '🐉', 'legend', 4, { stats: { attack: 8, hp: 8, defense: 1 }, keywords: [{ id: 'flying' }] }), 1],
]);

// ---------------------------------------------------------------- 呪いカード中心
const curses = preset('curses', '呪いの契約', '自分を傷つける代わりに、強力な呪いカードで押し込む', [
  [
    c('chinoyaiba', '血の刃', '🩸', 'common', 1, {
      effects: [fx({ id: 'damage', value: 8 })],
      drawbacks: [{ id: 'selfDamage', value: 4, timing: 'play' }],
    }),
    8,
  ],
  [
    c('noroikishi', '呪われた騎士', '🧟', 'rare', 2, {
      stats: { attack: 4, hp: 6, defense: 1 },
      drawbacks: [
        { id: 'upkeep', timing: null },
        { id: 'selfDamage', value: 3, timing: 'summon' },
      ],
    }),
    5,
  ],
  [
    c('akuma', '悪魔の取引', '😈', 'epic', 1, {
      effects: [fx({ id: 'draw', value: 3, target: 'self' }), fx({ id: 'energy', value: 2, target: 'self' })],
      drawbacks: [
        { id: 'recoil', timing: 'play' },
        { id: 'selfDamage', value: 2, timing: 'play' },
      ],
    }),
    3,
  ],
  [
    c('kyosenshi', '狂戦士の契約', '💀', 'legend', 1, {
      effects: [fx({ id: 'strength', value: 5, target: 'self' })],
      drawbacks: [{ id: 'selfDamage', value: 4, timing: 'turnStart' }],
    }),
    1,
  ],
  [
    c('majuu', '裏切りの魔獣', '👹', 'legend', 2, {
      stats: { attack: 7, hp: 7, defense: 0 },
      keywords: [{ id: 'haste' }],
      drawbacks: [
        { id: 'betrayal', timing: null },
        { id: 'upkeep', timing: null },
        { id: 'selfPoison', value: 2, timing: 'summon' },
      ],
    }),
    1,
  ],
  [
    c('ikenie', '生贄の儀式', '🕯️', 'rare', 1, {
      effects: [fx({ id: 'shield', value: 10, target: 'self' }), fx({ id: 'heal', value: 3, target: 'self' })],
      drawbacks: [
        { id: 'discardRandom', timing: 'play' },
        { id: 'gift', timing: 'play' },
      ],
    }),
    3,
  ],
  [c('hinoko', '火の粉', '🔥', 'common', 1, { effects: [fx({ id: 'damage', value: 2 }), fx({ id: 'burn', value: 0 })] }), 4],
  [c('yaminotate', '闇の盾', '🌑', 'common', 1, { effects: [fx({ id: 'shield', value: 6, target: 'self' })] }), 5],
]);

export const PRESET_DECKS: readonly PresetDeck[] = [poison, beasts, curses];
