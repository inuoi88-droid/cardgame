/**
 * トースト（画面の下に少しの間だけ出る通知）。
 * 使い方：App に <ToastProvider> を置き、画面側で const toast = useToast(); toast({ text: '保存しました', kind: 'ok' })。
 * スマホでは下中央、PC では右下に積む。3秒（エラーは6秒、ボタン付きは6秒）で消える。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { sfx } from '../sound/index.ts';
import { cx } from '../util.ts';
import { UiIcon } from './UiIcon.tsx';

export type ToastKind = 'ok' | 'ng' | 'info';

export interface ToastOptions {
  text: string;
  kind?: ToastKind;
  /** 「元に戻す」などのボタン。押すとトーストは消える */
  action?: { label: string; onClick: () => void };
  /** 表示時間（ミリ秒）。省略時は kind と action から決める */
  duration?: number;
}

export interface ToastFn {
  (opts: ToastOptions): string;
  /** ID で消す */
  dismiss(id: string): void;
}

interface ToastItem extends ToastOptions {
  id: string;
}

export const TOAST_DURATION = { default: 3000, ng: 6000, withAction: 6000 } as const;

const noop: ToastFn = Object.assign(() => '', { dismiss: () => undefined });
const ToastContext = createContext<ToastFn>(noop);

export function useToast(): ToastFn {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const seq = useRef(0);

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setItems((xs) => xs.filter((x) => x.id !== id));
  }, []);

  const toast = useMemo<ToastFn>(() => {
    const fn = ((opts: ToastOptions) => {
      const id = `t${++seq.current}`;
      // 効果音（決定事項 #127）：エラー・できない操作
      if (opts.kind === 'ng') sfx('ui.error');
      const duration = opts.duration ?? (opts.kind === 'ng' ? TOAST_DURATION.ng : opts.action ? TOAST_DURATION.withAction : TOAST_DURATION.default);
      setItems((xs) => [...xs.slice(-3), { ...opts, id }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      );
      return id;
    }) as ToastFn;
    fn.dismiss = dismiss;
    return fn;
  }, [dismiss]);

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" aria-live="polite" aria-relevant="additions">
        {items.map((t) => (
          <div key={t.id} className={cx('toast', `toast--${t.kind ?? 'info'}`)} role="status">
            <span className="toast__icon" aria-hidden="true">
              {t.kind === 'ok' ? <UiIcon name="check-mark" /> : t.kind === 'ng' ? '!' : 'i'}
            </span>
            <span className="toast__text">{t.text}</span>
            {t.action && (
              <button
                type="button"
                className="btn btn--small toast__action"
                onClick={() => {
                  dismiss(t.id);
                  t.action!.onClick();
                }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" className="toast__close" onClick={() => dismiss(t.id)} aria-label="閉じる">
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
