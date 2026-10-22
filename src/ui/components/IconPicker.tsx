/**
 * カードの絵の選択パネル（決定事項 #105）。スマホは下から出るシート、PC は右のパネル。
 *
 * - 「アイコン」タブ：game-icons.net の 4000 余りのアイコン。英語と日本語で検索、分類のチップ、カードに合う「おすすめ」、最近使ったもの。
 *   一覧は見えている行だけを描く（仮想化）ので、スマホでも軽く動く。絵は見えている分のシャードだけを読む。
 * - 「絵文字」タブ：以前の絵文字の一覧。
 *
 * キーボード：Tab でタブ・検索欄・チップ・一覧へ。一覧の中は矢印キー・Home・End・PageUp・PageDown で動き、Enter で決定。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { CardAnalysis, CardDef } from '../../engine/index.ts';
import { CATEGORY_LABEL, CATEGORY_ORDER, type IconCategory } from '../icons/categories.ts';
import { ICON_TOTAL } from '../icons/generated/info.ts';
import { prefetchIcons, useIconIndex } from '../icons/load.ts';
import { giIcon, parseIconRef } from '../icons/ref.ts';
import { buildSearchIndex, displayName, searchIcons, suggestIcons, type IconSearchIndex } from '../icons/search.ts';
import { cx } from '../util.ts';
import { CardArt } from './CardArt.tsx';
import { EmojiGrid } from './EmojiPicker.tsx';
import { Sheet } from './Sheet.tsx';
import './iconPicker.css';

interface Props {
  open: boolean;
  card: CardDef;
  analysis: CardAnalysis;
  onSelect: (icon: string) => void;
  onClose: () => void;
}

const RECENT_KEY = 'cardgame.v1.recentIcons';
const RECENT_MAX = 12;
const TAB_KEY = 'cardgame.v1.iconPickerTab';

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function pushRecent(name: string): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([name, ...readList(RECENT_KEY).filter((x) => x !== name)].slice(0, RECENT_MAX)));
  } catch {
    // 保存できなくても困らない
  }
}

function readTab(): 'gi' | 'emoji' {
  try {
    return localStorage.getItem(TAB_KEY) === 'emoji' ? 'emoji' : 'gi';
  } catch {
    return 'gi';
  }
}

export function IconPicker({ open, card, analysis, onSelect, onClose }: Props) {
  const [tab, setTab] = useState<'gi' | 'emoji'>(() => (parseIconRef(card.icon).kind === 'emoji' ? 'emoji' : readTab()));
  const choose = (icon: string) => {
    onSelect(icon);
    onClose();
  };
  const switchTab = (t: 'gi' | 'emoji') => {
    setTab(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      // 保存できなくても困らない
    }
  };
  const onTabKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = tab === 'gi' ? 'emoji' : 'gi';
    switchTab(next);
    (e.currentTarget.parentElement?.querySelector(`[data-tab="${next}"]`) as HTMLElement | null)?.focus();
  };
  return (
    <Sheet open={open} title="カードの絵を選ぶ" onClose={onClose} className="icon-sheet">
      <div className="ip">
        <div className="ip__tabs" role="tablist" aria-label="絵の種類">
          {(
            [
              ['gi', 'アイコン'],
              ['emoji', '絵文字'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              data-tab={id}
              id={`ip-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`ip-panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              className={cx('ip__tab', tab === id && 'is-active')}
              onClick={() => switchTab(id)}
              onKeyDown={onTabKey}
            >
              {label}
            </button>
          ))}
          <span className="ip__now" aria-label="いまの絵">
            <CardArt icon={card.icon} rarity={card.rarity} cardType={analysis.cardType} curse={analysis.isCurse} size={36} />
          </span>
        </div>
        {tab === 'gi' ? (
          <div className="ip__panel" role="tabpanel" id="ip-panel-gi" aria-labelledby="ip-tab-gi">
            <GiPane card={card} analysis={analysis} onPick={(name) => {
              pushRecent(name);
              choose(giIcon(name));
            }} />
          </div>
        ) : (
          <div className="ip__panel ip__scroll" role="tabpanel" id="ip-panel-emoji" aria-labelledby="ip-tab-emoji">
            <EmojiGrid value={card.icon} onSelect={choose} />
          </div>
        )}
        <p className="ip__credit">
          アイコン：
          <a href="https://game-icons.net" target="_blank" rel="noreferrer">
            game-icons.net
          </a>
          （Lorc・Delapouite ほか、CC BY 3.0・色を変更）・
          <a href="#/credits" onClick={onClose}>
            クレジット
          </a>
        </p>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- アイコンのタブ

/** 1マスの大きさ（ボタン 52px＋すき間）。タップの的は 44px 以上 */
const CELL = 60;
/** 見えている行の前後に余分に描く行 */
const OVERSCAN = 3;

