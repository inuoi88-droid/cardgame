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
    title: '疾走モンスター',
    description: '出したターンから殴る。序盤の押し込み役',
    build: (id) =>
      make(id, {
        name: '突撃ウルフ',
        icon: 'gi:wolf-head',
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
    description: '挑発で攻撃や効果の対象を引き受ける。守備力で削りに強い',
    build: (id) =>
      make(id, {
        name: '岩の守り手',
        icon: 'gi:golem-head',
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
        icon: 'gi:fireball',
        rarity: 'common',
        cost: 1,
        stats: null,
        keywords: [],
        effects: [
          { id: 'damage', value: 1, timing: 'play', target: 'chosen', condition: null },
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
        icon: 'gi:poison-cloud',
        rarity: 'common',
        cost: 1,
        stats: null,
        keywords: [],
        effects: [
          { id: 'damage', value: 1, timing: 'play', target: 'chosen', condition: null },
          { id: 'poison', value: 3, timing: 'play', target: 'chosen', condition: null },
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
        icon: 'gi:bolt-spell-cast',
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
        icon: 'gi:bleeding-heart',
        rarity: 'rare',
        cost: 1,
        stats: null,
        keywords: [],
        effects: [{ id: 'damage', value: 8, timing: 'play', target: 'chosen', condition: null }],
        drawbacks: [{ id: 'selfDamage', value: 6, timing: 'play' }],
      }),
  },
  // MTG 要素 ○ バッチC2：モード選択（製造・暴動）
  {
    id: 'fabricate',
    title: '製造モンスター',
    description: '出すときに「自分を鍛える」か「小鬼を出す」かを選ぶ（モード選択）',
    build: (id) =>
      make(id, {
        name: '工房のからくり',
        icon: 'gi:gears',
        rarity: 'common',
        cost: 1,
        stats: { attack: 1, hp: 1, defense: 0 },
        keywords: [],
        effects: [
          { id: 'train', value: 1, timing: 'summon', target: 'thisMonster', condition: null, mode: 1 },
          { id: 'token', value: 1, hits: 1, timing: 'summon', target: 'self', condition: null, mode: 2 },
        ],
        drawbacks: [],
        tribe: 'machine',
      }),
  },
  {
    id: 'riot',
    title: '暴動モンスター',
    description: '出すときに「疾走ですぐ殴る」か「鍛えて大きくなる」かを選ぶ（モード選択）',
    build: (id) =>
      make(id, {
        name: '暴れ猪',
        icon: 'gi:boar',
        rarity: 'common',
        cost: 2,
        stats: { attack: 2, hp: 2, defense: 0 },
        keywords: [],
        effects: [
          { id: 'grantKeyword', option: 'haste', timing: 'summon', target: 'thisMonster', condition: null, mode: 1 },
          { id: 'train', value: 1, timing: 'summon', target: 'thisMonster', condition: null, mode: 2 },
        ],
        drawbacks: [],
        tribe: 'beast',
      }),
  },
  // MTG 要素 △ バッチD：既存の要素の組み合わせで作れる MTG の仕組み（補強・湧血・種類サイクリング・変成・融合）
  {
    id: 'reinforce',
    title: '補強（手札から鍛える）',
    description: '出してもよし、手札から魂力で捨てて自分のモンスターを鍛えてもよし（MTG の補強）',
    build: (id) =>
      make(id, {
        name: '援軍の旗手',
        icon: 'gi:knight-banner',
        rarity: 'common',
        cost: 2,
        stats: { attack: 2, hp: 2, defense: 0 },
        keywords: [],
        effects: [{ id: 'train', value: 1, timing: 'channel', target: 'chosen', condition: null }],
        drawbacks: [],
        abilities: [{ id: 'channel', value: 1 }],
      }),
  },
  {
    id: 'bloodrush',
    title: '湧血（手札から一時強化）',
    description: '出してもよし、手札から魂力で捨てて味方1体をこのターンだけ強くしてもよし（MTG の湧血）',
    build: (id) =>
      make(id, {
        name: '血気の狂戦士',
        icon: 'gi:war-axe',
        rarity: 'common',
        cost: 2,
        stats: { attack: 3, hp: 1, defense: 0 },
        keywords: [],
        effects: [{ id: 'pump', value: 2, timing: 'channel', target: 'chosen', condition: null }],
        drawbacks: [],
        abilities: [{ id: 'channel', value: 1 }],
      }),
  },
  {
    id: 'typecycling',
    title: '種類サイクリング（手札からサーチ）',
    description: '重いカードを、手札から魂力で捨てて山札のモンスターに替えられる（MTG のタイプ・サイクリング）',
    build: (id) =>
      make(id, {
        name: '大地の目覚め',
        icon: 'gi:earth-crack',
        rarity: 'common',
        cost: 3,
        stats: null,
        keywords: [],
        effects: [
          { id: 'damage', value: 6, timing: 'play', target: 'chosen', condition: null },
          { id: 'search', option: 'monster', timing: 'channel', target: 'self', condition: null },
        ],
        drawbacks: [],
        abilities: [{ id: 'channel', value: 1 }],
      }),
  },
  {
    id: 'transmute',
    title: '変成（同じコストを探す）',
    description: '手札から魂力で捨てて、山札から同じコストのカードを探す（MTG の変成）',
    build: (id) =>
      make(id, {
        name: '錬成の書',
        icon: 'gi:book-aura',
        rarity: 'common',
        cost: 2,
        stats: null,
        keywords: [],
        effects: [
          { id: 'draw', value: 1, timing: 'play', target: 'self', condition: null },
          { id: 'shield', value: 4, timing: 'play', target: 'self', condition: null },
          { id: 'search', option: 'sameCost', timing: 'channel', target: 'self', condition: null },
        ],
        drawbacks: [],
        abilities: [{ id: 'channel', value: 1 }],
      }),
  },
  {
    id: 'fuse',
    title: '融合（2つのモード）',
    description: 'モード A か B を選んで使う。エナジーを足せば両方（双呪。MTG の融合・分割カード）',
    build: (id) =>
      make(id, {
        name: '火と氷',
        icon: 'gi:frostfire',
        rarity: 'common',
        cost: 2,
        stats: null,
        keywords: [],
        effects: [
          { id: 'damage', value: 3, timing: 'play', target: 'chosen', condition: null, mode: 1 },
          { id: 'shield', value: 4, timing: 'play', target: 'self', condition: null, mode: 2 },
        ],
        drawbacks: [],
        abilities: [{ id: 'entwine', value: 1 }],
      }),
  },
  // ---- MTG 要素 △ の統合（#101）：追加の支払い（バッチB）と待機ゾーン・裏向き（バッチC）の例
  {
    id: 'evoke',
    title: '想起（安く出して効果だけ）',
    description: 'ふつうに出せばモンスター。エナジー1で出すと召喚時の効果のあとすぐ破壊される（MTG の想起）',
    build: (id) =>
      make(id, {
        name: '一閃の精霊',
        icon: 'gi:spark-spirit',
        rarity: 'rare',
        cost: 4,
        stats: { attack: 4, hp: 4, defense: 0 },
        keywords: [],
        effects: [{ id: 'damage', value: 4, timing: 'summon', target: 'chosen', condition: null }],
        drawbacks: [],
        abilities: [{ id: 'evoke', value: 1 }],
      }),
  },
  {
    id: 'foretell',
    title: '予顕（伏せて後で安く）',
    description: 'エナジー2で裏向きに待機ゾーンへ伏せ、後のターンにコスト−2で使う（MTG の予顕）',
    build: (id) =>
      make(id, {
        name: '予言の雷',
        icon: 'gi:lightning-storm',
        rarity: 'rare',
        cost: 4,
        stats: null,
        keywords: [],
        effects: [{ id: 'damage', value: 10, timing: 'play', target: 'chosen', condition: null }],
        drawbacks: [],
        abilities: [{ id: 'foretell', value: 2 }],
      }),
  },
  {
    id: 'disguise',
    title: '変装（裏向きで出す）',
    description: 'エナジー2で正体を隠して出し（攻撃力・体力2・護法1）、あとで表にすると効果が出る（MTG の変装）',
    build: (id) =>
      make(id, {
        name: '覆面の刺客',
        icon: 'gi:hooded-assassin',
        rarity: 'rare',
        cost: 3,
        stats: { attack: 3, hp: 3, defense: 0 },
        keywords: [],
        effects: [{ id: 'damage', value: 3, timing: 'revealed', target: 'chosen', condition: null }],
        drawbacks: [],
        abilities: [{ id: 'disguise', value: 2 }],
      }),
  },
];
