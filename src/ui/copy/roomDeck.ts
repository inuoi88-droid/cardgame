/**
 * オンラインの部屋から、決着した対戦の相手のデッキを取り出す（純粋関数。決定事項 #122）。
 * サーバーの RoomView.opponentDeck（status が 'ended' のときだけ届く）を使い、無い古いサーバーでも
 * ドラフトの部屋なら公開のドラフトの記録（room.draft.taken）から組み立てる。決着前は何も返さない（対戦中の非公開情報を出さない）。
 */
import { battle, type CardDef, type Deck } from '../../engine/index.ts';
import type { RoomView } from '../../online/protocol.ts';

export interface RoomOpponentDeck {
  /** 相手の名前 */
  name: string;
  deck: Deck;
  cards: CardDef[];
}

export function opponentDeckOf(room: Pick<RoomView, 'status' | 'seat' | 'names' | 'opponentDeck' | 'draft' | 'code'>): RoomOpponentDeck | null {
  if (room.status !== 'ended') return null;
  const opp = battle.other(room.seat);
  const name = (room.names[opp] ?? '').trim() || (room.opponentDeck?.name ?? '').trim() || '相手';
  if (room.opponentDeck && room.opponentDeck.deck.entries.length > 0) return { name, deck: room.opponentDeck.deck, cards: room.opponentDeck.cards };
  const taken = room.draft?.done ? room.draft.taken[opp] : null;
  if (!taken || taken.length === 0) return null;
  return {
    name,
    deck: { v: 1, id: `draft-${room.code}-${opp}`, name: `${name}のドラフトのデッキ`, entries: taken.map((t) => ({ cardId: t.card.id, count: t.count })) },
    cards: taken.map((t) => t.card),
  };
}
