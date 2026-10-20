/**
 * エディター用の純粋な補助関数。
 * 選べる選択肢の一覧と、入力を変えたときに選べなくなった値を自動で直す処理。
 */
import { BALANCE } from './balance.ts';
import { CARD_TYPE_LABEL } from './labels.ts';
import { cardBase, classifyCard, rarityRank } from './classify.ts';
import { drawbackValueSpec, type AbilityDef, type DrawbackDef, type EffectDef, type ModifierDef } from './define.ts';
import { modifierFits } from './points.ts';
import { allowedTargets, conditionsFor, defaultTiming, targetsForEffect, TIMINGS, timingsFor } from './options.ts';
import { getAbility, getDrawback, getEffect, getModifier, listAbilities, listDrawbacks, listEffects, listModifiers } from './registry.ts';
import { stampScale } from './scaling.ts';
import type { AbilityInstance, CardBase, CardDef, DrawbackInstance, EffectInstance, Rarity, Stats, TimingId } from './types.ts';

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

/** このレアリティ（と土台）で使える効果。土台を渡すと、付けられない土台の効果（新生はモンスターだけ）を外す */
export function availableEffects(rarity: Rarity, base?: CardBase): EffectDef[] {
  return listEffects().filter(
    (d) => (!d.minRarity || rarityRank(rarity) >= rarityRank(d.minRarity)) && (base === undefined || !d.bases || d.bases.includes(base)),
  );
}

/** このデメリットをこの土台のカードに付けられるか（モンスター専用・付けられる種類。種類の細かい判定は validate） */
export function drawbackFitsBase(def: Pick<DrawbackDef, 'monsterOnly' | 'cardTypes'>, base: CardBase): boolean {
  if (def.monsterOnly && base !== 'monster') return false;
  if (!def.cardTypes) return true;
  return base === 'monster' ? def.cardTypes.includes('monster') : def.cardTypes.some((t) => t !== 'monster');
}

/** このカードに追加できるデメリット（使用済み・土台に合わないもの・同時に付けられないものを除く） */
export function availableDrawbacks(card: CardDef): DrawbackDef[] {
  const base = cardBase(card);
  const used = new Set(card.drawbacks.map((d) => d.id));
  return listDrawbacks().filter(
    (d) =>
      !used.has(d.id) &&
      drawbackFitsBase(d, base) &&
      !card.drawbacks.some((x) => d.conflicts?.includes(x.id) || getDrawback(x.id)?.conflicts?.includes(d.id)) &&
      // カードの能力と同時に付けられないもの（循環・再利用・反復と廃棄）
      !(card.abilities ?? []).some((a) => getAbility(a.id)?.conflicts?.includes(d.id)),
  );
}

/**
 * このカードの能力（MTG 要素 ○ バッチB）を付けられない理由。付けられるなら null
 * （上限・使用済み・カードの種類・レアリティ・同時に付けられない能力やデメリット）
 */
export function abilityBlockReason(card: CardDef, def: AbilityDef): string | null {
  const list = card.abilities ?? [];
  if (list.some((a) => a.id === def.id)) return 'もう付いています';
  if (list.length >= BALANCE.card.maxAbilities) return `カードの能力は${BALANCE.card.maxAbilities}つまでです`;
  if (def.minRarity && rarityRank(card.rarity) < rarityRank(def.minRarity)) return 'レアリティが足りません';
  const type = classifyCard(card);
  if (def.cardTypes && !def.cardTypes.includes(type)) return `${def.cardTypes.map((t) => CARD_TYPE_LABEL[t]).join('・')}のカードだけ`;
  for (const a of list) {
    const other = getAbility(a.id);
    if (def.conflicts?.includes(a.id) || other?.conflicts?.includes(def.id)) return `「${other?.name ?? a.id}」と同時に付けられません`;
  }
  for (const d of card.drawbacks) {
    if (def.conflicts?.includes(d.id)) return `デメリット「${getDrawback(d.id)?.name ?? d.id}」と同時に付けられません`;
  }
  return null;
}

