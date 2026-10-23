/**
 * カード一覧（カード置き場。決定事項 #109）：数百枚でも探しやすく、シナジーでまとめられるように
 * 検索・並べ替え・絞り込み・3つの密度（カード／コンパクト／リスト）・グループ・仕組みのタグ・まとめて操作。
 * 一覧は見えている行だけを描く（collection/VirtualRows）。表示の設定は見る人ごとに localStorage（collection/prefs）。
 */
import { useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { buildExport, mergeImport, normalizeName, uniqueName, type CardDef, type CardGroup, type ExportBundle } from '../../engine/index.ts';
import { CardDetail } from '../components/CardDetail.tsx';
import { useConfirm } from '../components/ConfirmDialog.tsx';
import { useIsPhone, useMediaQuery } from '../components/dialogUtil.ts';
import { ExportDialog, ImportDialog } from '../components/ImportExport.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { useToast } from '../components/Toast.tsx';
import { CardCollection } from '../collection/CardCollection.tsx';
import { FilterChipsRow, FilterSheet, SearchBox, SectionSelect, SortSelect, ViewSeg } from '../collection/Controls.tsx';
import { useEntries } from '../collection/entries.ts';
import { CardMembership, GroupBar, GroupDialog, GroupManager, GroupPicker } from '../collection/GroupUI.tsx';
import { groupHex, membershipIndex } from '../collection/groups.ts';
import { FilterIcon, SelectIcon, ViewIcon } from '../collection/icons.tsx';
import { useHeightVar, useTuck } from '../collection/sticky.ts';
import { PREF_KEYS, readPrefs, usePrefs, writePrefs } from '../collection/prefs.ts';
import { EMPTY_FILTERS, autoView, deckUseIndex, filterCount, filterEntries, sectionsFor, sortEntries, type Entry, type Section } from '../collection/query.ts';
import { tagLabel, type TagId } from '../collection/tags.ts';
import { navigate } from '../router.ts';
import { NEW_DRAFT, actions, cardDrafts, getState, useStore } from '../store.ts';
import '../collection/collection.css';
import { SAMPLE_CARDS } from '../../samples.ts';
import { cx, todayStamp, uuid } from '../util.ts';
import { UiIcon } from '../components/UiIcon.tsx';

type GroupDialogState = { kind: 'create'; cardIds?: string[]; initialName?: string; initialMemo?: string; then?: (g: CardGroup) => void } | { kind: 'edit'; group: CardGroup };

export function CardListPage() {
  const { cards, decks, groups } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const phone = useIsPhone();
  const wide = useMediaQuery('(min-width: 920px)');
  const [prefs, setPrefs] = usePrefs(PREF_KEYS.cards);
  const [query, setQuery] = useState('');
  /** 一覧に使う検索語（入力を先に返し、一覧の描き直しは後回しにする。日本語入力の変換中も重くならないように） */
  const listQuery = useDeferredValue(query);
  const [dialog, setDialog] = useState<'import' | 'menu' | 'filters' | 'display' | 'manage' | null>(null);
  const [exporting, setExporting] = useState<{ bundle: ExportBundle; title: string; filename: string } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [groupDialog, setGroupDialog] = useState<GroupDialogState | null>(null);
  const [picker, setPicker] = useState<{ mode: 'add' | 'remove'; ids: string[] } | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const lastFlat = useRef<number | null>(null);
  const bulkRef = useRef<HTMLDivElement>(null);
  const hasNewDraft = useMemo(() => cardDrafts.get(NEW_DRAFT) !== null, []);

  const entries = useEntries(cards);
  const membership = useMemo(() => membershipIndex(groups), [groups]);
  const groupsById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const deckUse = useMemo(() => deckUseIndex(decks), [decks]);
  const ctx = useMemo(() => ({ membership, deckUse }), [membership, deckUse]);
  const cardIds = useMemo(() => new Set(cards.map((c) => c.id)), [cards]);

  // 消えたグループ・デッキを指していたら「すべて」に戻す
  const scope = prefs.scope === 'all' || prefs.scope === 'ungrouped' || groupsById.has(prefs.scope) ? prefs.scope : 'all';
  const filters = prefs.filters.deck === 'any' || prefs.filters.deck === 'unused' || decks.some((d) => d.id === prefs.filters.deck) ? prefs.filters : { ...prefs.filters, deck: 'any' };
  const view = prefs.view ?? autoView(phone, cards.length);
  const sectionBy = prefs.sectionBy === 'group' && groups.length === 0 ? 'none' : prefs.sectionBy;
  const headers = sectionBy !== 'none';
  const collapsed = useMemo(() => new Set(prefs.collapsed), [prefs.collapsed]);

  const filtered = useMemo(() => filterEntries(entries, listQuery, filters, scope, ctx), [entries, listQuery, filters, scope, ctx]);
  const sorted = useMemo(() => sortEntries(filtered, prefs.sort, prefs.desc), [filtered, prefs.sort, prefs.desc]);
  const sections = useMemo(() => sectionsFor(sorted, sectionBy, groups, membership), [sorted, sectionBy, groups, membership]);
  /** 選択モードの範囲選択に使う並び（たたんだ節は含めない。CardCollection の通し番号と同じ） */
  const flatIds = useMemo(() => sections.flatMap((s) => (headers && collapsed.has(s.key) ? [] : s.entries.map((e) => e.card.id))), [sections, headers, collapsed]);
  const shownIds = useMemo(() => new Set(flatIds), [flatIds]);
  /** 選んでいるのに今の検索・絞り込み・たたんだ節で見えていないカード */
  const hiddenSelected = useMemo(() => [...selected].filter((id) => !shownIds.has(id)).length, [selected, shownIds]);

  const groupCounts = useMemo(() => new Map(groups.map((g) => [g.id, g.cardIds.filter((id) => cardIds.has(id)).length])), [groups, cardIds]);
  const ungrouped = useMemo(() => cards.filter((c) => (membership.get(c.id)?.length ?? 0) === 0).length, [cards, membership]);
  const tagCounts = useMemo(() => {
    const m = new Map<TagId, number>();
    for (const e of filterEntries(entries, '', EMPTY_FILTERS, scope, ctx)) for (const t of e.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return m;
  }, [entries, scope, ctx]);
  const invalidCount = useMemo(() => entries.filter((e) => !e.a.valid).length, [entries]);
  const scopeGroup = groupsById.get(scope);
  const detail = detailId ? entries.find((e) => e.card.id === detailId) : undefined;

  // 選んでいたカードが消えたら選択から外す
  useEffect(() => {
    setSelected((s) => {
      const next = new Set([...s].filter((id) => cardIds.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [cardIds]);
  // Escape で選択モードを抜ける（ダイアログが開いていないとき）
  useEffect(() => {
    if (!selecting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.modal, .sheet')) exitSelect();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selecting]);

  const edit = (card: CardDef) => navigate(`/cards/${encodeURIComponent(card.id)}`);
  const setFilters = (f: typeof filters) => setPrefs({ filters: f });
  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
    lastFlat.current = null;
  };

  // ---------------------------------------------------------------- カードの操作
  const addSamples = () => {
    const { cards: cur, decks: curDecks, groups: curGroups } = getState();
    const m = mergeImport(cur, curDecks, { cards: SAMPLE_CARDS, decks: [] }, uuid, curGroups);
    actions.replaceAll(m.cards, m.decks, m.groups);
    if (m.addedCards > 0) toast({ text: `サンプルを${m.addedCards}枚追加しました`, kind: 'ok' });
    else toast({ text: 'サンプルはすでに追加されています', kind: 'info' });
  };

  /** 複製（グループも元と同じものに入れる） */
  const duplicateCards = (list: readonly CardDef[]) => {
    const taken = new Set(getState().cards.map((c) => normalizeName(c.name)));
    const pairs = new Map<string, string>();
    const copies = list.map((card) => {
      const name = uniqueName(card.name, taken);
      taken.add(name);
      const copy = { ...card, id: uuid(), name };
      pairs.set(card.id, copy.id);
      return copy;
    });
    actions.addCards(copies, pairs);
    return copies;
  };

  const duplicate = (card: CardDef) => {
    const [copy] = duplicateCards([card]);
    setDetailId(null);
    toast({ text: `「${copy!.name}」として複製しました`, kind: 'ok', action: { label: '編集', onClick: () => navigate(`/cards/${encodeURIComponent(copy!.id)}`) } });
  };

  const removeCards = async (list: readonly CardDef[], hidden = 0) => {
    if (list.length === 0) return;
    const ids = new Set(list.map((c) => c.id));
    const usedIn = decks.filter((d) => d.entries.some((e) => ids.has(e.cardId)));
    const one = list.length === 1 ? list[0]! : null;
    const base =
      usedIn.length > 0
        ? `${one ? 'このカード' : '選んだカード'}は ${usedIn.map((d) => `「${d.name || '（名前なし）'}」`).join('')} で使われています。削除するとデッキが不完全になります。`
        : '削除したあと、しばらくの間は「元に戻す」で戻せます。';
    const ok = await confirm({
      title: one ? `「${one.name}」を削除しますか？` : `${list.length}枚のカードを削除しますか？`,
      message:
        hidden > 0 ? (
          <>
            <p>
              <b>うち{hidden}枚は、今の検索・絞り込み（またはたたんだ節）で表示されていないカードです。</b>
            </p>
            <p>{base}</p>
          </>
        ) : (
          base
        ),
      okLabel: '削除',
      danger: true,
    });
    if (!ok) return;
    const removed = actions.deleteCards([...ids]);
    toast({
      text: one ? `「${one.name}」を削除しました` : `${removed.length}枚を削除しました`,
      kind: 'info',
      action: { label: '元に戻す', onClick: () => actions.restoreCards(removed) },
    });
  };

  // ---------------------------------------------------------------- 選択
  const selectedCards = () => cards.filter((c) => selected.has(c.id));
  const onSelect = (id: string, flat: number, shift: boolean) => {
    // 範囲の起点は押す前の値で決める（setSelected の中は後で動くので、ref を直接読まない）
    const from = lastFlat.current;
    setSelected((s) => {
      const next = new Set(s);
      if (shift && from !== null) {
        const [a, b] = [Math.min(from, flat), Math.max(from, flat)];
        for (const x of flatIds.slice(a, b + 1)) next.add(x);
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    lastFlat.current = flat;
  };
  const onLongPress = (id: string, flat: number) => {
    setSelecting(true);
    setSelected((s) => new Set(s).add(id));
    lastFlat.current = flat;
  };

  // ---------------------------------------------------------------- グループ
  const dropOnGroup = (groupId: string, ids: string[]) => {
    const g = groupsById.get(groupId);
    if (!g) return;
    const fresh = ids.filter((id) => !g.cardIds.includes(id));
    const n = actions.addToGroup(groupId, ids);
    toast({
      text: n > 0 ? `「${g.name}」に${n}枚入れました` : `「${g.name}」にもう入っています`,
      kind: n > 0 ? 'ok' : 'info',
      action: n > 0 ? { label: '元に戻す', onClick: () => actions.removeFromGroup(groupId, fresh) } : undefined,
    });
  };
  const deleteGroup = (g: CardGroup) => {
    const r = actions.deleteGroup(g.id);
    if (!r) return;
    toast({ text: `グループ「${g.name}」を削除しました（カードは残っています）`, kind: 'info', action: { label: '元に戻す', onClick: () => actions.restoreGroup(r.group, r.index) } });
  };
  const sectionTools = (s: Section) => {
    if (s.group) {
      const g = s.group;
      return (
        <button type="button" className="btn btn--ghost btn--small" onClick={() => setGroupDialog({ kind: 'edit', group: g })}>
          直す
        </button>
      );
    }
    if (s.key.endsWith(':none') || s.key === 'all') return null;
    return (
      <button
        type="button"
        className="btn btn--ghost btn--small"
        onClick={() => setGroupDialog({ kind: 'create', cardIds: s.entries.map((e) => e.card.id), initialName: s.label.replace(/^種族：/, ''), then: (g) => toast({ text: `グループ「${g.name}」を作りました（${g.cardIds.length}枚）`, kind: 'ok' }) })}
        title="この節のカードでグループを作る"
      >
        ＋ グループにする
      </button>
    );
  };
  const makeGroupFromTag = (t: TagId) =>
    setGroupDialog({ kind: 'create', cardIds: sorted.map((e) => e.card.id), initialName: tagLabel(t).replace(/^種族：/, ''), then: (g) => toast({ text: `グループ「${g.name}」を作りました（${g.cardIds.length}枚）`, kind: 'ok' }) });
  const deckFromGroup = (g: CardGroup) => {
    writePrefs(PREF_KEYS.deckPool, { ...readPrefs(PREF_KEYS.deckPool), scope: g.id });
    navigate('/decks/new');
  };

  const fcount = filterCount(filters);
  const searching = query.trim() !== '';
  const clearAll = () => {
    setQuery('');
    setFilters(EMPTY_FILTERS);
  };

  const narrowed = filtered.length !== cards.length;
  const countLabel = (
    <span className="ccount" aria-live="polite">
      {narrowed ? (
        <>
          <b>{filtered.length}</b> / {cards.length}枚
        </>
      ) : (
        <>
          <b>{cards.length}</b>枚
        </>
      )}
    </span>
  );
  // 操作の列は上に固定（深くスクロールしても検索・絞り込みに手が届く）。スマホは下へスクロールする間だけ引っ込める
  useHeightVar('--topbar-h', '.topbar');
  useHeightVar('--bulkbar-h', bulkRef, selecting);
  const tucked = useTuck(!wide && cards.length > 0, () => !!document.activeElement?.closest('.ctools'));
  const toolbar = (
    <div className={cx('ctools ctools--sticky', !wide && 'ctools--narrow', tucked && 'is-tucked')}>
      <SearchBox value={query} onChange={setQuery} placeholder={wide ? undefined : '名前・効果など'} />
      {wide ? (
        <>
          <SortSelect sort={prefs.sort} desc={prefs.desc} onChange={(sort, desc) => setPrefs({ sort, desc })} />
          <SectionSelect value={sectionBy} hasGroups={groups.length > 0} onChange={(v) => setPrefs({ sectionBy: v })} />
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
      <button type="button" className={cx('btn ctools__btn', selecting && 'is-on')} aria-pressed={selecting} aria-label="選択（まとめて操作）" title={phone ? '選択（カードの長押しでも選べます）' : '選択'} onClick={() => (selecting ? exitSelect() : setSelecting(true))}>
        <SelectIcon />
        <span className="ctools__lbl">選択</span>
      </button>
    </div>
  );

  const groupBar = (layout: 'side' | 'bar') => (
    <GroupBar
      layout={layout}
      groups={groups}
      counts={groupCounts}
      total={cards.length}
      ungrouped={ungrouped}
      scope={scope}
      onScope={(s) => setPrefs({ scope: s })}
      onCreate={() => setGroupDialog({ kind: 'create', cardIds: selecting && selected.size > 0 ? [...selected] : undefined })}
      onManage={() => setDialog('manage')}
      onDropCards={wide ? dropOnGroup : undefined}
    />
  );

  return (
    <>
      <div className="page-head">
        <h1>カード</h1>
        <div className="btn-row">
          <button type="button" className="btn btn--primary" onClick={() => navigate('/cards/new')}>
            <UiIcon name="quill-ink" />
            新しいカード
          </button>
          {phone ? (
            <button type="button" className="btn" onClick={() => setDialog('menu')} aria-label="サンプル・書き出し・取り込み">
              ⋯
            </button>
          ) : (
            <>
              <button type="button" className="btn" onClick={addSamples}>
                サンプルを追加
              </button>
              <button type="button" className="btn" onClick={() => setExporting({ bundle: buildExport(cards, decks, groups), title: 'カードとデッキを書き出す', filename: `cardgame-${todayStamp()}.json` })} disabled={cards.length === 0}>
                書き出し
              </button>
              <button type="button" className="btn" onClick={() => setDialog('import')}>
                取り込み
              </button>
            </>
          )}
        </div>
      </div>

      {hasNewDraft && (
        <div className="notice">
          作成途中のカードがあります。
          <button type="button" className="btn btn--small" onClick={() => navigate('/cards/new')}>
            続きを編集
          </button>
        </div>
      )}
      {cards.length === 0 ? (
        <div className="empty">
          <p>まだカードがありません。</p>
          <p>「＋ 新しいカード」で作るか、「サンプルを追加」で作成例と見本の{SAMPLE_CARDS.length}枚を入れてみてください。</p>
          {phone && (
            <button type="button" className="btn" onClick={addSamples}>
              サンプルを追加
            </button>
          )}
        </div>
      ) : (
        <div className={cx('collection', wide && 'collection--wide')}>
          {wide && <aside className="collection__side">{groupBar('side')}</aside>}
          <div className="collection__main">
            {toolbar}
            {!wide && groupBar('bar')}
            {scopeGroup && (
              <div className="ghead" style={{ '--gc': groupHex(scopeGroup.color) } as CSSProperties}>
                <div className="ghead__top">
                  <span className="gdot" aria-hidden="true" />
                  <b className="ghead__name">{scopeGroup.name}</b>
                  <span className="ghead__n">{groupCounts.get(scopeGroup.id) ?? 0}枚</span>
                </div>
                {scopeGroup.memo ? <p className="ghead__memo">{scopeGroup.memo}</p> : <p className="ghead__memo is-empty">メモはまだありません（「直す」でシナジーのメモを書けます）</p>}
                <div className="ghead__btns">
                  <button type="button" className="btn btn--small" onClick={() => setGroupDialog({ kind: 'edit', group: scopeGroup })}>
                    直す
                  </button>
                  <button type="button" className="btn btn--small" onClick={() => deckFromGroup(scopeGroup)} disabled={(groupCounts.get(scopeGroup.id) ?? 0) === 0}>
                    このグループでデッキを作る
                  </button>
                </div>
              </div>
            )}
            <div className="cstatus">
              {countLabel}
              {invalidCount > 0 && !filters.invalidOnly && (
                <button type="button" className="cwarn" onClick={() => setFilters({ ...filters, invalidOnly: true })} title="編集して直すまでデッキでは使えません" aria-label={`要修正のカードが${invalidCount}枚あります（直すまでデッキで使えません）。要修正だけを見る`}>
                  ⚠ 要修正 {invalidCount}枚
                </button>
              )}
              <FilterChipsRow filters={filters} decks={decks} onChange={setFilters}>
                {searching && (
                  <button type="button" className="fchip" onClick={() => setQuery('')} aria-label="検索をやめる">
                    「{query.trim()}」<span aria-hidden="true">✕</span>
                  </button>
                )}
              </FilterChipsRow>
              {filters.tags.length === 1 && filtered.length > 0 && (
                <button type="button" className="btn btn--small" onClick={() => makeGroupFromTag(filters.tags[0]!)}>
                  ＋ このタグからグループを作る
                </button>
              )}
              {headers && sections.length > 1 && (
                <button type="button" className="btn btn--ghost btn--small cstatus__fold" onClick={() => setPrefs({ collapsed: collapsed.size > 0 ? [] : sections.map((s) => s.key) })}>
                  {collapsed.size > 0 ? 'すべて開く' : 'すべてたたむ'}
                </button>
              )}
            </div>
            {selecting && !phone && <p className="hint ctip">選択中：カードを押すと選ぶ／外す。Shift を押しながら押すと範囲で選べます。{wide && groups.length > 0 && '選んだカードは左のグループへドラッグしても入れられます。'}</p>}

            {filtered.length === 0 ? (
              <div className="empty empty--small">
                {scopeGroup && (groupCounts.get(scopeGroup.id) ?? 0) === 0 ? (
                  <>
                    <p>「{scopeGroup.name}」にはまだカードがありません。</p>
                    <p>「すべて」に戻ってカードを選び（{phone ? '長押し' : '「選択」'}）、「グループに追加」で入れてください。カードの詳細からも入れられます。</p>
                    <button type="button" className="btn" onClick={() => setPrefs({ scope: 'all' })}>
                      すべてのカードを見る
                    </button>
                  </>
                ) : (
                  <>
                    <p>条件に合うカードはありません。</p>
                    {(searching || fcount > 0) && (
                      <button type="button" className="btn" onClick={clearAll}>
                        検索と絞り込みを解除
                      </button>
                    )}
                  </>
                )}
              </div>
            ) : (
              <CardCollection
                sections={sections}
                headers={headers}
                view={view}
                collapsed={collapsed}
                onToggleSection={(k) => setPrefs((p) => ({ collapsed: p.collapsed.includes(k) ? p.collapsed.filter((x) => x !== k) : [...p.collapsed, k] }))}
                sectionTools={sectionTools}
                groupsById={groupsById}
                membership={membership}
                deckUse={deckUse}
                selecting={selecting}
                selected={selected}
                onOpen={(e: Entry) => setDetailId(e.card.id)}
                onEdit={(e: Entry) => edit(e.card)}
                onSelect={onSelect}
                onLongPress={onLongPress}
                draggable={wide && groups.length > 0}
                label="カードの一覧"
              />
            )}
          </div>
        </div>
      )}

      {selecting && (
        <div className="bulkbar" role="toolbar" aria-label="選んだカードの操作" ref={bulkRef}>
          <div className="bulkbar__top">
            <b aria-live="polite">
              {selected.size}枚を選択中
              {hiddenSelected > 0 && <small className="bulkbar__hidden">（うち{hiddenSelected}枚は表示外）</small>}
            </b>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setSelected(new Set(flatIds))} disabled={flatIds.length === 0} aria-label={`表示中の${flatIds.length}枚をすべて選ぶ`}>
              すべて選ぶ
            </button>
            {selected.size > 0 && (
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setSelected(new Set())} aria-label="選択を解除">
                解除
              </button>
            )}
            <button type="button" className="btn btn--small bulkbar__done" onClick={exitSelect}>
              完了
            </button>
          </div>
          <div className="bulkbar__acts">
            <button type="button" className="btn btn--small btn--primary" disabled={selected.size === 0} onClick={() => setPicker({ mode: 'add', ids: [...selected] })}>
              グループに追加
            </button>
            <button
              type="button"
              className="btn btn--small"
              disabled={selected.size === 0}
              onClick={() => {
                if (scopeGroup) {
                  const before = scopeGroup.cardIds.filter((id) => selected.has(id));
                  const n = actions.removeFromGroup(scopeGroup.id, [...selected]);
                  toast({ text: `「${scopeGroup.name}」から${n}枚外しました`, kind: 'info', action: { label: '元に戻す', onClick: () => actions.addToGroup(scopeGroup.id, before) } });
                  setSelected(new Set());
                } else setPicker({ mode: 'remove', ids: [...selected] });
              }}
            >
              {scopeGroup ? `「${scopeGroup.name}」から外す` : 'グループから外す'}
            </button>
            <button
              type="button"
              className="btn btn--small"
              disabled={selected.size === 0}
              onClick={() => {
                const copies = duplicateCards(selectedCards());
                toast({ text: `${copies.length}枚を複製しました`, kind: 'ok', action: { label: '元に戻す', onClick: () => actions.deleteCards(copies.map((c) => c.id)) } });
              }}
            >
              複製
            </button>
            <button
              type="button"
              className="btn btn--small"
              disabled={selected.size === 0}
              onClick={() => {
                const list = selectedCards();
                const ids = new Set(list.map((c) => c.id));
                setExporting({
                  bundle: buildExport(
                    list,
                    [],
                    groups.filter((g) => g.cardIds.some((id) => ids.has(id))),
                  ),
                  title: `選んだ${list.length}枚を書き出す`,
                  filename: `cardgame-cards${list.length}-${todayStamp()}.json`,
                });
              }}
            >
              書き出す
            </button>
            <button type="button" className="btn btn--small btn--danger" disabled={selected.size === 0} onClick={() => void removeCards(selectedCards(), hiddenSelected)}>
              削除
            </button>
          </div>
        </div>
      )}

      {dialog === 'menu' && (
        <Sheet open title="カードの管理" onClose={() => setDialog(null)}>
          <div className="menu-list">
            <button type="button" className="btn" onClick={() => (setDialog(null), addSamples())}>
              サンプルを追加
            </button>
            <button type="button" className="btn" disabled={cards.length === 0} onClick={() => (setDialog(null), setExporting({ bundle: buildExport(cards, decks, groups), title: 'カードとデッキを書き出す', filename: `cardgame-${todayStamp()}.json` }))}>
              書き出し（グループも入ります）
            </button>
            <button type="button" className="btn" onClick={() => setDialog('import')}>
              取り込み
            </button>
            <button type="button" className="btn" onClick={() => setDialog('manage')}>
              グループの管理
            </button>
          </div>
        </Sheet>
      )}
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
              <SectionSelect value={sectionBy} hasGroups={groups.length > 0} onChange={(v) => setPrefs({ sectionBy: v })} />
            </label>
            <p className="hint">「グループごと」「仕組みで分ける」では、1枚のカードがいくつかの節に出ることがあります。節の見出しを押すとたためます。</p>
            <button type="button" className="btn btn--primary" onClick={() => setDialog(null)}>
              閉じる
            </button>
          </div>
        </Sheet>
      )}
      {dialog === 'filters' && (
        <FilterSheet filters={filters} onChange={setFilters} decks={decks} tagCounts={tagCounts} resultCount={filtered.length} onClose={() => setDialog(null)} />
      )}
      {dialog === 'manage' && (
        <GroupManager
          counts={groupCounts}
          onClose={() => setDialog(null)}
          onEdit={(g) => setGroupDialog({ kind: 'edit', group: g })}
          onDelete={(g) => deleteGroup(g)}
          onCreate={() => setGroupDialog({ kind: 'create' })}
        />
      )}
      {exporting && <ExportDialog title={exporting.title} bundle={exporting.bundle} filename={exporting.filename} onClose={() => setExporting(null)} />}
      {dialog === 'import' && <ImportDialog onClose={() => setDialog(null)} />}
      {picker && (
        <GroupPicker
          mode={picker.mode}
          cardIds={picker.ids}
          onClose={() => setPicker(null)}
          onCreate={() => {
            const ids = picker.ids;
            setPicker(null);
            setGroupDialog({ kind: 'create', cardIds: ids, then: (g) => toast({ text: `グループ「${g.name}」を作って${g.cardIds.length}枚入れました`, kind: 'ok' }) });
          }}
        />
      )}
      {detail && (
        <CardDetail
          card={detail.card}
          analysis={detail.a}
          onClose={() => setDetailId(null)}
          status={
            <>
              <span>
                {(() => {
                  const used = decks.filter((d) => d.entries.some((e) => e.cardId === detail.card.id));
                  return used.length > 0 ? `使っているデッキ：${used.map((d) => `「${d.name || '（名前なし）'}」`).join('')}` : 'まだどのデッキにも入っていません';
                })()}
              </span>
              <CardMembership
                cardId={detail.card.id}
                groups={groups}
                tags={detail.tags}
                onNewGroup={() => setGroupDialog({ kind: 'create', cardIds: [detail.card.id] })}
                onTag={(t) => {
                  setDetailId(null);
                  setFilters({ ...EMPTY_FILTERS, tags: [t] });
                }}
              />
            </>
          }
          actions={
            <>
              <button type="button" className="btn btn--primary" onClick={() => edit(detail.card)}>
                編集
              </button>
              <button type="button" className="btn" onClick={() => duplicate(detail.card)}>
                複製
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => {
                  // 確認ダイアログとフォーカスの閉じ込めが重ならないよう、先に詳細を閉じる
                  setDetailId(null);
                  void removeCards([detail.card]);
                }}
              >
                削除
              </button>
            </>
          }
        />
      )}
      {groupDialog && (
        <GroupDialog
          group={groupDialog.kind === 'edit' ? groupDialog.group : undefined}
          cardIds={groupDialog.kind === 'create' ? groupDialog.cardIds : undefined}
          initialName={groupDialog.kind === 'create' ? groupDialog.initialName : undefined}
          initialMemo={groupDialog.kind === 'create' ? groupDialog.initialMemo : undefined}
          onClose={() => setGroupDialog(null)}
          onDone={(g) => {
            if (groupDialog.kind === 'create') {
              groupDialog.then?.(g);
              if (selecting && groupDialog.cardIds && groupDialog.cardIds.length > 1) setSelected(new Set());
            }
          }}
          onDelete={
            groupDialog.kind === 'edit'
              ? () => {
                  const g = groupDialog.group;
                  setGroupDialog(null);
                  if (scope === g.id) setPrefs({ scope: 'all' });
                  deleteGroup(g);
                }
              : undefined
          }
        />
      )}
    </>
  );
}
