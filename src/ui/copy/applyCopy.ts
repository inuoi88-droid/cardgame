/**
 * コピーを手元に保存する（store に書く）。中身の判断は copyLogic.ts（純粋関数）。
 * - deck：デッキごと（要るカードを足し、デッキ「<相手の名前>のデッキ（コピー）」を作る）
 * - cards：選んだカードだけ（デッキは作らない）
 * - selectionDeck：選んだカードと、それだけのデッキ「<相手の名前>のデッキ（一部）」（枚数が足りなくてもよい。デッキ構築で足りない分が出る）
 * 増えたカードはグループ「<相手の名前>から」に入れる。
 */
import type { CardDef, Deck } from '../../engine/index.ts';
import { actions, getState } from '../store.ts';
import { uuid } from '../util.ts';
import { PREF_KEYS, readPrefs, writePrefs } from '../collection/prefs.ts';
import { addToSourceGroup, copyDeck, sourceGroupName, uniqueDeckName } from './copyLogic.ts';

export type CopyKind = 'deck' | 'cards' | 'selectionDeck';

export interface CopyOutcome {
  /** 新しく足したカードの種類の数 */
  added: number;
  /** すでに持っていたので足さなかったカードの種類の数 */
  reused: number;
  /** 作ったデッキ（cards のときは null） */
  deck: Deck | null;
  /** カードを入れたグループの名前と ID（足したカードが無ければ null） */
  groupName: string | null;
  groupId: string | null;
}

export function copyDeckName(sourceName: string, kind: CopyKind): string {
  return `${sourceName}のデッキ${kind === 'deck' ? '（コピー）' : '（一部）'}`;
}

export function runCopy(kind: CopyKind, src: { sourceName: string; deck: Deck; cards: readonly CardDef[]; select?: Readonly<Record<string, number>> }): CopyOutcome {
  const st = getState();
  const r = copyDeck(src.deck, src.cards, st.cards, {
    name: kind === 'cards' ? src.deck.name : uniqueDeckName(copyDeckName(src.sourceName, kind), st.decks),
    ...(kind === 'deck' ? {} : { select: src.select ?? {} }),
    sourceName: src.sourceName,
    newId: uuid,
  });
  const g = addToSourceGroup(
    st.groups,
    src.sourceName,
    r.cards.map((c) => c.id),
    uuid,
  );
  const deck = kind === 'cards' ? null : r.deck;
  actions.applyCopy(r.cards, deck, g.groups);
  return { added: r.cards.length, reused: r.reused.length, deck, groupName: g.groupId ? sourceGroupName(src.sourceName) : null, groupId: g.groupId };
}

/** カード置き場を、そのグループを見ている状態で開く（グループが無ければ「すべて」） */
export function openCollection(groupId: string | null, navigate: (path: string) => void): void {
  if (groupId) writePrefs(PREF_KEYS.cards, { ...readPrefs(PREF_KEYS.cards), scope: groupId });
  navigate('/cards');
}
