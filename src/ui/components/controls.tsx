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
  /** true なら、直接入力した値も入力を終えたとき（blur）に step の倍数へ丸める（量の入力欄で使う） */
  snap?: boolean;
  /** 入力欄の id（「理由を見る」で飛ぶ先） */
  id?: string;
  /** ラベルの後ろに出す補足（例：「+20 ごとに 60pt」） */
  help?: ReactNode;
  /** 入力欄の下に出す誤りの説明 */
  error?: ReactNode;
}

export function Stepper({ label, value, min, max, onChange, invalid, step = 1, snap = false, id, help, error }: StepperProps) {
  const [text, setText] = useState<string | null>(null);
  const v = value ?? min;
  const clamp = (x: number) => Math.min(max, Math.max(min, x));
  const up = () => clamp((Math.floor(v / step) + 1) * step);
  const down = () => clamp((Math.ceil(v / step) - 1) * step);
  const settle = () => {
    setText(null);
    if (snap && step > 1) {
      const rounded = clamp(Math.round(v / step) * step);
      if (rounded !== v) onChange(rounded);
    }
  };
  return (
    <label className={invalid || error ? 'stepper stepper--invalid' : 'stepper'} id={id}>
      <span className="stepper__label">
        {label}
        {help && <small className="stepper__help"> {help}</small>}
      </span>
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
          onBlur={settle}
          aria-invalid={invalid || error ? true : undefined}
        />
        <button type="button" onClick={() => onChange(up())} disabled={v >= max} aria-label={`${label}を増やす`}>
          ＋
        </button>
      </span>
      {error && <span className="field__error">{error}</span>}
    </label>
  );
}

/**
 * 見出しの中の「」で囲んだ部分（カード名・デッキ名など人が入力した名前）を、カードと同じ書体（.u-name）で包む。
 * 見出しの明朝は UI の固定の文字だけを同梱しているので、名前の字が書体の抜けで混ざらないようにする（決定事項 #111）
 */
export function TitleText({ text }: { text: string }) {
  const parts = text.split(/(「[^「」]*」)/);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('「') && p.endsWith('」') && p.length > 2 ? (
          <span key={i}>
            「<span className="u-name">{p.slice(1, -1)}</span>」
          </span>
        ) : (
          p
        ),
      )}
    </>
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
          <h2 id={titleId}>
            <TitleText text={title} />
          </h2>
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
