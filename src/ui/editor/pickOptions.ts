/**
 * 選択パネル（OptionPicker）に渡す選択肢を、エンジンの一覧（TIMINGS・CONDITIONS・allowedTargets・効果の追加指定）から作る。
 * 効果やタイミング・条件の ID はここに書かない。定義が増えれば、そのまま選択肢に出る。
 *
 * TimingDef / ConditionDef / 追加指定の選択肢に、任意の項目 group（見出し）と description（1行の説明）があれば使う。
 * なければ、条件は「ゆるい／ふつう／きびしい」の見出し、タイミングは定義から作った説明にする。
 */
import {
  CONDITIONS,
  CONDITION_TIER_LABEL,
  TIMINGS,
  allowedTargets,
  attackProfile,
  cardBase,
  conditionMultiplier,
  conditionsFor,
  drawbackPoints,
  effectPoints,
  fitDrawback,
  fitEffect,
  formatMultiplier,
  getEffect,
  isPowerTiming,
  targetLabel,
  targetMultiplier,
  timingMultiplier,
  timingsFor,
  type CardBase,
  type CardDef,
  type ConditionId,
  type DrawbackInstance,
  type EffectInstance,
  type TargetId,
  type TimingDef,
  type TimingId,
} from '../../engine/index.ts';
import type { PickOption } from './OptionPicker.tsx';

/** 定義にあれば使う任意の項目（options.ts にまだ無くても動くように、型を信用せずに読む） */
interface Extra {
  group?: unknown;
  description?: unknown;
}
const str = (x: unknown): string | undefined => (typeof x === 'string' && x.trim() !== '' ? x : undefined);
const extra = (def: unknown): { group?: string; description?: string } => {
  const d = (def ?? {}) as Extra;
  return { group: str(d.group), description: str(d.description) };
};

/** 倍率の表示。定義が増えて計算できない値になっても壊れないように */
function mult(f: () => number): string | undefined {
  try {
    const m = f();
    return typeof m === 'number' && Number.isFinite(m) ? `×${formatMultiplier(m)}` : undefined;
  } catch {
    return undefined;
  }
}

const NONE = '';

// ---------------------------------------------------------------- タイミング

/** タイミングの説明がないときに、定義（パワーになるか・「選んだ1体」が何を指すか）から作る */
function timingAutoDescription(def: TimingDef, base: CardBase): string {
  const parts: string[] = [];
  if (base === 'spell' && def.powerTiming) parts.push('パワーになる（場に残って毎回発動）');
  switch (def.chosen) {
    case 'manual':
      parts.push('使うときに対象を選べる');
      break;
    case 'attackTarget':
      parts.push('「選んだ1体」は攻撃した相手');
      break;
    case 'damageSource':
      parts.push('「選んだ1体」はダメージを与えてきた相手');
      break;
    default:
      parts.push('対象は選べない（ランダム・全体など）');
  }
  return parts.join('・');
}

function timingReason(def: TimingDef): string {
  const bases = def.bases ?? [];
  if (bases.length === 1 && bases[0] === 'monster') return 'モンスター専用';
  if (bases.length === 1 && bases[0] === 'spell') return 'モンスター以外のカード専用';
  return 'このカードでは使えません';
}

function timingOptions(card: CardDef, points: (t: TimingId) => string | undefined): PickOption[] {
  const base = cardBase(card);
  const attack = attackProfile(card.keywords);
  const usable = new Set<TimingId>(timingsFor(base));
  return (Object.keys(TIMINGS) as TimingId[]).map((t) => {
    const def = TIMINGS[t];
    const x = extra(def);
    const ok = usable.has(t);
    return {
      id: t,
      label: def.label,
      group: x.group,
      description: x.description ?? timingAutoDescription(def, base),
      hint: mult(() => timingMultiplier(t, base, attack)),
      points: ok ? points(t) : undefined,
      disabled: ok ? undefined : timingReason(def),
    };
  });
}

export function effectTimingOptions(effect: EffectInstance, card: CardDef): PickOption[] {
  const base = cardBase(card);
  return timingOptions(card, (t) => `${effectPoints(fitEffect({ ...effect, timing: t }, base), card).value}pt`);
}

export function drawbackTimingOptions(drawback: DrawbackInstance, card: CardDef): PickOption[] {
  const base = cardBase(card);
  return timingOptions(card, (t) => `−${drawbackPoints(fitDrawback({ ...drawback, timing: t }, base), card).value}pt`);
}

// ---------------------------------------------------------------- 対象

export function targetOptions(effect: EffectInstance, card: CardDef): PickOption[] {
  const def = getEffect(effect.id);
  if (!def) return [];
  const targets = allowedTargets(def.targetRule, effect.timing);
  const out: PickOption[] = targets.map((t) => ({
    id: t,
    label: targetLabel(t, def.targetRule, effect.timing),
    hint: mult(() => targetMultiplier(t, def.targetRule)),
    points: `${effectPoints({ ...effect, target: t }, card).value}pt`,
  }));
  if (!targets.includes(effect.target)) {
    out.push({ id: effect.target, label: targetLabel(effect.target as TargetId, def.targetRule, effect.timing), disabled: 'いまのタイミングでは選べません' });
  }
  return out;
}

// ---------------------------------------------------------------- 条件

function conditionReason(id: ConditionId, timing: TimingId, base: CardBase): string {
  const c = CONDITIONS[id];
  if (c.timings && !c.timings.includes(timing)) return `${c.timings.map((t) => TIMINGS[t]?.label ?? t).join('・')}のときだけ`;
  if (isPowerTiming(timing, base) && c.notForPower) return 'パワーになるタイミングでは使えません';
  return 'いまのタイミングでは使えません';
}

export function conditionOptions(effect: EffectInstance, card: CardDef): PickOption[] {
  const base = cardBase(card);
  const usable = new Set<ConditionId>(conditionsFor(effect.timing, base));
  const none: PickOption = {
    id: NONE,
    label: 'なし',
    description: '条件を付けずに毎回発動する',
    hint: '×1.0',
    points: `${effectPoints({ ...effect, condition: null }, card).value}pt`,
    pinned: true,
  };
  const list = (Object.keys(CONDITIONS) as ConditionId[]).map((c): PickOption => {
    const def = CONDITIONS[c];
    const x = extra(def);
    const ok = usable.has(c);
    return {
      id: c,
      label: def.label,
      group: x.group ?? (def.tier ? CONDITION_TIER_LABEL[def.tier] : undefined),
      description: x.description,
      hint: mult(() => conditionMultiplier(c)),
      points: ok ? `${effectPoints({ ...effect, condition: c }, card).value}pt` : undefined,
      disabled: ok ? undefined : conditionReason(c, effect.timing, base),
    };
  });
  return [none, ...list];
}

/** 条件の選択肢の ID ⇔ 値（「なし」は空文字） */
export const conditionValue = (c: ConditionId | null): string => c ?? NONE;
export const conditionFromValue = (v: string): ConditionId | null => (v === NONE ? null : (v as ConditionId));

// ---------------------------------------------------------------- 効果ごとの追加指定

export function effectOptionOptions(effect: EffectInstance, card: CardDef): PickOption[] {
  const def = getEffect(effect.id);
  if (!def?.option) return [];
  return def.option.choices.map((c) => {
    const x = extra(c);
    return {
      id: c.id,
      label: c.label,
      group: x.group,
      description: x.description,
      points: `${effectPoints({ ...effect, option: c.id }, card).value}pt`,
    };
  });
}
