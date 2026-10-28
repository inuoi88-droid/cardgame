/**
 * 文字の大きさの設定（見る人ごと。localStorage の cardgame.v1.textSize = { size }。設定の歯車の中）。
 * <html data-text-size="…"> を付け、styles.css がその印で文字のトークン（--fs-xs〜--fs-xl）と本文の大きさを差し替える。
 * カードの部品（面・手札・場のタイル・一覧の行）は cardTokens.css で元の大きさに固定する（枠の大きさが決まっていて、文字だけ大きいとはみ出すため）。
 * 読めない・書けないときは標準のまま動く。ほかのタブで変えたら storage イベントで合わせる。
 */
import { useSyncExternalStore } from 'react';

export const TEXT_SIZE_KEY = 'cardgame.v1.textSize';

export const TEXT_SIZES = ['sm', 'md', 'lg', 'xl'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export const TEXT_SIZE_LABEL: Record<TextSize, string> = { sm: '小', md: '標準', lg: '大', xl: '特大' };

/** 保存した値を読む（壊れていたら標準） */
export function parseTextSize(raw: unknown): TextSize {
  const s = typeof raw === 'object' && raw !== null ? (raw as { size?: unknown }).size : undefined;
  return (TEXT_SIZES as readonly unknown[]).includes(s) ? (s as TextSize) : 'md';
}

function read(): TextSize {
  try {
    const raw = localStorage.getItem(TEXT_SIZE_KEY);
    return raw === null ? 'md' : parseTextSize(JSON.parse(raw));
  } catch {
    return 'md';
  }
}

let current: TextSize | null = null;
const listeners = new Set<() => void>();
const get = (): TextSize => (current ??= typeof window === 'undefined' ? 'md' : read());

/** <html> に印を付ける（標準は印なし） */
function apply(size: TextSize): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (size === 'md') delete root.dataset.textSize;
  else root.dataset.textSize = size;
}

function change(next: TextSize): void {
  current = next;
  apply(next);
  for (const f of listeners) f();
}

/** 変える（保存できなくても今の画面ではそのまま使う） */
export function setTextSize(size: TextSize): void {
  if (size === get()) return;
  try {
    localStorage.setItem(TEXT_SIZE_KEY, JSON.stringify({ size }));
  } catch {
    // 保存できなくても今の画面ではそのまま
  }
  change(size);
}

/** 起動時に1回（main.tsx。描く前に印を付けてちらつかせない）：保存した大きさを当て、ほかのタブの変更を受ける */
export function initTextSize(): void {
  apply(get());
  window.addEventListener('storage', (e) => {
    if (e.key !== TEXT_SIZE_KEY) return;
    const next = read();
    if (next !== get()) change(next);
  });
}

export function useTextSize(): TextSize {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    get,
    get,
  );
}
