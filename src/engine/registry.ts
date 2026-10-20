/** レジストリ本体。defs/ 以下の定義を ID で引けるようにする。 */
import type { AbilityDef, DrawbackDef, EffectDef, KeywordDef, ModifierDef } from './define.ts';
import { ABILITY_DEFS, DRAWBACK_DEFS, EFFECT_DEFS, KEYWORD_DEFS, MODIFIER_DEFS } from './registry.generated.ts';
import type { ModifierId } from './types.ts';

function indexById<T extends { id: string; order: number }>(defs: readonly T[], kind: string): Map<string, T> {
  const map = new Map<string, T>();
  for (const def of [...defs].sort((a, b) => a.order - b.order)) {
    if (map.has(def.id)) throw new Error(`${kind} の ID が重複しています: ${def.id}`);
    map.set(def.id, def);
  }
  return map;
}

const effects = indexById(EFFECT_DEFS, '効果');
const modifiers = indexById(MODIFIER_DEFS, 'オプション');
const keywords = indexById(KEYWORD_DEFS, 'キーワード');
const drawbacks = indexById(DRAWBACK_DEFS, 'デメリット');
const abilities = indexById(ABILITY_DEFS, 'カードの能力');

export const getEffect = (id: string): EffectDef | undefined => effects.get(id);
export const getModifier = (id: string): ModifierDef | undefined => modifiers.get(id as ModifierId);
export const getKeyword = (id: string): KeywordDef | undefined => keywords.get(id);
export const getDrawback = (id: string): DrawbackDef | undefined => drawbacks.get(id);
export const getAbility = (id: string): AbilityDef | undefined => abilities.get(id);

/** 並び順（order）どおりの一覧 */
export const listEffects = (): EffectDef[] => [...effects.values()];
export const listModifiers = (): ModifierDef[] => [...modifiers.values()];
export const listKeywords = (): KeywordDef[] => [...keywords.values()];
export const listDrawbacks = (): DrawbackDef[] => [...drawbacks.values()];
export const listAbilities = (): AbilityDef[] => [...abilities.values()];
