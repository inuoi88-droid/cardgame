/**
 * カード一覧・デッキ構築の候補で使う「1枚ぶんの下ごしらえ」（解析・タグ・検索用の文字列・ポイント）。
 * カードの定義（CardDef）は保存のたびに作り直されるので、同じオブジェクトなら解析を使い回す（数百枚でも、1枚直したときに全部を解析し直さない）。
 */
import { useMemo } from 'react';
import { analyzeCard, type CardAnalysis, type CardDef } from '../../engine/index.ts';
import { buildEntry, type Entry } from './query.ts';

const cache = new WeakMap<CardDef, Omit<Entry, 'index'>>();

export function analysisOf(card: CardDef): CardAnalysis {
  return entryBase(card).a;
}

function entryBase(card: CardDef): Omit<Entry, 'index'> {
  let e = cache.get(card);
  if (!e) {
    const { index: _index, ...rest } = buildEntry(card, analyzeCard(card), 0);
    e = rest;
    cache.set(card, e);
  }
  return e;
}

export function entriesOf(cards: readonly CardDef[]): Entry[] {
  return cards.map((card, index) => ({ ...entryBase(card), index }));
}

export function useEntries(cards: readonly CardDef[]): Entry[] {
  return useMemo(() => entriesOf(cards), [cards]);
}
