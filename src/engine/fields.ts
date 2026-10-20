/**
 * フィールド（MTG 要素 △ バッチD：#11 次元・#19 ワールドのアレンジ）。両者に効く場の効果（場に1つ）。
 * 対戦オプション「次元」で開始時にランダムに決まり（planar なら通算 fields.planarEvery ターンごとに変わる）、効果「フィールド」で上書きもできる。
 * 数値は balance.ts の fields、効果の処理は battle/rules.ts の ruleHooks。
 */
import { BALANCE } from './balance.ts';

const F = BALANCE.fields;

export const FIELD_IDS = ['volcano', 'library', 'sanctuary', 'arena', 'market', 'fog'] as const;
export type FieldId = (typeof FIELD_IDS)[number];

export interface FieldInfo {
  id: FieldId;
  name: string;
  icon: string;
  /** 1行の説明（数字は balance.ts から） */
  description: string;
}

export const FIELDS: Record<FieldId, FieldInfo> = {
  volcano: { id: 'volcano', name: '火山', icon: '🌋', description: `すべてのモンスターの攻撃力+${F.volcano.attack}` },
  library: { id: 'library', name: '大図書館', icon: '🏛', description: `ターン開始時に${F.library.draw}枚多く引く` },
  sanctuary: { id: 'sanctuary', name: '聖域', icon: '⛲', description: `ターン開始時にHPが${F.sanctuary.heal}回復する` },
  arena: { id: 'arena', name: '闘技場', icon: '🏟', description: 'モンスターは場に出たターンから攻撃できる' },
  market: { id: 'market', name: '市場', icon: '🏪', description: `各ターン最初に使うカードのコスト−${F.market.discount}` },
  fog: { id: 'fog', name: '霧', icon: '🌫', description: `モンスターの攻撃で相手プレイヤーに与えるダメージ−${Math.round(F.fog.rate * 100)}%（切り捨て）` },
};

export function isFieldId(x: unknown): x is FieldId {
  return typeof x === 'string' && (FIELD_IDS as readonly string[]).includes(x);
}

/** 対戦オプション「次元」：なし・ランダム（開始時に1つ）・移り変わる（開始時に1つ、通算 planarEvery ターンごとに別の1つへ） */
export const PLANAR_MODES = ['off', 'random', 'planar'] as const;
export type PlanarMode = (typeof PLANAR_MODES)[number];
export const PLANAR_LABEL: Record<PlanarMode, string> = { off: 'なし', random: 'ランダム', planar: '移り変わる' };
export const PLANAR_DESCRIPTION: Record<PlanarMode, string> = {
  off: 'フィールドなしで始める（カードの効果「フィールド」で置くことはできる）',
  random: '開始時にフィールドがランダムに1つ決まる（効果「フィールド」で上書きされるまで続く）',
  planar: `開始時にランダムに1つ決まり、通算${F.planarEvery}ターンごとに別のフィールドへ移り変わる`,
};

/** 対戦のルールのオプション（GameConfig.rules・GameState.rules。どれも省略可能） */
export interface MatchRules {
  field?: PlanarMode;
  dayNight?: boolean;
}

export function isPlanarMode(x: unknown): x is PlanarMode {
  return typeof x === 'string' && (PLANAR_MODES as readonly string[]).includes(x);
}

/** 届いた値を作り直す（知らない値は無し扱い）。何も無ければ undefined */
export function normalizeRules(x: unknown): MatchRules | undefined {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return undefined;
  const r = x as Record<string, unknown>;
  const out: MatchRules = {};
  if (isPlanarMode(r.field) && r.field !== 'off') out.field = r.field;
  if (r.dayNight === true) out.dayNight = true;
  return Object.keys(out).length > 0 ? out : undefined;
}
