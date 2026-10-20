/**
 * プレイヤーから見える状態（Phase 3 で各プレイヤーに配信する形）。
 * 相手の手札の中身、両者の山札の中身と順番、乱数の状態、相手だけのログ、相手の選択肢を隠す。
 */
import type { CardDef } from '../types.ts';
import { other } from './core.ts';
import type { CardInst, GameState, PlayerId } from './types.ts';

export const HIDDEN_CARD_ID = '__hidden__';

const hide = (cards: CardInst[], owner: PlayerId): CardInst[] =>
  cards.map((_, i) => ({ uid: `hidden-${owner}-${i}`, cardId: HIDDEN_CARD_ID, owner }));

export function viewFor(g: GameState, p: PlayerId): GameState {
  const v = structuredClone(g);
  const opp = other(p);
  v.rng = 0;
  v.queue = [];
  v.players[opp].hand = hide(v.players[opp].hand, opp);
  v.players[opp].deck = hide(v.players[opp].deck, opp);
  v.players[p].deck = hide(v.players[p].deck, p);
  v.log = v.log.filter((e) => e.private === undefined || e.private === p);
  if (v.pending && v.pending.player !== p) {
    v.pending = { ...v.pending, prompt: '相手が選んでいます', options: [] };
  }
  // 相手のカード定義は、場・捨て札・除外・パワーに出たものだけ渡す（デッキの中身を明かさない）
  const visible = new Set<string>();
  const me = v.players[p];
  for (const c of [...me.hand, ...me.discard, ...me.exile]) visible.add(c.cardId);
  for (const c of g.players[p].deck) visible.add(c.cardId);
  for (const pl of v.players) {
    for (const m of pl.board) {
      visible.add(m.card.cardId);
      // 装備しているカード（MTG 要素 ○ バッチB。公開）
      for (const c of m.equipment ?? []) visible.add(c.cardId);
    }
    for (const c of [...pl.discard, ...pl.exile]) visible.add(c.cardId);
    for (const pw of pl.powers) visible.add(pw.cardId);
    // 予約（反復のカードを含む。公開）
    for (const d of pl.delayed ?? []) {
      visible.add(d.src.cardId);
      if (d.rebound) visible.add(d.rebound.card.cardId);
    }
  }
  if (v.pending) for (const o of v.pending.options) if (o.cardId) visible.add(o.cardId);
  // 無料で使う途中のカード（続唱でめくって公開済み）
  if (v.pending?.step.t === 'freePlay') visible.add(v.pending.step.card.cardId);
  const cards: Record<string, CardDef> = {};
  for (const [id, def] of Object.entries(v.cards)) if (visible.has(id)) cards[id] = def;
  v.cards = cards;
  return v;
}
