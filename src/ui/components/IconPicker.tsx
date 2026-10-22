/**
 * カードの絵の選択パネル（決定事項 #105）。スマホは下から出るシート、PC は右のパネル。
 *
 * - 「アイコン」タブ：game-icons.net の 4000 余りのアイコン。英語と日本語で検索、分類のチップ、カードに合う「おすすめ」、最近使ったもの。
 *   一覧は見えている行だけを描く（仮想化）ので、スマホでも軽く動く。絵は見えている分のシャードだけを読む。
 * - 「絵文字」タブ：以前の絵文字の一覧。
 *
 * キーボード：Tab でタブ・検索欄・チップ・一覧へ。一覧の中は矢印キー・Home・End・PageUp・PageDown で動き、Enter で決定。
 */
import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { CardAnalysis, CardDef } from '../../engine/index.ts';
import { CATEGORY_LABEL, CATEGORY_ORDER, type IconCategory } from '../icons/categories.ts';
import { ICON_TOTAL } from '../icons/generated/info.ts';
import { prefetchIcons, useIconIndex } from '../icons/load.ts';
import { giIcon, parseIconRef } from '../icons/ref.ts';
import { buildSearchIndex, displayName, smartSearch, suggestIcons, type IconSearchIndex } from '../icons/search.ts';
import { cx } from '../util.ts';
import { CardArt } from './CardArt.tsx';
import { EmojiGrid } from './EmojiPicker.tsx';
import { useIsPhone } from './dialogUtil.ts';
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

/**
 * スマホのキーボード：見えている高さ（visualViewport）と、キーボードで隠れている下の高さを CSS 変数にする。
 * シートをその上に収めるため（iOS はキーボードが出てもページの高さが変わらない）
 */
function useVisualViewportVars(active: boolean): void {
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!active || !vv) return;
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty('--ip-vvh', `${Math.round(vv.height)}px`);
      root.style.setProperty('--ip-kb', `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      root.style.removeProperty('--ip-vvh');
      root.style.removeProperty('--ip-kb');
    };
  }, [active]);
}

export function IconPicker({ open, card, analysis, onSelect, onClose }: Props) {
  const [tab, setTab] = useState<'gi' | 'emoji'>(() => (parseIconRef(card.icon).kind === 'emoji' ? 'emoji' : readTab()));
  const [typing, setTyping] = useState(false);
  const phone = useIsPhone();
  useVisualViewportVars(open && phone);
  const choose = (icon: string) => {
    onSelect(icon);
    onClose();
  };
  const chooseRef = useRef(choose);
  useEffect(() => {
    chooseRef.current = choose;
  });
  // 一覧のマスを描き直さないように、決めたときの処理は変わらない関数にする
  const onPickIcon = useCallback((name: string) => {
    pushRecent(name);
    chooseRef.current(giIcon(name));
  }, []);
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
  // タブといまの絵はシートの見出しの行に置く（検索結果に使える高さを増やす）
  const actions = (
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
        <CardArt icon={card.icon} rarity={card.rarity} cardType={analysis.cardType} curse={analysis.isCurse} size={32} />
      </span>
    </div>
  );
  return (
    <Sheet open={open} title="カードの絵" onClose={onClose} className="icon-sheet" actions={actions}>
      <div className={cx('ip', typing && 'is-typing')}>
        {tab === 'gi' ? (
          <div className="ip__panel" role="tabpanel" id="ip-panel-gi" aria-labelledby="ip-tab-gi">
            <GiPane card={card} analysis={analysis} onPick={onPickIcon} onTyping={setTyping} />
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

function GiPane({ card, analysis, onPick, onTyping }: { card: CardDef; analysis: CardAnalysis; onPick: (name: string) => void; onTyping: (typing: boolean) => void }) {
  const index = useIconIndex();
  const si = useMemo(() => (index && index !== 'error' ? buildSearchIndex(index.names, index.ja) : null), [index]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<IconCategory | null>(null);
  const [recent] = useState(() => readList(RECENT_KEY));
  const current = parseIconRef(card.icon);
  const currentName = current.kind === 'gi' ? current.name : null;

  // 日本語の入力の途中（け → けん → 剣）で毎回探し直さないように、少し遅れて追いかける値で探す
  const deferredQuery = useDeferredValue(query);
  const result = useMemo(() => (si ? smartSearch(si, deferredQuery, category) : { names: [], near: null }), [si, deferredQuery, category]);
  const results = result.names;
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
  const browsing = deferredQuery.trim() === '' && category === null;

  const art = useMemo(() => ({ rarity: card.rarity, cardType: analysis.cardType, curse: analysis.isCurse }), [card.rarity, analysis.cardType, analysis.isCurse]);

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
          onFocus={() => onTyping(true)}
          onBlur={() => onTyping(false)}
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
          key={`${deferredQuery}|${category ?? ''}`}
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
                {results.length === 0
                  ? '見つかりません。別のことば（日本語か英語）でさがしてください'
                  : result.near
                    ? `近いもの（${result.near.join('・')}）${results.length}件`
                    : `${results.length}件`}
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

const IconCell = memo(function IconCell({
  si,
  name,
  selected,
  art,
  onPick,
  tabIndex,
  idx,
  onFocusIdx,
}: {
  si: IconSearchIndex;
  name: string;
  selected: boolean;
  art: ArtStyle;
  onPick: (n: string) => void;
  tabIndex?: number;
  idx?: number;
  onFocusIdx?: (idx: number) => void;
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
      onFocus={idx === undefined || !onFocusIdx ? undefined : () => onFocusIdx(idx)}
      onClick={() => onPick(name)}
    >
      <CardArt icon={giIcon(name)} {...art} size={44} />
    </button>
  );
});

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

/** 先読みを始めるまでの待ち（速く流したとき・入力の途中で、通り過ぎる分を読まない） */
const PREFETCH_DELAY = 150;

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
  // 見えている最初の行（スクロールのたびではなく、行が変わったときだけ描き直す）
  const [vp, setVp] = useState({ row: 0, height: 480, width: 320, gridTop: 0 });
  const [focusIdx, setFocusIdx] = useState(0);
  const wantFocus = useRef(false);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    const grid = gridRef.current;
    if (!el || !grid) return;
    const next = { row: Math.floor((el.scrollTop - grid.offsetTop) / CELL), height: el.clientHeight, width: grid.clientWidth, gridTop: grid.offsetTop };
    setVp((v) => (v.row === next.row && v.height === next.height && v.width === next.width && v.gridTop === next.gridTop ? v : next));
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
  const first = Math.max(0, vp.row - OVERSCAN);
  const last = Math.min(rows, vp.row + Math.ceil(vp.height / CELL) + 1 + OVERSCAN);
  const visible = useMemo(() => names.slice(first * cols, last * cols), [names, first, last, cols]);
  // Tab で入れる1マス（矢印キーで動いた先。描いていなければ見えている最初のマス）
  const tabbable = focusIdx >= first * cols && focusIdx < last * cols ? focusIdx : first * cols;
  const left = Math.max(0, Math.floor((vp.width - cols * CELL) / 2));

  // 見えている範囲の少し先を、止まってから読む（見えているマスは CardArt が自分で読む）
  useEffect(() => {
    const t = setTimeout(() => prefetchIcons(names.slice(last * cols, (last + OVERSCAN * 2) * cols)), PREFETCH_DELAY);
    return () => clearTimeout(t);
  }, [names, last, cols]);

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
              <IconCell si={si} name={n} selected={n === selected} art={art} onPick={onPick} idx={idx} tabIndex={idx === tabbable ? 0 : -1} onFocusIdx={setFocusIdx} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
