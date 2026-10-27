/**
 * 公式カード（ドラフト戦で使うカードの山。決定事項 #116）。数値は倍率1（元の仕様）の大きさで書き、読み込み時に fromBaseScale で倍率を掛ける
 * （プリセットと同じ。決定事項 #65・#67）。倍率1のテストでも作れるよう、数値はすべて倍率1で整数。
 *
 * - 126種類：コモン72・レア32・エピック16・レジェンド6（各色と汎用に1枚。ドラフトの山に1枚ずつで、1人1枚まで：決定事項 #134）
 * - コモンは読みやすく：能力は簡単なもの（キッカー・サイクリング・起動・親和）を1つまで、モードなし（決定事項 #136）
 * - アーキタイプ5つ（毒・獣・呪い・守り・機械）と、どのデッキにも入る汎用のカード
 * - コモンだけで1つのアーキタイプのデッキが組めるように、どのアーキタイプにも序盤のモンスター・除去・勝ち筋・重いカードがある
 * - ID は `official-<slug>`（変えない。保存したデッキ・ドラフトの記録が ID で参照する）
 *
 * エンジンと同じく純粋なデータだけ（DOM・乱数・時刻を使わない）。Edge Function の束にも入る。
 */
import { fromBaseScale } from '../engine/scaling.ts';
import type { AbilityInstance, CardDef, DrawbackInstance, EffectInstance, KeywordInstance, Rarity, TribeId } from '../engine/types.ts';

/** アーキタイプ（ドラフトのときの「色」）。neutral はどのデッキにも入る汎用のカード */
export const OFFICIAL_ARCHETYPE_IDS = ['poison', 'beast', 'curse', 'guard', 'machine', 'neutral'] as const;
export type OfficialArchetype = (typeof OFFICIAL_ARCHETYPE_IDS)[number];

export interface OfficialArchetypeInfo {
  id: OfficialArchetype;
  name: string;
  /** 1行の説明（遊び方） */
  description: string;
}

export const OFFICIAL_ARCHETYPES: readonly OfficialArchetypeInfo[] = [
  { id: 'poison', name: '毒沼', description: '毒をばらまいて時間を味方にし、毒の回った相手を一気に仕留める' },
  { id: 'beast', name: '牙の群れ', description: '獣の種族を並べ、仲間がいるほど強くなる牙で序盤から押し切る' },
  { id: 'curse', name: '血の契約', description: '自分の HP を代償に、相場より強い不死の軍勢と呪文で押し込む' },
  { id: 'guard', name: '白銀の砦', description: '挑発の壁と回復で耐え、除去で盤面を整え、重い騎士で勝ち切る' },
  { id: 'machine', name: '歯車工房', description: '守備力のある硬い機械を並べ、機械の数や使ったカードの枚数で強くなる仕掛けで削る' },
  { id: 'neutral', name: '汎用', description: 'どのデッキにも入る除去・ドロー・効率のよいモンスター' },
];

/** 公式カード1枚と、ドラフト・資料のための付帯情報（カードの中身ではない） */
export interface OfficialEntry {
  card: CardDef;
  archetype: OfficialArchetype;
  /** デッキの中での役割（1行。docs/OFFICIAL_SET.md と同じ。数値は倍率で変わるので書かない） */
  role: string;
}

type StatTuple = readonly [attack: number, hp: number, defense?: number];

interface Spec {
  stats?: StatTuple;
  kw?: KeywordInstance[];
  fx?: EffectInstance[];
  dr?: DrawbackInstance[];
  ab?: AbilityInstance[];
  tribe?: TribeId;
  desc?: string;
}

const fx = (id: string, rest: Partial<EffectInstance> = {}): EffectInstance => ({ id, timing: 'play', target: 'chosen', condition: null, ...rest });
/** 自分に作用する効果（ドロー・シールドなど） */
const me = (id: string, rest: Partial<EffectInstance> = {}): EffectInstance => fx(id, { target: 'self', ...rest });
const kw = (id: string, value?: number): KeywordInstance => (value === undefined ? { id } : { id, value });
const dr = (id: string, timing: DrawbackInstance['timing'], value?: number): DrawbackInstance => (value === undefined ? { id, timing } : { id, timing, value });

function entry(
  archetype: OfficialArchetype,
  slug: string,
  name: string,
  icon: string,
  rarity: Rarity,
  cost: number,
  role: string,
  spec: Spec = {},
): OfficialEntry {
  const card: CardDef = {
    v: 1,
    id: `official-${slug}`,
    name,
    icon,
    rarity,
    cost,
    stats: spec.stats ? { attack: spec.stats[0], hp: spec.stats[1], defense: spec.stats[2] ?? 0 } : null,
    keywords: spec.kw ?? [],
    effects: spec.fx ?? [],
    drawbacks: spec.dr ?? [],
  };
  if (spec.ab) card.abilities = spec.ab;
  if (spec.tribe) card.tribe = spec.tribe;
  if (spec.desc) card.description = spec.desc;
  return { card: fromBaseScale(card), archetype, role };
}

// ================================================================ 毒沼（毒）
const P = (...a: Parameters<typeof entry> extends [unknown, ...infer R] ? R : never) => entry('poison', ...a);

