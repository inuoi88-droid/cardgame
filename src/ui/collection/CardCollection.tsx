/**
 * カード置き場の一覧本体（決定事項 #109）。3つの密度（カード・コンパクト・リスト）と節分け、選択モード、
 * 窓の中だけ描く仮想スクロール（VirtualRows）、矢印キーでの移動、スマホの長押しで選択、PC のドラッグ（グループの札へ）。
 * 何を出すか（絞り込み・並べ替え・節）は呼び出し側が query.ts で決めて sections で渡す。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { CARD_TYPE_LABEL, CURSE_LABEL, RARITY_LABEL, TRIBE_LABEL, formatPoints, type CardGroup } from '../../engine/index.ts';
import { CardArtOf } from '../components/CardArt.tsx';
import { CardView } from '../components/CardView.tsx';
import { CostGem, StatMini, frameClasses, RarityGem } from '../components/cardParts.tsx';
import { cx } from '../util.ts';
import { groupHex } from './groups.ts';
import type { Entry, Section, ViewMode } from './query.ts';
import { VirtualRows, type VRow, type VirtualApi } from './VirtualRows.tsx';

/** ドラッグで運ぶカード ID の形式 */
export const DRAG_MIME = 'application/x-cardgame-cards';

interface Props {
  sections: readonly Section[];
  /** 節の見出しを出す（節分けしているとき） */
  headers: boolean;
  view: ViewMode;
  collapsed: ReadonlySet<string>;
  onToggleSection: (key: string) => void;
  /** 節の見出しの右に置く操作（「このタグからグループを作る」など） */
  sectionTools?: (s: Section) => ReactNode;
  groupsById: ReadonlyMap<string, CardGroup>;
  membership: ReadonlyMap<string, readonly string[]>;
  deckUse: ReadonlyMap<string, ReadonlySet<string>>;
  selecting: boolean;
  selected: ReadonlySet<string>;
  onOpen: (e: Entry) => void;
  onEdit?: (e: Entry) => void;
  /** 選択モードで押したとき（shift で範囲） */
  onSelect: (id: string, flatIndex: number, shift: boolean) => void;
  /** スマホの長押し（選択モードに入る） */
  onLongPress?: (id: string, flatIndex: number) => void;
  /** PC でグループへドラッグできる */
  draggable?: boolean;
  /** 一覧の読み上げ名 */
  label: string;
}

interface HeadRow extends VRow {
  kind: 'head' | 'headm';
  section: Section;
  collapsed: boolean;
}
interface ItemsRow extends VRow {
  kind: 'items';
  items: { entry: Entry; flat: number }[];
}
type Row = HeadRow | ItemsRow;

/** 密度ごとの1つの幅の目安と間（列の数を決める） */
const LAYOUT: Record<ViewMode, { min: number; gap: number; maxCols: number }> = {
  card: { min: 160, gap: 18, maxCols: 7 },
  compact: { min: 106, gap: 8, maxCols: 12 },
  list: { min: 9999, gap: 6, maxCols: 1 },
};
const ESTIMATE: Record<ViewMode, number> = { card: 300, compact: 170, list: 70 };

export function columnsFor(view: ViewMode, width: number): number {
  if (view === 'list' || width <= 0) return 1;
  if (view === 'card' && width < 600) return 2;
  const { min, gap, maxCols } = LAYOUT[view];
  return Math.max(view === 'compact' ? 3 : 2, Math.min(maxCols, Math.floor((width + gap) / (min + gap))));
}

const LONG_PRESS_MS = 480;

