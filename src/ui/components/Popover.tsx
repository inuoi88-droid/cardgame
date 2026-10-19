/**
 * ポップオーバー：タップ／クリック（PC ではホバーでも）で、小さな説明カードをきっかけの要素の近くに出す。
 * 対戦画面の状態異常・キーワード・パワー、エディターの効果の説明に使う。
 *
 *   <Popover content={{ title: '毒 5', description: 'ターン開始時に…', lines: ['次：5ダメージ'] }}>
 *     <span className="st st--bad">毒5</span>
 *   </Popover>
 *
 * content は { title, description?, lines? } か、任意の ReactNode。外側のタップ・Escape で閉じる。
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../util.ts';

export interface PopoverCard {
  title: ReactNode;
  description?: ReactNode;
  /** 補足の行（残りターン、次に起きることなど） */
  lines?: ReactNode[];
}

export type PopoverContent = PopoverCard | ReactNode;

interface Props {
  content: PopoverContent;
  children: ReactNode;
  /** 包む要素のクラス（きっかけの見た目を調整したいとき） */
  className?: string;
  /** 包む要素をフォーカスできるボタンにする（既定 true。子が自前のボタンなら false） */
  focusable?: boolean;
  /** PC のホバーで開く（既定 true） */
  hover?: boolean;
  /** 出す向きの希望。収まらなければ反対側 */
  placement?: 'bottom' | 'top';
}

/** { title, … } の形か（React 要素や配列には title がない） */
const isCard = (c: PopoverContent): c is PopoverCard => typeof c === 'object' && c !== null && !Array.isArray(c) && 'title' in c;

const MARGIN = 8;

export function Popover({ content, children, className, focusable = true, hover = true, placement = 'bottom' }: Props) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const [style, setStyle] = useState<CSSProperties>({});
  const [side, setSide] = useState<'top' | 'bottom'>(placement);
  const hoverOk = useRef(false);

  useEffect(() => {
    hoverOk.current = hover && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  }, [hover]);

  // 位置を決める（開いたとき、スクロール・リサイズのたび）
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchorRef.current?.getBoundingClientRect();
      const p = popRef.current;
      if (!a || !p) return;
      const w = p.offsetWidth;
      const h = p.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = a.left + a.width / 2 - w / 2;
      left = Math.max(MARGIN, Math.min(vw - w - MARGIN, left));
      const below = a.bottom + MARGIN;
      const above = a.top - h - MARGIN;
      const fitsBelow = below + h <= vh - MARGIN;
      const fitsAbove = above >= MARGIN;
      const useBottom = placement === 'bottom' ? fitsBelow || !fitsAbove : !fitsAbove && fitsBelow;
      const top = useBottom ? below : Math.max(MARGIN, above);
      setSide(useBottom ? 'bottom' : 'top');
      setStyle({ left, top, '--arrow-x': `${a.left + a.width / 2 - left}px` } as CSSProperties);
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, placement]);

  // 外側のタップ・Escape で閉じる
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        anchorRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const body = isCard(content) ? (
    <>
      <div className="popover__title">{content.title}</div>
      {content.description && <div className="popover__desc">{content.description}</div>}
      {content.lines && content.lines.length > 0 && (
        <ul className="popover__lines">
          {content.lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
    </>
  ) : (
    content
  );

  return (
    <>
      <span
        ref={anchorRef}
        className={cx('popover__anchor', open && 'is-open', className)}
        role={focusable ? 'button' : undefined}
        tabIndex={focusable ? 0 : undefined}
        aria-expanded={focusable ? open : undefined}
        aria-describedby={open ? id : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (!focusable) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        onMouseEnter={() => hoverOk.current && setOpen(true)}
        onMouseLeave={() => hoverOk.current && setOpen(false)}
      >
        {children}
      </span>
      {open &&
        createPortal(
          <div ref={popRef} id={id} role="tooltip" className={cx('popover', `popover--${side}`)} style={style} onClick={(e) => e.stopPropagation()}>
            {body}
          </div>,
          document.body,
        )}
    </>
  );
}
