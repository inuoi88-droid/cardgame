/** 対戦エンジンの公開窓口 */
export * from './types.ts';
export { createGame, type GameConfig, type PlayerSetup, type CreateResult } from './setup.ts';
export { applyAction, validateAction } from './apply.ts';
export { legalActions, playInfo, payableEnemyTargets, isPowerCapWarning, NOTE_TAUNT_LIMITED, WARN_QUASH, type PlayInfo } from './legal.ts';
export { viewFor, HIDDEN_CARD_ID } from './view.ts';
export { attackBlockReason, attackTargets, attacksPerTurn, cannotAttack } from './combat.ts';
export { keywordFlags, targetableTaunts, cardTargetableTaunts, combatBonus } from './damage.ts';
export { lifespanOf } from './play.ts';
export { tokenCount } from './zones.ts';
export { nextFullMulliganSize } from './mulligan.ts';
export { other, cardName, findMonster, targetLabel, effectiveAttack } from './core.ts';
