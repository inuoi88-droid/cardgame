/**
 * 効果・オプション・キーワード・デメリットの定義の型。
 * defs/ 以下の各ファイルは、ここにある define* 関数で1つの定義を default export する。
 * 新しい効果は defs/effects/ に1ファイル追加し、基礎ポイントを balance.ts に書けば、
 * エディター・ポイント計算・効果テキストのすべてに反映される（索引は scripts/gen-registry.mjs が自動生成）。
 */
import { BALANCE } from './balance.ts';
import type { TargetRule } from './options.ts';
import type {
  DrawbackInstance,
  EffectInstance,
  KeywordInstance,
  ModifierId,
  Rarity,
  Stats,
} from './types.ts';

export interface ParamSpec {
  /** 入力欄の名前 */
  label: string;
  min: number;
  max: number;
  default: number;
}

export interface OptionSpec {
  label: string;
  choices: readonly { id: string; label: string }[];
  default: string;
}

export type EffectGroup = 'damage' | 'defense' | 'status' | 'buff' | 'resource' | 'disrupt' | 'special';

export const EFFECT_GROUPS: readonly { id: EffectGroup; label: string }[] = [
  { id: 'damage', label: 'ダメージ系' },
  { id: 'defense', label: '防御・回復系' },
  { id: 'status', label: '状態異常' },
  { id: 'buff', label: '強化系' },
  { id: 'resource', label: 'リソース系' },
  { id: 'disrupt', label: '妨害系' },
  { id: 'special', label: 'レアリティ限定' },
];

/** 効果テキストを作るときに渡す情報 */
export interface DescribeContext {
  /** 対象の呼び方（「相手1体」「相手モンスター全体」「自分」など） */
  target: string;
  /** 防御無視などの前置き（例：「防御無視の」） */
  modPrefix: string;
  /** 吸収などの後置き（例：「（与えたダメージの半分だけ回復）」） */
  modSuffix: string;
}

export interface EffectDef {
  kind: 'effect';
  id: string;
  name: string;
  group: EffectGroup;
  /** エディターでの並び順 */
  order: number;
  /** エディターに出す短い説明 */
  summary: string;
  /** 数値 N の入力欄（なければ数値なし） */
  value?: ParamSpec;
  /** 回数 M の入力欄（連撃のみ） */
  hits?: ParamSpec;
  /** 追加の選択欄（サーチの種類など） */
  option?: OptionSpec;
  /** 作用する相手。選べる対象はここから決まる */
  targetRule: TargetRule;
  /** このレアリティ以上でないと使えない */
  minRarity?: Rarity;
  /** 種類判定の「相手へのダメージ効果」 */
  isDamage?: boolean;
  /** 種類判定の「プレイヤーに永続的に残る効果」 */
  isPlayerPermanent?: boolean;
  /** 防御無視・吸収を付けられる */
  allowsMods?: boolean;
  /** 倍率を掛ける前の基礎ポイント */
  basePoints(e: EffectInstance): number;
  /** 基礎ポイントの式（内訳表示用。例：「2×2」） */
  baseFormula(e: EffectInstance): string;
  /** 効果テキスト（タイミング・条件の前置きと句点は付けない） */
  describe(e: EffectInstance, ctx: DescribeContext): string;
  /** エディターの効果名の後ろに付ける数値表示（例：「2」「3×2」） */
  shortValue?(e: EffectInstance): string;
}

export interface ModifierDef {
  kind: 'modifier';
  id: ModifierId;
  name: string;
  order: number;
  summary: string;
  /** 基礎ポイントへの上乗せ率 */
  rate: number;
  textPrefix: string;
  textSuffix: string;
}

export interface KeywordDef {
  kind: 'keyword';
  id: string;
  name: string;
  order: number;
  summary: string;
  value?: ParamSpec;
  points(k: KeywordInstance, stats: Stats): number;
  formula(k: KeywordInstance, stats: Stats): string;
  /** カードに表示する名前（例：「自己修復2」） */
  displayName(k: KeywordInstance): string;
  /** 説明文 */
  describe(k: KeywordInstance): string;
}

export interface DrawbackDef {
  kind: 'drawback';
  id: string;
  name: string;
  order: number;
  summary: string;
  value?: ParamSpec;
  /** モンスターにしか付けられない */
  monsterOnly?: boolean;
  /** 倍率込みの固定値（あればタイミングを選ばない） */
  fixedPoints?: number;
  /** 倍率を掛ける前のポイント（正の数） */
  basePoints(d: DrawbackInstance): number;
  baseFormula(d: DrawbackInstance): string;
  /** テキスト（タイミングの前置きと句点は付けない） */
  describe(d: DrawbackInstance): string;
}

export const defineEffect = (def: Omit<EffectDef, 'kind'>): EffectDef => ({ kind: 'effect', ...def });
export const defineModifier = (def: Omit<ModifierDef, 'kind'>): ModifierDef => ({ kind: 'modifier', ...def });
export const defineKeyword = (def: Omit<KeywordDef, 'kind'>): KeywordDef => ({ kind: 'keyword', ...def });
export const defineDrawback = (def: Omit<DrawbackDef, 'kind'>): DrawbackDef => ({ kind: 'drawback', ...def });

// ---------------------------------------------------------------- 定義ファイル用の小道具

/** 数値 N の入力欄 */
export function valueParam(label = 'N', opts: { min?: number; max?: number; default?: number } = {}): ParamSpec {
  return {
    label,
    min: opts.min ?? BALANCE.params.valueMin,
    max: opts.max ?? BALANCE.params.valueMax,
    default: opts.default ?? 1,
  };
}

/** 効果の追加指定（未設定なら定義の初期値） */
export function optionOf(def: { option?: OptionSpec }, e: { option?: string }): string | undefined {
  return e.option ?? def.option?.default;
}

/** インスタンスから N を取り出す（未設定なら 0） */
export const n = (x: { value?: number }): number => x.value ?? 0;

/** 「a×b」形式の式。値が1なら係数だけ */
export const mulFormula = (...xs: number[]): string => xs.join('×');
