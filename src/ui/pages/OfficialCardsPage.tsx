/**
 * 公式カードの一覧（#/official。決定事項 #119）。ドラフト戦の山（公式カード「黎明の大陸」）を見るだけのページ。
 * カード置き場の部品（検索・並べ替え・絞り込み・3つの密度・節）をそのまま使い、編集・選択・グループはしない。
 * 節は「色（アーキタイプ）ごと」が既定（ドラフトで色をそろえるときの目安）。表示の設定は見る人ごとに localStorage。
 */
import { useDeferredValue, useMemo, useState } from 'react';
import { BALANCE, type CardGroup } from '../../engine/index.ts';
import { OFFICIAL_ARCHETYPES, OFFICIAL_CARDS, OFFICIAL_SET, officialArchetypeName, officialEntry } from '../../official/index.ts';
import { CardDetail } from '../components/CardDetail.tsx';
import { useMediaQuery } from '../components/dialogUtil.ts';
import { Sheet } from '../components/Sheet.tsx';
import { UiIcon } from '../components/UiIcon.tsx';
import { CardCollection } from '../collection/CardCollection.tsx';
import { FilterChipsRow, FilterSheet, SearchBox, SortSelect, ViewSeg } from '../collection/Controls.tsx';
import { useEntries } from '../collection/entries.ts';
import { FilterIcon, ViewIcon } from '../collection/icons.tsx';
import { usePrefs } from '../collection/prefs.ts';
import { useHeightVar } from '../collection/sticky.ts';
import { EMPTY_FILTERS, autoView, filterCount, filterEntries, sectionsFor, sortEntries, type Entry, type Section } from '../collection/query.ts';
import type { TagId } from '../collection/tags.ts';
import { navigate } from '../router.ts';
import { cx } from '../util.ts';
import '../collection/collection.css';
import '../draft/draft.css';

const PREF_KEY = 'cardgame.v1.prefs.official';
type By = 'archetype' | 'rarity' | 'cost' | 'type' | 'none';
const BY_LABEL: Record<By, string> = { archetype: '色ごと', rarity: 'レアリティごと', cost: 'コストごと', type: '種類ごと', none: 'まとめない' };
const NO_GROUPS: readonly CardGroup[] = [];
const NO_MEMBERS = new Map<string, readonly string[]>();
const NO_DECKS = new Map<string, ReadonlySet<string>>();
const NO_SELECTION = new Set<string>();
const NO_GROUP_MAP = new Map<string, CardGroup>();

function sectionsOf(entries: readonly Entry[], by: By): Section[] {
  if (by !== 'archetype') return sectionsFor(entries, by, NO_GROUPS, NO_MEMBERS);
  return OFFICIAL_ARCHETYPES.map((a) => ({
    key: `arch:${a.id}`,
    label: `${a.name}（${a.description}）`,
    entries: entries.filter((e) => officialEntry(e.card.id)?.archetype === a.id),
  })).filter((s) => s.entries.length > 0);
}

