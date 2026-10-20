/**
 * 選択肢の多い入力欄（タイミング・対象・条件・効果ごとの追加指定など）の選択パネル。
 * ネイティブの <select> の代わりに使う。きっかけのボタンにいまの選択と倍率を出し、
 * 開くとスマホはボトムシート、PC はボタンの近くにパネルを出す。
 * パネルには検索欄・グループ見出し・1行の説明・ポイントへの影響・選べない理由を並べる。
 *
 * キーボード：↑↓ で移動、Enter で決定、Esc で閉じる、文字を打つとそのまま検索。
 * データは呼び出し側が PickOption[] にして渡す（editor/pickOptions.ts）。選択肢が何十個に増えても同じ部品で扱える。
 */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Sheet } from '../components/Sheet.tsx';
import { useFocusTrap, useIsPhone } from '../components/dialogUtil.ts';
import { cx } from '../util.ts';
import './picker.css';

export interface PickOption {
  id: string;
  label: string;
  /** 1行の説明 */
  description?: string;
  /** 見出し（同じ見出しのものをまとめる。どれかに見出しがあれば、見出しのないものは「その他」） */
  group?: string;
  /** 小さく出す補足（倍率「×0.7」など） */
  hint?: string;
  /** 選んだときのポイント（「24pt」など） */
  points?: string;
  /** 選べない理由（あれば灰色で、いちばん下の「選べないもの」に出す） */
  disabled?: string;
  /** 見出しより上に固定で出す（「なし」など） */
  pinned?: boolean;
}

interface Props {
  /** 入力欄の見出し（「タイミング」など） */
  label: ReactNode;
  /** パネルの見出し・読み上げ用の名前（「1番目の効果のタイミング」など） */
  title: string;
  value: string;
  options: readonly PickOption[];
  onChange: (id: string) => void;
  invalid?: boolean;
  /** 選べるものが1つしかないときなど */
  disabled?: boolean;
  /** 入力欄の id（「理由を見る」で飛ぶ先） */
  id?: string;
  /** パネルの上に出す補足 */
  note?: string;
  className?: string;
}

export const OTHER_GROUP = 'その他';
const DISABLED_GROUP = '選べないもの';