export function CardCollection(props: Props) {
  const { sections, headers, view, collapsed, groupsById, membership, deckUse, selecting, selected, label } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const cols = columnsFor(view, width);

  const { rows, flatCount, itemRow } = useMemo(() => {
    const rows: Row[] = [];
    const itemRow: { row: number; col: number }[] = [];
    let flat = 0;
    for (const s of sections) {
      const isCollapsed = headers && collapsed.has(s.key);
      if (headers) rows.push({ key: `h:${s.key}`, kind: s.group?.memo ? 'headm' : 'head', section: s, collapsed: isCollapsed });
      if (isCollapsed) continue;
      for (let i = 0; i < s.entries.length; i += cols) {
        const chunk = s.entries.slice(i, i + cols).map((entry, c) => {
          itemRow[flat] = { row: rows.length, col: c };
          return { entry, flat: flat++ };
        });
        rows.push({ key: `i:${s.key}:${i}`, kind: 'items', items: chunk });
      }
    }
    return { rows, flatCount: flat, itemRow };
  }, [sections, headers, collapsed, cols]);

  // ---------------------------------------------------------------- キーボード（矢印・PageUp/PageDown・Home・End）
  // Tab で止まるのは一覧の中の1枚だけ（active。ロービング tabindex）。その行は見える範囲の外でも描いておく（フォーカスが消えないように）。
  // 一覧の外にフォーカスがあるときは、スクロールが止まるたびに見えているいちばん上のカードを active にする（Tab で戻ったときに飛ばない）
  const api = useRef<VirtualApi | null>(null);
  const [activeRaw, setActive] = useState(0);
  /** 見えているいちばん上の行（それより上の、余分に描いてある節の見出しは Tab で止めない） */
  const [firstRow, setFirstRow] = useState(0);
  const active = Math.max(0, Math.min(activeRaw, flatCount - 1));
  const activeRow = itemRow[active]?.row;
  const tabFor = (flat: number) => (flat === active ? 0 : -1);
  useEffect(() => {
    let t = 0;
    const on = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        const wrap = wrapRef.current;
        if (!wrap || !api.current || wrap.contains(document.activeElement)) return;
        const first = api.current.firstVisibleRow();
        setFirstRow(first);
        for (let r = first; r < rows.length; r++) {
          const row = rows[r]!;
          if (row.kind === 'items') {
            setActive(row.items[0]!.flat);
            return;
          }
        }
      }, 160);
    };
    window.addEventListener('scroll', on, { passive: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('scroll', on);
    };
  }, [rows]);
  const pendingFocus = useRef<number | null>(null);
  const focusItem = (n: number) => {
    const el = wrapRef.current?.querySelector<HTMLElement>(`[data-vi="${n}"]`);
    const target = el?.matches('.vfocus') ? el : el?.querySelector<HTMLElement>('.vfocus, .tcg');
    if (target) {
      target.focus({ preventScroll: true });
      return true;
    }
    return false;
  };
  const onRendered = useCallback(() => {
    if (pendingFocus.current === null) return;
    if (focusItem(pendingFocus.current)) pendingFocus.current = null;
  }, []);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const holder = (e.target as HTMLElement).closest<HTMLElement>('[data-vi]');
    if (!holder) return;
    const cur = Number(holder.dataset.vi);
    const pos = itemRow[cur];
    if (!pos) return;
    let next: number | null = null;
    const rowItems = (r: number) => (rows[r]?.kind === 'items' ? (rows[r] as ItemsRow).items : null);
    const nextItemsRow = (from: number, dir: 1 | -1) => {
      for (let r = from + dir; r >= 0 && r < rows.length; r += dir) if (rowItems(r)) return r;
      return null;
    };
    if (e.key === 'ArrowRight') next = Math.min(flatCount - 1, cur + 1);
    else if (e.key === 'ArrowLeft') next = Math.max(0, cur - 1);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const r = nextItemsRow(pos.row, e.key === 'ArrowDown' ? 1 : -1);
      if (r !== null) {
        const items = rowItems(r)!;
        next = items[Math.min(pos.col, items.length - 1)]!.flat;
      }
    } else if (e.key === 'PageDown' || e.key === 'PageUp') {
      // 1画面ぶん先の行の、同じ列のカードへ
      const a = api.current;
      if (a) {
        const dir = e.key === 'PageDown' ? 1 : -1;
        const page = Math.max(120, window.innerHeight - 200);
        const at = a.rowAt(a.rowTop(pos.row) + dir * page);
        const r = rowItems(at) ? at : (nextItemsRow(at, dir) ?? nextItemsRow(at, dir === 1 ? -1 : 1));
        if (r !== null && rowItems(r)) {
          const items = rowItems(r)!;
          next = items[Math.min(pos.col, items.length - 1)]!.flat;
        }
      }
    } else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = flatCount - 1;
    if (next === null || next === cur || !itemRow[next]) return;
    e.preventDefault();
    setActive(next);
    pendingFocus.current = next;
    api.current?.scrollToRow(itemRow[next]!.row);
    if (focusItem(next)) pendingFocus.current = null;
  };

  // ---------------------------------------------------------------- 長押し（タッチ）
  const press = useRef<{ id: string; flat: number; x: number; y: number; timer: number } | null>(null);
  const swallowClick = useRef(false);
  /**
   * 長押しのあとに指を離したときのクリックを捨てる。選択のバーが指の下に出てくることがあるので、一覧の外のクリックも
   * （少しの間・1回だけ）捨てる
   */
  const swallowNextClick = () => {
    swallowClick.current = true;
    const onClick = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
      done();
    };
    const done = () => {
      swallowClick.current = false;
      document.removeEventListener('click', onClick, true);
      window.clearTimeout(timer);
    };
    const timer = window.setTimeout(done, 700);
    document.addEventListener('click', onClick, true);
  };
  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || !props.onLongPress) return;
    const holder = (e.target as HTMLElement).closest<HTMLElement>('[data-vi]');
    if (!holder?.dataset.id) return;
    const id = holder.dataset.id;
    const flat = Number(holder.dataset.vi);
    cancelPress();
    press.current = {
      id,
      flat,
      x: e.clientX,
      y: e.clientY,
      timer: window.setTimeout(() => {
        press.current = null;
        swallowNextClick();
        props.onLongPress?.(id, flat);
        navigator.vibrate?.(12);
      }, LONG_PRESS_MS),
    };
  };
  const onPointerMove = (e: PointerEvent) => {
    const p = press.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) cancelPress();
  };
  useEffect(() => cancelPress, []);

  // ---------------------------------------------------------------- ドラッグ（PC：グループの札へ）
  const onDragStart = (e: DragEvent) => {
    const holder = (e.target as HTMLElement).closest<HTMLElement>('[data-vi]');
    const id = holder?.dataset.id;
    if (!id) return;
    const ids = selecting && selected.has(id) ? [...selected] : [id];
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(ids));
    e.dataTransfer.setData('text/plain', `${ids.length}枚のカード`);
    e.dataTransfer.effectAllowed = 'copy';
    document.body.classList.add('is-dragging-cards');
  };
  const onDragEnd = () => document.body.classList.remove('is-dragging-cards');

  const estimate = useMemo(() => ({ head: 50, headm: 72, items: ESTIMATE[view] }), [view]);
  const total = flatCount;

  const renderItem = (entry: Entry, flat: number): ReactNode => {
    const { card } = entry;
    const isSel = selected.has(card.id);
    const groupIds = membership.get(card.id) ?? [];
    const deckCount = deckUse.get(card.id)?.size ?? 0;
    const common = {
      'data-vi': flat,
      'data-id': card.id,
      draggable: props.draggable || undefined,
    };
    const click = (ev: MouseEvent) => {
      if (selecting) props.onSelect(card.id, flat, ev.shiftKey);
      else if (ev.shiftKey && props.onLongPress) props.onLongPress(card.id, flat);
      else props.onOpen(entry);
    };
    if (view === 'card') {
      return (
        <div key={card.id} className={cx('cc-card', isSel && 'is-selected', selecting && 'is-selecting')} {...common}>
          <CardView card={card} analysis={entry.a} size="sm" onClick={() => props.onOpen(entry)} actionLabel={`${card.name || '（名前なし）'}の詳細を見る`} tabIndex={selecting ? -1 : tabFor(flat)} />
          {selecting && (
            <button type="button" className="cc-card__sel vfocus" tabIndex={tabFor(flat)} role="checkbox" aria-checked={isSel} aria-label={`${card.name || '（名前なし）'}を選ぶ`} onClick={click}>
              <span className="selmark" aria-hidden="true" />
            </button>
          )}
          <div className="card-grid__actions">
            <GroupDots ids={groupIds} groupsById={groupsById} />
            <span className={cx('card-grid__pts', entry.over && 'is-over')}>
              {formatPoints(entry.used)}/{entry.budget}pt
              {!entry.a.valid && <span className="sr">（要修正）</span>}
            </span>
            {props.onEdit && !selecting && (
              <button type="button" className="btn btn--small" tabIndex={tabFor(flat)} onClick={() => props.onEdit!(entry)} aria-label={`${card.name || '（名前なし）'}を編集`}>
                編集
              </button>
            )}
          </div>
        </div>
      );
    }
    const name = card.name.trim() || '（名前なし）';
    const tribe = card.tribe && TRIBE_LABEL[card.tribe] ? TRIBE_LABEL[card.tribe] : null;
    const typeLabel = `${CARD_TYPE_LABEL[entry.a.cardType]}${entry.a.isCurse ? `・${CURSE_LABEL}` : ''}${tribe ? `・${tribe}` : ''}`;
    const selProps = selecting ? { role: 'checkbox', 'aria-checked': isSel } : {};
    if (view === 'compact') {
      return (
        <button
          key={card.id}
          type="button"
          className={cx('ctile vfocus', frameClasses(card.rarity, entry.a.cardType, entry.a.isCurse), !entry.a.valid && 'is-invalid', isSel && 'is-selected')}
          {...common}
          tabIndex={tabFor(flat)}
          {...selProps}
          onClick={click}
          title={entry.summary || undefined}
          aria-label={`${name}（コスト${card.cost}・${typeLabel}・${RARITY_LABEL[card.rarity]}${entry.a.valid ? '' : '・要修正'}）${selecting ? '' : 'の詳細を見る'}`}
        >
          <CostGem cost={card.cost} label={false} />
          {selecting && <span className="selmark" aria-hidden="true" />}
          <span className="ctile__art" aria-hidden="true">
            <CardArtOf card={card} analysis={entry.a} size={50} />
            {entry.a.isCurse && <span className="ctile__seal">呪</span>}
          </span>
          <span className="ctile__name" aria-hidden="true">
            {name}
          </span>
          <span className="ctile__type" aria-hidden="true">
            <span>{CARD_TYPE_LABEL[entry.a.cardType]}</span>
            <RarityGem rarity={card.rarity} />
          </span>
          <span className="ctile__foot" aria-hidden="true">
            {card.stats ? <StatMini attack={card.stats.attack} hp={card.stats.hp} defense={card.stats.defense} /> : <span className="ctile__sum">{entry.summary}</span>}
          </span>
          {groupIds.length > 0 && (
            <span className="ctile__dots" aria-hidden="true">
              <GroupDots ids={groupIds} groupsById={groupsById} max={4} />
            </span>
          )}
          {!entry.a.valid && <span className="ctile__bad">要修正</span>}
        </button>
      );
    }
    return (
      <button
        key={card.id}
        type="button"
        className={cx('lrow vfocus', frameClasses(card.rarity, entry.a.cardType, entry.a.isCurse), !entry.a.valid && 'is-invalid', isSel && 'is-selected', selecting && 'is-selecting')}
        {...common}
        tabIndex={tabFor(flat)}
        {...selProps}
        onClick={click}
      >
        {selecting && <span className="selmark" aria-hidden="true" />}
        <CostGem cost={card.cost} />
        <span className="lrow__art" aria-hidden="true">
          <CardArtOf card={card} analysis={entry.a} size={40} />
        </span>
        <span className="lrow__main">
          <span className="lrow__l1">
            <b className="lrow__name">{name}</b>
            <RarityGem rarity={card.rarity} withLabel="sr" />
            {!entry.a.valid && <span className="card-row__bad">要修正</span>}
            <GroupChips ids={groupIds} groupsById={groupsById} />
          </span>
          <span className="lrow__l2">
            {/* 狭い行のモンスターは「モンスター」を省いて種族を残す（ステータスの絵でモンスターと分かる） */}
            <span className="lrow__type">
              <span className={cx('lrow__kind', !!card.stats && 'lrow__kind--monster')}>{CARD_TYPE_LABEL[entry.a.cardType]}</span>
              {entry.a.isCurse && <span className="lrow__curse">{CURSE_LABEL}</span>}
              {tribe && <span className="lrow__tribe">{tribe}</span>}
            </span>
            {card.stats && <StatMini attack={card.stats.attack} hp={card.stats.hp} defense={card.stats.defense} />}
            <span className="lrow__sum">{entry.summary}</span>
          </span>
        </span>
        <span className="lrow__side">
          <span className={cx('lrow__pts', entry.over && 'is-over')}>
            {formatPoints(entry.used)}
            <small className="lrow__budget">/{entry.budget}</small>
            <small>pt</small>
          </span>
          {deckCount > 0 && <span className="lrow__deck">デッキ{deckCount}</span>}
        </span>
      </button>
    );
  };

  /** 速いスクロールの間の仮の行（名前だけ。枠と高さは本物と同じ） */
  const renderLight = (row: Row, index: number) => {
    if (row.kind !== 'items') return render(row, index);
    return (
      <div className={cx('vitems', `vitems--${view}`)} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} aria-hidden="true">
        {row.items.map(({ entry }) => (
          <div key={entry.card.id} className={cx('vph', `vph--${view}`, frameClasses(entry.card.rarity, entry.a.cardType, entry.a.isCurse))}>
            <span className="vph__cost">{entry.card.cost}</span>
            <span className="vph__name">{entry.card.name}</span>
          </div>
        ))}
      </div>
    );
  };

  const render = (row: Row, index: number) => {
    if (row.kind === 'items') {
      return (
        <div className={cx('vitems', `vitems--${view}`)} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {row.items.map(({ entry, flat }) => renderItem(entry, flat))}
        </div>
      );
    }
    const s = row.section;
    const color = s.group ? groupHex(s.group.color) : undefined;
    return (
      <div
        className={cx('csec', s.cardType && `ty--${s.cardType}`, s.rarity && `rar--${s.rarity}`)}
        style={color ? ({ '--gc': color } as CSSProperties) : undefined}
        inert={index < firstRow}
      >
        <div className="csec__bar">
          <button type="button" className="csec__toggle" aria-expanded={!row.collapsed} onClick={() => props.onToggleSection(s.key)}>
            <span className="csec__caret" aria-hidden="true" />
            {s.group && <span className="gdot" aria-hidden="true" style={{ background: color }} />}
            <b className="csec__label">{s.label}</b>
            <span className="csec__count">{s.entries.length}枚</span>
          </button>
          {props.sectionTools?.(s)}
        </div>
        {s.group?.memo && <p className="csec__memo">{s.group.memo}</p>}
      </div>
    );
  };

  return (
    <div
      ref={wrapRef}
      className={cx('ccoll', `ccoll--${view}`, selecting && 'is-selecting')}
      role="region"
      aria-label={`${label}（${total}枚。矢印キーで移動）`}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onMouseDown={(e) => {
        // 選択モードの Shift＋クリックで文字が選ばれないように
        if (selecting && e.shiftKey) e.preventDefault();
      }}
      onPointerMove={onPointerMove}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onContextMenu={(e) => {
        if (press.current || swallowClick.current) e.preventDefault();
      }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onFocus={(e) => {
        const holder = (e.target as HTMLElement).closest<HTMLElement>('[data-vi]');
        if (holder) setActive(Number(holder.dataset.vi));
      }}
    >
      {width > 0 && <VirtualRows rows={rows} estimate={estimate} render={render} renderLight={renderLight} api={api} onRendered={onRendered} measureKey={`${view}:${width}`} keep={activeRow} />}
    </div>
  );
}

