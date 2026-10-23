/**
 * タイルの右上の「⋯」と、その下に開く小さなメニュー（UI2 の D：デッキ一覧のデッキ箱）。
 * 矢印キー・Home/End で移る、Escape・外側のタップで閉じる（閉じたら ⋯ にフォーカスを戻す）。削除などの危険な項目は深紅。
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cx } from '../util.ts';
import { UiIcon, type UiIconName } from './UiIcon.tsx';

export interface MenuItem {
  icon: UiIconName;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

export function TileMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);
  const close = (focus = true) => {
    setOpen(false);
    if (focus) btnRef.current?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = (i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
      list[next]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      list[e.key === 'Home' ? 0 : list.length - 1]?.focus();
    } else if (e.key === 'Tab') close(false);
  };
  return (
    <>
      <button ref={btnRef} type="button" className={cx('tmenu__btn', open && 'is-open')} aria-label={label} aria-haspopup="menu" aria-expanded={open} title="操作" onClick={() => setOpen((o) => !o)}>
        <MoreDots />
      </button>
      {open && (
        <div ref={menuRef} className="tmenu" role="menu" aria-label={label} onKeyDown={onKey}>
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className={cx('tmenu__item', it.danger && 'is-danger')}
              onClick={() => {
                close(false);
                it.onClick();
              }}
            >
              <UiIcon name={it.icon} />
              {it.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/** 「⋯」：鉄の菱形の鋲を3つ（文字の三点より、板の上で金属の部品に見える） */
export function MoreDots() {
  return (
    <span className="u-more" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}