const POISON: OfficialEntry[] = [
  // ---- コモン
  P('numa-mamushi', '沼のマムシ', 'gi:snake', 'common', 1, '攻撃で毒を入れる小さな蛇', {
    stats: [1, 2],
    fx: [fx('poison', { value: 1, timing: 'attack' })],
    tribe: 'beast',
    desc: '小さくても牙は本物。噛まれた者は眠れぬ夜を過ごす',
  }),
  P('doku-houshi', '毒の胞子', 'gi:spotted-mushroom', 'common', 1, '毒を多めに入れる安い呪文。毒デッキの土台', {
    fx: [fx('poison', { value: 3 }), fx('damage', { value: 1 })],
    desc: '沼の底から舞い上がる胞子。吸えば肺から腐る',
  }),
  P('dokunuri-tanken', '毒塗りの短剣', 'gi:curvy-knife', 'common', 1, '毒を入れ、毒の回った相手にはダメージ。コモンの決め手', {
    fx: [fx('poison', { value: 2 }), fx('damage', { value: 5, condition: 'enemyPoisoned' })],
    desc: '刃が浅くても、毒は深く入る',
  }),
  P('kumo-no-ito', '蜘蛛の糸', 'gi:spider-web', 'common', 1, '攻撃力を奪い、毒を入れる', {
    fx: [fx('weaken', { value: 2 }), fx('poison', { value: 2 })],
    desc: '絡め取られた獲物は、もがくほど毒が回る',
  }),
  P('moudoku-kiri', '猛毒の霧', 'gi:poison-cloud', 'common', 2, '相手モンスター全体に毒と、1体にダメージ', {
    fx: [fx('poison', { value: 2, target: 'enemyMonsters' }), fx('damage', { value: 3 })],
    desc: '霧が晴れたとき、立っているのは毒に慣れた者だけ',
  }),
  P('doku-no-ame', '毒の雨', 'gi:acid', 'common', 2, '相手モンスター全体を削り、1体に毒', {
    fx: [fx('damage', { value: 2, target: 'enemyMonsters' }), fx('poison', { value: 3 })],
    desc: '緑の雨が降った翌朝、沼の周りには何も残らない',
  }),
  P('kusare-gaeru', '腐れ沼の蛙', 'gi:frog', 'common', 2, '出たときに毒。倒れると相手に毒を残す中堅', {
    stats: [3, 4],
    fx: [fx('poison', { value: 1, timing: 'summon' }), fx('poison', { value: 2, timing: 'destroyed', target: 'enemyPlayer' })],
    desc: '鳴き声を聞いたら息を止めろ。沼の古い言い伝え',
  }),
  P('oohiru', '沼の大ヒル', 'gi:leeching-worm', 'common', 2, '絆魂の壁。倒れると相手に毒を残す', {
    stats: [3, 6],
    kw: [kw('lifelink')],
    fx: [fx('poison', { value: 1, timing: 'destroyed', target: 'enemyPlayer' })],
    desc: '吸った血の分だけ、ヒルは太る',
  }),
  P('dokutsubo', '毒壺の行商人', 'gi:poison-bottle', 'common', 2, '出たときに多めの毒と、手札の入れ替え', {
    stats: [2, 2],
    fx: [fx('poison', { value: 3, timing: 'summon' }), me('loot', { value: 1, timing: 'summon' })],
    desc: '「よく効く薬だよ。誰に効くかは言わないがね」',
  }),
  P('shouki-numabito', '瘴気の沼人', 'gi:swamp', 'common', 2, '挑発の壁。毎ターン相手に毒を足す', {
    stats: [1, 4],
    kw: [kw('taunt')],
    fx: [fx('poison', { value: 1, timing: 'turnStart', target: 'enemyPlayer' })],
    desc: '沼人の吐く息は、それだけで呪いになる',
  }),
  P('fushoku-doro', '腐蝕の泥', 'gi:acid-blob', 'common', 3, '大きいモンスターを溶かす除去', {
    fx: [fx('wither', { value: 4 }), fx('poison', { value: 1, target: 'enemyAll' }), fx('damage', { value: 1 })],
    desc: '鎧も鱗も、この泥の前では紙と同じ',
  }),
  P('ekibyou', '疫病の運び手', 'gi:plague-doctor-profile', 'common', 4, '相手全体に毒をまき、倒れても毒を残す重いモンスター', {
    stats: [5, 10],
    fx: [fx('poison', { value: 1, timing: 'summon', target: 'enemyAll' }), fx('poison', { value: 2, timing: 'destroyed', target: 'enemyPlayer' })],
    desc: '鳥の嘴の仮面の奥で、医者は笑っている',
  }),
  // ---- レア
  P('hebi-miko', '毒蛇の巫女', 'gi:snake-totem', 'rare', 2, '出たときと殴るたびに毒', {
    stats: [3, 4],
    fx: [fx('poison', { value: 1, timing: 'attack' }), fx('poison', { value: 1, timing: 'summon' })],
    tribe: 'human',
    desc: '蛇神に仕える巫女。祈りの言葉はすべて毒の名前',
  }),
  P('yowarime', '弱り目の一刺し', 'gi:stiletto', 'rare', 1, '毒の回った相手への大ダメージか、毒を入れるかを選ぶ', {
    fx: [fx('damage', { value: 10, condition: 'enemyPoisoned', mode: 1 }), fx('poison', { value: 3, mode: 2 })],
    desc: '毒で弱った相手なら、細い針でも急所に届く',
  }),
  P('doku-myakudou', '毒の脈動', 'gi:heart-beats', 'rare', 1, '毒を入れ、毒の回った相手にはさらに毒を入れる', {
    fx: [fx('poison', { value: 2 }), fx('poison', { value: 3, condition: 'enemyPoisoned' }), me('draw', { value: 1 })],
    desc: '体に回った毒が、心臓の鼓動に合わせて暴れ出す',
  }),
  P('numa-no-saidan', '毒沼の祭壇', 'gi:star-altar', 'rare', 2, '毎ターン相手に毒を足すパワー', {
    fx: [fx('poison', { value: 1, timing: 'turnStart', target: 'enemyPlayer' }), fx('poison', { value: 1 })],
    desc: '沼に沈んだ古い祭壇。今も誰かが供物を捧げている',
  }),
  P('numa-no-nushi', '沼の主', 'gi:sea-serpent', 'rare', 3, '挑発の大きな壁。攻撃と破壊で毒を入れる', {
    stats: [3, 8],
    kw: [kw('taunt')],
    fx: [fx('poison', { value: 1, timing: 'attack' }), fx('poison', { value: 1, timing: 'destroyed', target: 'enemyPlayer' })],
    desc: '沼が濁るのは、主が寝返りを打ったときだという',
  }),
  // ---- エピック
  P('fudoku-ryuu', '腐毒竜', 'gi:spiked-dragon-head', 'epic', 4, '飛ぶ毒竜。出たときに相手モンスター全体へ毒、攻撃でも毒', {
    stats: [5, 10],
    kw: [kw('flying')],
    fx: [fx('poison', { value: 2, timing: 'attack' }), fx('poison', { value: 1, timing: 'summon', target: 'enemyMonsters' })],
    tribe: 'dragon',
    desc: '腐った沼で千年眠った竜。吐く息は緑に濁っている',
  }),
  P('shidoku-senkoku', '死毒の宣告', 'gi:death-note', 'epic', 1, '毒の回った相手への決め手', {
    fx: [fx('damage', { value: 13, condition: 'enemyPoisoned' }), me('draw', { value: 1 })],
    desc: '毒が回ったら、名前を呼ぶだけでいい',
  }),
  P('sendoku-hiyaku', '千毒の秘薬', 'gi:potion-of-madness', 'epic', 2, '毒を入れてから、相手の毒を倍にする', {
    fx: [fx('poison', { value: 4 }), fx('double', { option: 'poison', target: 'self' }), me('draw', { value: 1 })],
    desc: '千の毒を煮詰めた一滴。毒に毒を重ねる禁じ手',
  }),
  // ---- レジェンド（ドラフトの山に1枚。1人1枚まで）
  P('numa-no-joou', '毒沼の魔女王', 'gi:witch-face', 'legend', 4, '毎ターン相手全体に毒を入れる大きな魔女', {
    stats: [5, 11],
    fx: [fx('poison', { value: 1, timing: 'turnStart', target: 'enemyAll' })],
    desc: '沼の底に玉座を構える魔女。その吐息ひとつで、国がひとつ眠りにつく',
  }),
];

// ================================================================ 牙の群れ（獣の種族）
const B = (...a: Parameters<typeof entry> extends [unknown, ...infer R] ? R : never) => entry('beast', ...a);

