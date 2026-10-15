/** ポイント計算。合計 = ステータス + キーワード + 効果 − コスト×10 − デメリット */
import { BALANCE } from './balance.ts';
import { cardBase } from './classify.ts';
import { formatMultiplier } from './labels.ts';
import { ceilPoints, floorPoints, round2 } from './math.ts';
import {
  CONDITIONS,
  TIMINGS,
  conditionMultiplier,
  defaultTiming,
  targetLabel,
  targetMultiplier,
  timingMultiplier,
} from './options.ts';
import { getDrawback, getEffect, getKeyword, getModifier } from './registry.ts';
import type { CardBase, CardDef, DrawbackInstance, EffectInstance, PointLine, PointSummary } from './types.ts';

export interface Factor {
  label: string;
  value: number;
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
      : [String(round2(base)), ...shown.map((f) => `${formatMultiplier(f.value)}（${f.label}）`)].join(' × ');
  return Number.isInteger(round2(raw)) ? body : `${body} = ${round2(raw)} → ${rounding}`;
}

/** 効果1つのポイント：基礎ポイント ×（1 + オプション）× タイミング × 対象 × 条件 → 切り上げ */
export function effectPoints(e: EffectInstance, base: CardBase): EffectPoints {
  const def = getEffect(e.id);
  if (!def) return { base: 0, factors: [], raw: 0, value: 0, formula: '0' };
  const b = def.basePoints(e);
  const factors: Factor[] = [];

  const mods = def.allowsMods ? [...new Set(e.mods ?? [])] : [];
  const modDefs = mods.map((m) => getModifier(m)).filter((m) => m !== undefined);
  if (modDefs.length > 0) {
    factors.push({ label: modDefs.map((m) => m.name).join('・'), value: 1 + modDefs.reduce((s, m) => s + m.rate, 0) });
  }
  if (TIMINGS[e.timing]) factors.push({ label: TIMINGS[e.timing].label, value: timingMultiplier(e.timing, base) });
  if (BALANCE.target[e.target] !== undefined) {
    factors.push({ label: targetLabel(e.target, def.targetRule, e.timing), value: targetMultiplier(e.target) });
  }
  if (e.condition && CONDITIONS[e.condition]) {
    factors.push({ label: CONDITIONS[e.condition].label, value: conditionMultiplier(e.condition) });
  }

  const raw = factors.reduce((x, f) => x * f.value, b);
  return { base: b, factors, raw, value: ceilPoints(raw), formula: buildFormula(def.baseFormula(e), b, factors, raw, '切り上げ') };
}

/** デメリット1つのポイント（正の数）：基礎ポイント × タイミング → 切り捨て。固定値のものはそのまま */
export function drawbackPoints(d: DrawbackInstance, base: CardBase): DrawbackPoints {
  const def = getDrawback(d.id);
  if (!def) return { base: 0, factors: [], raw: 0, value: 0, formula: '0' };
  const b = def.basePoints(d);
  if (def.fixedPoints !== undefined) {
    return { base: b, factors: [], raw: def.fixedPoints, value: def.fixedPoints, formula: def.baseFormula(d) };
  }
  const factors: Factor[] = [];
  if (d.timing && TIMINGS[d.timing]) factors.push({ label: TIMINGS[d.timing].label, value: timingMultiplier(d.timing, base) });
  const raw = factors.reduce((x, f) => x * f.value, b);
  return { base: b, factors, raw, value: floorPoints(raw), formula: buildFormula(def.baseFormula(d), b, factors, raw, '切り捨て') };
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
    const p = effectPoints(e, base);
    lines.push({ kind: 'effect', index, label: effectLabel(e, base), formula: p.formula, value: p.value });
  });

  if (card.cost !== 0) {
    const per = BALANCE.card.pointsPerCost;
    lines.push({ kind: 'cost', label: `コスト${card.cost}`, formula: `${card.cost}×−${per}`, value: -card.cost * per });
  }

  let drawbackTotal = 0;
  card.drawbacks.forEach((d, index) => {
    const p = drawbackPoints(d, base);
    drawbackTotal += p.value;
    lines.push({ kind: 'drawback', index, label: drawbackLabel(d, base), formula: p.formula, value: -p.value + 0 });
  });

  const total = lines.reduce((s, l) => s + l.value, 0);
  const cap = BALANCE.rarity[card.rarity]?.cap ?? 0;
  return { lines, total, cap, remaining: cap - total, drawbackTotal };
}
