/**
 * 「残りのポイントで入れられるもの」（決定事項 #140）：作っているカードに足しても予算に収まる効果・キーワード・能力・ステータスと、
 * そのときに入れられる最大の数値を探す（純粋関数。tests/editorFits.test.ts）。
 * 判定は実際に足したカードを engine の analyzeCard で計算する（タイミング・倍率・相殺も本物と同じ）。
 * 「入る」＝足したあとも あと ≥ 0 で、足したことで新しいルール違反が増えない。数値は大きいほど高い前提で二分探索する。
 */
import {
  BALANCE,
  EFFECT_GROUPS,
  abilityChoices,
  analyzeCard,
  availableEffects,
  cardBase,
  createAbility,
  createEffect,
  getAbility,
  listKeywords,
  type AbilityInstance,
  type CardDef,
  type EffectGroup,
  type EffectInstance,
  type KeywordInstance,
  type ParamSpec,
  type Stats,
} from '../../engine/index.ts';

export type FitKind = 'stat' | 'keyword' | 'effect' | 'ability';

export interface FitItem {
  kind: FitKind;
  id: string;
  name: string;
  summary: string;
  group?: EffectGroup;
  /** 入れられる最大の数値（数値の無いものは無し） */
  max?: number;
  /** 数値の名前（「N」「ターン数」など） */
  label?: string;
  /** 最大で入れたときに使うポイント */
  points: number;
  /** 最大で入れたときの あと */
  left: number;
  /** 足すもの（最大の数値で） */
  effect?: EffectInstance;
  keyword?: KeywordInstance;
  ability?: AbilityInstance;
  /** ステータスなら、足す量 */
  stat?: keyof Stats;
}

export interface FitList {
  /** 今の あと（負なら超過） */
  remaining: number;
  stats: FitItem[];
  keywords: FitItem[];
  effects: FitItem[];
  abilities: FitItem[];
  /** 効果をもう足せない理由（効果の数の上限） */
  effectsFull?: string;
  abilitiesFull?: string;
}

const STAT_LABEL: Record<keyof Stats, string> = { attack: '攻撃力', hp: '体力', defense: '守備力' };

/** 数値の候補（小さい順）。量（scaled）は倍率の刻み、数は1刻み */
function grid(spec: Pick<ParamSpec, 'min' | 'max' | 'scaled'>): number[] {
  const step = spec.scaled ? BALANCE.scale : 1;
  const out: number[] = [];
  if (spec.min % step !== 0) out.push(spec.min);
  for (let v = Math.ceil(spec.min / step) * step; v <= spec.max; v += step) if (v >= spec.min) out.push(v);
  return out;
}