/** 検索用：大文字小文字・カタカナとひらがな・全角半角の違いをならす */
function fold(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

interface Section {
  key: string;
  title: string | null;
  items: PickOption[];
}

/** 固定 → 見出しごと（最初に出てきた順。「その他」は最後）→ 選べないもの の順に並べる */
function sectionsOf(options: readonly PickOption[]): Section[] {
  const pinned = options.filter((o) => o.pinned && !o.disabled);
  const rest = options.filter((o) => !o.pinned && !o.disabled);
  const disabled = options.filter((o) => o.disabled);
  const grouped = options.some((o) => o.group);
  const out: Section[] = [];
  if (pinned.length > 0) out.push({ key: '__pinned', title: null, items: pinned });
  if (!grouped) {
    if (rest.length > 0) out.push({ key: '__all', title: null, items: rest });
  } else {
    const order: string[] = [];
    const by = new Map<string, PickOption[]>();
    for (const o of rest) {
      const g = o.group ?? OTHER_GROUP;
      if (!by.has(g)) {
        by.set(g, []);
        order.push(g);
      }
      by.get(g)!.push(o);
    }
    const sorted = [...order.filter((g) => g !== OTHER_GROUP), ...order.filter((g) => g === OTHER_GROUP)];
    for (const g of sorted) out.push({ key: `g:${g}`, title: g, items: by.get(g)! });
  }
  if (disabled.length > 0) out.push({ key: '__disabled', title: DISABLED_GROUP, items: disabled });
  return out;
}

export function OptionPicker({ label, title, value, options, onChange, invalid, disabled, id, note, className }: Props) {
  const [open, setOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const phone = useIsPhone();
  const current = options.find((o) => o.id === value);

  const show = (q = '') => {
    if (disabled) return;
    setInitialQuery(q);
    setOpen(true);
  };
  const close = useCallback(() => setOpen(false), []);
  const pick = (optId: string) => {
    setOpen(false);
    if (optId !== value) onChange(optId);
  };

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      show();
      return;
    }
    // 文字を打ったら、その文字で検索を始める
    if (e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      show(e.key);
    }
  };

  const panel = open && (
    <PickerPanel title={title} value={value} options={options} note={note} initialQuery={initialQuery} autoFocusSearch={!phone || options.length > 12} onPick={pick} />
  );

  return (
    <div className={cx('field opk-field', invalid && 'field--invalid', className)} id={id}>
      <span>{label}</span>
      <button
        ref={triggerRef}
        type="button"
        className={cx('opk-trigger', invalid && 'is-invalid', open && 'is-open')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${title}：${current?.label ?? '未選択'}${disabled ? '' : '（変更する）'}`}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={onTriggerKey}
      >
        <span className="opk-trigger__label">{current?.label ?? '（選べない値）'}</span>
        {current?.hint && <span className="opk-trigger__hint">{current.hint}</span>}
        {!disabled && (
          <span className="opk-trigger__chev" aria-hidden="true">
            ▾
          </span>
        )}
      </button>
      {phone ? (
        <Sheet open={open} title={title} onClose={close}>
          {panel}
        </Sheet>
      ) : (
        open && (
          <Anchored anchor={triggerRef} title={title} onClose={close}>
            {panel}
          </Anchored>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------- PC：ボタンの近くに出すパネル

const MARGIN = 8;
const PANEL_MIN_W = 340;
const PANEL_MAX_H = 460;
/** 下にこれだけ場所があれば下に出す */
const PANEL_PREFER_H = 360;

function Anchored({ anchor, title, onClose, children }: { anchor: RefObject<HTMLElement | null>; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' });
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  const escape = useRef(() => closeRef.current());
  useFocusTrap(ref, { onEscape: escape.current });

  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      if (!a) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = Math.min(vw - MARGIN * 2, Math.max(a.width, PANEL_MIN_W));
      const left = Math.max(MARGIN, Math.min(vw - width - MARGIN, a.left));
      const below = vh - a.bottom - MARGIN * 2;
      const above = a.top - MARGIN * 2;
      // 下に十分な場所があれば下、なければ広いほう
      const useBelow = below >= PANEL_PREFER_H || below >= above;
      const maxHeight = Math.min(PANEL_MAX_H, useBelow ? below : above);
      setStyle(useBelow ? { left, width, top: a.bottom + MARGIN, maxHeight } : { left, width, bottom: vh - a.top + MARGIN, maxHeight });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor]);

  // 外側を押したら閉じる（きっかけのボタンは自分で開け閉めする）
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return;
      closeRef.current();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [anchor]);

  return createPortal(
    <div ref={ref} className="opk-pop" role="dialog" aria-label={title} style={style} tabIndex={-1}>
      {children}
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- 中身（シートとパネルで共通）

interface PanelProps {
  title: string;
  value: string;
  options: readonly PickOption[];
  note?: string;
  initialQuery: string;
  autoFocusSearch: boolean;
  onPick: (id: string) => void;
}

function PickerPanel({ title, value, options, note, initialQuery, autoFocusSearch, onPick }: PanelProps) {
  const [query, setQuery] = useState(initialQuery);
  const searchRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const optId = (i: number) => `${baseId}-o${i}`;

  const q = fold(query.trim());
  const sections = useMemo(() => {
    const match = (o: PickOption) => q === '' || [o.label, o.description, o.group, o.hint].some((s) => s && fold(s).includes(q));
    return sectionsOf(options.filter(match));
  }, [options, q]);
  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const [active, setActive] = useState(() => Math.max(0, flat.findIndex((o) => o.id === value)));
  const activeIndex = Math.min(active, Math.max(0, flat.length - 1));

  // 検索が変わったら先頭（選べるもの）へ
  const firstQuery = useRef(true);
  useEffect(() => {
    if (firstQuery.current) {
      firstQuery.current = false;
      return;
    }
    setActive(0);
  }, [q]);

  // 開いたとき：検索欄へフォーカス（シートのフォーカストラップより後に）。
  // スマホで選択肢が少ないときは、画面キーボードで一覧が隠れないよう一覧の枠にフォーカスする（↑↓・Enter・文字入力は効く）
  useEffect(() => {
    const t = setTimeout(() => {
      const el = searchRef.current;
      if (!el) return;
      if (!autoFocusSearch && !initialQuery) {
        rootRef.current?.focus({ preventScroll: true });
        return;
      }
      el.focus({ preventScroll: true });
      const n = el.value.length;
      el.setSelectionRange(n, n);
    }, 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 選んでいるもの・キーボードで動かしたものが見えるように
  useEffect(() => {
    const el = document.getElementById(optId(activeIndex));
    el?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  const move = (d: number) => {
    if (flat.length === 0) return;
    setActive((i) => (Math.min(i, flat.length - 1) + d + flat.length) % flat.length);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing) return;
    const inSearch = e.target === searchRef.current;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(1);
        return;
      case 'ArrowUp':
        e.preventDefault();
        move(-1);
        return;
      case 'Home':
      case 'End':
        if (inSearch && query !== '') return;
        e.preventDefault();
        setActive(e.key === 'Home' ? 0 : flat.length - 1);
        return;
      case 'Enter': {
        if (!inSearch && e.target !== e.currentTarget) return;
        e.preventDefault();
        const o = flat[activeIndex];
        if (o && !o.disabled) onPick(o.id);
        return;
      }
    }
    // 検索欄の外で文字を打ったら検索欄へ
    if (!inSearch && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ') {
      searchRef.current?.focus({ preventScroll: true });
    }
  };

  const active0 = flat[activeIndex];
  let n = -1;
  return (
    <div className="opk" onKeyDown={onKeyDown} ref={rootRef} tabIndex={-1}>
      <label className="opk__search">
        <span className="sr-only">{title}を検索</span>
        <input
          ref={searchRef}
          type="search"
          role="combobox"
          aria-expanded="true"
          aria-controls={`${baseId}-list`}
          aria-activedescendant={active0 ? optId(activeIndex) : undefined}
          aria-autocomplete="list"
          placeholder="名前や説明で探す"
          value={query}
          autoComplete="off"
          enterKeyHint="done"
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {note && <p className="opk__note">{note}</p>}
      <div className="opk__list" role="listbox" id={`${baseId}-list`} aria-label={title}>
        {flat.length === 0 && <p className="opk__empty">「{query}」に合うものはありません</p>}
        {sections.map((s) => (
          <div key={s.key} role="group" aria-label={s.title ?? undefined} className={cx('opk__group', s.key === '__disabled' && 'is-disabled')}>
            {s.title && (
              <div className="opk__group-head" aria-hidden="true">
                {s.title}
              </div>
            )}
            {s.items.map((o) => {
              n += 1;
              const i = n;
              const selected = o.id === value;
              return (
                <div
                  key={o.id || '__none'}
                  id={optId(i)}
                  role="option"
                  aria-selected={selected}
                  aria-disabled={o.disabled ? true : undefined}
                  className={cx('opk-opt', selected && 'is-selected', i === activeIndex && 'is-active', o.disabled && 'is-disabled')}
                  onPointerMove={() => i !== activeIndex && setActive(i)}
                  onClick={() => !o.disabled && onPick(o.id)}
                >
                  <span className="opk-opt__check" aria-hidden="true">
                    {selected ? '✓' : ''}
                  </span>
                  <span className="opk-opt__main">
                    <span className="opk-opt__label">{o.label}</span>
                    {o.description && <span className="opk-opt__desc">{o.description}</span>}
                    {o.disabled && <span className="opk-opt__reason">🔒 {o.disabled}</span>}
                  </span>
                  {(o.points || o.hint) && (
                    <span className="opk-opt__pts">
                      {o.points && <b>{o.points}</b>}
                      {o.hint && <small>{o.hint}</small>}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
