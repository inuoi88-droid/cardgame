/**
 * カード・デッキ・カードのグループの保存先（localStorage）。engine からは参照しない。
 * 読み込み時は engine の parseCard / parseDeck / parseGroup で形を確かめ、壊れたデータは捨てる。
 * 書き込みは変わった項目だけ（数百枚のカードを、グループを変えるたびに書き直さない）。
 */
import { useSyncExternalStore } from 'react';
import { parseCard, parseDeck, type CardDef, type CardGroup, type Deck } from '../engine/index.ts';
import * as G from './collection/groups.ts';

export const KEYS = {
  cards: 'cardgame.v1.cards',
  decks: 'cardgame.v1.decks',
  /** カードのグループ（カード置き場の整理用。決定事項 #109） */
  groups: 'cardgame.v1.groups',
  cardDrafts: 'cardgame.v1.drafts.cards',
  deckDrafts: 'cardgame.v1.drafts.decks',
} as const;

/** 新規作成中の下書きのキー */
export const NEW_DRAFT = '__new__';

export interface StoreState {
  cards: CardDef[];
  decks: Deck[];
  groups: CardGroup[];
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
  const cards = loadList(KEYS.cards, parseCard);
  // 起動時は、もう無いカードの ID をグループから落とす（削除の「元に戻す」の間は残しておくため、保存のたびには落とさない）
  const groups = G.loadGroups(readJson(KEYS.groups), new Set(cards.map((c) => c.id)));
  return { cards, decks: loadList(KEYS.decks, parseDeck), groups, saveError: null };
}

let state: StoreState = load();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

type SavedKey = 'cards' | 'decks' | 'groups';
/** 前に書けなかった項目（次の保存で書き直す） */
const unsaved = new Set<SavedKey>();

/** 変わった項目（と、前に書けなかった項目）だけ書く。書けなかったら saveError（容量不足など） */
function setState(next: Partial<Omit<StoreState, 'saveError'>>) {
  const merged = { ...state, ...next };
  let error: string | null = null;
  for (const k of ['cards', 'decks', 'groups'] as const) {
    if (!unsaved.has(k) && (next[k] === undefined || next[k] === state[k])) continue;
    const e = writeJson(KEYS[k], merged[k]);
    if (e) {
      unsaved.add(k);
      error ??= e;
    } else unsaved.delete(k);
  }
  state = { ...merged, saveError: error };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// 別のタブで変更されたら読み直す
window.addEventListener('storage', (e) => {
  if (e.key === KEYS.cards || e.key === KEYS.decks || e.key === KEYS.groups || e.key === null) {
    unsaved.clear();
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
  /** 何枚かまとめて足す（複製）。copiedFrom（元の ID → 新しい ID）を渡すと、元のカードのグループに複製も入れる */
  addCards(cards: CardDef[], copiedFrom?: ReadonlyMap<string, string>) {
    setState({ cards: [...state.cards, ...cards], ...(copiedFrom ? { groups: G.copyMemberships(state.groups, copiedFrom) } : {}) });
  },
  deleteCard(id: string) {
    setState({ cards: state.cards.filter((c) => c.id !== id), decks: state.decks });
  },
  /** まとめて削除。戻すための元の位置を返す（グループの中の ID は残すので、元に戻せばグループにも戻る） */
  deleteCards(ids: readonly string[]): { card: CardDef; index: number }[] {
    const drop = new Set(ids);
    const removed = state.cards.flatMap((card, index) => (drop.has(card.id) ? [{ card, index }] : []));
    setState({ cards: state.cards.filter((c) => !drop.has(c.id)) });
    return removed;
  },
  /** 削除の取り消し：元の位置に戻す（同じ ID がすでにあれば上書き） */
  restoreCard(card: CardDef, index: number) {
    const rest = state.cards.filter((c) => c.id !== card.id);
    const at = Math.max(0, Math.min(rest.length, index));
    setState({ cards: [...rest.slice(0, at), card, ...rest.slice(at)], decks: state.decks });
  },
  /** まとめて削除の取り消し（位置の小さい順に戻す） */
  restoreCards(items: readonly { card: CardDef; index: number }[]) {
    const ids = new Set(items.map((x) => x.card.id));
    const cards = state.cards.filter((c) => !ids.has(c.id));
    for (const { card, index } of [...items].sort((a, b) => a.index - b.index)) cards.splice(Math.max(0, Math.min(cards.length, index)), 0, card);
    setState({ cards });
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
  /** 取り込み・サンプルの追加。groups を省くとグループはそのまま */
  replaceAll(cards: CardDef[], decks: Deck[], groups?: CardGroup[]) {
    setState(groups ? { cards, decks, groups } : { cards, decks });
  },

  // ---------------------------------------------------------------- グループ
  createGroup(group: CardGroup) {
    setState({ groups: [...state.groups, group] });
  },
  updateGroup(id: string, patch: { name?: string; color?: string; memo?: string | null }) {
    setState({ groups: G.updateGroup(state.groups, id, patch) });
  },
  moveGroup(id: string, delta: number) {
    setState({ groups: G.moveGroup(state.groups, id, delta) });
  },
  /** 削除。戻すための位置を返す（見つからなければ null） */
  deleteGroup(id: string): { group: CardGroup; index: number } | null {
    const r = G.removeGroup(state.groups, id);
    if (!r.removed) return null;
    setState({ groups: r.groups });
    return { group: r.removed, index: r.index };
  },
  restoreGroup(group: CardGroup, index: number) {
    setState({ groups: G.restoreGroup(state.groups, group, index) });
  },
  /** カードを入れる。増えた枚数を返す */
  addToGroup(id: string, cardIds: readonly string[]): number {
    const r = G.addCardsToGroup(state.groups, id, cardIds);
    if (r.added > 0) setState({ groups: r.groups });
    return r.added;
  },
  /** カードを外す。減った枚数を返す */
  removeFromGroup(id: string, cardIds: readonly string[]): number {
    const r = G.removeCardsFromGroup(state.groups, id, cardIds);
    if (r.removed > 0) setState({ groups: r.groups });
    return r.removed;
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
