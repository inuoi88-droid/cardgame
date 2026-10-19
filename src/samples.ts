/**
 * カード一覧の「サンプルを追加」で入るカード。数値は倍率1で書き、読み込み時に倍率を掛ける（決定事項 #65・#67）。
 * - BASE_SAMPLES：仕様の「作成例」4枚（テストで計算結果を確かめる。中身を変えない）
 * - SHOWCASE_SAMPLES：今の予算でどこまで作れるかを見せる見本4枚（どれも上限ちょうどか、ほぼちょうど）
 */
import { fromBaseScale, type CardDef, type EffectInstance } from './engine/index.ts';

const BASE_SAMPLES: CardDef[] = [
  {
    v: 1,
    id: 'sample-hinoko',
    name: '火の粉',
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
  },
  {
    v: 1,
    id: 'sample-dokuga-nezumi',
    name: '毒牙ネズミ',
    icon: '🐀',
    rarity: 'common',
    cost: 1,
    stats: { attack: 1, hp: 2, defense: 0 },
    keywords: [],
    effects: [{ id: 'poison', value: 1, timing: 'attack', target: 'chosen', condition: null }],
    drawbacks: [],
  },
  {
    v: 1,
    id: 'sample-todome',
    name: 'とどめの一撃',
    icon: '🗡️',
    rarity: 'rare',
    cost: 2,
    stats: null,
    keywords: [],
    effects: [{ id: 'damage', value: 20, timing: 'play', target: 'chosen', condition: 'enemyPoisoned' }],
    drawbacks: [],
  },
  {
    v: 1,
    id: 'sample-kyosenshi',
    name: '狂戦士の契約',
    icon: '💀',
    rarity: 'legend',
    cost: 1,
    stats: null,
    keywords: [],
    effects: [{ id: 'strength', value: 5, timing: 'play', target: 'self', condition: null }],
    drawbacks: [{ id: 'selfDamage', value: 4, timing: 'turnStart' }],
  },
];

const fx = (e: Partial<EffectInstance> & { id: string }): EffectInstance => ({
  timing: 'play',
  target: 'chosen',
  condition: null,
  ...e,
});

const SHOWCASE_SAMPLES: CardDef[] = [
  {
    // コモンでも、ステータスと効果2つを持てる（3×3＋4×2＋2×2＋1×4−20＝5）
    v: 1,
    id: 'sample-minarai',
    name: '見習い魔術師',
    icon: '🧑‍🎓',
    rarity: 'common',
    cost: 2,
    stats: { attack: 3, hp: 4, defense: 0 },
    keywords: [],
    effects: [fx({ id: 'damage', value: 2, timing: 'summon' }), fx({ id: 'draw', value: 1, timing: 'summon', target: 'self' })],
    drawbacks: [],
  },
  {
    // レアは効果を4つまで（6×2＋1×4＋1×4＋2×4−20＝8）
    v: 1,
    id: 'sample-kenja',
    name: '賢者の杖',
    icon: '🪄',
    rarity: 'rare',
    cost: 2,
    stats: null,
    keywords: [],
    effects: [
      fx({ id: 'damage', value: 6 }),
      fx({ id: 'poison', value: 1 }),
      fx({ id: 'heal', value: 1, target: 'self' }),
      fx({ id: 'draw', value: 2, target: 'self' }),
    ],
    drawbacks: [],
  },
  {
    // エピックのモンスター：キーワードと効果を両方（4×3＋7×2＋1×4＋挑発6＋回復2×4−32＝12）
    v: 1,
    id: 'sample-shirogane',
    name: '白銀の騎士',
    icon: '🛡️',
    rarity: 'epic',
    cost: 3,
    stats: { attack: 4, hp: 7, defense: 1 },
    keywords: [{ id: 'taunt' }],
    effects: [fx({ id: 'heal', value: 2, timing: 'summon', target: 'self' })],
    drawbacks: [],
  },
  {
    // レジェンドは予算が大きい。選ぶ効果（サーチ）も入れられる（2×4＋1×8＋8＋4×3.5−20＝18）
    v: 1,
    id: 'sample-madousho',
    name: '時の魔導書',
    icon: '📖',
    rarity: 'legend',
    cost: 2,
    stats: null,
    keywords: [],
    effects: [
      fx({ id: 'draw', value: 2, target: 'self' }),
      fx({ id: 'energy', value: 1, target: 'self' }),
      fx({ id: 'search', option: 'attack', target: 'self' }),
      fx({ id: 'shield', value: 4, target: 'self' }),
    ],
    drawbacks: [],
  },
];

export const SAMPLE_CARDS: CardDef[] = [...BASE_SAMPLES, ...SHOWCASE_SAMPLES].map(fromBaseScale);
