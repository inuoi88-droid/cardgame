/** 対戦エンジンの公開窓口 */
export * from './types.ts';
export { createGame, type GameConfig, type PlayerSetup, type CreateResult } from './setup.ts';
export { applyAction, validateAction } from './apply.ts';
export {
  legalActions,
  playInfo,
  payableEnemyTargets,
  isPowerCapWarning,
  NOTE_TAUNT_LIMITED,
  WARN_QUASH,
  discardPlayInfos,
  activateInfo,
  activateInfos,
  handAbilityInfo,
  handAbilityInfos,
  discardPreference,
  exilePreference,
  type PlayInfo,
  type ActivateInfo,
  type HandAbilityInfo,
  type ModeInfo,
} from './legal.ts';
export {
  costBreakdown,
  costNotes,
  effectiveCost,
  fromDiscardAbility,
  kickerCost,
  playTiming,
  playableModes,
  modeName,
  validateMode,
  WARN_ICED,
  type CostBreakdown,
  type CostStep,
} from './play.ts';
export { cardModes, entwineCost } from './modes.ts';
export { lastChapter, advanceableSagas } from './powers.ts';
export { activateSource, handAbilityOf, handAbilityKinds } from './abilities.ts';
export { viewFor, HIDDEN_CARD_ID } from './view.ts';
export { attackBlockReason, attackTargets, attacksPerTurn, cannotAttack } from './combat.ts';
export { keywordFlags, targetableTaunts, cardTargetableTaunts, combatBonus, guarded } from './damage.ts';
export { lifespanOf } from './play.ts';
export { tokenCount } from './zones.ts';
export { nextFullMulliganSize } from './mulligan.ts';
export { other, cardName, findMonster, targetLabel, effectiveAttack, dormantNow, monsterDormant } from './core.ts';
