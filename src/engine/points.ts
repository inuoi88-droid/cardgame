/**
 * ポイント計算。合計 = ステータス + キーワード + 効果 − コストの差し引き − デメリット。
 * コストの差し引きはコストごとの表（決定事項 #67）。コスト0のカードはレアリティ上限が下がる。
 * デメリットで差し引けるのはレアリティ上限まで。コスト0のカードは差し引けない（決定事項 #64）
 */
import { BALANCE } from './balance.ts';
import { cardBase } from './classify.ts';
import type { EffectDef, ModifierDef, PointCard } from './define.ts';
import { formatMultiplier } from './labels.ts';
import { ceilPoints, floorPoints, round2 } from './math.ts';
import {
  CONDITIONS,
  DEFAULT_ATTACK_PROFILE,
  TIMINGS,
  conditionMultiplier,
  defaultTiming,
  targetLabel,
  targetMultiplier,
  timingMultiplier,
  type AttackProfile,
} from './options.ts';
import { getAbility, getDrawback, getEffect, getKeyword, getModifier } from './registry.ts';
import type { AbilityInstance, CardBase, CardDef, DrawbackInstance, EffectInstance, KeywordInstance, PointLine, PointSummary, TimingId } from './types.ts';
import type { AbilityPointContext } from './define.ts';

export interface Factor {
  label: string;
  value: number;
  /** 式に出す文字（省略なら value をそのまま。例：「2.0×2+1.0」） */
  text?: string;
}

export interface EffectPoints {
  base: number;
  factors: Factor[];
  /** 丸める前の値 */
  raw: number;
  /** 切り上げ後の値 */
  value: number;
  formula: string;
}

export interface DrawbackPoints {
  base: number;
  factors: Factor[];
  raw: number;
  /** 切り捨て後の値（正の数） */
  value: number;
  formula: string;
}

/** 「基礎 × 倍率（理由）…」の式を作る。倍率1は省略し、端数が出たら丸め方を添える */
function buildFormula(baseFormula: string, base: number, factors: Factor[], raw: number, rounding: string): string {
  const shown = factors.filter((f) => f.value !== 1);
  const body =
    shown.length === 0
      ? baseFormula
      : [String(round2(base)), ...shown.map((f) => `${f.text ?? formatMultiplier(f.value)}（${f.label}）`)].join(' × ');
  return Number.isInteger(round2(raw)) ? body : `${body} = ${round2(raw)} → ${rounding}`;
}

/** モンスターの攻撃のしかた（キーワードから。「攻撃するたび」の倍率に使う） */
export function attackProfile(keywords: readonly KeywordInstance[]): AttackProfile {
  let attacks = DEFAULT_ATTACK_PROFILE.attacks;
  let haste = DEFAULT_ATTACK_PROFILE.haste;
  for (const k of keywords) {
    const b = getKeyword(k.id)?.battle;
    if (!b) continue;
    if (b.attacksPerTurn !== undefined) attacks = Math.max(attacks, b.attacksPerTurn);
    if (b.haste) haste = true;
  }
  return { attacks, haste };
}

/** タイミングの倍率の項（「攻撃するたび」は攻撃回数と速攻を式と理由に出す） */
function timingFactor(timing: keyof typeof TIMINGS, base: CardBase, card: PointCard): Factor {
  const t = TIMINGS[timing];
  if (timing === 'hitEnemyPlayer') {
    // 二回攻撃なら発動の機会も2倍
    const profile = attackProfile(card.keywords);
    const value = timingMultiplier(timing, base, profile);
    if (profile.attacks === 1) return { label: t.label, value };
    const name = getKeyword('doubleAttack')?.name ?? '二回攻撃';
    return { label: `${t.label}・${name}`, value, text: `${formatMultiplier(BALANCE.timing.hitEnemyPlayer)}×${profile.attacks}` };
  }
  if (timing === 'activated' || timing === 'channel') {
    // 起動・魂力（MTG 要素 ○ バッチC1）：起動のエナジーで倍率が変わる。表示はエナジーつき
    return { label: timingLabelFor(timing, card.abilities), value: timingMultiplier(timing, base, undefined, card) };
  }
  if (timing !== 'attack' || base !== 'monster') return { label: t.label, value: timingMultiplier(timing, base) };
  const profile = attackProfile(card.keywords);
  const value = timingMultiplier(timing, base, profile);
  const T = BALANCE.timing;
  const names: string[] = [t.label];
  let text = formatMultiplier(T.attack);
  if (profile.attacks !== 1) {
    text += `×${profile.attacks}`;
    names.push(getKeyword('doubleAttack')?.name ?? '二回攻撃');
  }
  if (profile.haste) {
    text += `+${formatMultiplier(T.attackHasteBonus)}`;
    names.push(getKeyword('haste')?.name ?? '速攻');
  }
  return { label: names.join('・'), value, text: profile.attacks === 1 && !profile.haste ? undefined : text };
}

