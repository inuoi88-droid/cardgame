/**
 * アプリ内の確認ダイアログ（window.confirm の置き換え）。
 * 使い方：App に <ConfirmProvider> を置き、画面側で
 *   const confirm = useConfirm();
 *   if (await confirm({ title: '削除しますか？', message: '…', okLabel: '削除', danger: true })) { … }
 */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { cx } from '../util.ts';
import { Modal } from './controls.tsx';

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  okLabel?: string;
  cancelLabel?: string;
  /** 取り消せない操作（削除・降参など）。OK ボタンが赤になり、最初のフォーカスはキャンセルに置く */
  danger?: boolean;
}

export type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(() => Promise.resolve(false));

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext);
}

interface Pending {
  opts: ConfirmOptions;
  resolve: (ok: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const queue = useRef<Pending[]>([]);

  const next = useCallback(() => {
    setPending(queue.current.shift() ?? null);
  }, []);

  const confirm = useCallback<ConfirmFn>(
    (opts) =>
      new Promise<boolean>((resolve) => {
        const item = { opts, resolve };
        setPending((cur) => {
          if (cur) {
            queue.current.push(item);
            return cur;
          }
          return item;
        });
      }),
    [],
  );

  const answer = (ok: boolean) => {
    pending?.resolve(ok);
    next();
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && <ConfirmDialog key={pending.opts.title} {...pending.opts} onAnswer={answer} />}
    </ConfirmContext.Provider>
  );
}

interface DialogProps extends ConfirmOptions {
  onAnswer: (ok: boolean) => void;
}

export function ConfirmDialog({ title, message, okLabel = 'OK', cancelLabel = 'キャンセル', danger = false, onAnswer }: DialogProps) {
  const okRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal
      title={title}
      onClose={() => onAnswer(false)}
      size="sm"
      role="alertdialog"
      description={message ? <p className="confirm__message">{message}</p> : undefined}
      initialFocus={danger ? cancelRef : okRef}
    >
      <div className="btn-row confirm__buttons">
        <button type="button" className="btn btn--secondary" ref={cancelRef} onClick={() => onAnswer(false)}>
          {cancelLabel}
        </button>
        <button type="button" className={cx('btn', danger ? 'btn--danger-filled' : 'btn--primary')} ref={okRef} onClick={() => onAnswer(true)}>
          {okLabel}
        </button>
      </div>
    </Modal>
  );
}