const BEAST: OfficialEntry[] = [
  // ---- コモン
  B('noinu', '野犬の斥候', 'gi:hound', 'common', 1, '速攻と潜伏の斥候。仲間の獣がいれば、相手に通すたびにドロー', {
    stats: [1, 2],
    kw: [kw('haste'), kw('skulk')],
    fx: [me('draw', { value: 1, timing: 'hitEnemyPlayer', condition: 'tribeAlly' })],
    tribe: 'beast',
    desc: '群れの先を走り、獲物の匂いを仲間に知らせる',
  }),
  B('wakaookami', '群れの若狼', 'gi:wolf-head', 'common', 1, '仲間の獣がいれば出たときに育つ', {
    stats: [2, 3],
    fx: [fx('train', { value: 1, timing: 'summon', target: 'thisMonster', condition: 'tribeAlly' })],
    tribe: 'beast',
    desc: '群れの後ろを走る若い狼。仲間の匂いがすると牙が鋭くなる',
  }),
  B('yamaneko', '茂みの山猫', 'gi:cat', 'common', 1, '隠密の小型。仲間の獣がいれば攻撃が強くなる', {
    stats: [2, 1],
    kw: [kw('stealth')],
    fx: [fx('pump', { value: 1, timing: 'attack', target: 'thisMonster', condition: 'tribeAlly' })],
    tribe: 'beast',
    desc: '茂みの影から、音もなく飛びかかる',
  }),
  B('emono-chouyaku', '獲物への跳躍', 'gi:sprint', 'common', 1, '自分の獣で相手モンスターを狩る除去', {
    fx: [fx('pump', { value: 4 }), fx('fight')],
    desc: '狙いを定めたら、ためらわずに跳べ',
  }),
  B('surudoi-tsume', '鋭い爪', 'gi:claw-slashes', 'common', 1, 'ダメージと味方の強化を1枚で', {
    fx: [fx('damage', { value: 4 }), fx('attackUp', { value: 1 })],
    desc: '爪の一閃は、獣の誇りそのもの',
  }),
  B('tooboe', '遠吠え', 'gi:wolf-howl', 'common', 1, 'このターン自分のモンスター全体の攻撃力を上げる一斉攻撃の決め手。傷も少し癒す', {
    fx: [fx('pump', { value: 3, target: 'allyMonsters' }), fx('repair', { value: 1, target: 'allyMonsters' }), me('draw', { value: 1 })],
    desc: '一匹が吠えれば、群れのすべてが応える',
  }),
  B('oozuno', '大角の雄鹿', 'gi:deer', 'common', 2, '貫通の雄鹿。仲間の獣がいれば攻撃で大きく一時強化', {
    stats: [3, 6],
    kw: [kw('trample')],
    fx: [fx('pump', { value: 2, timing: 'attack', target: 'thisMonster', condition: 'tribeAlly' })],
    tribe: 'beast',
    desc: '大きな角で、盾の列ごと押し倒す',
  }),
  B('mureookami', '群れ狼', 'gi:direwolf', 'common', 2, '速攻と、仲間の小鬼を連れてくる序盤の数', {
    stats: [3, 4],
    kw: [kw('haste')],
    fx: [me('token', { value: 1, hits: 1, timing: 'summon' })],
    tribe: 'beast',
    desc: '群れで駆ければ、どんな獲物も逃げきれない',
  }),
  B('arashi-washi', '嵐の鷲', 'gi:eagle-head', 'common', 2, '飛行の鷲。仲間の獣がいれば出たときにダメージ', {
    stats: [3, 5],
    kw: [kw('flying')],
    fx: [fx('damage', { value: 2, timing: 'summon', condition: 'tribeAlly' })],
    tribe: 'beast',
    desc: '嵐の日にだけ高く舞う鷲。雷よりも先に獲物を見つける',
  }),
  B('kariudo-tsunobue', '狩人の角笛', 'gi:hunting-horn', 'common', 2, '山札から獣を1枚探し、味方を強化', {
    fx: [me('search', { option: 'tribe' }), fx('attackUp', { value: 4 }), me('draw', { value: 1 })],
    tribe: 'beast',
    desc: '角笛の音を聞いた獣は、どこからでも駆けつける',
  }),
  B('mori-no-ooguma', '森の大熊', 'gi:bear-head', 'common', 2, 'ダメージを受けるたびに攻撃力が上がる壁', {
    stats: [3, 7],
    fx: [fx('attackUp', { value: 1, timing: 'damaged', target: 'thisMonster' })],
    tribe: 'beast',
    desc: '冬眠明けの大熊ほど、森で恐ろしいものはない',
  }),
  B('abare-mammoth', '暴れマンモス', 'gi:mammoth', 'common', 4, '貫通と対空の大型。仲間の獣がいれば出たときに相手モンスター全体を削る', {
    stats: [6, 9],
    kw: [kw('trample'), kw('reach')],
    fx: [fx('damage', { value: 3, timing: 'summon', target: 'enemyMonsters', condition: 'tribeAlly' })],
    tribe: 'beast',
    desc: '凍った大地を揺らして進む。止めたければ山を動かせ',
  }),
  // ---- レア
  B('haiiro-osa', '灰色狼の長', 'gi:werewolf', 'rare', 3, '激励と貫通。群れ全体を強くする', {
    stats: [5, 11],
    kw: [kw('inspire', 1), kw('trample')],
    tribe: 'beast',
    desc: '長の遠吠えが響く夜、群れは一匹残らず牙をむく',
  }),
  B('shippuu-hyou', '疾風の豹', 'gi:saber-toothed-cat-head', 'rare', 2, '速攻と先制攻撃。仲間の獣がいれば攻撃で一時強化', {
    stats: [3, 5],
    kw: [kw('haste'), kw('firstStrike')],
    fx: [fx('pump', { value: 1, timing: 'attack', target: 'thisMonster', condition: 'tribeAlly' })],
    tribe: 'beast',
    desc: '見えたときには、もう喉元にいる',
  }),
  B('kemono-kettou', '獣の血統', 'gi:paw-heart', 'rare', 2, '獣が多いほど大きく鍛え、2枚引く', {
    fx: [fx('train', { value: 2, mods: ['perTribeAlly'] }), me('draw', { value: 2 })],
    tribe: 'beast',
    desc: '血は群れの中で受け継がれる',
  }),
  B('nawabari', '縄張りの番獣', 'gi:boar', 'rare', 2, '挑発の番獣。仲間が倒れるたびに攻撃力が上がる', {
    stats: [2, 6],
    kw: [kw('taunt')],
    fx: [fx('attackUp', { value: 1, timing: 'allyDestroyed', target: 'thisMonster' })],
    tribe: 'beast',
    desc: '縄張りに入った者は、まずこの牙と話をつけることになる',
  }),
  B('shuryou-honnou', '狩猟本能', 'gi:fangs', 'rare', 1, '格闘で狩り、1枚引く', {
    fx: [fx('pump', { value: 2 }), fx('fight'), me('draw', { value: 1 })],
    ab: [{ id: 'cycling' }],
    desc: '考えるより先に体が動く。それが狩りの才能',
  }),
  // ---- エピック
  B('hyakujuu-ou', '百獣の王', 'gi:lion', 'epic', 4, '貫通と激励の王。仲間の獣がいれば出たときにダメージ', {
    stats: [7, 13],
    kw: [kw('trample'), kw('inspire', 1)],
    fx: [fx('damage', { value: 3, timing: 'summon', condition: 'tribeAlly' })],
    tribe: 'beast',
    desc: '王が吠えると、草原から音が消える',
  }),
  B('daigourei', '群れの大号令', 'gi:rally-the-troops', 'epic', 2, '獣全体の攻撃力を上げ、このターンはさらに上げる', {
    fx: [fx('attackUp', { value: 2, target: 'tribeAllies' }), fx('pump', { value: 3, target: 'tribeAllies' }), me('draw', { value: 2 })],
    tribe: 'beast',
    desc: '王の一声で、群れはひとつの獣になる',
  }),
  B('soutou-maro', '双頭の魔狼', 'gi:double-face-mask', 'epic', 3, '二回攻撃の魔狼。攻撃のたびにランダムな相手にダメージ', {
    stats: [3, 10],
    kw: [kw('doubleAttack')],
    fx: [fx('damage', { value: 1, timing: 'attack', target: 'random' })],
    tribe: 'beast',
    desc: '片方の頭が眠っても、もう片方が見張っている',
  }),
  // ---- レジェンド（ドラフトの山に1枚。1人1枚まで）
  B('hyakujuu-sorei', '百獣の祖霊', 'gi:beast-eye', 'legend', 5, '貫通と強い激励。出たときに小鬼を連れてくる', {
    stats: [7, 14],
    kw: [kw('trample'), kw('inspire', 2)],
    fx: [me('token', { value: 2, hits: 2, timing: 'summon' })],
    tribe: 'beast',
    desc: 'すべての獣の祖とされる霊。その眼に見つめられた獣は、牙を研ぎ直す',
  }),
];

