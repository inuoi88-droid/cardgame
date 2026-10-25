/** デッキ構築 */
import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BALANCE,
  CARD_TYPE_LABEL,
  RARITY_LABEL,
  TRIBE_LABEL,
  analyzeDeck,
  normalizeName,
  type CardAnalysis,
  type CardDef,
  type Deck,
  type DeckAnalysis,
  type RarityRow,
} from '../../engine/index.ts';
import { FilterChipsRow, FilterSheet, SearchBox, SortSelect } from '../collection/Controls.tsx';
import { useEntries } from '../collection/entries.ts';
import { GroupDots } from '../collection/CardCollection.tsx';
import { GroupBar } from '../collection/GroupUI.tsx';
import { membershipIndex } from '../collection/groups.ts';
import { FilterIcon } from '../collection/icons.tsx';
import { PREF_KEYS, usePrefs } from '../collection/prefs.ts';
import { EMPTY_FILTERS, deckUseIndex, filterCount, filterEntries, sortEntries, type Entry } from '../collection/query.ts';
import type { TagId } from '../collection/tags.ts';
import { VirtualRows } from '../collection/VirtualRows.tsx';
import '../collection/collection.css';
import { CardDetail } from '../components/CardDetail.tsx';
import { CardArtOf } from '../components/CardArt.tsx';
import { CostGem, frameClasses, RarityGem, StatMini } from '../components/cardParts.tsx';
import { CostCurve } from '../components/CostCurve.tsx';
import { Stepper, Violations } from '../components/controls.tsx';
import { useToast } from '../components/Toast.tsx';
import { navigate } from '../router.ts';
import { NEW_DRAFT, actions, deckDrafts, useStore } from '../store.ts';
import { cx, uuid } from '../util.ts';
import { shareDeckNow, unshareDeckNow } from '../social/sharing.ts';
import { sharedDeckIds } from '../social/socialLogic.ts';
import { useSocial } from '../social/socialStore.ts';
import { UiIcon } from '../components/UiIcon.tsx';
import { FeedbackButton, FeedbackSheet } from '../feedback/FeedbackSheet.tsx';

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const emptyDeck = (id: string): Deck => ({ v: 1, id, name: '', entries: [] });

export function DeckBuilderPage({ id }: { id: string | null }) {
  const { decks } = useStore();
  const saved = id ? (decks.find((d) => d.id === id) ?? null) : null;
  if (id && !saved) {
    return (
      <div className="panel">
        <p>デッキが見つかりませんでした（削除された可能性があります）。</p>
        <button type="button" className="btn" onClick={() => navigate('/decks')}>
          デッキ一覧へ
        </button>
      </div>
    );
  }
  return <Builder key={id ?? NEW_DRAFT} saved={saved} />;
}

/** 1枚足せないなら、その理由（デッキの枚数・同名・レアリティの上限、要修正） */
function blockReason(card: CardDef, ca: CardAnalysis | undefined, deck: Deck, da: DeckAnalysis, cardsById: ReadonlyMap<string, CardDef>): string | null {
  if (ca && !ca.valid) return '要修正のカードはデッキに入れられません（先にカードを直してください）';
  if (da.total >= da.size) return `デッキは${da.size}枚ちょうどです（もう${da.total}枚入っています）`;
  const perName = BALANCE.rarity[card.rarity].perNameLimit;
  const key = normalizeName(card.name);
  const nameCount = deck.entries.reduce((n, e) => (cardsById.get(e.cardId) && normalizeName(cardsById.get(e.cardId)!.name) === key ? n + e.count : n), 0);
  if (perName !== null && nameCount >= perName) return `同じ名前のカードは${RARITY_LABEL[card.rarity]}なら${perName}枚までです（いま${nameCount}枚）`;
  const row = da.rarityRows.find((r) => r.rarity === card.rarity);
  if (row && row.limit !== null && row.count >= row.limit) return `${RARITY_LABEL[card.rarity]}はデッキ全体で${row.limit}枚までです（いま${row.count}枚）`;
  return null;
}

