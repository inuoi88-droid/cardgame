/**
 * CPU のドラフトの判断（決定事項 #115。元は src/ui/battle/draft.ts の cpuPickScore）。
 * 点 = 中身の強さ（コストを差し引いた後のポイント。#117）× コストの散らばり × 種類の釣り合い × 手持ちとの相性。
 * 場から交互に取る形式では、相手がいちばん欲しそうなカードを少しだけ先に取る（妨害）。よわい・ふつうは点にばらつきを足す。
 * 重みは CPU の判断の目安なので、ai/evaluate.ts と同じくここに置く（バランスの数値ではない）。
 */
import { analyzeCard } from '../analyze.ts';
import { BALANCE } from '../balance.ts';
import { classifyCard } from '../classify.ts';
import type { CpuLevel } from '../ai/cpu.ts';
import type { CardDef, CardType } from '../types.ts';
import type { DraftCounts } from './types.ts';

const D = BALANCE.draft;

/** 種類ごとの、デッキの中の望ましい割合（取得回数に対して） */
const TYPE_SHARE: Record<CardType, number> = { monster: 0.6, attack: 0.17, skill: 0.13, power: 0.06, powerAttack: 0.04 };
/** 望ましい数との差1つにつき点を上下させる割合と、その幅 */
const TYPE_STEP = 0.07;
const TYPE_MIN = 0.55;
const TYPE_MAX = 1.15;
/** コストの区分（0〜1・2・3・4・5以上）ごとの望ましい割合 */
const CURVE_SHARE = [0.2, 0.27, 0.23, 0.17, 0.13] as const;
const CURVE_STEP = 0.06;
const CURVE_MIN = 0.7;
const CURVE_MAX = 1.1;
/** 同じ種族のカード1回につき・同じ効果やキーワード1つにつき足す割合と、その上限 */
const TRIBE_STEP = 0.04;
const TRIBE_MAX = 0.16;
const FEATURE_STEP = 0.012;
const FEATURE_MAX = 0.1;
/** コストで引く前のポイントを足す割合（同点を分けるためだけの小さな値） */
const PRE_COST_TIEBREAK = 0.02;
/** 相手の点を自分の点に足す割合（妨害） */
const DENIAL: Record<CpuLevel, number> = { easy: 0, normal: 0.08, hard: 0.18 };
/** 点のばらつき（±この割合） */
const NOISE: Record<CpuLevel, number> = { easy: 0.7, normal: 0.15, hard: 0 };

/**
 * カードの強さの目安：コストを差し引いた後のポイント（＝予算のうち使った分。レアリティの上限が高いほど大きい）。
 * 以前（#115）はコストで引く前のポイントだったが、それだとコスト4〜5のカードがいつも上位になり、重いカードばかり取った（#117）
 */
export function cardPower(def: CardDef): number {
  const pts = analyzeCard(def).points;
  const before = pts.lines.filter((l) => l.kind !== 'cost').reduce((sum, l) => sum + l.value, 0);
  // 予算を使い切っていない手作りのカード（差し引き後が0以下）どうしでも差が付くよう、引く前の大きさを少しだけ足す
  return Math.max(0, pts.total) + PRE_COST_TIEBREAK * Math.max(0, before);
}

const curveBucket = (cost: number): number => Math.max(0, Math.min(CURVE_SHARE.length - 1, cost - 1));
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** カードの「仕組み」の目印（効果・キーワード・能力の ID）。相性の目安 */
function features(def: CardDef): string[] {
  return [...def.effects.map((e) => `e:${e.id}`), ...def.keywords.map((k) => `k:${k.id}`), ...(def.abilities ?? []).map((a) => `a:${a.id}`)];
}

export interface PickContext {
  /** 自分のデッキ（カードID → 枚数） */
  counts: DraftCounts;
  /** counts のカードの定義 */
  byId: ReadonlyMap<string, CardDef>;
}

/**
 * CPU のピックの点：ポイント（コストを差し引いた後の強さの目安）に、コストの散らばり・種類の釣り合い・手持ちとの相性を掛ける。
 * ばらつきと妨害は含まない（pickBest が足す）
 */
export function cpuPickScore(def: CardDef, counts: DraftCounts, byId: ReadonlyMap<string, CardDef>): number {
  const mine: CardDef[] = [];
  for (const [id, n] of Object.entries(counts)) {
    const c = byId.get(id);
    if (c) for (let i = 0; i < Math.round(n / D.copies); i++) mine.push(c);
  }
  const taken = mine.length;
  const type = classifyCard(def);
  const sameType = mine.filter((c) => classifyCard(c) === type).length;
  const typeRate = clamp(1 + TYPE_STEP * (TYPE_SHARE[type] * (taken + 1) - (sameType + 1)), TYPE_MIN, TYPE_MAX);
  const bucket = curveBucket(def.cost);
  const sameCost = mine.filter((c) => curveBucket(c.cost) === bucket).length;
  const curveRate = clamp(1 + CURVE_STEP * (CURVE_SHARE[bucket]! * (taken + 1) - (sameCost + 1)), CURVE_MIN, CURVE_MAX);
  let synergy = 0;
  if (def.tribe) synergy += Math.min(TRIBE_MAX, TRIBE_STEP * mine.filter((c) => c.tribe === def.tribe).length);
  const own = new Set(features(def));
  let shared = 0;
  for (const c of mine) for (const f of features(c)) if (own.has(f)) shared++;
  synergy += Math.min(FEATURE_MAX, FEATURE_STEP * shared);
  return Math.max(0, cardPower(def)) * typeRate * curveRate * (1 + synergy);
}

/** 決まった乱数（mulberry32）。state を持たない呼び出し用 */
export function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PickOptions {
  level?: CpuLevel;
  /** 相手のデッキ（妨害に使う。無ければ妨害しない） */
  opponent?: PickContext;
  /** ばらつきの乱数（無ければばらつかない） */
  random?: () => number;
}

/** 候補の中からいちばん点の高いものを選ぶ（候補が無ければ undefined） */
export function pickBest(candidates: readonly CardDef[], me: PickContext, opts: PickOptions = {}): CardDef | undefined {
  const level = opts.level ?? 'normal';
  let best: CardDef | undefined;
  let bestScore = -Infinity;
  for (const c of candidates) {
    let s = cpuPickScore(c, me.counts, me.byId);
    if (opts.opponent && DENIAL[level] > 0) s += DENIAL[level] * cpuPickScore(c, opts.opponent.counts, opts.opponent.byId);
    if (opts.random && NOISE[level] > 0) s *= 1 + NOISE[level] * (2 * opts.random() - 1);
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return best;
}

/** ひとりで選ぶ形式の CPU のピック（ばらつき・妨害なし） */
export function cpuPick(offer: readonly CardDef[], counts: DraftCounts, byId: ReadonlyMap<string, CardDef>): CardDef | undefined {
  return pickBest(offer, { counts, byId });
}
