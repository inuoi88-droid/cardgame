/** カードとデッキのデータ型。保存するのはここにある形だけ。種類・呪い・ポイント・テキストは毎回計算する。 */

export const RARITIES = ['common', 'rare', 'epic', 'legend'] as const;
export type Rarity = (typeof RARITIES)[number];

export const CARD_TYPES = ['monster', 'powerAttack', 'power', 'attack', 'skill'] as const;
export type CardType = (typeof CARD_TYPES)[number];

/** カードの土台。ステータスがあればモンスター、なければそれ以外（呪文） */
export type CardBase = 'monster' | 'spell';

export const TIMING_IDS = [
  'play',
  'summon',
  'destroyed',
  'damaged',
  'attack',
  'turnStart',
  'turnEnd',
  'cardPlayed',
  'allySummoned',
  'allyDestroyed',
  'powerPlayed',
  'skillPlayed',
  'hitEnemyPlayer',
  // MTG 要素 ○ バッチA
  'drawn',
  'targeted',
  'bigCardPlayed',
  // MTG 要素 ○ バッチC1（カードの能力があるときだけ選べる）
  'fromDiscard',
  'activated',
  'channel',
  // MTG 要素 ○ バッチC2：英雄譚の章（パワーになる）と、蓄積がたまったとき（能力「蓄積」があるときだけ）
  'chapter1',
  'chapter2',
  'chapter3',
  'charged',
  // MTG 要素 △ バッチA：相手のモンスターが攻撃するたび（罠）・捨てられたとき（マッドネス）・各ターン初めて自分のカードの対象になったとき（雄姿）
  'enemyAttacked',
  'discarded',
  'valiant',
  // MTG 要素 △ バッチB：能力「相続」で捨て札から除外したとき・能力「予見」で手札から使ったとき（能力があるときだけ）
  'renew',
  'forecast',
] as const;
export type TimingId = (typeof TIMING_IDS)[number];

export const TARGET_IDS = [
  'chosen',
  'random',
  'enemyMonsters',
  'enemyAll',
  'everyone',
  'self',
  'enemyPlayer',
  'board',
  'thisMonster',
  'allyMonsters',
  // MTG 要素 ○ バッチA
  'otherAllies',
  'weakestAlly',
  'bothPlayers',
  // MTG 要素 ○ バッチC2（種族のあるカードだけ）
  'tribeAllies',
  // MTG 要素 △ バッチA：「相手のモンスターが攻撃するたび」の、攻撃してきたモンスター
  'attacker',
] as const;
export type TargetId = (typeof TARGET_IDS)[number];

export const CONDITION_IDS = [
  'hasMonster',
  'enemyHpHigher',
  'enemyPoisoned',
  'lowHp',
  'smallHand',
  'enemyPoisonBurn',
  'nthCard',
  'manyMonsters',
  'enemyDamagedThisTurn',
  'monsterDestroyedThisTurn',
  'allyAttackedThisTurn',
  'loneMonster',
  'twoPowers',
  'coinFlip',
  'secondPlayer',
  'emptyHand',
  'bigMonster',
  'bigDiscard',
  'monsterInHand',
  'twoSummonsThisTurn',
  // MTG 要素 ○ バッチA
  'enemyPlayedMany',
  'veteran',
  'strongerAlly',
  'totalAttack',
  'twoAllyAttacks',
  'coven',
  'delirium',
  'criticalHp',
  'bigDamageThisTurn',
  'skillsInDiscard',
  'healedThisTurn',
  'enemyPoisonHigh',
  'notFirstCard',
  'clash',
  'exploit',
  // MTG 要素 ○ バッチC1
  'kicked',
  // MTG 要素 ○ バッチC2
  'tribeAlly',
  'maxSpeed',
  'hasCrown',
  // MTG 要素 △ バッチA：収斂・落魄・長久
  'converge',
  'descend',
  'rested',
  // MTG 要素 △ バッチB：協約したなら（能力「協約」があるときだけ）
  'bargained',
] as const;
export type ConditionId = (typeof CONDITION_IDS)[number];

/**
 * 効果のオプション。pierce・drain はダメージ系（allowsMods）、nextTurn は遅延（予約）、
 * それ以外は数値に掛ける倍数（scalable な効果）
 */
export const MODIFIER_IDS = [
  'pierce',
  'drain',
  'xEnergy',
  'perEnemyMonster',
  'perCardPlayed',
  'nextTurn',
  'perDiscardMonster',
  'perTribeAlly',
  // MTG 要素 △ バッチA：萎縮（ダメージ系）・経験1につき・ばらつき（数値の倍数）
  'witherDmg',
  'perExp',
  'gamble',
] as const;
export type ModifierId = (typeof MODIFIER_IDS)[number];

/**
 * 種族（MTG 要素 ○ バッチC2：クリーチャー・タイプ／部族シナジー）。カードに1つまで付けられる。
 * ID と名前はバランスの数値ではないので、ここに置く
 */
export const TRIBE_IDS = ['beast', 'dragon', 'undead', 'machine', 'spirit', 'human'] as const;
export type TribeId = (typeof TRIBE_IDS)[number];
export const TRIBE_LABEL: Record<TribeId, string> = {
  beast: '獣',
  dragon: '竜',
  undead: '不死',
  machine: '機械',
  spirit: '精霊',
  human: '人',
};