/** このオプション（の種類）をこの効果に付けられるか（タイミングは見ない） */
export function modifierFits(m: Pick<ModifierDef, 'scope'>, def: Pick<EffectDef, 'allowsMods' | 'scalable' | 'noDelay'>): boolean {
  switch (m.scope) {
    case 'damage':
      return def.allowsMods === true;
    case 'scale':
      return def.scalable === true;
    case 'delay':
      return def.noDelay !== true;
  }
}

/**
 * 効果に付いていて、その効果に付けられるオプション（防御無視・吸収は allowsMods、数値の倍数は scalable の効果だけ、
 * 遅延は noDelay でない効果）。付けられないものは無視する（validate が違反として出す）
 */
export function effectModifiers(e: EffectInstance): ModifierDef[] {
  const def = getEffect(e.id);
  if (!def) return [];
  return [...new Set(e.mods ?? [])]
    .map((m) => getModifier(m))
    .filter((m): m is ModifierDef => m !== undefined && modifierFits(m, def));
}

/** 効果1つのポイント：基礎ポイント ×（1 + オプション）× タイミング × 対象 × 条件 → 切り上げ */
export function effectPoints(e: EffectInstance, card: PointCard): EffectPoints {
  const def = getEffect(e.id);
  if (!def) return { base: 0, factors: [], raw: 0, value: 0, formula: '0' };
  const base = cardBase(card);
  const b = def.basePoints(e);
  const factors: Factor[] = [];

  const modDefs = effectModifiers(e);
  if (modDefs.length > 0) {
    factors.push({ label: modDefs.map((m) => m.name).join('・'), value: 1 + modDefs.reduce((s, m) => s + m.rate, 0) });
  }
  if (TIMINGS[e.timing]) factors.push(timingFactor(e.timing, base, card));
  if (BALANCE.target[e.target] !== undefined) {
    factors.push({ label: targetLabel(e.target, def.targetRule, e.timing), value: targetMultiplier(e.target, def.targetRule) });
  }
  if (e.condition && CONDITIONS[e.condition]) {
    factors.push({ label: CONDITIONS[e.condition].label, value: conditionMultiplier(e.condition, card) });
  }

  const raw = factors.reduce((x, f) => x * f.value, b);
  return { base: b, factors, raw, value: ceilPoints(raw), formula: buildFormula(def.baseFormula(e), b, factors, raw, '切り上げ') };
}

/** デメリット1つのポイント（正の数）：基礎ポイント × タイミング → 切り捨て。固定値のものはそのまま */
export function drawbackPoints(d: DrawbackInstance, card: PointCard): DrawbackPoints {
  const def = getDrawback(d.id);
  if (!def) return { base: 0, factors: [], raw: 0, value: 0, formula: '0' };
  const base = cardBase(card);
  const b = def.basePoints(d, card);
  if (def.fixed) {
    return { base: b, factors: [], raw: b, value: floorPoints(b), formula: def.baseFormula(d, card) };
  }
  const factors: Factor[] = [];
  if (d.timing && TIMINGS[d.timing]) factors.push(timingFactor(d.timing, base, card));
  const raw = factors.reduce((x, f) => x * f.value, b);
  return { base: b, factors, raw, value: floorPoints(raw), formula: buildFormula(def.baseFormula(d, card), b, factors, raw, '切り捨て') };
}

