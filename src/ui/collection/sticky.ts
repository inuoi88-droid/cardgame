/**
 * カード置き場で上下に固定する部品の補助（決定事項 #109 のレビュー：深くスクロールしても検索・絞り込みに手が届くように）。
 * - useHeightVar：要素の高さを CSS 変数に入れる（.topbar → --topbar-h、まとめて操作のバー → --bulkbar-h）
 * - useTuck：下へスクロールしている間だけ true（スマホで操作の列を上へ引っ込め、上へ戻すと出す）
 */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** 要素（ref か、無ければ selector で探す）の高さを :root の CSS 変数に入れる。外れたら変数を消す */
export function useHeightVar(name: string, target: RefObject<HTMLElement | null> | string, active = true) {
  useLayoutEffect(() => {
    if (!active) return;
    const el = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target.current;
    if (!el) return;
    const root = document.documentElement;
    const set = () => root.style.setProperty(name, `${el.offsetHeight}px`);
    set();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(set);
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.style.removeProperty(name);
    };
  }, [name, target, active]);
}

/** これより上（px）では引っ込めない */
const TUCK_FROM = 320;
/** これより小さい動き（px）は無視する（指の揺れ） */
const TUCK_SLOP = 6;

/**
 * 下へスクロールすると true、上へ戻すと false。enabled が false のとき・keepOpen() が true のとき
 * （検索の欄に入力中など）はいつも false
 */
export function useTuck(enabled: boolean, keepOpen: () => boolean): boolean {
  const [tucked, setTucked] = useState(false);
  const keep = useRef(keepOpen);
  keep.current = keepOpen;
  useEffect(() => {
    if (!enabled) {
      setTucked(false);
      return;
    }
    let lastY = window.scrollY;
    const on = () => {
      const y = window.scrollY;
      const dy = y - lastY;
      if (Math.abs(dy) < TUCK_SLOP) return;
      lastY = y;
      setTucked(dy > 0 && y > TUCK_FROM && !keep.current());
    };
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [enabled]);
  return enabled && tucked;
}