// ================================================================ 血の契約（呪い・不死）
// 呪いカード（デメリットのあるカード）は、デメリットの合計がレアリティ上限以上で、上限まで予算が増える（決定事項 #64）
const C = (...a: Parameters<typeof entry> extends [unknown, ...infer R] ? R : never) => entry('curse', ...a);

const CURSE: OfficialEntry[] = [
  // ---- コモン
  C('hone-ryouken', '骨の猟犬', 'gi:bone-gnawer', 'common', 1, 'HP を払って出す安い攻め手。倒れると相手にダメージ', {
    stats: [3, 4],
    fx: [fx('damage', { value: 2, timing: 'destroyed', target: 'enemyPlayer' })],
    dr: [dr('selfDamage', 'summon', 5)],
    tribe: 'undead',
    desc: '主人の血を一滴なめさせれば、どこまでも追いかける',
  }),
  C('hakamori', '墓守りの亡者', 'gi:shambling-zombie', 'common', 1, '仲間が倒れるたびに育つ墓守。維持費あり', {
    stats: [2, 5],
    fx: [fx('train', { value: 1, timing: 'allyDestroyed', target: 'thisMonster' })],
    dr: [dr('upkeep', null)],
    tribe: 'undead',
    desc: '墓の番をするうちに、自分も墓の住人になった',
  }),
  C('gaikotsu-hei', '骸骨の兵', 'gi:skeleton', 'common', 1, '不屈の骸骨。HP が少ないと出たときに攻撃力が上がる', {
    stats: [1, 3],
    kw: [kw('undying')],
    fx: [fx('attackUp', { value: 2, timing: 'summon', target: 'thisMonster', condition: 'lowHp' })],
    tribe: 'undead',
    desc: '砕いても砕いても、骨は立ち上がる',
  }),
  C('senketsu-tanken', '鮮血の短剣', 'gi:bloody-sword', 'common', 1, '自傷と引き換えにダメージと1枚ドロー', {
    fx: [fx('damage', { value: 5 }), me('draw', { value: 1 })],
    dr: [dr('selfDamage', 'play', 4)],
    desc: '振るう者の血も吸う刃。だから切れ味が落ちない',
  }),
  C('daishou-hirameki', '代償の閃き', 'gi:brain-tentacle', 'common', 1, '自傷と引き換えにエナジーと1枚', {
    fx: [me('energy', { value: 2 }), me('draw', { value: 1 })],
    dr: [dr('selfDamage', 'play', 5)],
    desc: '頭の奥で何かがちぎれる音。そのかわり、すべてが見える',
  }),
  C('kyuuketsu-kiba', '吸血の牙', 'gi:vampire-dracula', 'common', 2, '吸収のダメージ。HP が少ないとさらにダメージ', {
    fx: [fx('damage', { value: 5, mods: ['drain'] }), fx('damage', { value: 5, condition: 'lowHp' })],
    dr: [dr('selfDamage', 'play', 4)],
    desc: '奪った血は、払った血の埋め合わせになる',
  }),
  C('sasayaku-shiryou', '囁く死霊', 'gi:spectre', 'common', 2, '隠密の死霊。出たときにダメージ', {
    stats: [3, 6],
    kw: [kw('stealth')],
    fx: [fx('damage', { value: 2, timing: 'summon' })],
    dr: [dr('selfDamage', 'summon', 5)],
    tribe: 'undead',
    desc: '耳元の囁きを聞いた者は、少しずつ命を抜かれていく',
  }),
  C('shokushi-ghoul', '屍食いのグール', 'gi:ghost', 'common', 2, '仲間が倒れるたびに育つ大食らい', {
    stats: [5, 6],
    fx: [fx('train', { value: 1, timing: 'allyDestroyed', target: 'thisMonster' })],
    dr: [dr('selfDamage', 'summon', 5)],
    tribe: 'undead',
    desc: '飢えたグールは、敵も味方も区別しない',
  }),
  C('kusare-shouki', '腐れた瘴気', 'gi:poison-gas', 'common', 2, '相手モンスター全体を少し削り、1体を大きく削る。自傷が代償', {
    fx: [fx('damage', { value: 2, target: 'enemyMonsters' }), fx('damage', { value: 6 })],
    dr: [dr('selfDamage', 'play', 5)],
    desc: '吸い込んだ者の肺を腐らせる霧。使い手も無事では済まない',
  }),
  C('tamashii-kari', '魂刈り', 'gi:scythe', 'common', 2, '中くらいまでのモンスターを処刑し、1枚引く', {
    fx: [fx('execute', { value: 10 }), me('draw', { value: 1 })],
    dr: [dr('selfDamage', 'play', 4)],
    desc: '鎌は命の長さを測らない。ただ刈るだけ',
  }),
  C('chisui-yoroi', '血吸いの鎧', 'gi:black-knight-helm', 'common', 2, '絆魂・挑発・守備力の鎧。維持費あり', {
    stats: [3, 4, 1],
    kw: [kw('lifelink'), kw('taunt')],
    dr: [dr('upkeep', null), dr('selfDamage', 'summon', 3)],
    tribe: 'undead',
    desc: '中身はとうに空っぽ。それでも鎧は血を欲しがる',
  }),
  C('meifu-kyojin', '冥府の巨人', 'gi:giant', 'common', 4, '出たときにダメージ。倒れても小鬼を残す重い巨人', {
    stats: [7, 12],
    fx: [fx('damage', { value: 3, timing: 'summon' }), me('token', { value: 2, hits: 1, timing: 'destroyed' })],
    dr: [dr('selfDamage', 'summon', 5)],
    tribe: 'undead',
    desc: '冥府の門を背負って歩く巨人。一歩ごとに地面が裂ける',
  }),
  // ---- レア
  C('kyuuketsu-kizoku', '吸血鬼の貴族', 'gi:female-vampire', 'rare', 3, '絆魂の貴族。出たときに吸い取る', {
    stats: [5, 7],
    kw: [kw('lifelink')],
    fx: [fx('damage', { value: 2, timing: 'summon', mods: ['drain'] })],
    tribe: 'undead',
    desc: '晩餐に招かれたら、帰りの心配はしなくていい',
  }),
  C('chimamire', '血塗れの処刑人', 'gi:executioner-hood', 'rare', 2, '速攻と接死の狂戦士。維持費あり', {
    stats: [4, 6],
    kw: [kw('haste'), kw('deathtouch')],
    dr: [dr('upkeep', null), dr('selfDamage', 'summon', 2)],
    tribe: 'undead',
    desc: '首を落とすたびに、自分の首も少し軽くなる気がする',
  }),
  C('chi-no-meiyaku', '血の盟約', 'gi:drop', 'rare', 2, '毎ターン相手を焼くパワー。HP が少ないと強くなる', {
    fx: [fx('damage', { value: 1, timing: 'turnStart', target: 'enemyPlayer' }), fx('damage', { value: 2, timing: 'turnStart', target: 'enemyPlayer', condition: 'lowHp' })],
    dr: [dr('selfDamage', 'turnStart', 1)],
    desc: '交わした血は、どちらかが尽きるまで流れ続ける',
  }),
  C('hone-ryuu', '骨の竜', 'gi:dinosaur-bones', 'rare', 3, '飛行と不屈の骨の竜。出たときにダメージ', {
    stats: [5, 11],
    kw: [kw('flying'), kw('undying')],
    fx: [fx('damage', { value: 2, timing: 'summon' })],
    dr: [dr('upkeep', null), dr('selfDamage', 'summon', 6)],
    tribe: 'undead',
    desc: '肉が朽ちても竜は竜。骨の翼でも空は飛べる',
  }),
  C('nageki-bourei', '嘆きの亡霊', 'gi:haunting', 'rare', 1, '倒れると相手にダメージとドロー', {
    stats: [2, 1],
    fx: [fx('damage', { value: 3, timing: 'destroyed', target: 'enemyPlayer' }), me('draw', { value: 1, timing: 'destroyed' })],
    tribe: 'undead',
    desc: '消える間際の嘆きは、聞いた者の耳から離れない',
  }),
  // ---- エピック
  C('shikabane-ou', '屍の王', 'gi:crowned-skull', 'epic', 3, '出たときに相手モンスター全体を削り、仲間が倒れるたびに小鬼を出す', {
    stats: [4, 8],
    fx: [fx('damage', { value: 2, timing: 'summon', target: 'enemyMonsters' }), me('token', { value: 1, hits: 1, timing: 'allyDestroyed' })],
    tribe: 'undead',
    desc: '王が目覚めると、生者の兵はみな膝をつく',
  }),
  C('chi-no-ame', '血の雨', 'gi:bleeding-wound', 'epic', 2, '相手全体を削る。HP が少ないとさらに削る', {
    fx: [fx('damage', { value: 3, target: 'enemyAll' }), fx('damage', { value: 2, target: 'enemyAll', condition: 'lowHp' })],
    dr: [dr('selfDamage', 'play', 6), dr('gift', 'play')],
    desc: '空が赤く染まるとき、敵も味方も血を流す',
  }),
  C('akuma-sasayaki', '悪魔の囁き', 'gi:devil-mask', 'epic', 1, 'エナジーとダメージ。次のターンが苦しい', {
    fx: [me('energy', { value: 2 }), fx('damage', { value: 6 })],
    dr: [dr('recoil', 'play'), dr('selfDamage', 'play', 3)],
    desc: '「今だけ力を貸そう。返済は明日でいい」',
  }),
  // ---- レジェンド（ドラフトの山に1枚。1人1枚まで）
  C('fushi-no-ou', '不死の王', 'gi:death-skull', 'legend', 4, '絆魂と不屈。小鬼を連れ、仲間が倒れるたびに相手から吸い取る', {
    stats: [5, 9],
    kw: [kw('lifelink'), kw('undying')],
    fx: [me('token', { value: 1, hits: 2, timing: 'summon' }), fx('damage', { value: 2, timing: 'allyDestroyed', target: 'enemyPlayer', mods: ['drain'] })],
    tribe: 'undead',
    desc: '死を三度退けた王。家臣が倒れるたび、その命を己の糧にする',
  }),
];

