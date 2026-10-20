/**
 * モード選択（MTG 要素 ○ バッチC2：分割カード・モード選択・製造・暴動）と双呪の小道具。
 * 使用時・召喚時・捨て札から使ったときの効果に mode（1＝A・2＝B・3＝C）が付いていれば、使うときに1つを選ぶ。
 * mode の無い効果は「いつも」出る。0 は双呪（すべてのモード。追加エナジー）
 */
import { getAbility } from '../registry.ts';
import type { CardDef, EffectInstance, ModeId, TimingId } from '../types.ts';

/**
 * 選んだモード：番号（1〜3。0 は双呪ですべて）か、放題（MTG 要素 △ バッチB）で選んだモードの並び（2つ以上）
 */
export type ModeSel = number | readonly number[];

/** このタイミングのモード（番号の順。モード選択のカードでなければ空） */
export function cardModes(def: Pick<CardDef, 'effects'> | undefined, timing: TimingId): ModeId[] {
  const set = new Set<ModeId>();
  for (const e of def?.effects ?? []) if (e.timing === timing && e.mode !== undefined) set.add(e.mode);
  return [...set].sort((a, b) => a - b);
}

/** 双呪の追加エナジー（双呪が無ければ 0） */
export function entwineCost(def: Pick<CardDef, 'abilities'> | undefined): number {
  for (const a of def?.abilities ?? []) {
    const k = getAbility(a.id)?.battle.entwineCost?.(a);
    if (k !== undefined) return k;
  }
  return 0;
}

/**
 * 実際に使うモード：モード選択のカードでなければ undefined。モードを渡されなければ A（1）
 * （蘇生・複写トークンなど、選ぶ場面のない召喚。決定事項ログ #94）
 */
export function resolveMode(def: Pick<CardDef, 'effects'> | undefined, timing: TimingId, mode: ModeSel | undefined): ModeSel | undefined {
  if (cardModes(def, timing).length === 0) return undefined;
  return mode ?? 1;
}

/** この効果が、選んだモードで出るか（mode が undefined なら全部。放題の並びなら、その中のモード） */
export function modeMatches(e: EffectInstance, mode: ModeSel | undefined): boolean {
  if (e.mode === undefined || mode === undefined) return true;
  if (typeof mode !== 'number') return mode.includes(e.mode);
  return mode === 0 || e.mode === mode;
}

/** 放題（MTG 要素 △ バッチB）の2つ目からのモード1つにつきのエナジー（放題が無ければ 0） */
export function spreeCost(def: Pick<CardDef, 'abilities'> | undefined): number {
  for (const a of def?.abilities ?? []) {
    const k = getAbility(a.id)?.battle.spreeCost?.(a);
    if (k !== undefined) return k;
  }
  return 0;
}

/** 最悪の二択（MTG 要素 △ バッチB）：モードを相手が選ぶカードか */
export function isVillain(def: Pick<CardDef, 'abilities'> | undefined): boolean {
  return (def?.abilities ?? []).some((a) => getAbility(a.id)?.battle.villain === true);
}

/** 段階（MTG 要素 △ バッチB）：このモードの追加のエナジー（段階が無ければ 0） */
export function tieredSurcharge(def: Pick<CardDef, 'abilities'> | undefined, mode: ModeSel | undefined, table: readonly number[]): number {
  if (typeof mode !== 'number' || mode <= 0) return 0;
  if (!(def?.abilities ?? []).some((a) => getAbility(a.id)?.battle.tiered === true)) return 0;
  return table[mode - 1] ?? 0;
}

/** モードの表示用の番号（放題の並びは最初の1つ。反復で使う） */
export function firstMode(mode: ModeSel | undefined): number | undefined {
  if (mode === undefined) return undefined;
  return typeof mode === 'number' ? mode : mode[0];
}

/**
 * このタイミング・モードで出る効果を、解決する順に並べる：「いつも」の効果はカードの順、モードの効果は最初のモードの効果の位置に
 * モードの番号の順（双呪なら A→B→C）。効果テキスト（text.ts の describeEffects）と同じ並び
 */
export function effectsForMode(effects: readonly EffectInstance[], timing: TimingId, mode: ModeSel | undefined): EffectInstance[] {
  const list = effects.filter((e) => e.timing === timing && modeMatches(e, mode));
  const moded = list.filter((e) => e.mode !== undefined).sort((a, b) => a.mode! - b.mode!);
  if (moded.length === 0) return list;
  const out: EffectInstance[] = [];
  let placed = false;
  for (const e of list) {
    if (e.mode === undefined) out.push(e);
    else if (!placed) {
      out.push(...moded);
      placed = true;
    }
  }
  return out;
}