/** 内訳に出す効果名（例：「攻撃するたび 毒1」） */
export function effectLabel(e: EffectInstance, base: CardBase): string {
  const def = getEffect(e.id);
  if (!def) return `不明な効果（${e.id}）`;
  const value = def.shortValue ? def.shortValue(e) : def.hits ? `${e.value ?? 0}×${e.hits ?? 0}` : def.value ? String(e.value ?? 0) : '';
  const timing = e.timing !== defaultTiming(base) && TIMINGS[e.timing] ? `${TIMINGS[e.timing].label} ` : '';
  return `${timing}${def.name}${value}`;
}

export function drawbackLabel(d: DrawbackInstance, base: CardBase): string {
  const def = getDrawback(d.id);
  if (!def) return `不明なデメリット（${d.id}）`;
  const timing = d.timing && d.timing !== defaultTiming(base) && TIMINGS[d.timing] ? `${TIMINGS[d.timing].label} ` : '';
  return `${timing}${def.name}${def.value ? (d.value ?? 0) : ''}`;
}

/** ステータスとキーワードのポイントの合計（MTG 要素 ○ バッチC1：捨て札から使う能力・魂力の二者択一） */
export function bodyPoints(card: Pick<CardDef, 'stats' | 'keywords'>): number {
  if (!card.stats) return 0;
  const S = BALANCE.stats;
  const { attack, hp, defense } = card.stats;
  let v = attack * S.attackPoints + hp * S.hpPoints + defense * S.defensePoints;
  for (const k of card.keywords) {
    const def = getKeyword(k.id);
    if (def) v += def.points(k, card.stats);
  }
  return v;
}

/** カードの能力のポイント計算に渡す情報（効果のポイントの合計など） */
export function abilityContext(card: Pick<CardDef, 'stats' | 'keywords' | 'effects'> & { abilities?: CardDef['abilities']; cost?: number }): AbilityPointContext {
  const timing = card.stats ? 'summon' : 'play';
  let all = 0;
  let play = 0;
  let channel = 0;
  for (const e of card.effects) {
    const v = effectPoints(e, card).value;
    all += v;
    if (e.timing === timing) play += v;
    if (e.timing === 'channel') channel += v;
  }
  return {
    card,
    effectPoints: all,
    playEffectPoints: play,
    bodyPoints: bodyPoints(card),
    channelEffectPoints: channel,
    hasFromDiscard: card.effects.some((e) => e.timing === 'fromDiscard'),
  };
}

/** 起動・魂力のタイミングの表示名（エナジーつき。MTG 要素 ○ バッチC1） */
export function timingLabelFor(timing: TimingId, abilities: CardDef['abilities']): string {
  const id = timing === 'activated' ? 'activate' : timing === 'channel' ? 'channel' : null;
  const v = id ? (abilities ?? []).find((a) => a.id === id)?.value : undefined;
  return v === undefined ? TIMINGS[timing].label : `${TIMINGS[timing].label}（エナジー${v}）`;
}

/**
 * 魂力（MTG 要素 ○ バッチC1）の二者択一の割引：本体（ステータス・キーワード・魂力以外の効果）A と魂力の効果 B は
 * どちらか一方しか使えないので、合計を「高い方＋低い方×choice.otherRate」にする。割り引く量（正の数）。魂力が無ければ0
 */
export function choiceDiscount(card: CardDef): { value: number; formula: string } | null {
  if (!(card.abilities ?? []).some((a) => a.id === 'channel')) return null;
  const ctx = abilityContext(card);
  const b = ctx.channelEffectPoints;
  const a = ctx.bodyPoints + ctx.effectPoints - b;
  const low = Math.min(a, b);
  if (low <= 0) return null;
  const rate = BALANCE.choice.otherRate;
  const value = floorPoints(low * (1 - rate));
  return { value, formula: `本体${round2(a)}と魂力${round2(b)}：低い方${round2(low)}×${round2(1 - rate)} → 切り捨て` };
}

/** カードの能力1つのポイント（切り上げ） */
export function abilityPoints(a: AbilityInstance, ctx: AbilityPointContext): { value: number; formula: string } {
  const def = getAbility(a.id);
  if (!def) return { value: 0, formula: '0' };
  return { value: ceilPoints(def.points(a, ctx)), formula: def.formula(a, ctx) };
}

