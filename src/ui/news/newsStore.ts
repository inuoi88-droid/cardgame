/**
 * 更新情報の「見た」の印（端末ごと。localStorage の cardgame.v1.news = { seen }。決定事項 #131）。
 * 読めない・書けない（プライベートウィンドウなど）ときは、この画面を開いている間だけ覚える。
 */
import { useSyncExternalStore } from 'react';
import { initialSeen, latestNo } from './newsLogic.ts';
import { PATCH_NOTES } from './notes.ts';

export const NEWS_KEY = 'cardgame.v1.news';
/** これがあれば前から遊んでいる人（カード・デッキ・効果音の設定など） */
const RETURNING_KEYS = ['cardgame.v1.cards', 'cardgame.v1.decks', 'cardgame.v1.sound', 'cardgame.v1.player'];

let seen: number | null = null;
const listeners = new Set<() => void>();

function read(): number {
  try {
    const raw = JSON.parse(localStorage.getItem(NEWS_KEY) ?? 'null') as { seen?: unknown } | null;
    const stored = raw && typeof raw.seen === 'number' && Number.isFinite(raw.seen) ? raw.seen : null;
    const returning = RETURNING_KEYS.some((k) => localStorage.getItem(k) !== null);
    const value = initialSeen(stored, returning, PATCH_NOTES);
    if (stored === null) localStorage.setItem(NEWS_KEY, JSON.stringify({ seen: value }));
    return value;
  } catch {
    return latestNo(PATCH_NOTES);
  }
}

export function getNewsSeen(): number {
  return (seen ??= typeof window === 'undefined' ? latestNo(PATCH_NOTES) : read());
}

/** ここまで見た（帯を閉じた・更新情報を開いた） */
export function markNewsSeen(no = latestNo(PATCH_NOTES)): void {
  if (getNewsSeen() >= no) return;
  seen = no;
  try {
    localStorage.setItem(NEWS_KEY, JSON.stringify({ seen: no }));
  } catch {
    // 保存できなくても今の画面ではそのまま
  }
  for (const f of listeners) f();
}

function subscribe(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

export function useNewsSeen(): number {
  return useSyncExternalStore(subscribe, getNewsSeen, getNewsSeen);
}