// ================================================================ 白銀の砦（守り・人）
const G = (...a: Parameters<typeof entry> extends [unknown, ...infer R] ? R : never) => entry('guard', ...a);

const GUARD: OfficialEntry[] = [
  // ---- コモン
  G('yari-eihei', '槍の衛兵', 'gi:spear-hook', 'common', 1, '対空の槍兵。序盤の壁', {
    stats: [2, 4],
    kw: [kw('reach')],
    tribe: 'human',
    desc: '槍を構えて一歩も引かない。それが衛兵の仕事',
  }),
  G('tateuchi', '盾打ち', 'gi:shield-bash', 'common', 1, 'ダメージと味方の手当て', {
    fx: [fx('damage', { value: 4 }), fx('repair', { value: 3 })],
    desc: '盾は守るためだけのものではない',
  }),
  G('kiyome-hikari', '清めの光', 'gi:sun-radiations', 'common', 1, '回復しながらダメージ', {
    fx: [me('heal', { value: 2 }), fx('damage', { value: 2 })],
    desc: '穢れを焼き、傷を癒す。光はいつも二つの顔を持つ',
  }),
  G('jomon-eihei', '城門の衛兵', 'gi:guards', 'common', 2, '挑発の門番。ターン終了時に自分を修理', {
    stats: [2, 6],
    kw: [kw('taunt')],
    fx: [fx('repair', { value: 1, timing: 'turnEnd', target: 'thisMonster' })],
    tribe: 'human',
    desc: '門の前に立つことが、彼の誇りだ',
  }),
  G('iyashite', '村の癒し手', 'gi:healing', 'common', 2, '絆魂の癒し手。出たときに回復し、ターン終了時に仲間を修理', {
    stats: [2, 3],
    kw: [kw('lifelink')],
    fx: [me('heal', { value: 2, timing: 'summon' }), fx('repair', { value: 1, timing: 'turnEnd', target: 'allyMonsters' })],
    tribe: 'human',
    desc: '村にひとりはいる、頼りになる薬師',
  }),
  G('jouheki-yumi', '城壁の弓兵', 'gi:bowman', 'common', 2, '対空の弓兵。回復したターンなら出たときのダメージが増える', {
    stats: [3, 4],
    kw: [kw('reach')],
    fx: [fx('damage', { value: 2, timing: 'summon' }), fx('damage', { value: 1, timing: 'summon', condition: 'healedThisTurn' })],
    tribe: 'human',
    desc: '城壁の上から、近づく敵を一人ずつ射抜く',
  }),
  G('kishi-chikai', '騎士の誓い', 'gi:sword-altar', 'common', 2, '味方1体を鍛えて守備力を上げ、回復もする', {
    fx: [fx('train', { value: 2 }), fx('defenseUp', { value: 1 }), me('heal', { value: 3 })],
    desc: '剣に誓いを立てた者は、仲間の盾となる',
  }),
  G('kishi-totsugeki', '騎士の突撃', 'gi:thrown-spear', 'common', 2, 'ダメージの除去とシールド', {
    fx: [fx('damage', { value: 6 }), me('shield', { value: 2 })],
    desc: '馬上の槍は、城壁さえ貫く',
  }),
  G('juusou-hohei', '重装歩兵', 'gi:closed-barbute', 'common', 2, '守備力の高い歩兵。出たときに仲間の守備力を上げる', {
    stats: [2, 7, 1],
    fx: [fx('defenseUp', { value: 1, timing: 'summon' })],
    tribe: 'human',
    desc: '重い鎧で一歩も動かない。それが一番の仕事',
  }),
  G('rouren-kishi', '老練の騎士', 'gi:mounted-knight', 'common', 3, '先制攻撃の騎士。出たときに少し回復', {
    stats: [6, 8],
    kw: [kw('firstStrike')],
    fx: [me('heal', { value: 1, timing: 'summon' })],
    tribe: 'human',
    desc: '傷の数だけ、守り方を知っている',
  }),
  G('ishi-no-bannin', '石の番人', 'gi:stone-tower', 'common', 3, '自己修復する挑発の壁', {
    stats: [3, 12],
    kw: [kw('taunt'), kw('selfRepair', 1)],
    desc: '城の門に据えられた石像。動き出すのは敵が来たときだけ',
  }),
  G('kishidanchou', '城塞の大盾兵', 'gi:knight-banner', 'common', 4, '挑発と対空の大きな壁。白銀の砦の終盤を支える', {
    stats: [7, 13],
    kw: [kw('taunt'), kw('reach')],
    tribe: 'human',
    desc: '大盾の列が立つ限り、砦は落ちない',
  }),
  // ---- レア
  G('seijun-kishi', '聖盾の騎士', 'gi:shield-reflect', 'rare', 2, '聖盾と挑発。一度は必ず耐える', {
    stats: [3, 5],
    kw: [kw('divineShield'), kw('taunt')],
    tribe: 'human',
    desc: '女神の祝福を受けた盾は、最初の一撃を必ず防ぐ',
  }),
  G('iyashi-seidou', '癒しの聖堂', 'gi:church', 'rare', 2, '毎ターン味方のモンスター全体の傷を癒すパワー。置いたときに HP も回復', {
    fx: [fx('repair', { value: 2, timing: 'turnStart', target: 'allyMonsters' }), me('heal', { value: 1 })],
    desc: '鐘が鳴るたび、人々は少しだけ元気になる',
  }),
  G('shinpan-tettsui', '審判の鉄槌', 'gi:thor-hammer', 'rare', 3, '大きめのモンスターまで処刑し、シールド', {
    fx: [fx('execute', { value: 13 }), me('shield', { value: 2 })],
    desc: '罪の重さは、鉄槌が量ってくれる',
  }),
  G('seikou-nami', '聖光の波', 'gi:sunbeams', 'rare', 1, '相手モンスター全体へのダメージか、回復とドローかを選ぶ', {
    fx: [fx('damage', { value: 2, target: 'enemyMonsters', mode: 1 }), me('heal', { value: 2, mode: 2 }), me('draw', { value: 1, mode: 2 })],
    desc: '光の波が城壁を越えて広がり、押し寄せる影を洗い流す',
  }),
  G('hakugin-kyozou', '白銀の巨像', 'gi:stone-bust', 'rare', 3, '挑発・聖盾・守備力の巨像', {
    stats: [3, 10, 1],
    kw: [kw('taunt'), kw('divineShield')],
    desc: '白銀で鋳られた巨像。刃は鈍り、矢は弾かれる',
  }),
  // ---- エピック
  G('akatsuki-seikishi', '暁の聖騎士', 'gi:templar-shield', 'epic', 4, '挑発と絆魂。殴り合うほど回復する', {
    stats: [6, 11, 1],
    kw: [kw('taunt'), kw('lifelink')],
    fx: [me('heal', { value: 1, timing: 'summon' })],
    tribe: 'human',
    desc: '夜明けとともに現れ、闇が退くまで剣を振るう',
  }),
  G('megami-kago', '女神の加護', 'gi:angel-wings', 'epic', 2, '味方のモンスター全体に聖盾を与え、シールドと回復', {
    fx: [fx('grantKeyword', { option: 'divineShield', target: 'allyMonsters' }), me('shield', { value: 4 }), me('heal', { value: 2 })],
    desc: '女神の翼が広がると、どんな刃も届かない',
  }),
  G('sabaki-seikou', '裁きの聖光', 'gi:sun', 'epic', 3, '毎ターン相手のだれか1体にダメージのパワー。置いたときも1体にダメージ', {
    fx: [fx('damage', { value: 3, timing: 'turnStart', target: 'random' }), fx('damage', { value: 3 })],
    desc: '太陽が昇るたび、罪ある者の影が焼かれる',
  }),
  // ---- レジェンド（ドラフトの山に1枚。1人1枚まで）
  G('hakugin-seijo', '白銀の聖女', 'gi:angel-outfit', 'legend', 4, '挑発の聖女。出たときに仲間全体へ聖盾、毎ターン仲間を修理', {
    stats: [4, 12, 1],
    kw: [kw('taunt')],
    fx: [fx('grantKeyword', { timing: 'summon', target: 'allyMonsters', option: 'divineShield' }), fx('repair', { value: 2, timing: 'turnEnd', target: 'allyMonsters' })],
    tribe: 'human',
    desc: '彼女が祈れば、砦の兵はひとたびだけ死をはね返す',
  }),
];

