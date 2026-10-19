/**
 * ダイアログ共通の振る舞い：フォーカスの閉じ込め・復帰、背景のスクロール禁止、Escape。
 * Modal・Sheet・ConfirmDialog が使う。
 */
import { useEffect, useState, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusableIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
}

interface TrapOptions {
  active?: boolean;
  /** Escape が押されたとき（閉じられないダイアログでは渡さない） */
  onEscape?: () => void;
  /** 開いたときに最初にフォーカスする要素（なければ最初のフォーカスできる要素、なければ本体） */
  initialFocus?: RefObject<HTMLElement | null>;
}

/**
 * ref の中に Tab を閉じ込め、閉じたら開く前の要素へフォーカスを戻す。
 * Escape は capture で拾うので、入力欄の中でも効く。
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, { active = true, onEscape, initialFocus }: TrapOptions): void {
  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const first = initialFocus?.current ?? focusableIn(root)[0] ?? root;
    // 開いた直後はまだ描画が終わっていないことがあるので、次のフレームで
    const raf = requestAnimationFrame(() => first.focus({ preventScroll: true }));

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscape) {
        e.stopPropagation();
        e.preventDefault();
        onEscape();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusableIn(root);
      if (items.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const head = items[0]!;
      const tail = items[items.length - 1]!;
      const cur = document.activeElement;
      if (e.shiftKey && (cur === head || !root.contains(cur))) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && (cur === tail || !root.contains(cur))) {
        e.preventDefault();
        head.focus();
      }
    };
    // フォーカスが外へ逃げたら戻す（マウスで背景をクリックしたときなど）
    const onFocusIn = (e: FocusEvent) => {
      if (e.target instanceof Node && !root.contains(e.target)) (focusableIn(root)[0] ?? root).focus();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', onFocusIn);
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [ref, active, onEscape, initialFocus]);
}

let lockCount = 0;
let savedOverflow = '';

/** 開いている間、背景（body）をスクロールさせない。入れ子でも数を数えて最後に戻す */
export function useScrollLock(active = true): void {
  useEffect(() => {
    if (!active) return;
    if (lockCount === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    lockCount += 1;
    return () => {
      lockCount -= 1;
      if (lockCount === 0) document.body.style.overflow = savedOverflow;
    };
  }, [active]);
}

/** スマホ幅か（Sheet・Toast の置き方を切り替える）。SSR はないので window を直接見る */
export function useIsPhone(maxWidth = 719): boolean {
  const query = `(max-width: ${maxWidth}px)`;
  return useMediaQuery(query);
}

export function useMediaQuery(query: string): boolean {
  const [state, setState] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setState(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return state;
}
