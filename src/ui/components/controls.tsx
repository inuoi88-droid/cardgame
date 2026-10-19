/** 入力部品：数値ステッパー、モーダル、違反リスト */
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useFocusTrap, useScrollLock } from './dialogUtil.ts';

interface StepperProps {
  label: string;
  value: number | undefined;
  min: number;
  max: number;
  onChange: (v: number) => void;
  invalid?: boolean;
  /** −／＋ボタンで動く幅（区切りのよい数にそろえる）。直接入力はどんな整数でもよい */
  step?: number;
}

export function Stepper({ label, value, min, max, onChange, invalid, step = 1 }: StepperProps) {
  const [text, setText] = useState<string | null>(null);
  const v = value ?? min;
  const clamp = (x: number) => Math.min(max, Math.max(min, x));
  const up = () => clamp((Math.floor(v / step) + 1) * step);
  const down = () => clamp((Math.ceil(v / step) - 1) * step);
  return (
    <label className={invalid ? 'stepper stepper--invalid' : 'stepper'}>
      <span className="stepper__label">{label}</span>
      <span className="stepper__box">
        <button type="button" onClick={() => onChange(down())} disabled={v <= min} aria-label={`${label}を減らす`}>
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          value={text ?? (Number.isFinite(v) ? String(v) : '')}
          min={min}
          max={max}
          onFocus={(e) => {
            setText(String(v));
            e.target.select();
          }}
          onChange={(e) => {
            // 入力途中（空欄など）は文字のまま持ち、数として読めたときだけ反映する
            setText(e.target.value);
            const n = parseInt(e.target.value, 10);
            if (!Number.isNaN(n)) onChange(clamp(n));
          }}
          onBlur={() => setText(null)}
        />
        <button type="button" onClick={() => onChange(up())} disabled={v >= max} aria-label={`${label}を増やす`}>
          ＋
        </button>
      </span>
    </label>
  );
}

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** false なら閉じるボタンを出さず、Escape・背景タップでも閉じない（選ぶまで閉じられない画面） */
  closable?: boolean;
  /** 幅の種類。sm は確認ダイアログ程度 */
  size?: 'sm' | 'md';
  /** role（確認ダイアログは alertdialog） */
  role?: 'dialog' | 'alertdialog';
  /** 見出しの下に出す補足（aria-describedby に使う） */
  description?: ReactNode;
  /** 開いたときにフォーカスする要素 */
  initialFocus?: RefObject<HTMLElement | null>;
}

/**
 * モーダル。Tab はこの中を巡り、閉じると開いた要素にフォーカスが戻り、開いている間は背景がスクロールしない。
 * closable のときだけ Escape・背景タップ・✕ で閉じる。
 */
export function Modal({ title, onClose, children, closable = true, size = 'md', role = 'dialog', description, initialFocus }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  // onClose が毎描画で変わっても trap を張り直さないように最新を参照で持つ
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  const escape = useRef(() => closeRef.current());
  useFocusTrap(ref, { onEscape: closable ? escape.current : undefined, initialFocus });
  useScrollLock();
  return (
    <div className="modal" onClick={closable ? onClose : undefined}>
      <div
        className={`modal__body modal__body--${size}`}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__head">
          <h2 id={titleId}>{title}</h2>
          {closable && (
            <button type="button" className="btn btn--ghost btn--icon" onClick={onClose} aria-label="閉じる">
              ✕
            </button>
          )}
        </div>
        {description && (
          <div id={descId} className="modal__desc">
            {description}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function Violations({ items }: { items: { message: string }[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="violations" aria-live="polite">
      {items.map((v, i) => (
        <li key={i}>{v.message}</li>
      ))}
    </ul>
  );
}
