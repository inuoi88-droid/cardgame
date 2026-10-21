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
  discardAbilityInfo,
  discardAbilityInfos,
  payOptions,
  bestEnlist,
  discardPreference,
  exilePreference,
  setAsideInfo,
  setAsideInfos,
  waitingPlayInfos,
  revealInfo,
  revealInfos,
  type SetAsideInfo,
  type RevealInfo,
  type PlayInfo,
  type ActivateInfo,
  type HandAbilityInfo,
  type ModeInfo,
  type PayOptions,
  type AltInfo,
  type DiscardAbilityInfo,
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
  validatePlay,
  costCtxOf,
  WARN_ICED,
  type CostBreakdown,
  type CostStep,
  type CostCtx,
  type PlayOpts,
} from './play.ts';
export { cardModes, entwineCost, spreeCost, isVillain } from './modes.ts';
export { lastChapter, advanceableSagas } from './powers.ts';
export { activateSource, handAbilityOf, handAbilityKinds, discardAbilityOf, discardAbilityKinds, ACTIVATE_USE_LABEL, levelOf } from './abilities.ts';
export { waitingEntry, WAITING_LABEL, setAsideKinds } from './waiting.ts';
export { altWinGoalOf, altWinTarget, achieveOf, isEmblemCard } from './powers.ts';
export { waitingRule, revealCostOf } from './play.ts';
export { viewFor, HIDDEN_CARD_ID } from './view.ts';
export { attackBlockReason, attackTargets, attacksPerTurn, cannotAttack, enlistOptions } from './combat.ts';
export { keywordFlags, targetableTaunts, cardTargetableTaunts, combatBonus, guarded } from './damage.ts';
export { lifespanOf } from './play.ts';
export { tokenCount, fatigueDamage, nextFatigueDamage } from './zones.ts';
export { nextFullMulliganSize } from './mulligan.ts';
export { other, cardName, findMonster, targetLabel, effectiveAttack, dormantNow, monsterDormant } from './core.ts';
export { ruleHooks, fogDamage, fieldAttackBonus, type RuleHooks } from './rules.ts';
export { nextPlanarTurn, usesDayNight } from './matchRules.ts';
