/**
 * オンラインのドラフトに使うカード（決定事項 #115：公式のカードだけ）。
 * 公式のカードの一式ができるまでは、仮にプリセットデッキのカードを使う（レジェンドはエンジンの draftPool が外す）。
 * TODO(統合)：公式のカード（OFFICIAL_CARDS）ができたら、ここをそれに差し替える。サーバーのテストは ServeDeps.draftPool で山を渡す
 */
import { PRESET_DECKS } from '../presets.ts';
import type { CardDef } from '../engine/types.ts';

export const ONLINE_DRAFT_CARDS: readonly CardDef[] = PRESET_DECKS.flatMap((p) => p.cards);