/** 候補のうち ok になる最大のもの（ok は数値が大きいほど通りにくい前提）。どれも駄目なら undefined */
function largest<T>(values: readonly number[], ok: (v: number) => T | null): { v: number; r: T } | undefined {
  let lo = 0;
  let hi = values.length - 1;
  let best: { v: number; r: T } | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = ok(values[mid]!);
    if (r !== null) {
      best = { v: values[mid]!, r };
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best;
}

const key = (v: { code: string; path?: string }) => `${v.code}|${v.path ?? ''}`;

/**
 * 作っているカードに足せるものの一覧。並びは 種類ごと（効果は見出しの順）、その中は名前の順。
 * 超過しているときは空（remaining だけ返す）
 */
export function fitsWithin(card: CardDef): FitList {
  const before = analyzeCard(card);
  const remaining = before.points.remaining;
  const out: FitList = { remaining, stats: [], keywords: [], effects: [], abilities: [] };
  if (remaining < 0) return out;
  const had = new Set(before.violations.map(key));
  const base = cardBase(card);
  /** 足したカードが入るなら、その使用ポイントと あと */
  const check = (next: CardDef): { points: number; left: number } | null => {
    const a = analyzeCard(next);
    if (a.points.remaining < 0) return null;
    if (a.violations.some((v) => !had.has(key(v)))) return null;
    return { points: remaining - a.points.remaining, left: a.points.remaining };
  };

  // ステータス（モンスター）：それぞれ単独で上げられる量
  if (card.stats) {
    const S = BALANCE.stats;
    const limits: Record<keyof Stats, number> = { attack: S.attackMax, hp: S.hpMax, defense: S.defenseMax };
    for (const stat of ['attack', 'hp', 'defense'] as const) {
      const now = card.stats[stat];
      const room = limits[stat] - now;
      if (room <= 0) continue;
      const deltas = grid({ min: BALANCE.scale, max: room, scaled: true });
      const best = largest(deltas, (d) => check({ ...card, stats: { ...card.stats!, [stat]: now + d } }));
      if (best) out.stats.push({ kind: 'stat', id: stat, name: STAT_LABEL[stat], summary: `${STAT_LABEL[stat]}を上げる（今 ${now}）`, stat, max: best.v, points: best.r.points, left: best.r.left });
    }

    // キーワード（モンスター専用）
    for (const def of listKeywords()) {
      if (card.keywords.some((k) => k.id === def.id)) continue;
      const make = (v?: number): KeywordInstance => (v === undefined ? { id: def.id } : { id: def.id, value: v });
      const found = def.value
        ? largest(grid(def.value), (v) => check({ ...card, keywords: [...card.keywords, make(v)] }))
        : ((r) => (r ? { v: undefined, r } : undefined))(check({ ...card, keywords: [...card.keywords, make()] }));
      if (!found) continue;
      out.keywords.push({
        kind: 'keyword',
        id: def.id,
        name: def.name,
        summary: def.summary,
        ...(found.v !== undefined ? { max: found.v, label: def.value!.label } : {}),
        points: found.r.points,
        left: found.r.left,
        keyword: make(found.v),
      });
    }
  }

  // 効果
  const maxEffects = BALANCE.rarity[card.rarity].maxEffects;
  if (card.effects.length >= maxEffects) out.effectsFull = `効果は${maxEffects}つまでです`;
  else {
    const order = new Map(EFFECT_GROUPS.map((g, i) => [g.id, i]));
    for (const def of availableEffects(card.rarity, base)) {
      const e0 = createEffect(def.id, base, card.abilities, card.effects);
      const make = (v?: number): EffectInstance => (v === undefined ? e0 : { ...e0, value: v });
      const found = def.value
        ? largest(grid(def.value), (v) => check({ ...card, effects: [...card.effects, make(v)] }))
        : ((r) => (r ? { v: undefined, r } : undefined))(check({ ...card, effects: [...card.effects, make()] }));
      if (!found) continue;
      out.effects.push({
        kind: 'effect',
        id: def.id,
        name: def.name,
        summary: def.summary,
        group: def.group,
        ...(found.v !== undefined ? { max: found.v, label: def.value!.label } : {}),
        points: found.r.points,
        left: found.r.left,
        effect: make(found.v),
      });
    }
    out.effects.sort((a, b) => (order.get(a.group!) ?? 99) - (order.get(b.group!) ?? 99));
  }

  // カードの能力
  const abilities = card.abilities ?? [];
  if (abilities.length >= BALANCE.card.maxAbilities) out.abilitiesFull = `カードの能力は${BALANCE.card.maxAbilities}つまでです`;
  else {
    for (const { def, blocked } of abilityChoices(card)) {
      if (blocked) continue;
      const a0 = createAbility(def.id);
      const make = (v?: number): AbilityInstance => (v === undefined ? a0 : { ...a0, value: v });
      const spec = getAbility(def.id)?.value;
      const found = spec
        ? largest(grid(spec), (v) => check({ ...card, abilities: [...abilities, make(v)] }))
        : ((r) => (r ? { v: undefined, r } : undefined))(check({ ...card, abilities: [...abilities, make()] }));
      if (!found) continue;
      out.abilities.push({
        kind: 'ability',
        id: def.id,
        name: def.name,
        summary: def.summary,
        ...(found.v !== undefined ? { max: found.v, label: spec!.label } : {}),
        points: found.r.points,
        left: found.r.left,
        ability: make(found.v),
      });
    }
  }
  return out;
}

/** 一覧の行の数値の言葉（「最大 60」「+40 まで」など） */
export function fitValueText(it: FitItem): string | undefined {
  if (it.kind === 'stat') return `+${it.max} まで`;
  if (it.max === undefined) return undefined;
  return `${it.label && it.label !== 'N' && it.label !== it.name ? `${it.label} ` : ''}最大 ${it.max}`;
}