function Builder({ saved }: { saved: Deck | null }) {
  const { cards, decks, groups } = useStore();
  const toast = useToast();
  const draftKey = saved?.id ?? NEW_DRAFT;
  const [restored] = useState(() => {
    const d = deckDrafts.get(draftKey);
    return d && !sameJson(d, saved) ? d : null;
  });
  const [deck, setDeck] = useState<Deck>(() => restored ?? saved ?? emptyDeck(uuid()));
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const isShared = sharedDeckIds(useSocial().snap).has(deck.id);
  /** 保存したときにフレンドに公開するか（公開中なら最初から入っている） */
  const [shareChoice, setShareChoice] = useState<boolean | null>(null);
  const share = shareChoice ?? isShared;
  const [draftNotice, setDraftNotice] = useState(restored !== null);
  const [tab, setTab] = useState<'pool' | 'deck'>('pool');
  const [prefs, setPrefs] = usePrefs(PREF_KEYS.deckPool);
  const [filterOpen, setFilterOpen] = useState(false);
  const [query, setQuery] = useState('');
  /** 候補に使う検索語（入力を先に返し、候補の描き直しは後回し） */
  const listQuery = useDeferredValue(query);
  const [previewId, setPreviewId] = useState<string | null>(null);

  useEffect(() => {
    const pristine = saved ? sameJson(deck, saved) : sameJson(deck, emptyDeck(deck.id));
    if (pristine) deckDrafts.clear(draftKey);
    else deckDrafts.set(draftKey, deck);
  }, [deck, saved, draftKey]);

  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const entries = useEntries(cards);
  const analyses = useMemo(() => new Map(entries.map((e) => [e.card.id, e.a])), [entries]);
  const membership = useMemo(() => membershipIndex(groups), [groups]);
  const groupsById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const ctx = useMemo(() => ({ membership, deckUse: deckUseIndex(decks) }), [membership, decks]);
  const scope = prefs.scope === 'all' || prefs.scope === 'ungrouped' || groupsById.has(prefs.scope) ? prefs.scope : 'all';
  // デッキ構築ではデッキの絞り込みは使わない
  const filters = prefs.filters.deck === 'any' ? prefs.filters : { ...prefs.filters, deck: 'any' };
  const scopeGroup = groupsById.get(scope);
  const a = useMemo(() => analyzeDeck(deck, cardsById), [deck, cardsById]);
  const dirty = !saved || !sameJson(deck, saved);

  const countOf = (cardId: string) => deck.entries.find((e) => e.cardId === cardId)?.count ?? 0;
  const setCount = (cardId: string, count: number) =>
    setDeck((d) => {
      const exists = d.entries.some((e) => e.cardId === cardId);
      const entries =
        count <= 0
          ? d.entries.filter((e) => e.cardId !== cardId)
          : exists
            ? d.entries.map((e) => (e.cardId === cardId ? { ...e, count } : e))
            : [...d.entries, { cardId, count }];
      return { ...d, entries };
    });

  // 同名の枚数（呪いカードも元のレアリティの制限に従う。決定事項 #64）
  const nameCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of deck.entries) {
      const c = cardsById.get(e.cardId);
      if (!c) continue;
      const k = normalizeName(c.name);
      m.set(k, (m.get(k) ?? 0) + e.count);
    }
    return m;
  }, [deck, cardsById, analyses]);

  const pool = useMemo(() => sortEntries(filterEntries(entries, listQuery, filters, scope, ctx), prefs.sort, prefs.desc), [entries, listQuery, filters, scope, ctx, prefs.sort, prefs.desc]);
  const poolRows = useMemo(() => pool.map((e) => ({ key: e.card.id, kind: 'row', entry: e })), [pool]);
  const groupCounts = useMemo(() => new Map(groups.map((g) => [g.id, g.cardIds.filter((id) => cardsById.has(id)).length])), [groups, cardsById]);
  const ungrouped = useMemo(() => cards.filter((c) => (membership.get(c.id)?.length ?? 0) === 0).length, [cards, membership]);
  const tagCounts = useMemo(() => {
    const m = new Map<TagId, number>();
    for (const e of filterEntries(entries, '', EMPTY_FILTERS, scope, ctx)) for (const t of e.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return m;
  }, [entries, scope, ctx]);

  const deckRows = deck.entries
    .map((e) => ({ entry: e, card: cardsById.get(e.cardId) }))
    .sort((x, y) => (x.card?.cost ?? 99) - (y.card?.cost ?? 99) || (x.card?.name ?? '').localeCompare(y.card?.name ?? '', 'ja'));

  const addBlock = (card: CardDef): string | null => blockReason(card, analyses.get(card.id), deck, a, cardsById);
  const preview = previewId ? (cardsById.get(previewId) ?? null) : null;

  /** 表示中の候補を1枚ずつ入れる（まだ入っていないカードだけ。上限・要修正で入らないものは飛ばす） */
  const addEachOnce = (list: readonly Entry[]) => {
    const before = deck;
    let d = deck;
    let added = 0;
    /** 上限（レアリティ・同名）・要修正で入れられなかった枚数 */
    let blocked = 0;
    /** デッキの枚数がいっぱいになって入れなかった残り（並び順で後ろのカード） */
    let left = 0;
    for (const e of list) {
      if (d.entries.some((x) => x.cardId === e.card.id)) continue;
      const da = analyzeDeck(d, cardsById);
      if (da.total >= da.size) {
        left++;
        continue;
      }
      if (blockReason(e.card, e.a, d, da, cardsById)) {
        blocked++;
        continue;
      }
      d = { ...d, entries: [...d.entries, { cardId: e.card.id, count: 1 }] };
      added++;
    }
    setDeck(d);
    const notes = [
      left > 0 ? `${a.size}枚になったので、並び順で後ろの${left}枚は入れていません` : '',
      blocked > 0 ? `${blocked}枚は上限（レアリティ・同じ名前）か要修正で入れられません` : '',
    ].filter(Boolean);
    toast({
      text: added > 0 ? `${added}枚を1枚ずつ入れました${notes.length > 0 ? `（${notes.join('。')}）` : ''}` : notes.length > 0 ? `入れられるカードがありませんでした（${notes.join('。')}）` : 'どれももう入っています',
      kind: added > 0 ? 'ok' : 'info',
      action: added > 0 ? { label: '元に戻す', onClick: () => setDeck(before) } : undefined,
    });
  };

  const save = () => {
    if (!a.valid) return;
    const name = deck.name.trim();
    const next = { ...deck, name };
    actions.saveDeck(next);
    deckDrafts.clear(draftKey);
    // フレンドへの公開（決定事項 #123）：入れたなら公開、外したならやめる。公開中のまま直したら SocialRuntime が送り直す
    if (share && !isShared) void shareDeckNow(next, cards).then((e) => e && toast({ text: `フレンドに公開できませんでした：${e}`, kind: 'ng' }));
    if (!share && isShared) void unshareDeckNow(next.id);
    toast({ text: `デッキ「${name || '（名前なし）'}」を保存しました${share && !isShared ? '（フレンドに公開）' : ''}`, kind: 'ok' });
    navigate('/decks');
  };

  return (
    <>
      <div className="page-head">
        <h1>{saved ? 'デッキを編集' : '新しいデッキ'}</h1>
        {/* 報告・要望（決定事項 #129）：選べるカードはデッキのカード、添えるのはデッキの中身 */}
        <FeedbackButton className="btn--small btn--ghost" onClick={() => setFeedbackOpen(true)} />
      </div>
      {feedbackOpen && (
        <FeedbackSheet
          source="deck"
          onClose={() => setFeedbackOpen(false)}
          cards={deck.entries.flatMap((e) => cards.filter((c) => c.id === e.cardId))}
          context={() => ({
            v: 1,
            deck: { name: deck.name, cards: deck.entries.map((e) => ({ id: e.cardId, name: cards.find((c) => c.id === e.cardId)?.name ?? '?', count: e.count })) },
          })}
          contextLabel="このデッキの中身（カードと枚数）を添える"
        />
      )}
      {draftNotice && (
        <div className="notice">
          保存していない編集内容（下書き）を復元しました。
          <button
            type="button"
            className="btn btn--small"
            onClick={() => {
              deckDrafts.clear(draftKey);
              setDeck(saved ?? emptyDeck(uuid()));
              setDraftNotice(false);
            }}
          >
            下書きを捨てる
          </button>
        </div>
      )}

      <section className="panel deck-summary">
        <label className="field deck-summary__name">
          <span>デッキ名</span>
          <input type="text" className="u-name-input" value={deck.name} placeholder="例：毒デッキ" onChange={(e) => setDeck({ ...deck, name: e.target.value })} />
        </label>
        <label className="share-toggle">
          <input type="checkbox" checked={share} onChange={(e) => setShareChoice(e.target.checked)} />
          <UiIcon name="three-friends" />
          <span>
            フレンドに公開
            <small>{isShared ? (share ? '公開中。保存すると公開中の中身も新しくなります' : '保存すると公開をやめます') : '保存すると、フレンドが見てコピーできます'}</small>
          </span>
        </label>
        {/* PC は「枚数とレアリティ」「コスト分布」「要修正」の3列、スマホは縦に積む */}
        <div className="deck-summary__grid">
          <div className="deck-summary__counts">
            <div className={cx('deck-summary__total', a.total !== a.size && 'is-ng')}>
              <b>{a.total}</b> / {a.size}枚
            </div>
            <ul className="rarity-rows">
              {a.rarityRows.map((r) => (
                <li key={r.rarity} className={cx(r.limit !== null && r.count > r.limit && 'is-ng')}>
                  <RarityGem rarity={r.rarity} />
                  <span>
                    {RARITY_LABEL[r.rarity]} <b>{r.count}</b>
                    {r.limit !== null ? ` / ${r.limit}` : '（制限なし）'}
                  </span>
                </li>
              ))}
              <li>
                <i className="curse-mark" aria-hidden="true" />
                <span>
                  うち呪い <b>{a.curseCount}</b>
                </span>
              </li>
            </ul>
          </div>
          <div className="deck-summary__curve">{a.total > 0 ? <CostCurve deck={deck} cards={cards} /> : <p className="hint">カードを入れると、ここにコスト分布が出ます。</p>}</div>
          <div className="deck-summary__check">{a.valid ? <p className="ok-msg">✓ このデッキは保存できます</p> : <Violations items={a.violations} />}</div>
        </div>
      </section>

      <div className="tabs tabs--mobile">
        <button type="button" className={cx('tab', tab === 'pool' && 'is-active')} onClick={() => setTab('pool')}>
          カードを選ぶ
        </button>
        <button type="button" className={cx('tab', tab === 'deck' && 'is-active')} onClick={() => setTab('deck')}>
          デッキの中身（{a.total}）
        </button>
      </div>

      <div className="builder">
        <section className={cx('panel builder__pool', tab !== 'pool' && 'is-hidden-mobile')}>
          <h2>カードを選ぶ</h2>
          {cards.length === 0 ? (
            <p className="hint">カードがありません。先に「カード」タブでカードを作ってください。</p>
          ) : (
            <>
              <div className="ctools ctools--pool">
                <SearchBox value={query} onChange={setQuery} />
                <button type="button" className={cx('btn ctools__btn', filterCount(filters) > 0 && 'is-on')} onClick={() => setFilterOpen(true)}>
                  <FilterIcon />
                  絞り込み{filterCount(filters) > 0 && <span className="ctools__n">{filterCount(filters)}</span>}
                </button>
              </div>
              {groups.length > 0 && <GroupBar layout="bar" groups={groups} counts={groupCounts} total={cards.length} ungrouped={ungrouped} scope={scope} onScope={(sc) => setPrefs({ scope: sc })} />}
              <div className="cstatus">
                <span className="ccount" aria-live="polite">
                  <b>{pool.length}</b> / {cards.length}枚
                </span>
                <FilterChipsRow filters={filters} decks={[]} onChange={(f) => setPrefs({ filters: f })} />
                <SortSelect className="cstatus__sort" sort={prefs.sort} desc={prefs.desc} onChange={(sort, desc) => setPrefs({ sort, desc })} />
              </div>
              {(scopeGroup || filters.tags.length > 0) && pool.length > 0 && (
                <div className="pool-bulk">
                  {scopeGroup?.memo && <p className="pool-bulk__memo">{scopeGroup.memo}</p>}
                  <button type="button" className="btn btn--small" onClick={() => addEachOnce(pool)} disabled={a.total >= a.size}>
                    ＋ 表示中の{pool.length}枚を1枚ずつ入れる
                  </button>
                </div>
              )}
              {pool.length === 0 && (
                <p className="hint">
                  条件に合うカードはありません。
                  {(query.trim() !== '' || filterCount(filters) > 0) && (
                    <button
                      type="button"
                      className="btn btn--small"
                      onClick={() => {
                        setQuery('');
                        setPrefs({ filters: EMPTY_FILTERS });
                      }}
                    >
                      解除
                    </button>
                  )}
                </p>
              )}
              <VirtualRows
                className="card-rows card-rows--pool"
                rows={poolRows}
                estimate={{ row: 70 }}
                measureKey="pool"
                render={({ entry }) => {
                  const c = entry.card;
                  const ca = entry.a;
                  const count = countOf(c.id);
                  const perName = BALANCE.rarity[c.rarity].perNameLimit;
                  const nameCount = nameCounts.get(normalizeName(c.name)) ?? 0;
                  return (
                    <div className={cx('card-row card-row--pool', frameClasses(c.rarity, ca.cardType, ca.isCurse), !ca.valid && 'is-invalid', count > 0 && 'is-in')}>
                      <CardRowInfo
                        card={c}
                        a={ca}
                        onPreview={() => setPreviewId(c.id)}
                        extra={
                          <>
                            <GroupDots ids={membership.get(c.id) ?? []} groupsById={groupsById} max={3} />
                            {ca.valid && perName !== null && <span className={cx('card-row__limit', nameCount > perName && 'text-ng')}>同名 {nameCount}/{perName}</span>}
                          </>
                        }
                      />
                      <CountControl count={count} disabled={!ca.valid && count === 0} onChange={(n) => setCount(c.id, n)} />
                    </div>
                  );
                }}
              />
            </>
          )}
        </section>

        <section className={cx('panel builder__deck', tab !== 'deck' && 'is-hidden-mobile')}>
          <h2>デッキの中身</h2>
          {deckRows.length === 0 && <p className="hint">まだカードが入っていません。</p>}
          <ul className="card-rows">
            {deckRows.map(({ entry, card }) =>
              card ? (
                <li key={entry.cardId} className={cx('card-row', frameClasses(card.rarity, analyses.get(card.id)?.cardType, analyses.get(card.id)?.isCurse), !analyses.get(card.id)?.valid && 'is-invalid')}>
                  <CardRowInfo card={card} a={analyses.get(card.id)!} onPreview={() => setPreviewId(card.id)} />
                  <span />
                  <CountControl count={entry.count} onChange={(n) => setCount(card.id, n)} />
                </li>
              ) : (
                <li key={entry.cardId} className="card-row is-invalid">
                  <span className="card-row__info">削除されたカード ×{entry.count}</span>
                  <span />
                  <button type="button" className="btn btn--small" onClick={() => setCount(entry.cardId, 0)}>
                    外す
                  </button>
                </li>
              ),
            )}
          </ul>
        </section>
      </div>

      <div className="savebar">
        <span className={cx('savebar__pts', a.total !== a.size && 'is-over')}>
          <b>{a.total}</b> / {a.size}枚
        </span>
        <span className={cx('savebar__status', !a.valid && 'is-ng')} aria-live="polite">
          {a.valid ? (dirty ? '保存できます' : '保存済み') : `要修正 ${a.violations.length}件`}
        </span>
        <button type="button" className="btn btn--secondary" onClick={() => navigate('/decks')}>
          一覧へ
        </button>
        <button type="button" className="btn btn--primary" disabled={!a.valid || !dirty} onClick={save}>
          保存
        </button>
      </div>

      {filterOpen && (
        <FilterSheet filters={filters} onChange={(f) => setPrefs({ filters: f })} decks={[]} showDeck={false} tagCounts={tagCounts} resultCount={pool.length} onClose={() => setFilterOpen(false)} />
      )}
      {preview && <PoolDetail card={preview} analysis={analyses.get(preview.id)!} count={countOf(preview.id)} block={addBlock(preview)} nameCount={nameCounts.get(normalizeName(preview.name)) ?? 0} rarityRow={a.rarityRows.find((r) => r.rarity === preview.rarity)} onCount={(n) => setCount(preview.id, n)} onClose={() => setPreviewId(null)} />}
    </>
  );
}