export function abilityLabel(a: AbilityInstance): string {
  const def = getAbility(a.id);
  return def ? `能力 ${def.displayName(a)}` : `不明な能力（${a.id}）`;
}

/** コストの差し引き（表にないコストは0。範囲外は validate が弾く） */
export function costPoints(cost: number): number {
  return BALANCE.card.costPoints[cost] ?? 0;
}

/** レアリティの上限。コスト0のカードは下がる（決定事項 #67） */
export function rarityCap(rarity: CardDef['rarity'], cost: number): number {
  const cap = BALANCE.rarity[rarity]?.cap ?? 0;
  return cost === 0 ? Math.max(0, cap - BALANCE.card.cost0CapPenalty) : cap;
}

export function calculatePoints(card: CardDef): PointSummary {
  const base = cardBase(card);
  const S = BALANCE.stats;
  const lines: PointLine[] = [];

  if (card.stats) {
    const { attack, hp, defense } = card.stats;
    if (attack !== 0) lines.push({ kind: 'stat', label: `攻撃力${attack}`, formula: `${attack}×${S.attackPoints}`, value: attack * S.attackPoints });
    lines.push({ kind: 'stat', label: `体力${hp}`, formula: `${hp}×${S.hpPoints}`, value: hp * S.hpPoints });
    if (defense !== 0) lines.push({ kind: 'stat', label: `守備力${defense}`, formula: `${defense}×${S.defensePoints}`, value: defense * S.defensePoints });

    card.keywords.forEach((k, index) => {
      const def = getKeyword(k.id);
      if (!def || !card.stats) return;
      lines.push({ kind: 'keyword', index, label: def.displayName(k), formula: def.formula(k, card.stats), value: def.points(k, card.stats) });
    });
  }

  card.effects.forEach((e, index) => {
    const p = effectPoints(e, card);
    lines.push({ kind: 'effect', index, label: effectLabel(e, base), formula: p.formula, value: p.value });
  });

  // カードの能力（MTG 要素 ○ バッチB）：再利用・反復は効果のポイントから決まる
  const ctx = abilityContext(card);
  (card.abilities ?? []).forEach((a, index) => {
    const p = abilityPoints(a, ctx);
    lines.push({ kind: 'ability', index, label: abilityLabel(a), formula: p.formula, value: p.value });
  });

  // 魂力の二者択一の割引（MTG 要素 ○ バッチC1）
  const choice = choiceDiscount(card);
  if (choice && choice.value > 0) {
    lines.push({ kind: 'limit', label: '二者択一の割引（魂力）', formula: choice.formula, value: -choice.value });
  }

  const costPt = costPoints(card.cost);
  if (costPt !== 0) {
    lines.push({ kind: 'cost', label: `コスト${card.cost}`, formula: `−${costPt}`, value: -costPt });
  }

  let drawbackTotal = 0;
  card.drawbacks.forEach((d, index) => {
    const p = drawbackPoints(d, card);
    drawbackTotal += p.value;
    lines.push({ kind: 'drawback', index, label: drawbackLabel(d, base), formula: p.formula, value: -p.value + 0 });
  });

  const cap = rarityCap(card.rarity, card.cost);
  const limit = drawbackOffsetLimit(card.cost, cap);
  const drawbackOffset = Math.min(drawbackTotal, limit);
  if (drawbackTotal > drawbackOffset) {
    const why = limit === 0 ? `コスト${BALANCE.curse.minCostForOffset}未満のカードは差し引けない` : `差し引けるのは${limit}ptまで`;
    lines.push({
      kind: 'limit',
      label: 'デメリットの差し引き上限',
      formula: `${drawbackTotal} − ${drawbackOffset}（${why}）`,
      value: drawbackTotal - drawbackOffset,
    });
  }

  const total = lines.reduce((s, l) => s + l.value, 0);
  return { lines, total, cap, remaining: cap - total, drawbackTotal, drawbackOffset };
}

/** デメリットで差し引けるポイントの上限 */
export function drawbackOffsetLimit(cost: number, cap: number): number {
  const C = BALANCE.curse;
  return cost < C.minCostForOffset ? 0 : Math.floor(cap * C.maxOffsetRate);
}
