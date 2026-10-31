/**
 * プリセットデッキの書き換えの下書き（運営だけ。決定事項 #148）。枚数・入れるカード・カードの中身を端末で直してから、
 * 「全員に反映」でまとめてサーバーに送る。カードの編集画面に移っても消えないよう localStorage（`cardgame.v1.presetDraft`）に置く。
 * 下書きが無いデッキは、いまのプリセット（運営の書き換えを重ねたもの）から始める
 */
import { useSyncExternalStore } from 'react';
import { normalizeName, uniqueName, type CardDef } from '../../engine/index.ts';
import type { PresetDeck, PresetOverride } from '../../presets.ts';
import { uuid } from '../util.ts';

const KEY = 'cardgame.v1.presetDraft';
type Drafts = Record<string, PresetOverride>;

function read(): Drafts {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as unknown;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Drafts;
  } catch {
    // 読めなければ下書きなし
  }
  return {};
}

let drafts: Drafts = read();
const listeners = new Set<() => void>();

function write(next: Drafts): void {
  drafts = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 保存できなくても開いている間は使える
  }
  for (const l of listeners) l();
}

/** いまのプリセットを書き換えの形にする */
export function overrideOf(p: PresetDeck): PresetOverride {
  return { id: p.deck.id, deck: structuredClone(p.deck), cards: structuredClone(p.cards) };
}

/** 下書き（無ければ null） */
export function usePresetDraft(deckId: string): PresetOverride | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => drafts[deckId] ?? null,
    () => null,
  );
}

export function getPresetDraft(deckId: string): PresetOverride | null {
  return drafts[deckId] ?? null;
}

export function setPresetDraft(o: PresetOverride): void {
  write({ ...drafts, [o.id]: o });
}

export function clearPresetDraft(deckId: string): void {
  const { [deckId]: _gone, ...rest } = drafts;
  write(rest);
}

/** 2つの書き換えが同じ中身か（枚数・カード） */
export function samePreset(a: PresetOverride, b: PresetOverride): boolean {
  return JSON.stringify([a.deck.entries, a.cards]) === JSON.stringify([b.deck.entries, b.cards]);
}

/** プリセットのカードの新しい ID（preset-<デッキ>-<乱数>。公式カード・自分のカードの ID と重ならない） */
export function newPresetCardId(deckId: string): string {
  const key = deckId.replace(/^preset-deck-/, '');
  return `preset-${key}-${uuid().replace(/-/g, '').slice(0, 10)}`;
}

/** 別のカードを写して1枚入れる（名前はデッキの中で重ならないように）。入れたカードの ID を返す */
export function addCopy(o: PresetOverride, card: CardDef): { next: PresetOverride; id: string } {
  const id = newPresetCardId(o.id);
  const taken = new Set(o.cards.map((c) => normalizeName(c.name)));
  const copy: CardDef = { ...structuredClone(card), id, name: uniqueName(card.name, taken) };
  return { next: { ...o, cards: [...o.cards, copy], deck: { ...o.deck, entries: [...o.deck.entries, { cardId: id, count: 1 }] } }, id };
}

/** 枚数を変える（0 ならデッキから外し、カードも消す） */
export function setCount(o: PresetOverride, cardId: string, count: number): PresetOverride {
  if (count <= 0) {
    return { ...o, cards: o.cards.filter((c) => c.id !== cardId), deck: { ...o.deck, entries: o.deck.entries.filter((e) => e.cardId !== cardId) } };
  }
  return { ...o, deck: { ...o.deck, entries: o.deck.entries.map((e) => (e.cardId === cardId ? { ...e, count } : e)) } };
}

/** カードの中身を差し替える */
export function replaceCard(o: PresetOverride, card: CardDef): PresetOverride {
  return { ...o, cards: o.cards.map((c) => (c.id === card.id ? card : c)) };
}
