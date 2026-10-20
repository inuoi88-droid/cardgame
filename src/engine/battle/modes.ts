/**
 * モード選択（MTG 要素 ○ バッチC2：分割カード・モード選択・製造・暴動）と双呪の小道具。
 * 使用時・召喚時・捨て札から使ったときの効果に mode（1＝A・2＝B・3＝C）が付いていれば、使うときに1つを選ぶ。
 * mode の無い効果は「いつも」出る。0 は双呪（すべてのモード。追加エナジー）
 */
import { getAbility } from '../registry.ts';
import type { CardDef, EffectInstance, ModeId, TimingId } from '../types.ts';

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
export function resolveMode(def: Pick<CardDef, 'effects'> | undefined, timing: TimingId, mode: number | undefined): number | undefined {
  if (cardModes(def, timing).length === 0) return undefined;
  return mode ?? 1;
}

/** この効果が、選んだモードで出るか（mode が undefined なら全部） */
export function modeMatches(e: EffectInstance, mode: number | undefined): boolean {
  return e.mode === undefined || mode === undefined || mode === 0 || e.mode === mode;
}

/**
 * このタイミング・モードで出る効果を、解決する順に並べる：「いつも」の効果はカードの順、モードの効果は最初のモードの効果の位置に
 * モードの番号の順（双呪なら A→B→C）。効果テキスト（text.ts の describeEffects）と同じ並び
 */
export function effectsForMode(effects: readonly EffectInstance[], timing: TimingId, mode: number | undefined): EffectInstance[] {
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
