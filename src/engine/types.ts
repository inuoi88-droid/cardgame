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
] as const;
export type ConditionId = (typeof CONDITION_IDS)[number];

export type ModifierId = 'pierce' | 'drain';

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
  /** 防御無視・吸収（ダメージと連撃のみ） */
  mods?: ModifierId[];
  /** 効果ごとの追加指定（サーチするカードの種類など） */
  option?: string;
}

export interface DrawbackInstance {
  id: string;
  value?: number;
  /** 倍率込み固定値のデメリット（維持費・寄生・裏切り）は null */
  timing: TimingId | null;
}

export interface CardDef {
  /** データ形式のバージョン */
  v: 1;
  id: string;
  name: string;
  icon: string;
  rarity: Rarity;
  cost: number;
  stats: Stats | null;
  keywords: KeywordInstance[];
  effects: EffectInstance[];
  drawbacks: DrawbackInstance[];
}

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
