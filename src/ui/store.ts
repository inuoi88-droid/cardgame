/**
 * カードとデッキの保存先（localStorage）。engine からは参照しない。
 * 読み込み時は engine の parseCard / parseDeck で形を確かめ、壊れたデータは捨てる。
 */
import { useSyncExternalStore } from 'react';
import { parseCard, parseDeck, type CardDef, type Deck } from '../engine/index.ts';

const KEYS = {
  cards: 'cardgame.v1.cards',
  decks: 'cardgame.v1.decks',
  cardDrafts: 'cardgame.v1.drafts.cards',
  deckDrafts: 'cardgame.v1.drafts.decks',
} as const;

/** 新規作成中の下書きのキー */
export const NEW_DRAFT = '__new__';

export interface StoreState {
  cards: CardDef[];
  decks: Deck[];
  /** 保存に失敗したとき（容量不足など）のメッセージ */
  saveError: string | null;
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): string | null {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return null;
  } catch {
    return 'ブラウザへの保存に失敗しました（容量不足か、保存が禁止されている可能性があります）';
  }
}

function loadList<T>(key: string, parse: (x: unknown) => { ok: true; value: T } | { ok: false }): T[] {
  const data = readJson(key);
  if (!Array.isArray(data)) return [];
  return data.flatMap((x) => {
    const r = parse(x);
    return r.ok ? [r.value] : [];
  });
}

function load(): StoreState {
  return { cards: loadList(KEYS.cards, parseCard), decks: loadList(KEYS.decks, parseDeck), saveError: null };
}

let state: StoreState = load();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function setState(next: Omit<StoreState, 'saveError'>) {
  const errors = [writeJson(KEYS.cards, next.cards), writeJson(KEYS.decks, next.decks)].filter(Boolean);
  state = { ...next, saveError: errors[0] ?? null };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// 別のタブで変更されたら読み直す
window.addEventListener('storage', (e) => {
  if (e.key === KEYS.cards || e.key === KEYS.decks) {
    state = load();
    emit();
  }
});

export function useStore(): StoreState {
  return useSyncExternalStore(subscribe, () => state);
}

export function getState(): StoreState {
  return state;
}

export const actions = {
  saveCard(card: CardDef) {
    const exists = state.cards.some((c) => c.id === card.id);
    setState({
      cards: exists ? state.cards.map((c) => (c.id === card.id ? card : c)) : [...state.cards, card],
      decks: state.decks,
    });
  },
  deleteCard(id: string) {
    setState({ cards: state.cards.filter((c) => c.id !== id), decks: state.decks });
  },
  /** 削除の取り消し：元の位置に戻す（同じ ID がすでにあれば上書き） */
  restoreCard(card: CardDef, index: number) {
    const rest = state.cards.filter((c) => c.id !== card.id);
    const at = Math.max(0, Math.min(rest.length, index));
    setState({ cards: [...rest.slice(0, at), card, ...rest.slice(at)], decks: state.decks });
  },
  saveDeck(deck: Deck) {
    const exists = state.decks.some((d) => d.id === deck.id);
    setState({
      cards: state.cards,
      decks: exists ? state.decks.map((d) => (d.id === deck.id ? deck : d)) : [...state.decks, deck],
    });
  },
  deleteDeck(id: string) {
    setState({ cards: state.cards, decks: state.decks.filter((d) => d.id !== id) });
  },
  restoreDeck(deck: Deck, index: number) {
    const rest = state.decks.filter((d) => d.id !== deck.id);
    const at = Math.max(0, Math.min(rest.length, index));
    setState({ cards: state.cards, decks: [...rest.slice(0, at), deck, ...rest.slice(at)] });
  },
  replaceAll(cards: CardDef[], decks: Deck[]) {
    setState({ cards, decks });
  },
};

// ---------------------------------------------------------------- 下書き（保存前の編集内容）

function draftStore<T>(key: string, parse: (x: unknown) => { ok: true; value: T } | { ok: false }) {
  const readAll = (): Record<string, unknown> => {
    const data = readJson(key);
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  };
  return {
    get(id: string): T | null {
      const raw = readAll()[id];
      if (raw === undefined) return null;
      const r = parse(raw);
      return r.ok ? r.value : null;
    },
    set(id: string, value: T) {
      writeJson(key, { ...readAll(), [id]: value });
    },
    clear(id: string) {
      const all = readAll();
      delete all[id];
      writeJson(key, all);
    },
  };
}

export const cardDrafts = draftStore(KEYS.cardDrafts, parseCard);
export const deckDrafts = draftStore(KEYS.deckDrafts, parseDeck);
