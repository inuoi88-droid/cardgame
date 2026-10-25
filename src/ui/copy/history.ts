/**
 * 対戦した相手の記録（localStorage の cardgame.v1.opponents。新しい順に最大 20 件）。
 * 決着した対戦ごとに、相手のデッキ（とカード）・結果を残し、デッキ一覧の「対戦した相手のデッキ」からコピーできるようにする。
 * 読み書きの中身（pushOpponent・parseHistory）は純粋関数（tests/deck-copy.test.ts）。保存先は外から渡せる（テストは偽の Storage）。
 */
import { useSyncExternalStore } from 'react';
import { parseCard, parseDeck, type CardDef, type Deck } from '../../engine/index.ts';

export const OPPONENTS_KEY = 'cardgame.v1.opponents';
/** 残す件数 */
export const OPPONENTS_MAX = 20;

export type OpponentSource = 'cpu' | 'online' | 'draft' | 'friend';
export const OPPONENT_SOURCES: readonly OpponentSource[] = ['cpu', 'online', 'draft', 'friend'];
export type OpponentResult = 'win' | 'loss' | 'draw' | null;

export interface OpponentEntry {
  /** 対戦ごとの ID（同じ対戦を2回記録しても1件にする） */
  id: string;
  /** 記録した時刻（エポックミリ秒） */
  at: number;
  source: OpponentSource;
  opponentName: string;
  deck: Deck;
  cards: CardDef[];
  /** 自分から見た結果（分からなければ null） */
  result: OpponentResult;
  /** フレンドのとき、相手のフレンドコード */
  friendCode?: string;
}

export const SOURCE_LABEL: Record<OpponentSource, string> = { cpu: 'CPU 戦', online: 'オンライン', draft: 'ドラフト', friend: 'フレンド' };
export const RESULT_LABEL: Record<Exclude<OpponentResult, null>, string> = { win: '勝ち', loss: '負け', draw: '引き分け' };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** 1件を読む（形が壊れていれば null。カードは parseCard を通すので古い倍率のカードも今の倍率になる） */
export function parseOpponent(x: unknown): OpponentEntry | null {
  if (!isObj(x)) return null;
  if (typeof x.id !== 'string' || x.id === '' || typeof x.at !== 'number' || !Number.isFinite(x.at)) return null;
  if (!(OPPONENT_SOURCES as readonly unknown[]).includes(x.source)) return null;
  if (typeof x.opponentName !== 'string') return null;
  const d = parseDeck(x.deck);
  if (!d.ok || !Array.isArray(x.cards)) return null;
  const cards = x.cards.flatMap((c) => {
    const r = parseCard(c);
    return r.ok ? [r.value] : [];
  });
  const result = x.result === 'win' || x.result === 'loss' || x.result === 'draw' ? x.result : null;
  const e: OpponentEntry = { id: x.id, at: x.at, source: x.source as OpponentSource, opponentName: x.opponentName, deck: d.value, cards, result };
  if (typeof x.friendCode === 'string' && x.friendCode !== '') e.friendCode = x.friendCode;
  return e;
}

/** 保存データを読む（壊れた件・同じ ID の2件目は捨て、新しい順に OPPONENTS_MAX 件まで） */
export function parseHistory(data: unknown): OpponentEntry[] {
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const out: OpponentEntry[] = [];
  for (const x of data) {
    const e = parseOpponent(x);
    if (!e || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out.sort((a, b) => b.at - a.at).slice(0, OPPONENTS_MAX);
}

/** 1件足す：同じ ID があれば置き換え、新しい順に並べて max 件まで。デッキに使っていないカードは落とす */
export function pushOpponent(list: readonly OpponentEntry[], entry: OpponentEntry, max = OPPONENTS_MAX): OpponentEntry[] {
  const used = new Set(entry.deck.entries.map((e) => e.cardId));
  const slim: OpponentEntry = { ...entry, cards: entry.cards.filter((c) => used.has(c.id)) };
  return [slim, ...list.filter((e) => e.id !== entry.id)].sort((a, b) => b.at - a.at).slice(0, max);
}

/** 保存先（テストでは偽物を渡す） */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStore(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadOpponents(store: KeyValueStore | null = defaultStore()): OpponentEntry[] {
  if (!store) return [];
  try {
    const raw = store.getItem(OPPONENTS_KEY);
    return raw === null ? [] : parseHistory(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** 書く。容量が足りなければ古いものから減らして書き直す。書けた件数を返す（書けなければ -1） */
function writeOpponents(list: readonly OpponentEntry[], store: KeyValueStore): number {
  for (let n = list.length; n >= 0; n--) {
    try {
      store.setItem(OPPONENTS_KEY, JSON.stringify(list.slice(0, n)));
      return n;
    } catch {
      // 容量不足：古いものを1件減らしてもう一度
    }
  }
  return -1;
}

const listeners = new Set<() => void>();
let cache: OpponentEntry[] | null = null;

/** 決着した対戦の相手を記録する（同じ ID は置き換え）。記録したあとの一覧を返す */
export function recordOpponent(entry: OpponentEntry, store: KeyValueStore | null = defaultStore()): OpponentEntry[] {
  if (!store) return [];
  const next = pushOpponent(loadOpponents(store), entry);
  const n = writeOpponents(next, store);
  const saved = n < 0 ? next : next.slice(0, n);
  if (store === defaultStore()) {
    cache = saved;
    for (const l of listeners) l();
  }
  return saved;
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === OPPONENTS_KEY || e.key === null) {
      cache = null;
      l();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener('storage', onStorage);
  };
}

function snapshot(): OpponentEntry[] {
  cache ??= loadOpponents();
  return cache;
}

/** 対戦した相手の一覧（新しい順。ほかのタブの記録も拾う） */
export function useOpponentHistory(): OpponentEntry[] {
  return useSyncExternalStore(subscribe, snapshot);
}