// ================================================================ 歯車工房（機械・コンボ）
const M = (...a: Parameters<typeof entry> extends [unknown, ...infer R] ? R : never) => entry('machine', ...a);

const MACHINE: OfficialEntry[] = [
  // ---- コモン
  M('zenmai-hei', 'ぜんまい兵', 'gi:vintage-robot', 'common', 1, '占術で山札を整える。機械の仲間がいれば倒れてドロー', {
    stats: [2, 2],
    fx: [me('scry', { value: 2, timing: 'summon' }), me('draw', { value: 1, timing: 'destroyed', condition: 'tribeAlly' })],
    tribe: 'machine',
    desc: 'ねじを巻けば動き出し、ついでに伝令も運ぶ',
  }),
  M('koukaku-hei', '鋼殻の兵', 'gi:robot-helmet', 'common', 1, '仲間が出るたびに守備力が上がる', {
    stats: [1, 1, 1],
    fx: [fx('defenseUp', { value: 1, timing: 'allySummoned', target: 'thisMonster' })],
    tribe: 'machine',
    desc: '鉄板を何枚も重ねた兵。小石くらいなら気づきもしない',
  }),
  M('teisatsu-drone', '偵察のからくり鳥', 'gi:delivery-drone', 'common', 1, '飛行の偵察。占術と、機械の仲間がいればドロー', {
    stats: [1, 2],
    kw: [kw('flying')],
    fx: [me('scry', { value: 2, timing: 'summon' }), me('draw', { value: 1, timing: 'summon', condition: 'tribeAlly' })],
    tribe: 'machine',
    desc: '空の上から戦場をのぞく、工房の小さな目',
  }),
  M('hibana-rensa', '火花の連鎖', 'gi:sparkles', 'common', 1, 'このターン使ったカードが多いほど痛い', {
    fx: [fx('damage', { value: 2, mods: ['perCardPlayed'] }), me('draw', { value: 1 })],
    desc: '歯車が噛み合うたび、火花はひとつ大きくなる',
  }),
  M('haguruma-kyoumei', '歯車の共鳴', 'gi:cog', 'common', 2, '機械の数だけダメージが増える。占術つき', {
    fx: [fx('damage', { value: 3, mods: ['perTribeAlly'] }), me('draw', { value: 1, condition: 'tribeAlly' }), me('scry', { value: 2 })],
    tribe: 'machine',
    desc: '一つの歯車が鳴れば、工房じゅうの歯車が共に鳴る',
  }),
  M('jouki-cannon', '蒸気キャノン', 'gi:cannon', 'common', 2, '1体への除去と、相手モンスター全体への小さな散弾', {
    fx: [fx('damage', { value: 6 }), fx('damage', { value: 1, target: 'enemyMonsters' })],
    desc: '蒸気の圧で鉄の玉を飛ばす。うるさいが、よく当たる',
  }),
  M('tekkou-hakobi', '鉄甲の運び車', 'gi:steam-locomotive', 'common', 2, '出たときに機械全体を鍛える', {
    stats: [2, 4, 1],
    fx: [fx('train', { value: 1, timing: 'summon', target: 'tribeAllies' })],
    tribe: 'machine',
    desc: '荷台に積むのは石炭か、兵か、大砲か',
  }),
  M('hagane-banken', '鋼の番犬', 'gi:robot-golem', 'common', 2, '挑発の番犬。ダメージを受けるたびにランダムな相手を撃つ', {
    stats: [2, 3],
    kw: [kw('taunt')],
    fx: [fx('damage', { value: 2, timing: 'damaged', target: 'random' })],
    tribe: 'machine',
    desc: '鋼の牙の番犬。吠えないが、決して通さない',
  }),
  M('minarai-gishi', 'からくりの助手', 'gi:mechanic-garage', 'common', 2, '次のカードを安くし、機械の仲間がいればドロー', {
    stats: [3, 4],
    fx: [me('discount', { timing: 'summon' }), me('draw', { value: 1, timing: 'summon', condition: 'tribeAlly' })],
    tribe: 'machine',
    desc: '技師が作った小さな助手。次の仕事の段取りは任せておけ',
  }),
  M('jidou-houtou', '自動砲塔', 'gi:sentry-gun', 'common', 2, 'エナジーを払って毎ターン撃てる砲塔', {
    stats: [2, 3],
    fx: [fx('damage', { value: 2, timing: 'activated' })],
    ab: [{ id: 'activate', value: 1 }],
    tribe: 'machine',
    desc: '狙いはいい加減。でも休まず撃ち続ける',
  }),
  M('haguruma-kyohei', '歯車の巨兵', 'gi:battle-mech', 'common', 3, '親和で軽くなる大型', {
    stats: [6, 9],
    ab: [{ id: 'affinity' }],
    tribe: 'machine',
    desc: '歩くたびに歯車が鳴る。その音が近づいてきたら逃げろ',
  }),
  M('tetsu-oogumo', '鉄の大蜘蛛', 'gi:spider-bot', 'common', 4, '対空の大蜘蛛。出たときに相手モンスター全体を少し削る', {
    stats: [7, 12, 1],
    kw: [kw('reach')],
    fx: [fx('damage', { value: 1, timing: 'summon', target: 'enemyMonsters' })],
    tribe: 'machine',
    desc: '八本の脚が床を叩く音は、まるで時計の秒針',
  }),
  // ---- レア
  M('shikikan', '歯車の指揮官', 'gi:tracked-robot', 'rare', 3, '激励と、機械全体の守備力を上げる指揮官', {
    stats: [3, 8, 1],
    kw: [kw('inspire', 1)],
    fx: [fx('defenseUp', { value: 1, timing: 'summon', target: 'tribeAllies' })],
    tribe: 'machine',
    desc: '号令ひとつで、すべての歯車が同じ向きに回り出す',
  }),
  M('kikai-ryuu', '機械仕掛けの竜', 'gi:dragon-head', 'rare', 4, '飛行の機械竜。攻撃のたびにランダムな相手にダメージ', {
    stats: [7, 11, 1],
    kw: [kw('flying')],
    fx: [fx('damage', { value: 2, timing: 'attack', target: 'random' })],
    tribe: 'machine',
    desc: '本物の竜を見た職人が、一生をかけて作った',
  }),
  M('ryousan-golem', '量産型ゴーレム', 'gi:robot-grab', 'rare', 2, '守備力つきの量産型。倒れても小鬼を残す', {
    stats: [4, 5, 1],
    fx: [me('token', { value: 1, hits: 1, timing: 'destroyed' })],
    tribe: 'machine',
    desc: '同じ型の仲間の装甲を、一体ずつ締め直していく',
  }),
  M('rensha-hou', '連射砲', 'gi:minigun', 'rare', 1, 'このターン使ったカードの数でダメージが増え、手札に戻る', {
    fx: [fx('damage', { value: 2, mods: ['perCardPlayed'] })],
    ab: [{ id: 'buyback' }],
    desc: '撃てば撃つほど銃身が熱くなる',
  }),
  M('jiritsu-golem', '自律型ゴーレム', 'gi:robot-antennas', 'rare', 3, '起動：エナジー1でダメージ', {
    stats: [4, 9],
    fx: [fx('damage', { value: 2, timing: 'activated' })],
    ab: [{ id: 'activate', value: 1 }],
    tribe: 'machine',
    desc: '命令がなくても動く。命令があればもっと動く',
  }),
  // ---- エピック
  M('kishin', '大歯車の機神', 'gi:mecha-head', 'epic', 4, '飛行の機神。出たときに相手モンスター全体を削る', {
    stats: [6, 12, 1],
    kw: [kw('flying')],
    fx: [fx('damage', { value: 2, timing: 'summon', target: 'enemyMonsters' })],
    tribe: 'machine',
    desc: '工房のすべての歯車は、この機神を動かすためにあった',
  }),
  M('sensha', '鋼鉄の戦車', 'gi:battle-tank', 'epic', 3, '貫通と守備力の戦車。相手に通すたびにドロー', {
    stats: [5, 8, 2],
    kw: [kw('trample')],
    fx: [me('draw', { value: 1, timing: 'hitEnemyPlayer' })],
    tribe: 'machine',
    desc: '工房の最高傑作。小さな刃は装甲に触れることさえできない',
  }),
  M('kajou-shutsuryoku', '過剰出力', 'gi:electric', 'epic', 2, 'このターン使ったカードが多いほど相手モンスター全体を焼き、エナジーを返す', {
    fx: [fx('damage', { value: 2, target: 'enemyMonsters', mods: ['perCardPlayed'] }), me('energy', { value: 1 })],
    desc: '安全弁を外せば、もう一段上がる',
  }),
  // ---- レジェンド（ドラフトの山に1枚。1人1枚まで）
  M('dai-koushou', '歯車の大工匠', 'gi:gear-hammer', 'legend', 4, '親和で軽くなり、エナジーを払うたびに機械全体を鍛える', {
    stats: [4, 9, 1],
    kw: [kw('inspire', 1)],
    fx: [fx('train', { value: 1, timing: 'activated', target: 'tribeAllies' })],
    ab: [{ id: 'activate', value: 1 }, { id: 'affinity' }],
    tribe: 'machine',
    desc: '工房の歯車はすべて彼の手で刻まれた。今日もまた一体、新しい兵が目を覚ます',
  }),
];

