/** デッキ構築 */
import { useEffect, useMemo, useState } from 'react';
import {
  BALANCE,
  CARD_TYPE_LABEL,
  RARITIES,
  RARITY_LABEL,
  analyzeCard,
  analyzeDeck,
  normalizeName,
  type CardAnalysis,
  type CardDef,
  type Deck,
  type Rarity,
} from '../../engine/index.ts';
import { CardView } from '../components/CardView.tsx';
import { Modal, Stepper, Violations } from '../components/controls.tsx';
import { navigate } from '../router.ts';
import { NEW_DRAFT, actions, deckDrafts, useStore } from '../store.ts';
import { cx, uuid } from '../util.ts';

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

type PoolFilter = Rarity | 'curse' | 'all';

function Builder({ saved }: { saved: Deck | null }) {
  const { cards } = useStore();
  const draftKey = saved?.id ?? NEW_DRAFT;
  const [restored] = useState(() => {
    const d = deckDrafts.get(draftKey);
    return d && !sameJson(d, saved) ? d : null;
  });
  const [deck, setDeck] = useState<Deck>(() => restored ?? saved ?? emptyDeck(uuid()));
  const [draftNotice, setDraftNotice] = useState(restored !== null);
  const [tab, setTab] = useState<'pool' | 'deck'>('pool');
  const [filter, setFilter] = useState<PoolFilter>('all');
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<CardDef | null>(null);

  useEffect(() => {
    const pristine = saved ? sameJson(deck, saved) : sameJson(deck, emptyDeck(deck.id));
    if (pristine) deckDrafts.clear(draftKey);
    else deckDrafts.set(draftKey, deck);
  }, [deck, saved, draftKey]);

  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const analyses = useMemo(() => new Map(cards.map((c) => [c.id, analyzeCard(c)])), [cards]);
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

  // 同名の枚数（呪いを除く）
  const nameCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of deck.entries) {
      const c = cardsById.get(e.cardId);
      if (!c || analyses.get(c.id)?.isCurse) continue;
      const k = normalizeName(c.name);
      m.set(k, (m.get(k) ?? 0) + e.count);
    }
    return m;
  }, [deck, cardsById, analyses]);

  const pool = cards.filter((c) => {
    const ca = analyses.get(c.id)!;
    if (filter === 'curse' && !ca.isCurse) return false;
    if (filter !== 'curse' && filter !== 'all' && c.rarity !== filter) return false;
    if (query.trim() && !c.name.includes(query.trim())) return false;
    return true;
  });

  const deckRows = deck.entries
    .map((e) => ({ entry: e, card: cardsById.get(e.cardId) }))
    .sort((x, y) => (x.card?.cost ?? 99) - (y.card?.cost ?? 99) || (x.card?.name ?? '').localeCompare(y.card?.name ?? '', 'ja'));

  const save = () => {
    if (!a.valid) return;
    actions.saveDeck({ ...deck, name: deck.name.trim() });
    deckDrafts.clear(draftKey);
    navigate('/decks');
  };

  return (
    <>
      <div className="page-head">
        <h1>{saved ? 'デッキを編集' : '新しいデッキ'}</h1>
      </div>
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
        <label className="field">
          <span>デッキ名</span>
          <input type="text" value={deck.name} placeholder="例：毒デッキ" onChange={(e) => setDeck({ ...deck, name: e.target.value })} />
        </label>
        <div className="deck-summary__counts">
          <div className={cx('deck-summary__total', a.total !== a.size && 'is-ng')}>
            <b>{a.total}</b> / {a.size}枚
          </div>
          <ul className="rarity-rows">
            {a.rarityRows.map((r) => (
              <li key={r.rarity} className={cx(r.limit !== null && r.count > r.limit && 'is-ng')}>
                <span className={cx('dot', `dot--${r.rarity}`)} />
                {RARITY_LABEL[r.rarity]} {r.count}
                {r.limit !== null ? ` / ${r.limit}` : '（制限なし）'}
              </li>
            ))}
            <li>
              <span className="dot dot--curse" />
              うち呪い {a.curseCount}
            </li>
          </ul>
        </div>
        {a.valid ? <p className="ok-msg">✓ このデッキは保存できます</p> : <Violations items={a.violations} />}
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
          <div className="filters">
            <div className="chips">
              {(['all', ...RARITIES, 'curse'] as PoolFilter[]).map((r) => (
                <button key={r} type="button" className={cx('chip', filter === r && 'is-active')} onClick={() => setFilter(r)}>
                  {r === 'all' ? 'すべて' : r === 'curse' ? '呪い' : RARITY_LABEL[r]}
                </button>
              ))}
            </div>
            <input type="search" value={query} placeholder="名前で探す" onChange={(e) => setQuery(e.target.value)} />
          </div>
          {cards.length === 0 && <p className="hint">カードがありません。先に「カード」タブでカードを作ってください。</p>}
          <ul className="card-rows">
            {pool.map((c) => {
              const ca = analyses.get(c.id)!;
              const count = countOf(c.id);
              const perName = ca.isCurse ? null : BALANCE.rarity[c.rarity].perNameLimit;
              const nameCount = nameCounts.get(normalizeName(c.name)) ?? 0;
              return (
                <li key={c.id} className={cx('card-row', !ca.valid && 'is-invalid', count > 0 && 'is-in')}>
                  <CardRowInfo card={c} a={ca} onPreview={() => setPreview(c)} />
                  <span className={cx('card-row__limit', perName !== null && nameCount > perName && 'text-ng')}>
                    {!ca.valid ? 'ルール違反' : perName !== null ? `同名 ${nameCount}/${perName}` : ''}
                  </span>
                  <CountControl count={count} disabled={!ca.valid && count === 0} onChange={(n) => setCount(c.id, n)} />
                </li>
              );
            })}
          </ul>
        </section>

        <section className={cx('panel builder__deck', tab !== 'deck' && 'is-hidden-mobile')}>
          <h2>デッキの中身</h2>
          {deckRows.length === 0 && <p className="hint">まだカードが入っていません。</p>}
          <ul className="card-rows">
            {deckRows.map(({ entry, card }) =>
              card ? (
                <li key={entry.cardId} className={cx('card-row', !analyses.get(card.id)?.valid && 'is-invalid')}>
                  <CardRowInfo card={card} a={analyses.get(card.id)!} onPreview={() => setPreview(card)} />
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
        <span className={cx('savebar__status', !a.valid && 'is-ng')}>
          {a.valid ? (dirty ? '保存できます' : '保存済み') : `保存できません（理由${a.violations.length}件）`}
        </span>
        <button type="button" className="btn" onClick={() => navigate('/decks')}>
          一覧へ
        </button>
        <button type="button" className="btn btn--primary" disabled={!a.valid || !dirty} onClick={save}>
          保存
        </button>
      </div>

      {preview && (
        <Modal title={preview.name} onClose={() => setPreview(null)}>
          <div className="preview-modal">
            <CardView card={preview} />
          </div>
        </Modal>
      )}
    </>
  );
}

function CardRowInfo({ card, a, onPreview }: { card: CardDef; a: CardAnalysis; onPreview: () => void }) {
  return (
    <button type="button" className="card-row__info" onClick={onPreview} title="カードを見る">
      <span className={cx('card-row__icon', `frame--${card.rarity}`, a.isCurse && 'frame--curse')}>{card.icon}</span>
      <span className="card-row__text">
        <b>{card.name}</b>
        <small>
          コスト{card.cost}・{CARD_TYPE_LABEL[a.cardType]}・{RARITY_LABEL[card.rarity]}
          {a.isCurse && '・呪い'}
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