/** モード選択（MTG 要素 ○ バッチC2）のモードの番号（1＝A、2＝B、3＝C）。使うときの 0 は双呪（すべてのモード） */
export const MODE_IDS = [1, 2, 3] as const;
export type ModeId = (typeof MODE_IDS)[number];
export const MODE_LABEL: Record<ModeId, string> = { 1: 'A', 2: 'B', 3: 'C' };

export interface Stats {
  attack: number;
  hp: number;
  defense: number;
}

export interface KeywordInstance {
  id: string;
  value?: number;
}

export interface EffectInstance {
  id: string;
  /** N */
  value?: number;
  /** M（連撃の回数） */
  hits?: number;
  timing: TimingId;
  target: TargetId;
  /** 条件は1つまで */
  condition: ConditionId | null;
  /** オプション：防御無視・吸収（ダメージと連撃のみ）と、数値の倍数（X・相手モンスター1体につき など。1効果に1つまで） */
  mods?: ModifierId[];
  /** 効果ごとの追加指定（サーチするカードの種類など） */
  option?: string;
  /**
   * モード（MTG 要素 ○ バッチC2）。使用時・召喚時・捨て札から使ったときの効果だけに付けられ、使うときに1つを選ぶ
   * （省略は「いつも」出る）
   */
  mode?: ModeId;
}

export interface DrawbackInstance {
  id: string;
  value?: number;
  /** 倍率込み固定値のデメリット（維持費・寄生・裏切り）は null */
  timing: TimingId | null;
  /** デメリットごとの追加指定（捨て札の除外の「枚数／コスト合計」など） */
  option?: string;
}

/**
 * カードの能力（MTG 要素 ○ バッチB）。モンスター以外にも付く、カード単位の性質（循環・再利用・反復・成長など）。
 * 定義は defs/abilities/。1枚に BALANCE.card.maxAbilities まで、同じ id は1つ
 */
export interface AbilityInstance {
  id: string;
  value?: number;
  option?: string;
  /** 能力に付ける条件（MTG 要素 ○ バッチC1：条件付き軽減の「〜なら」） */
  condition?: ConditionId;
  /** 1回きり（MTG 要素 △ バッチA：蓄積の「プラン」。たまったら効果を出してパワーが消える）。AbilityDef.onceOption のある能力だけ */
  once?: boolean;
}

export interface CardDef {
  /** データ形式のバージョン */
  v: 1;
  /** 値を書いたときのインフレ倍率（決定事項 #65）。省略は1。読み込み時に今の倍率へそろえる */
  scale?: number;
  id: string;
  name: string;
  icon: string;
  rarity: Rarity;
  cost: number;
  stats: Stats | null;
  keywords: KeywordInstance[];
  effects: EffectInstance[];
  drawbacks: DrawbackInstance[];
  /** カードの能力（MTG 要素 ○ バッチB）。省略は無し */
  abilities?: AbilityInstance[];
  /** 種族（MTG 要素 ○ バッチC2）。省略は種族なし。ポイントは0 */
  tribe?: TribeId;
  /**
   * プレイヤーが書く短い説明（フレーバーや使い方のメモ）。任意。ポイントやルールには関係しない。
   * 読み込み時に前後の空白・制御文字を除き、CARD_DESCRIPTION_MAX 文字を超えた分は切り詰める（io.ts の normalizeDescription）
   */
  description?: string;
}

/** カードの説明の最大文字数（見た目の都合の上限で、バランスの数値ではない） */
export const CARD_DESCRIPTION_MAX = 80;

export interface DeckEntry {
  cardId: string;
  count: number;
}

export interface Deck {
  v: 1;
  id: string;
  name: string;
  entries: DeckEntry[];
}

export interface Violation {
  /** 機械判定用のコード（テストで使う） */
  code: string;
  /** 画面に出す理由 */
  message: string;
  /** どの入力欄の問題か（例：'effects.1.target'） */
  path?: string;
}

export interface PointLine {
  /** 何のポイントか（例：「攻撃するたび 毒1」） */
  label: string;
  /** 計算式（例：「3 × 2.0」） */
  formula: string;
  /** 合計に加える値（コスト・デメリットは負） */
  value: number;
  /** limit：デメリットのうち差し引けない分を戻す行 */
  kind: 'stat' | 'keyword' | 'effect' | 'ability' | 'cost' | 'drawback' | 'limit';
  /** effects / drawbacks / keywords / abilities の何番目か */
  index?: number;
}

export interface PointSummary {
  lines: PointLine[];
  /** 上限と比べる合計 */
  total: number;
  /** レアリティの上限 */
  cap: number;
  /** 上限までの残り（超過なら負） */
  remaining: number;
  /** デメリットの合計（正の数。呪いの条件に使う） */
  drawbackTotal: number;
  /** デメリットのうち、合計から実際に差し引いた分 */
  drawbackOffset: number;
}

export interface CardText {
  effects: string[];
  keywords: { name: string; text: string }[];
  drawbacks: string[];
  /** カードの能力（カードの下段に表示） */
  abilities: { name: string; text: string }[];
}

export interface CardAnalysis {
  base: CardBase;
  cardType: CardType;
  isCurse: boolean;
  points: PointSummary;
  text: CardText;
  violations: Violation[];
  valid: boolean;
}
