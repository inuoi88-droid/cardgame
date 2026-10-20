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
] as const;
export type ConditionId = (typeof CONDITION_IDS)[number];

/**
 * 効果のオプション。pierce・drain はダメージ系（allowsMods）、nextTurn は遅延（予約）、
 * それ以外は数値に掛ける倍数（scalable な効果）
 */
export const MODIFIER_IDS = ['pierce', 'drain', 'xEnergy', 'perEnemyMonster', 'perCardPlayed', 'nextTurn', 'perDiscardMonster'] as const;
export type ModifierId = (typeof MODIFIER_IDS)[number];

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
}

export interface DrawbackInstance {
  id: string;
  value?: number;
  /** 倍率込み固定値のデメリット（維持費・寄生・裏切り）は null */
  timing: TimingId | null;
  /** デメリットごとの追加指定（捨て札の除外の「枚数／コスト合計」など） */
  option?: string;
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
  kind: 'stat' | 'keyword' | 'effect' | 'cost' | 'drawback' | 'limit';
  /** effects / drawbacks / keywords の何番目か */
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
