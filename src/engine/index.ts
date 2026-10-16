/** ルールエンジンの公開窓口。UI・CPU・サーバーはここから読み込む。 */
export * from './types.ts';
export { BALANCE } from './balance.ts';
export { analyzeCard } from './analyze.ts';
export { cardBase, classifyCard, isCurseCard, rarityRank } from './classify.ts';
export { calculatePoints, effectPoints, drawbackPoints } from './points.ts';
export { describeCard, describeEffect, describeDrawback } from './text.ts';
export * from './labels.ts';
export * from './options.ts';
export * from './registry.ts';
export * from './editing.ts';
export type { EffectDef, KeywordDef, DrawbackDef, ModifierDef, ParamSpec, OptionSpec, EffectGroup } from './define.ts';
export { EFFECT_GROUPS } from './define.ts';
export { analyzeDeck, isNameTaken, normalizeName, uniqueName, type DeckAnalysis, type RarityRow } from './deck.ts';
export {
  buildExport,
  exportDeck,
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
