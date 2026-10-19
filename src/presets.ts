/**
 * CPU 用のプリセットデッキ5つ（毒・モンスター・呪い・守り・コンボ）。すべてカード作成ルールとデッキルールを守る（テストで確認）。
 * どのデッキにも、使うと選ぶ画面が出るカード（サーチ・回収・保持・解除）を1種類以上入れる。
 * 数値は倍率1（元の仕様）の大きさで書き、読み込み時に倍率を掛ける（決定事項 #65・#67）。
 * 組み方と CPU 同士の勝率の測定は決定事項ログの「プリセット5つと作成例の追加」を参照。
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

const stats = (attack: number, hp: number, defense = 0): Stats => ({ attack, hp, defense });

// ---------------------------------------------------------------- 毒（状態異常）
const poison = preset('poison', '毒沼の魔女', '毒をばらまいてじわじわ削り、毒の回った相手にとどめを刺す', [
  [c('dokubari', '毒針', '🗡️', 'common', 1, { effects: [fx({ id: 'damage', value: 1 }), fx({ id: 'poison', value: 3 })] }), 5],
  [c('nezumi', '毒牙ネズミ', '🐀', 'common', 1, { stats: stats(1, 2), effects: [fx({ id: 'poison', value: 1, timing: 'attack' })] }), 1],
  [c('hebi', '腐食の蛇', '🐍', 'common', 2, { stats: stats(3, 5), effects: [fx({ id: 'poison', value: 1, timing: 'attack' })] }), 3],
  [
    c('fukiya', '毒の吹き矢', '🎯', 'common', 1, {
      effects: [fx({ id: 'poison', value: 1, target: 'enemyAll' })],
    }),
    6,
  ],
  [
    c('gedoku', '解毒の薬', '🧪', 'common', 1, {
      effects: [fx({ id: 'shield', value: 2, target: 'self' }), fx({ id: 'heal', value: 2, target: 'self' })],
    }),
    2,
  ],
  [
    c('ookama', '魔女の大釜', '🫕', 'rare', 1, {
      effects: [fx({ id: 'recall', target: 'self' }), fx({ id: 'damage', value: 2 }), fx({ id: 'poison', value: 1 })],
    }),
    2,
  ],
  [c('todome', 'とどめの一撃', '⚔️', 'rare', 2, { effects: [fx({ id: 'damage', value: 20, condition: 'enemyPoisoned' })] }), 3],
  [c('joou', '毒蛇の女王', '🐉', 'rare', 3, { stats: stats(3, 10), effects: [fx({ id: 'poison', value: 2, timing: 'attack' })] }), 3],
  [
    c('dokuyaiba', '毒の刃', '🔪', 'epic', 2, {
      effects: [fx({ id: 'poison', value: 2, target: 'enemyAll' }), fx({ id: 'damage', value: 1 })],
    }),
    2,
  ],
  [
    c('numachi', '毒の沼地', '🫧', 'epic', 2, {
      effects: [fx({ id: 'poison', value: 1, timing: 'turnStart', target: 'enemyPlayer' }), fx({ id: 'poison', value: 2 })],
    }),
    2,
  ],
  [
    c('majo', '沼の魔女', '🧙', 'legend', 3, {
      stats: stats(4, 6),
      effects: [fx({ id: 'poison', value: 1, timing: 'turnStart', target: 'enemyAll' })],
    }),
    1,
  ],
]);

// ---------------------------------------------------------------- モンスター（数で押す）
const beasts = preset('beasts', '獣の群れ', '速いモンスターと牙の一撃で、相手が守りを固める前に押し切る', [
  [c('washi', '狩りの鷲', '🪶', 'common', 1, { stats: stats(1, 4), effects: [fx({ id: 'damage', value: 2, timing: 'summon' })] }), 6],
  [c('taka', '鷹', '🦅', 'common', 1, { stats: stats(2, 4), keywords: [{ id: 'flying' }] }), 6],
  [c('kiba', '牙の一撃', '🦷', 'common', 1, { effects: [fx({ id: 'damage', value: 5 })] }), 5],
  [
    c('gourei', '号令', '📯', 'common', 1, {
      effects: [fx({ id: 'attackUp', value: 2 }), fx({ id: 'draw', value: 2, target: 'self' })],
    }),
    3,
  ],
  [
    c('yobigoe', '群れの呼び声', '🌕', 'rare', 1, {
      effects: [fx({ id: 'search', option: 'monster', target: 'self' }), fx({ id: 'draw', value: 1, target: 'self' }), fx({ id: 'attackUp', value: 2 })],
    }),
    3,
  ],
  [
    c('kishuu', '狼の奇襲', '🐺', 'rare', 1, {
      stats: stats(2, 3),
      keywords: [{ id: 'haste' }],
      effects: [fx({ id: 'damage', value: 1, timing: 'summon' })],
    }),
    3,
  ],
  [c('hyou', '黒豹', '🐆', 'epic', 1, { stats: stats(3, 4), keywords: [{ id: 'haste' }] }), 1],
  [
    c('osa', '群れの長', '🦁', 'epic', 2, {
      stats: stats(3, 8),
      effects: [fx({ id: 'attackUp', value: 2, timing: 'summon' }), fx({ id: 'attackUp', value: 1, timing: 'turnStart', target: 'random' })],
    }),
    1,
  ],
  [c('shishi', '獅子王', '🦁', 'legend', 2, { stats: stats(5, 8), keywords: [{ id: 'haste' }] }), 1],
  [
    c('ryu', '竜', '🐲', 'legend', 4, {
      stats: stats(9, 13, 1),
      keywords: [{ id: 'flying' }],
      effects: [fx({ id: 'damage', value: 3, timing: 'summon' })],
    }),
    1,
  ],
]);

// ---------------------------------------------------------------- 呪い（自傷で一気に押し込む）
const curses = preset('curses', '呪いの契約', '自分の HP を代償に、強力な呪いカードで一気に押し込む', [
  [
    c('chinoyaiba', '血の刃', '🩸', 'common', 1, {
      effects: [fx({ id: 'damage', value: 5 }), fx({ id: 'draw', value: 1, target: 'self' })],
      drawbacks: [
        { id: 'discardRandom', timing: 'play' },
        { id: 'gift', timing: 'play' },
      ],
    }),
    5,
  ],
  [
    c('keiyakujuu', '血の契約獣', '🐺', 'common', 1, {
      stats: stats(4, 5),
      drawbacks: [
        { id: 'discardRandom', timing: 'summon' },
        { id: 'gift', timing: 'summon' },
      ],
    }),
    5,
  ],
  [
    c('yaminotate', '闇の盾', '🌑', 'common', 1, {
      effects: [fx({ id: 'shield', value: 3, target: 'self' }), fx({ id: 'heal', value: 1, target: 'self' })],
    }),
    5,
  ],
  [
    c('shouki', '呪いの瘴気', '☠️', 'common', 1, {
      effects: [fx({ id: 'damage', value: 2, target: 'enemyMonsters' }), fx({ id: 'draw', value: 2, target: 'self' })],
      drawbacks: [
        { id: 'discardRandom', timing: 'play' },
        { id: 'gift', timing: 'play' },
      ],
    }),
    3,
  ],
  [
    c('noroikishi', '呪われた騎士', '🧟', 'rare', 2, {
      stats: stats(6, 9, 1),
      drawbacks: [
        { id: 'upkeep', timing: null },
        { id: 'discardRandom', timing: 'summon' },
      ],
    }),
    2,
  ],
  [
    c('ikenie', '生贄の儀式', '🕯️', 'rare', 1, {
      effects: [fx({ id: 'shield', value: 5, target: 'self' }), fx({ id: 'heal', value: 2, target: 'self' })],
      drawbacks: [
        { id: 'discardRandom', timing: 'play' },
        { id: 'gift', timing: 'play' },
        { id: 'selfDamage', value: 2, timing: 'play' },
      ],
    }),
    3,
  ],
  [
    c('meifu', '冥府の呼び声', '⚰️', 'rare', 1, {
      effects: [fx({ id: 'recall', target: 'self' }), fx({ id: 'damage', value: 3, mods: ['drain'] }), fx({ id: 'draw', value: 1, target: 'self' })],
      drawbacks: [
        { id: 'parasite', timing: null },
        { id: 'discardRandom', timing: 'play' },
      ],
    }),
    2,
  ],
  [
    c('akuma', '悪魔の取引', '😈', 'epic', 1, {
      effects: [
        fx({ id: 'draw', value: 3, target: 'self' }),
        fx({ id: 'energy', value: 2, target: 'self' }),
        fx({ id: 'focus', value: 2, target: 'self' }),
      ],
      drawbacks: [
        { id: 'recoil', timing: 'play' },
        { id: 'selfDamage', value: 3, timing: 'play' },
      ],
    }),
    2,
  ],
  [
    c('hametsu', '破滅の一撃', '☄️', 'epic', 2, {
      effects: [fx({ id: 'damage', value: 4, target: 'enemyAll' })],
      drawbacks: [
        { id: 'selfDamage', value: 4, timing: 'play' },
        { id: 'discardRandom', timing: 'play' },
        { id: 'gift', timing: 'play' },
      ],
    }),
    1,
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
      stats: stats(8, 9),
      keywords: [{ id: 'haste' }],
      drawbacks: [
        { id: 'betrayal', timing: null },
        { id: 'upkeep', timing: null },
        { id: 'selfPoison', value: 2, timing: 'summon' },
      ],
    }),
    1,
  ],
]);

// ---------------------------------------------------------------- 守り（耐えて終盤に勝つ）
const fortress = preset('fortress', '鉄壁の砦', '挑発の壁と石の巨人で耐え、除去で立て直し、終盤の大砲で削り切る', [
  [c('mihari', '見張りの衛兵', '💂', 'common', 1, { stats: stats(2, 4), effects: [fx({ id: 'damage', value: 1, timing: 'summon' })] }), 2],
  [c('jouheki', '城壁の守り手', '🏰', 'common', 2, { stats: stats(2, 7), keywords: [{ id: 'taunt' }] }), 2],
  [
    c('tetsunotate', '鉄の盾', '🛡️', 'common', 1, {
      effects: [fx({ id: 'shield', value: 3, target: 'self' }), fx({ id: 'retain', target: 'self' })],
    }),
    1,
  ],
  [c('touseki', '投石', '🪨', 'common', 1, { effects: [fx({ id: 'damage', value: 5 })] }), 9],
  [
    c('izumi', '癒しの泉', '⛲', 'common', 1, {
      effects: [fx({ id: 'heal', value: 2, target: 'self' }), fx({ id: 'shield', value: 2, target: 'self' })],
    }),
    1,
  ],
  [
    c('ooyumi', '大弓', '🏹', 'common', 2, {
      effects: [fx({ id: 'damage', value: 8 })],
    }),
    4,
  ],
  [
    c('kaiju', '解呪の光', '🔆', 'rare', 1, {
      effects: [fx({ id: 'dispel', target: 'enemyPlayer' }), fx({ id: 'shield', value: 2, target: 'self' })],
    }),
    1,
  ],
  [
    c('ono', '処刑人の斧', '🪓', 'rare', 2, {
      effects: [fx({ id: 'execute', value: 8 }), fx({ id: 'draw', value: 1, target: 'self' }), fx({ id: 'shield', value: 1, target: 'self' })],
    }),
    1,
  ],
  [
    c('inori', '癒しの祈り', '🙏', 'rare', 2, {
      effects: [fx({ id: 'heal', value: 3, target: 'self' }), fx({ id: 'damage', value: 5 })],
    }),
    1,
  ],
  [
    c('ikazuchi', '裁きの雷', '⚡', 'rare', 2, {
      effects: [fx({ id: 'damage', value: 2, target: 'enemyAll' }), fx({ id: 'damage', value: 2 })],
    }),
    2,
  ],
  [c('kyojin', '石の巨人', '🗿', 'rare', 3, { stats: stats(6, 12), keywords: [{ id: 'trample' }] }), 2],
  [
    c('taihou', '砦の大砲', '💣', 'epic', 3, {
      effects: [fx({ id: 'damage', value: 2, timing: 'turnStart', target: 'enemyPlayer' }), fx({ id: 'damage', value: 2 })],
    }),
    2,
  ],
  [
    c('senkoku', '王の宣告', '👑', 'legend', 3, {
      effects: [fx({ id: 'damage', value: 4, target: 'enemyAll' }), fx({ id: 'shield', value: 2, target: 'self' })],
    }),
    1,
  ],
  [
    c('chikai', '鉄壁の誓い', '🏯', 'legend', 2, {
      effects: [
        fx({ id: 'damage', value: 1, timing: 'turnStart', target: 'enemyPlayer' }),
        fx({ id: 'shield', value: 2, target: 'self' }),
        fx({ id: 'draw', value: 2, target: 'self' }),
      ],
    }),
    1,
  ],
]);

// ---------------------------------------------------------------- コンボ（引いて、増やして、仕掛けを回す）
const clockwork = preset('clockwork', '歯車仕掛け', 'ドローとエナジーで手数を増やし、「カードを使うたび」の仕掛けで削り切る', [
  [
    c('zenmai', 'ゼンマイ巻き', '🔧', 'common', 1, {
      effects: [fx({ id: 'draw', value: 1, target: 'self' }), fx({ id: 'energy', value: 1, target: 'self' }), fx({ id: 'focus', value: 1, target: 'self' })],
    }),
    1,
  ],
  [
    c('kobito', '歯車の小人', '⚙️', 'common', 1, {
      stats: stats(2, 4),
      effects: [fx({ id: 'damage', value: 1, timing: 'summon' })],
    }),
    6,
  ],
  [c('jouki', '蒸気砲', '💨', 'common', 1, { effects: [fx({ id: 'damage', value: 5 })] }), 10],
  [
    c('sekkeizu', '設計図', '📐', 'common', 1, {
      effects: [fx({ id: 'search', option: 'power', target: 'self' }), fx({ id: 'draw', value: 1, target: 'self' }), fx({ id: 'focus', value: 1, target: 'self' })],
    }),
    1,
  ],
  [c('haguruma', '歯車兵', '🤖', 'common', 2, { stats: stats(5, 6) }), 4],
  [
    c('rensa', '連鎖反応', '🔗', 'rare', 1, {
      effects: [fx({ id: 'damage', value: 3, target: 'enemyMonsters' })],
    }),
    1,
  ],
  [
    c('bougo', '防護歯車', '🛞', 'rare', 2, {
      effects: [fx({ id: 'shield', value: 1, timing: 'cardPlayed', target: 'self' })],
    }),
    2,
  ],
  [
    c('shinzou', '歯車の心臓', '❤️‍🔥', 'epic', 2, {
      effects: [fx({ id: 'damage', value: 1, timing: 'cardPlayed', target: 'enemyPlayer' }), fx({ id: 'damage', value: 2 })],
    }),
    2,
  ],
  [
    c('kakyuu', '過給器', '🔋', 'epic', 1, {
      effects: [fx({ id: 'energy', value: 2, target: 'self' }), fx({ id: 'draw', value: 1, target: 'self' })],
    }),
    1,
  ],
  [
    c('eikyuu', '永久機関', '♾️', 'legend', 3, {
      effects: [fx({ id: 'damage', value: 2, timing: 'cardPlayed', target: 'enemyPlayer' })],
    }),
    1,
  ],
  [
    c('kyoshin', '大時計の巨神', '🕰️', 'legend', 3, {
      stats: stats(6, 10, 1),
      effects: [fx({ id: 'draw', value: 3, timing: 'summon', target: 'self' })],
    }),
    1,
  ],
]);

export const PRESET_DECKS: readonly PresetDeck[] = [poison, beasts, curses, fortress, clockwork];
