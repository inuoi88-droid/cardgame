/** 対戦エンジンの公開窓口 */
export * from './types.ts';
export { createGame, type GameConfig, type PlayerSetup, type CreateResult } from './setup.ts';
export { applyAction, validateAction } from './apply.ts';
export { legalActions, playInfo, type PlayInfo } from './legal.ts';
export { viewFor, HIDDEN_CARD_ID } from './view.ts';
export { attackBlockReason, attackTargets, attacksPerTurn } from './combat.ts';
export { keywordFlags } from './damage.ts';
export { nextFullMulliganSize } from './mulligan.ts';
export { other, cardName, findMonster, targetLabel } from './core.ts';