function CardRowInfo({ card, a, onPreview, extra }: { card: CardDef; a: CardAnalysis; onPreview: () => void; extra?: ReactNode }) {
  const name = card.name || '（名前なし）';
  return (
    <button type="button" className="card-row__info" onClick={onPreview} title="詳細を見る" aria-label={`${name}（コスト${card.cost}・${CARD_TYPE_LABEL[a.cardType]}・${RARITY_LABEL[card.rarity]}${a.isCurse ? '・呪い' : ''}）の詳細を見る`}>
      <CostGem cost={card.cost} label={false} />
      <span className="card-row__icon" aria-hidden="true">
        <CardArtOf card={card} analysis={a} size={38} />
      </span>
      <span className="card-row__text">
        <span className="card-row__name">
          <b>{name}</b>
          <RarityGem rarity={card.rarity} />
          {/* 要修正は名前の横の赤い札（狭い画面でも行を増やさない） */}
          {!a.valid && <span className="card-row__bad">要修正</span>}
        </span>
        <small>
          <span className="card-row__type">
            {CARD_TYPE_LABEL[a.cardType]}
            {a.isCurse && '・呪い'}
            {card.tribe && TRIBE_LABEL[card.tribe] ? `・${TRIBE_LABEL[card.tribe]}` : ''}
          </span>
          {card.stats && <StatMini attack={card.stats.attack} hp={card.stats.hp} defense={card.stats.defense} />}
          {extra}
        </small>
      </span>
    </button>
  );
}