/** このカードに付けられる能力（付けられないものは理由つき。エディターの選択パネル用） */
export function abilityChoices(card: CardDef): { def: AbilityDef; blocked: string | null }[] {
  return listAbilities().map((def) => ({ def, blocked: abilityBlockReason(card, def) }));
}

export function createAbility(abilityId: string): AbilityInstance {
  const def = getAbility(abilityId);
  const a: AbilityInstance = { id: abilityId };
  if (def?.value) a.value = def.value.default;
  if (def?.option) a.option = def.option.default;
  return a;
}

/** このデメリットをこの土台のカードに付けるとき選べるタイミング（デメリットごとの制限 timings を含む） */
export function drawbackTimings(def: Pick<DrawbackDef, 'timings'>, base: CardBase): TimingId[] {
  return timingsFor(base).filter((t) => !def.timings || def.timings.includes(t));
}

/** 土台に合わないタイミングは、その土台の基本タイミング（使用時／召喚時）に読み替える */
function mapTiming(timing: TimingId, base: CardBase): TimingId {
  return TIMINGS[timing]?.bases.includes(base) ? timing : defaultTiming(base);
}

/** この効果をこの土台のカードに付けるとき選べるタイミング（効果ごとの制限 timings を含む） */
export function effectTimings(def: Pick<EffectDef, 'timings'>, base: CardBase): TimingId[] {
  return timingsFor(base).filter((t) => !def.timings || def.timings.includes(t));
}

/** この効果に、このタイミングで付けられるオプション（防御無視・吸収と、数値の倍数と、遅延） */
export function modifiersFor(def: Pick<EffectDef, 'allowsMods' | 'scalable' | 'noDelay'>, timing: TimingId): ModifierDef[] {
  return listModifiers().filter((m) => {
    if (!modifierFits(m, def)) return false;
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
  // 遅延と X は同時に付けられない（後から付けたほうを残す）
  const delayAt = mods.findIndex((m) => getModifier(m)?.scope === 'delay');
  const xAt = mods.indexOf('xEnergy');
  if (delayAt >= 0 && xAt >= 0) mods = mods.filter((_, i) => i !== Math.min(delayAt, xAt));
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
  const mapped = mapTiming(d.timing ?? defaultTiming(base), base);
  const timings = drawbackTimings(def, base);
  return { ...d, timing: timings.includes(mapped) ? mapped : (timings[0] ?? defaultTiming(base)) };
}

export function createDrawback(drawbackId: string, base: CardBase): DrawbackInstance {
  const def = getDrawback(drawbackId);
  const d: DrawbackInstance = { id: drawbackId, timing: defaultTiming(base) };
  if (def?.option) d.option = def.option.default;
  const spec = def ? drawbackValueSpec(def, d) : undefined;
  if (spec) d.value = spec.default;
  return fitDrawback(d, base);
}

/** デメリットの追加指定を変える。数値の入力欄が変わるなら、その初期値に戻す */
export function changeDrawbackOption(d: DrawbackInstance, option: string): DrawbackInstance {
  const def = getDrawback(d.id);
  const next: DrawbackInstance = { ...d, option };
  const spec = def ? drawbackValueSpec(def, next) : undefined;
  if (spec && (next.value === undefined || next.value < spec.min || next.value > spec.max || drawbackValueSpec(def!, d) !== spec)) next.value = spec.default;
  return next;
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
      .filter((d) => {
        const def = getDrawback(d.id);
        return !def || drawbackFitsBase(def, base);
      })
      .map((d) => fitDrawback(d, base)),
    // カードの能力はモンスターには付かない（付けられる種類にモンスターがあるものだけ残す）
    ...(monster && card.abilities ? { abilities: card.abilities.filter((x) => getAbility(x.id)?.cardTypes?.includes('monster') ?? true) } : {}),
    // 新生などモンスターだけの効果は、モンスターでなくなったら外す
    ...(monster ? {} : { effects: card.effects.filter((e) => !getEffect(e.id)?.bases || getEffect(e.id)!.bases!.includes(base)).map((e) => fitEffect(e, base)) }),
  };
}

export { timingsFor, allowedTargets, targetsForEffect, conditionsFor };
