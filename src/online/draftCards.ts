/**
 * オンラインのドラフトに使うカード（決定事項 #115・#117：公式カード「黎明の大陸」だけ）。
 * サーバーの中にあるこの一覧だけを使い、送られてきたカードは使わない（create・join のデッキはドラフトの部屋では無視する）。
 * サーバーのテストは ServeDeps.draftPool で別の山を渡せる
 */
import { OFFICIAL_CARDS } from '../official/index.ts';
import type { CardDef } from '../engine/types.ts';

export const ONLINE_DRAFT_CARDS: readonly CardDef[] = OFFICIAL_CARDS;
