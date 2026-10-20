/** ルールエンジンの公開窓口。UI・CPU・サーバーはここから読み込む。 */
export * from './types.ts';
export { BALANCE } from './balance.ts';
export { analyzeCard } from './analyze.ts';
export { cardBase, classifyCard, isCurseCard, rarityRank } from './classify.ts';
export { calculatePoints, effectPoints, drawbackPoints, attackProfile, costPoints, rarityCap, abilityContext, abilityPoints, modeSummary, modeDiscount } from './points.ts';
export { describeCard, describeEffect, describeEffects, describeDrawback, describeAbility, modeTexts, type ModeText } from './text.ts';
export * from './labels.ts';
export * from './options.ts';
export * from './registry.ts';
export * from './editing.ts';
export { fromBaseScale, scaleCardValues, stampScale, toCurrentScale } from './scaling.ts';
export type { EffectDef, KeywordDef, DrawbackDef, ModifierDef, AbilityDef, ParamSpec, OptionSpec, EffectGroup, PointCard, AbilityGroup } from './define.ts';
export { EFFECT_GROUPS, ABILITY_GROUPS, drawbackValueSpec } from './define.ts';
export { analyzeDeck, isNameTaken, normalizeName, uniqueName, type DeckAnalysis, type RarityRow } from './deck.ts';
export {
  buildExport,
  descriptionLength,
  exportDeck,
  normalizeDescription,
  mergeImport,
  parseCard,
  parseDeck,
  parseImport,
  EXPORT_FORMAT,
  type ExportBundle,
  type MergeResult,
  type ParsedImport,
} from './io.ts';
export * as battle from './battle/index.ts';
export * as ai from './ai/index.ts';