/** カードが入っているグループの小さな色の点 */
export function GroupDots({ ids, groupsById, max = 5 }: { ids: readonly string[]; groupsById: ReadonlyMap<string, CardGroup>; max?: number }) {
  const gs = ids.flatMap((id) => (groupsById.has(id) ? [groupsById.get(id)!] : []));
  if (gs.length === 0) return null;
  return (
    <span className="gdots" title={gs.map((g) => g.name).join('・')}>
      {gs.slice(0, max).map((g) => (
        <span key={g.id} className="gdot" style={{ background: groupHex(g.color) }} aria-hidden="true" />
      ))}
      {gs.length > max && <span className="gdots__more">+{gs.length - max}</span>}
      <span className="sr">グループ：{gs.map((g) => g.name).join('、')}</span>
    </span>
  );
}

/** グループの札（名前つき。狭いところでは点だけ） */
export function GroupChips({ ids, groupsById, max = 2 }: { ids: readonly string[]; groupsById: ReadonlyMap<string, CardGroup>; max?: number }) {
  const gs = ids.flatMap((id) => (groupsById.has(id) ? [groupsById.get(id)!] : []));
  if (gs.length === 0) return null;
  return (
    <span className="gchips">
      <span className="sr">グループ：</span>
      {gs.slice(0, max).map((g) => (
        <span key={g.id} className="gchip" style={{ '--gc': groupHex(g.color) } as CSSProperties}>
          <span className="gdot" aria-hidden="true" />
          <span className="gchip__name">{g.name}</span>
        </span>
      ))}
      {gs.length > max && <span className="gdots__more">+{gs.length - max}</span>}
    </span>
  );
}
