/**
 * ドラフト戦の判断（純粋な関数）。中身はエンジンの src/engine/draft/ に移した（決定事項 #115）。
 * ここは今の DraftPage のための薄い入口
 */
import { draft } from '../../engine/index.ts';

export type DraftCounts = draft.DraftCounts;
export const { draftPool, countTotal, deckFromCounts, canAdd, makeOffer, addPick, cpuPickScore, cpuPick, runCpuDraft, cardsOf } = draft;