function CountControl({ count, onChange, disabled }: { count: number; onChange: (n: number) => void; disabled?: boolean }) {
  if (count === 0) {
    return (
      <button type="button" className="btn btn--small btn--primary" disabled={disabled} onClick={() => onChange(1)}>
        ＋ 入れる
      </button>
    );
  }
  return <Stepper label="枚数" value={count} min={0} max={BALANCE.deck.size} onChange={onChange} />;
}

interface PoolDetailProps {
  card: CardDef;
  analysis: CardAnalysis;
  count: number;
  /** 1枚足せない理由（足せるなら null） */
  block: string | null;
  nameCount: number;
  rarityRow: RarityRow | undefined;
  onCount: (n: number) => void;
  onClose: () => void;
}

/** デッキ構築でカードを押したときの詳細：枚数と上限、「デッキに追加」「1枚減らす」 */
function PoolDetail({ card, analysis, count, block, nameCount, rarityRow, onCount, onClose }: PoolDetailProps) {
  const perName = BALANCE.rarity[card.rarity].perNameLimit;
  return (
    <CardDetail
      card={card}
      analysis={analysis}
      onClose={onClose}
      status={
        <>
          <span>
            デッキに <b>{count}枚</b>
            {perName !== null && `・同名 ${nameCount}/${perName}`}
            {rarityRow && rarityRow.limit !== null && `・${RARITY_LABEL[card.rarity]} ${rarityRow.count}/${rarityRow.limit}`}
          </span>
          {block && (
            <span className="text-warn" role="status">
              {block}
            </span>
          )}
        </>
      }
      actions={
        <>
          <button type="button" className="btn btn--primary" disabled={block !== null} onClick={() => onCount(count + 1)}>
            ＋ デッキに追加
          </button>
          <button type="button" className="btn" disabled={count === 0} onClick={() => onCount(count - 1)}>
            − 1枚減らす
          </button>
        </>
      }
    />
  );
}
