/**
 * エディター用の純粋な補助関数。
 * 選べる選択肢の一覧と、入力を変えたときに選べなくなった値を自動で直す処理。
 */
import { BALANCE } from './balance.ts';
import { cardBase, rarityRank } from './classify.ts';
import type { DrawbackDef, EffectDef, ModifierDef } from './define.ts';
import { allowedTargets, conditionsFor, defaultTiming, targetsForEffect, TIMINGS, timingsFor } from './options.ts';
import { getDrawback, getEffect, getModifier, listDrawbacks, listEffects, listModifiers } from './registry.ts';
import { stampScale } from './scaling.ts';
import type { CardBase, CardDef, DrawbackInstance, EffectInstance, Rarity, Stats, TimingId } from './types.ts';

export const DEFAULT_STATS: Stats = { attack: 1 * BALANCE.amountScale, hp: 1 * BALANCE.amountScale, defense: 0 };

export function newCard(id: string): CardDef {
  return stampScale({
    v: 1,
    id,
    name: '',
    icon: '🔥',
    rarity: 'common',
    cost: 1,
    stats: null,
    keywords: [],
    effects: [],
    drawbacks: [],
  });
}

/** このレアリティで使える効果 */
export function availableEffects(rarity: Rarity): EffectDef[] {
  return listEffects().filter((d) => !d.minRarity || rarityRank(rarity) >= rarityRank(d.minRarity));
}

/** このカードに追加できるデメリット（使用済みとモンスター専用を除く） */
export function availableDrawbacks(card: CardDef): DrawbackDef[] {
  const base = cardBase(card);
  const used = new Set(card.drawbacks.map((d) => d.id));
  return listDrawbacks().filter((d) => !used.has(d.id) && (!d.monsterOnly || base === 'monster'));
}

/** 土台に合わないタイミングは、その土台の基本タイミング（使用時／召喚時）に読み替える */
function mapTiming(timing: TimingId, base: CardBase): TimingId {
  return TIMINGS[timing]?.bases.includes(base) ? timing : defaultTiming(base);
}

/** この効果をこの土台のカードに付けるとき選べるタイミング（効果ごとの制限 timings を含む） */
export function effectTimings(def: Pick<EffectDef, 'timings'>, base: CardBase): TimingId[] {
  return timingsFor(base).filter((t) => !def.timings || def.timings.includes(t));
}

/** この効果に、このタイミングで付けられるオプション（防御無視・吸収と、数値の倍数） */
export function modifiersFor(def: Pick<EffectDef, 'allowsMods' | 'scalable'>, timing: TimingId): ModifierDef[] {
  return listModifiers().filter((m) => {
    if (m.scope === 'damage' ? !def.allowsMods : !def.scalable) return false;
    return !m.timings || m.timings.includes(timing);
  });
}

/** 効果を、カードの土台に合わせて選べる値へ直す */
export function fitEffect(e: EffectInstance, base: CardBase): EffectInstance {
  const def = getEffect(e.id);
  if (!def) return e;
  const timings = effectTimings(def, base);
  const mapped = mapTiming(e.timing, base);
  const timing = timings.includes(mapped) ? mapped : (timings[0] ?? defaultTiming(base));
  const targets = targetsForEffect(def, timing, base);
  const target = targets.includes(e.target) ? e.target : targets[0]!;
  const condition = e.condition !== null && conditionsFor(timing, base).includes(e.condition) ? e.condition : null;
  const next: EffectInstance = { ...e, timing, target, condition };
  // 付けられないオプションを外す。数値の倍数は1つまで（後から付けたものを残す）
  const allowed = new Set(modifiersFor(def, timing).map((m) => m.id));
  let mods = [...new Set(e.mods ?? [])].filter((m) => allowed.has(m));
  const scale = mods.filter((m) => getModifier(m)?.scope === 'scale');
  if (scale.length > 1) mods = mods.filter((m) => getModifier(m)?.scope !== 'scale' || m === scale[scale.length - 1]);
  if (mods.length > 0) next.mods = mods;
  else delete next.mods;
  return next;
}

export function createEffect(effectId: string, base: CardBase): EffectInstance {
  const def = getEffect(effectId);
  const timing = defaultTiming(base);
  const e: EffectInstance = { id: effectId, timing, target: 'self', condition: null };
  if (!def) return e;
  if (def.value) e.value = def.value.default;
  if (def.hits) e.hits = def.hits.default;
  if (def.option) e.option = def.option.default;
  return fitEffect(e, base);
}

/** 効果の種類を変える。タイミング・条件はなるべく引き継ぐ */
export function changeEffectType(e: EffectInstance, effectId: string, base: CardBase): EffectInstance {
  const fresh = createEffect(effectId, base);
  return fitEffect({ ...fresh, timing: e.timing, condition: e.condition, target: e.target }, base);
}

export function fitDrawback(d: DrawbackInstance, base: CardBase): DrawbackInstance {
  const def = getDrawback(d.id);
  if (!def) return d;
  if (def.fixed) return { ...d, timing: null };
  return { ...d, timing: mapTiming(d.timing ?? defaultTiming(base), base) };
}

export function createDrawback(drawbackId: string, base: CardBase): DrawbackInstance {
  const def = getDrawback(drawbackId);
  const d: DrawbackInstance = { id: drawbackId, timing: defaultTiming(base) };
  if (def?.value) d.value = def.value.default;
  return fitDrawback(d, base);
}

/** モンスターにする／やめる。キーワード・効果・デメリットを新しい土台に合わせる */
export function setMonster(card: CardDef, monster: boolean): CardDef {
  const base: CardBase = monster ? 'monster' : 'spell';
  return {
    ...card,
    stats: monster ? (card.stats ?? { ...DEFAULT_STATS }) : null,
    keywords: monster ? card.keywords : [],
    effects: card.effects.map((e) => fitEffect(e, base)),
    drawbacks: card.drawbacks
      .filter((d) => monster || !getDrawback(d.id)?.monsterOnly)
      .map((d) => fitDrawback(d, base)),
  };
}

export { timingsFor, allowedTargets, targetsForEffect, conditionsFor };
