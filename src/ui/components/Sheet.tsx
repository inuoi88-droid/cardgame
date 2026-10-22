/**
 * シート：スマホでは画面の下から出るボトムシート（つまみを下に引くと閉じる）、PC では右側のパネル。
 * ログ・ポイントの内訳・フィルターなど「見たいときだけ出す」ものに使う。
 *
 *   <Sheet open={open} title="ログ" onClose={() => setOpen(false)}>…</Sheet>
 */
import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../util.ts';
import { useFocusTrap, useIsPhone, useScrollLock } from './dialogUtil.ts';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** PC での見た目。side＝右のパネル（既定）、modal＝中央のモーダル */
  desktop?: 'side' | 'modal';
  /** 見出しの右に置くもの（ボタンなど） */
  actions?: ReactNode;
  /** パネルに足すクラス（中身の高さを決めたいときなど） */
  className?: string;
}

/** これより下へ引いたら閉じる（px） */
const CLOSE_DRAG = 90;

export function Sheet({ open, title, onClose, children, desktop = 'side', actions, className }: Props) {
  const phone = useIsPhone();
  if (!open) return null;
  return createPortal(<SheetBody phone={phone} title={title} onClose={onClose} desktop={desktop} actions={actions} className={className} children={children} />, document.body);
}

function SheetBody({ phone, title, onClose, children, desktop, actions, className }: Omit<Props, 'open'> & { phone: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  const escape = useRef(() => closeRef.current());
  useFocusTrap(ref, { onEscape: escape.current });
  useScrollLock();

  // つまみのドラッグ（スマホ）
  const [drag, setDrag] = useState<{ startY: number; dy: number } | null>(null);
  const onPointerDown = (e: PointerEvent) => {
    if (!phone) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ startY: e.clientY, dy: 0 });
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!drag) return;
    setDrag({ startY: drag.startY, dy: Math.max(0, e.clientY - drag.startY) });
  };
  const onPointerUp = () => {
    if (!drag) return;
    const dy = drag.dy;
    setDrag(null);
    if (dy > CLOSE_DRAG) onClose();
  };

  const mode = phone ? 'bottom' : desktop;
  return (
    <div className={cx('sheet', `sheet--${mode}`)} onClick={onClose}>
      <div
        ref={ref}
        className={cx('sheet__panel', drag && 'is-dragging', className)}
        style={drag ? { transform: `translateY(${drag.dy}px)` } : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {phone && (
          <div className="sheet__handle" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
            <span />
          </div>
        )}
        <div className="sheet__head">
          <h2 id={titleId}>{title}</h2>
          {actions}
          <button type="button" className="btn btn--ghost btn--icon" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </div>
        <div className="sheet__body">{children}</div>
      </div>
    </div>
  );
}