export function OfficialCardsPage() {
  const wide = useMediaQuery('(min-width: 920px)');
  const [prefs, setPrefs] = usePrefs(PREF_KEY);
  const [by, setBy] = useState<By>('archetype');
  const [query, setQuery] = useState('');
  const listQuery = useDeferredValue(query);
  const [dialog, setDialog] = useState<'filters' | 'display' | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  useHeightVar('--topbar-h', '.topbar');

  const entries = useEntries(OFFICIAL_CARDS);
  const ctx = useMemo(() => ({ membership: NO_MEMBERS, deckUse: NO_DECKS }), []);
  const filters = useMemo(() => ({ ...prefs.filters, deck: 'any' as const, invalidOnly: false }), [prefs.filters]);
  const filtered = useMemo(() => filterEntries(entries, listQuery, filters, 'all', ctx), [entries, listQuery, filters, ctx]);
  const sorted = useMemo(() => sortEntries(filtered, prefs.sort, prefs.desc), [filtered, prefs.sort, prefs.desc]);
  const sections = useMemo(() => sectionsOf(sorted, by), [sorted, by]);
  const tagCounts = useMemo(() => {
    const m = new Map<TagId, number>();
    for (const e of entries) for (const t of e.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return m;
  }, [entries]);
  const view = prefs.view ?? autoView(!wide, 0);
  const fcount = filterCount(filters);
  const detail = detailId ? entries.find((e) => e.card.id === detailId) : undefined;
  const counts = useMemo(() => {
    const c = { common: 0, rare: 0, epic: 0, legend: 0 };
    for (const card of OFFICIAL_CARDS) if (card.rarity in c) c[card.rarity as keyof typeof c]++;
    return c;
  }, []);

  const bySelect = (
    <select className="csel" value={by} aria-label="まとめ方" onChange={(e) => setBy(e.target.value as By)}>
      {(Object.keys(BY_LABEL) as By[]).map((b) => (
        <option key={b} value={b}>
          {BY_LABEL[b]}
        </option>
      ))}
    </select>
  );

  return (
    <>
      <div className="page-head">
        <h1>公式カード</h1>
        <div className="btn-row">
          <button type="button" className="btn btn--ghost" onClick={() => navigate('/battle/draft')}>
            <UiIcon name="card-pick" />
            ドラフト戦（CPU）
          </button>
        </div>
      </div>
      <p className="hint official__lead">
        「{OFFICIAL_SET.name}」（版{OFFICIAL_SET.version}）：{OFFICIAL_CARDS.length}種類（コモン{counts.common}・レア{counts.rare}・エピック{counts.epic}・レジェンド{counts.legend}）。
        オンラインのドラフト戦はこのカードだけを使います。伏せた山にはコモンが{BALANCE.draft.pileCopies.common}枚ずつ、レアとエピックが
        {BALANCE.draft.pileCopies.rare}枚ずつ、レジェンドが{BALANCE.draft.pileCopies.legend}枚ずつ入ります（レジェンドは1人{BALANCE.draft.legendTakes}枚まで）。カードを押すと全文と役割が見られます。
      </p>
      <div className="collection__main">
        <div className={cx('ctools ctools--sticky', !wide && 'ctools--narrow')}>
          <SearchBox value={query} onChange={setQuery} placeholder={wide ? undefined : '名前・効果など'} />
          {wide ? (
            <>
              <SortSelect sort={prefs.sort} desc={prefs.desc} onChange={(sort, desc) => setPrefs({ sort, desc })} />
              {bySelect}
              <ViewSeg value={view} onChange={(v) => setPrefs({ view: v })} />
            </>
          ) : (
            <button type="button" className="btn ctools__btn" onClick={() => setDialog('display')} aria-label="表示（大きさ・並べ替え・まとめ方）" title="表示">
              <ViewIcon view={view} />
              <span className="ctools__lbl">表示</span>
            </button>
          )}
          <button type="button" className={cx('btn ctools__btn', fcount > 0 && 'is-on')} onClick={() => setDialog('filters')} aria-label={`絞り込み${fcount > 0 ? `（${fcount}件）` : ''}`} title="絞り込み">
            <FilterIcon />
            <span className="ctools__lbl">絞り込み</span>
            {fcount > 0 && <span className="ctools__n">{fcount}</span>}
          </button>
        </div>
        <div className="cstatus">
          <span className="ccount">
            <b>{filtered.length}</b>
            {filtered.length !== entries.length && <> / {entries.length}</>}種類
          </span>
          <FilterChipsRow filters={filters} decks={[]} onChange={(f) => setPrefs({ filters: f })}>
            {query.trim() && (
              <button type="button" className="fchip" onClick={() => setQuery('')} aria-label="検索をやめる">
                「{query.trim()}」<span aria-hidden="true">✕</span>
              </button>
            )}
          </FilterChipsRow>
        </div>
        {filtered.length === 0 ? (
          <div className="empty empty--small">
            <p>条件に合うカードはありません。</p>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setQuery('');
                setPrefs({ filters: EMPTY_FILTERS });
              }}
            >
              検索と絞り込みを解除
            </button>
          </div>
        ) : (
          <CardCollection
            sections={sections}
            headers={by !== 'none'}
            view={view}
            collapsed={collapsed}
            onToggleSection={(k) =>
              setCollapsed((c) => {
                const n = new Set(c);
                if (n.has(k)) n.delete(k);
                else n.add(k);
                return n;
              })
            }
            groupsById={NO_GROUP_MAP}
            membership={NO_MEMBERS}
            deckUse={NO_DECKS}
            selecting={false}
            selected={NO_SELECTION}
            onOpen={(e) => setDetailId(e.card.id)}
            onSelect={() => undefined}
            label="公式カードの一覧"
          />
        )}
      </div>

      {dialog === 'display' && (
        <Sheet open title="表示" onClose={() => setDialog(null)}>
          <div className="dsheet">
            <section className="fset">
              <h3>表示の大きさ</h3>
              <ViewSeg value={view} onChange={(v) => setPrefs({ view: v })} labels />
            </section>
            <label className="fset">
              <h3>並べ替え</h3>
              <SortSelect sort={prefs.sort} desc={prefs.desc} onChange={(sort, desc) => setPrefs({ sort, desc })} />
            </label>
            <label className="fset">
              <h3>まとめ方</h3>
              {bySelect}
            </label>
            <button type="button" className="btn btn--primary" onClick={() => setDialog(null)}>
              閉じる
            </button>
          </div>
        </Sheet>
      )}
      {dialog === 'filters' && (
        <FilterSheet filters={filters} onChange={(f) => setPrefs({ filters: f })} decks={[]} showDeck={false} tagCounts={tagCounts} resultCount={filtered.length} onClose={() => setDialog(null)} />
      )}
      {detail && (
        <CardDetail
          card={detail.card}
          analysis={detail.a}
          onClose={() => setDetailId(null)}
          status={
            officialEntry(detail.card.id) ? (
              <>
                {officialArchetypeName(officialEntry(detail.card.id)!.archetype)}：{officialEntry(detail.card.id)!.role}
              </>
            ) : undefined
          }
        />
      )}
    </>
  );
}
