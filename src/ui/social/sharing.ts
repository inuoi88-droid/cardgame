/**
 * デッキの「フレンドに公開」（決定事項 #123）。公開・やめるの送信と、公開中のデッキを直したときの送り直しの印。
 * 印（デッキと使うカードの中身。socialLogic の shareSignature）は localStorage の cardgame.v1.sharedSig に deckId ごとに置き、
 * SocialRuntime が保存のたびに見比べて、変わっていれば送り直す（ルールに合わないデッキは送れないので前のまま）。
 */
import { analyzeDeck, type CardDef, type Deck } from '../../engine/index.ts';
import { shareSignature } from './socialLogic.ts';
import { socialAct } from './socialStore.ts';

const SIG_KEY = 'cardgame.v1.sharedSig';

export function loadSigs(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SIG_KEY);
    const x = raw ? (JSON.parse(raw) as unknown) : null;
    return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function saveSig(deckId: string, sig: string | null): void {
  const all = loadSigs();
  if (sig === null) delete all[deckId];
  else all[deckId] = sig;
  try {
    localStorage.setItem(SIG_KEY, JSON.stringify(all));
  } catch {
    // 何もしない（次の保存でまた送るだけ）
  }
}

/** デッキが使うカード */
export function usedCards(deck: Deck, cards: readonly CardDef[]): CardDef[] {
  const used = new Set(deck.entries.map((e) => e.cardId));
  return cards.filter((c) => used.has(c.id));
}

/** 公開できない理由（無ければ null） */
export function shareBlock(deck: Deck, cards: readonly CardDef[]): string | null {
  const a = analyzeDeck(deck, new Map(cards.map((c) => [c.id, c])));
  return a.valid ? null : 'ルールに合ったデッキだけ公開できます';
}

/** 公開する（同じデッキは置き換え）。エラーの言葉か null */
export async function shareDeckNow(deck: Deck, cards: readonly CardDef[]): Promise<string | null> {
  const block = shareBlock(deck, cards);
  if (block) return block;
  const used = usedCards(deck, cards);
  const res = await socialAct({ op: 'shareDeck', deck, cards: used });
  if (!res.ok) return res.error;
  saveSig(deck.id, shareSignature(deck, used));
  return null;
}

export async function unshareDeckNow(deckId: string): Promise<string | null> {
  const res = await socialAct({ op: 'unshareDeck', deckId });
  if (!res.ok) return res.error;
  saveSig(deckId, null);
  return null;
}
