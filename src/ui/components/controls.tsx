/** 入力部品：数値ステッパー、モーダル */
import { useEffect, useRef, useState, type ReactNode } from 'react';

interface StepperProps {
  label: string;
  value: number | undefined;
  min: number;
  max: number;
  onChange: (v: number) => void;
  invalid?: boolean;
}

export function Stepper({ label, value, min, max, onChange, invalid }: StepperProps) {
  const [text, setText] = useState<string | null>(null);
  const v = value ?? min;
  const clamp = (x: number) => Math.min(max, Math.max(min, x));
  return (
    <label className={invalid ? 'stepper stepper--invalid' : 'stepper'}>
      <span className="stepper__label">{label}</span>
      <span className="stepper__box">
        <button type="button" onClick={() => onChange(clamp(v - 1))} disabled={v <= min} aria-label={`${label}を減らす`}>
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
        <button type="button" onClick={() => onChange(clamp(v + 1))} disabled={v >= max} aria-label={`${label}を増やす`}>
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
  /** false なら閉じるボタンを出さない（選ぶまで閉じられない画面） */
  closable?: boolean;
}

export function Modal({ title, onClose, children, closable = true }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal" onClick={closable ? onClose : undefined}>
      <div className="modal__body" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h2>{title}</h2>
          {closable && (
            <button type="button" className="btn btn--ghost" onClick={onClose} aria-label="閉じる">
              ✕
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export function Violations({ items }: { items: { message: string }[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="violations">
      {items.map((v, i) => (
        <li key={i}>{v.message}</li>
      ))}
    </ul>
  );
}