function GiPane({ card, analysis, onPick }: { card: CardDef; analysis: CardAnalysis; onPick: (name: string) => void }) {
  const index = useIconIndex();
  const si = useMemo(() => (index && index !== 'error' ? buildSearchIndex(index.names, index.ja) : null), [index]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<IconCategory | null>(null);
  const [recent] = useState(() => readList(RECENT_KEY));
  const current = parseIconRef(card.icon);
  const currentName = current.kind === 'gi' ? current.name : null;

  const results = useMemo(() => (si ? searchIcons(si, query, category) : []), [si, query, category]);
  const counts = useMemo(() => {
    const m = new Map<IconCategory, number>();
    if (si) for (const c of si.categories) m.set(c, (m.get(c) ?? 0) + 1);
    return m;
  }, [si]);
  const effectIds = useMemo(() => card.effects.map((e) => e.id), [card.effects]);
  const suggestions = useMemo(
    () => (si ? suggestIcons(si, { name: card.name, tribe: card.tribe, cardType: analysis.cardType, curse: analysis.isCurse, effectIds }) : []),
    [si, card.name, card.tribe, analysis.cardType, analysis.isCurse, effectIds],
  );
  const recentOk = useMemo(() => (si ? recent.filter((n) => si.nameSet.has(n)) : []), [si, recent]);
  const browsing = query.trim() === '' && category === null;

  const art = { rarity: card.rarity, cardType: analysis.cardType, curse: analysis.isCurse };

  if (index === 'error') return <p className="hint ip__msg">アイコンの一覧を読み込めませんでした。通信を確かめて開き直すか、「絵文字」タブを使ってください。</p>;

  return (
    <>
      <div className="ip__search">
        <input
          type="search"
          className="input"
          placeholder="さがす（例：竜・剣・fire）"
          aria-label="アイコンをさがす（日本語・英語）"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          enterKeyHint="search"
        />
      </div>
      <div className="ip__chips" role="group" aria-label="分類">
        <button type="button" className={cx('chip', category === null && 'is-active')} aria-pressed={category === null} onClick={() => setCategory(null)}>
          すべて
        </button>
        {CATEGORY_ORDER.map((c) => (
          <button key={c} type="button" className={cx('chip', category === c && 'is-active')} aria-pressed={category === c} onClick={() => setCategory(category === c ? null : c)}>
            {CATEGORY_LABEL[c]}
            {si && <small>{counts.get(c) ?? 0}</small>}
          </button>
        ))}
      </div>
      {!si ? (
        <div className="ip__scroll">
          <p className="hint ip__msg">アイコンの一覧を読み込み中…</p>
        </div>
      ) : (
        <VirtualGrid
          key={`${query}|${category ?? ''}`}
          si={si}
          names={results}
          selected={currentName}
          art={art}
          onPick={onPick}
          header={
            browsing ? (
              <>
                {suggestions.length > 0 && (
                  <IconRow title="おすすめ" hint="名前・種族・種類・効果から" si={si} names={suggestions} selected={currentName} art={art} onPick={onPick} />
                )}
                {recentOk.length > 0 && <IconRow title="最近使った" si={si} names={recentOk} selected={currentName} art={art} onPick={onPick} />}
                <h3 className="ip__h">すべて（{ICON_TOTAL}）</h3>
              </>
            ) : (
              <h3 className="ip__h" aria-live="polite">
                {results.length > 0 ? `${results.length}件` : '見つかりません。別のことば（日本語か英語）でさがしてください'}
              </h3>
            )
          }
        />
      )}
    </>
  );
}

interface ArtStyle {
  rarity: CardDef['rarity'];
  cardType: CardAnalysis['cardType'];
  curse: boolean;
}

function IconCell({
  si,
  name,
  selected,
  art,
  onPick,
  tabIndex,
  idx,
  onFocus,
}: {
  si: IconSearchIndex;
  name: string;
  selected: boolean;
  art: ArtStyle;
  onPick: (n: string) => void;
  tabIndex?: number;
  idx?: number;
  onFocus?: () => void;
}) {
  const label = displayName(si, name);
  return (
    <button
      type="button"
      className={cx('ip__cell', selected && 'is-selected')}
      title={`${label}（${name}）`}
      aria-label={label === name.replace(/-/g, ' ') ? label : `${label}（${name}）`}
      aria-pressed={selected}
      tabIndex={tabIndex}
      data-idx={idx}
      onFocus={onFocus}
      onClick={() => onPick(name)}
    >
      <CardArt icon={giIcon(name)} {...art} size={44} />
    </button>
  );
}

function IconRow({ title, hint, si, names, selected, art, onPick }: { title: string; hint?: string; si: IconSearchIndex; names: readonly string[]; selected: string | null; art: ArtStyle; onPick: (n: string) => void }) {
  return (
    <section className="ip__row">
      <h3 className="ip__h">
        {title}
        {hint && <small> {hint}</small>}
      </h3>
      <div className="ip__rowgrid">
        {names.map((n) => (
          <IconCell key={n} si={si} name={n} selected={n === selected} art={art} onPick={onPick} />
        ))}
      </div>
    </section>
  );
}

function VirtualGrid({
  si,
  names,
  selected,
  art,
  onPick,
  header,
}: {
  si: IconSearchIndex;
  names: readonly string[];
  selected: string | null;
  art: ArtStyle;
  onPick: (n: string) => void;
  header: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ top: 0, height: 480, width: 320, gridTop: 0 });
  const [focusIdx, setFocusIdx] = useState(0);
  const wantFocus = useRef(false);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    const grid = gridRef.current;
    if (!el || !grid) return;
    setVp({ top: el.scrollTop, height: el.clientHeight, width: grid.clientWidth, gridTop: grid.offsetTop });
  }, []);
  useLayoutEffect(() => {
    measure();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (gridRef.current) ro.observe(gridRef.current);
    return () => ro.disconnect();
  }, [measure]);

  const cols = Math.max(1, Math.floor(vp.width / CELL));
  const rows = Math.ceil(names.length / cols);
  const first = Math.max(0, Math.floor((vp.top - vp.gridTop) / CELL) - OVERSCAN);
  const last = Math.min(rows, Math.ceil((vp.top - vp.gridTop + vp.height) / CELL) + OVERSCAN);
  const visible = useMemo(() => names.slice(first * cols, last * cols), [names, first, last, cols]);
  // Tab で入れる1マス（矢印キーで動いた先。描いていなければ見えている最初のマス）
  const tabbable = focusIdx >= first * cols && focusIdx < last * cols ? focusIdx : first * cols;
  const left = Math.max(0, Math.floor((vp.width - cols * CELL) / 2));

  // 見えている範囲と少し先のシャードをまとめて読む（1枚ずつ待たない）
  useEffect(() => {
    prefetchIcons(names.slice(first * cols, (last + OVERSCAN * 2) * cols));
  }, [names, first, last, cols]);

  // 矢印キーで動いたら、その1マスが見えるようにしてからフォーカスする
  useEffect(() => {
    if (!wantFocus.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const row = Math.floor(focusIdx / cols);
    const y = vp.gridTop + row * CELL;
    if (y < el.scrollTop) el.scrollTop = y;
    else if (y + CELL > el.scrollTop + el.clientHeight) el.scrollTop = y + CELL - el.clientHeight;
    const btn = gridRef.current?.querySelector<HTMLElement>(`[data-idx="${focusIdx}"]`);
    if (btn) {
      btn.focus({ preventScroll: true });
      wantFocus.current = false;
    }
  });

  const onKeyDown = (e: KeyboardEvent) => {
    const page = Math.max(1, Math.floor(vp.height / CELL)) * cols;
    const delta: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols, PageDown: page, PageUp: -page };
    let next: number | null = null;
    if (e.key in delta) next = tabbable + delta[e.key]!;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = names.length - 1;
    if (next === null) return;
    e.preventDefault();
    wantFocus.current = true;
    setFocusIdx(Math.max(0, Math.min(names.length - 1, next)));
  };

  return (
    <div className="ip__scroll" ref={scrollRef} onScroll={measure}>
      {header}
      <div
        ref={gridRef}
        className="ip__vgrid"
        style={{ height: rows * CELL }}
        role="group"
        aria-label={`アイコン ${names.length}件（矢印キーで移動）`}
        onKeyDown={onKeyDown}
      >
        {visible.map((n, i) => {
          const idx = first * cols + i;
          const r = Math.floor(idx / cols);
          const c = idx % cols;
          return (
            <div key={n} className="ip__vcell" style={{ transform: `translate(${left + c * CELL}px, ${r * CELL}px)` }}>
              <IconCell si={si} name={n} selected={n === selected} art={art} onPick={onPick} idx={idx} tabIndex={idx === tabbable ? 0 : -1} onFocus={() => setFocusIdx(idx)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