// ================================================================ 汎用
const N = (...a: Parameters<typeof entry> extends [unknown, ...infer R] ? R : never) => entry('neutral', ...a);

const NEUTRAL: OfficialEntry[] = [
  // ---- コモン
  N('hiya', '火矢', 'gi:flaming-arrow', 'common', 1, '安い除去。キッカーを払うとダメージが増える', {
    fx: [fx('damage', { value: 4 }), fx('damage', { value: 1, condition: 'kicked' })],
    ab: [{ id: 'kicker', value: 1 }],
    desc: '油を染ませた矢じりに火をつける。古くて確かな手',
  }),
  N('raigeki', '雷撃', 'gi:lightning-arc', 'common', 2, '大きめの除去。要らなければサイクリングで引き直す', {
    fx: [fx('damage', { value: 7 }), me('scry', { value: 1 })],
    ab: [{ id: 'cycling' }],
    desc: '空が光ったときには、もう遅い',
  }),
  N('yakusou', '薬草の束', 'gi:herbs-bundle', 'common', 1, '回復とシールド', {
    fx: [me('heal', { value: 2 }), me('shield', { value: 2 })],
    desc: '旅人の荷物には、いつも一束入っている',
  }),
  N('tabi-youhei', '旅の傭兵', 'gi:swordman', 'common', 1, 'プレイヤーを殴るときに強い序盤の傭兵', {
    stats: [2, 4],
    kw: [kw('onslaught', 1)],
    tribe: 'human',
    desc: '金さえ払えば、どの旗の下でも戦う',
  }),
  N('rurou-kenshi', '流浪の剣士', 'gi:swordwoman', 'common', 2, '武士道で、モンスターとの戦いに強い剣士', {
    stats: [3, 7],
    kw: [kw('bushido', 3)],
    tribe: 'human',
    desc: '主を持たない剣は、どこへでも行ける',
  }),
  N('toishi', '鍛冶屋の砥石', 'gi:anvil-impact', 'common', 1, '味方の攻撃力アップと1枚ドロー', {
    fx: [fx('attackUp', { value: 3 }), me('draw', { value: 1 }), fx('repair', { value: 2 })],
    desc: '研ぎ直した刃は、昨日より一段深く斬れる',
  }),
  N('danzai-yaiba', '断罪の刃', 'gi:guillotine', 'common', 2, '体力の低いモンスターを破壊。サイクリングつき', {
    fx: [fx('execute', { value: 9 })],
    ab: [{ id: 'cycling' }],
    desc: '裁きはいつも一瞬で終わる',
  }),
  N('ryuu-youtai', '竜の幼体', 'gi:dragon-breath', 'common', 2, '飛行の幼竜。攻撃しなかったターンに育つ', {
    stats: [2, 5],
    kw: [kw('flying')],
    fx: [fx('train', { value: 1, timing: 'turnEnd', target: 'thisMonster', condition: 'rested' })],
    tribe: 'dragon',
    desc: '小さな炎を吐く練習中。まだ時々むせる',
  }),
  N('fuuin-fuda', '封印の札', 'gi:scroll-unfurled', 'common', 1, '効果とキーワードを消し、ダメージ', {
    fx: [fx('seal'), fx('damage', { value: 2 })],
    desc: '札を貼られた者は、生まれ持った力を思い出せなくなる',
  }),
  N('itetsuku-ibuki', '凍てつく息吹', 'gi:frozen-orb', 'common', 1, '相手モンスター1体を凍結し、1枚引く', {
    fx: [fx('freeze'), me('draw', { value: 1 })],
    desc: '北の果てから吹く風は、戦場の時間を止める',
  }),
  N('reijuu', '森の大精霊', 'gi:unicorn', 'common', 3, '飛行の精霊。ターン終了時に仲間を修理', {
    stats: [4, 8],
    kw: [kw('flying')],
    fx: [fx('repair', { value: 2, timing: 'turnEnd', target: 'allyMonsters' })],
    tribe: 'spirit',
    desc: '森の奥の泉に宿る精霊。白い角の姿で空を駆ける',
  }),
  N('iwayama-hiryuu', '岩山の飛竜', 'gi:wyvern', 'common', 4, '飛行と不屈の大型', {
    stats: [6, 13],
    kw: [kw('flying'), kw('undying')],
    tribe: 'dragon',
    desc: '岩山に巣を作る飛竜。羽ばたき一つで砂嵐が起きる',
  }),
  // ---- レア
  N('ryuuseigun', '流星群', 'gi:meteor-impact', 'rare', 3, '相手モンスター全体と1体にダメージ', {
    fx: [fx('damage', { value: 3, target: 'enemyMonsters' }), fx('damage', { value: 7 })],
    desc: '夜空から降る星は、願いではなく破滅を運ぶ',
  }),
  N('tabibito-sentaku', '旅人の選択', 'gi:crossroad', 'rare', 2, 'ダメージか、2枚とエナジーとシールドかを選ぶ', {
    fx: [fx('damage', { value: 7, mode: 1 }), me('draw', { value: 2, mode: 2 }), me('energy', { value: 1, mode: 2 }), me('shield', { value: 1, mode: 2 })],
    desc: '右は戦の道、左は知恵の道',
  }),
  N('ryuu-kishi', '竜騎士', 'gi:dragon-shield', 'rare', 3, '飛行と後援の竜騎士', {
    stats: [6, 10],
    kw: [kw('flying'), kw('enlist')],
    tribe: 'human',
    desc: '竜と心を通わせた騎士は、空から戦場を駆ける',
  }),
  N('honoo-ryuu', '炎の竜', 'gi:dragon-spiral', 'rare', 3, '飛行の竜。出たときにダメージ', {
    stats: [5, 8],
    kw: [kw('flying')],
    fx: [fx('damage', { value: 3, timing: 'summon' })],
    tribe: 'dragon',
    desc: '炎の竜が通ったあとには、灰と静けさだけが残る',
  }),
  N('youhei-taichou', '傭兵隊長', 'gi:visored-helm', 'rare', 2, '激励と、出たときに仲間1体の攻撃力を上げる', {
    stats: [3, 5],
    kw: [kw('inspire', 1)],
    fx: [fx('attackUp', { value: 2, timing: 'summon' })],
    tribe: 'human',
    desc: '金の払いがいいうちは、部下の士気も高い',
  }),
  N('kenja-chie', '賢者の知恵', 'gi:open-book', 'rare', 1, '山札の上3枚から1枚を選び、相手1体にダメージ', {
    fx: [me('discover'), fx('damage', { value: 4 })],
    desc: '賢者は答えを教えない。三つの道を見せるだけだ',
  }),
  N('shippuu-yumite', '疾風の弓手', 'gi:archer', 'rare', 2, '出たときに相手モンスター全体を削るか、カードを引くかを選ぶ', {
    stats: [2, 4],
    fx: [fx('damage', { value: 2, timing: 'summon', target: 'enemyMonsters', mode: 1 }), me('draw', { value: 2, timing: 'summon', mode: 2 })],
    tribe: 'human',
    desc: '一息に三本。矢をつがえる音を聞いた者はいない',
  }),
  // ---- エピック
  N('koryuu', '古竜', 'gi:double-dragon', 'epic', 4, '飛行の古竜。攻撃のたびに相手モンスター全体を少し削る', {
    stats: [7, 12],
    kw: [kw('flying')],
    fx: [fx('damage', { value: 1, timing: 'attack', target: 'enemyMonsters' })],
    tribe: 'dragon',
    desc: '世界が若かったころから生きている竜。目覚めは災いを告げる',
  }),
  // ---- レジェンド（ドラフトの山に1枚。1人1枚まで）
  N('soukai-haryuu', '蒼海の覇竜', 'gi:sea-dragon', 'legend', 5, '飛行の覇竜。出たときに相手モンスター全体を焼き、相手に通すたびにドロー', {
    stats: [8, 15],
    kw: [kw('flying')],
    fx: [fx('damage', { value: 3, timing: 'summon', target: 'enemyMonsters' }), me('draw', { value: 1, timing: 'hitEnemyPlayer' })],
    tribe: 'dragon',
    desc: '海から昇り、空を覆う。その影が落ちた港は、一夜で地図から消える',
  }),
];

/** すべての公式カード（並びはアーキタイプ順・各アーキタイプの中はレアリティ順・コスト順） */
export const OFFICIAL_ENTRIES: readonly OfficialEntry[] = [...POISON, ...BEAST, ...CURSE, ...GUARD, ...MACHINE, ...NEUTRAL];
