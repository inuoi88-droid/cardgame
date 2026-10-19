/** カード一覧 */
import { useMemo, useState } from 'react';
import {
  CARD_TYPES,
  CARD_TYPE_LABEL,
  RARITIES,
  RARITY_LABEL,
  analyzeCard,
  buildExport,
  formatPoints,
  mergeImport,
  normalizeName,
  uniqueName,
  type CardDef,
  type CardType,
  type Rarity,
} from '../../engine/index.ts';
import { CardView } from '../components/CardView.tsx';
import { ExportDialog, ImportDialog } from '../components/ImportExport.tsx';
import { navigate } from '../router.ts';
import { NEW_DRAFT, actions, cardDrafts, getState, useStore } from '../store.ts';
import { SAMPLE_CARDS } from '../../samples.ts';
import { cx, todayStamp, uuid } from '../util.ts';

type RarityFilter = Rarity | 'curse' | 'all';

export function CardListPage() {
  const { cards, decks } = useStore();
  const [rarity, setRarity] = useState<RarityFilter>('all');
  const [type, setType] = useState<CardType | 'all'>('all');
  const [dialog, setDialog] = useState<'import' | 'export' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const hasNewDraft = useMemo(() => cardDrafts.get(NEW_DRAFT) !== null, []);

  const analyzed = useMemo(() => cards.map((c) => ({ card: c, a: analyzeCard(c) })), [cards]);
  const shown = analyzed.filter(({ card, a }) => {
    if (rarity === 'curse' && !a.isCurse) return false;
    if (rarity !== 'curse' && rarity !== 'all' && card.rarity !== rarity) return false;
    if (type !== 'all' && a.cardType !== type) return false;
    return true;
  });
  const invalidCount = analyzed.filter((x) => !x.a.valid).length;

  const addSamples = () => {
    const { cards: cur, decks: curDecks } = getState();
    const m = mergeImport(cur, curDecks, { cards: SAMPLE_CARDS, decks: [] }, uuid);
    actions.replaceAll(m.cards, m.decks);
    setMessage(m.addedCards > 0 ? `サンプルを${m.addedCards}枚追加しました` : 'サンプルはすでに追加されています');
  };

  const duplicate = (card: CardDef) => {
    const taken = new Set(getState().cards.map((c) => normalizeName(c.name)));
    actions.saveCard({ ...card, id: uuid(), name: uniqueName(card.name, taken) });
  };

  const remove = (card: CardDef) => {
    const usedIn = decks.filter((d) => d.entries.some((e) => e.cardId === card.id));
    const warn = usedIn.length > 0 ? `\nこのカードは ${usedIn.map((d) => `「${d.name}」`).join('')} で使われています。削除するとデッキが不完全になります。` : '';
    if (confirm(`「${card.name}」を削除しますか？${warn}`)) actions.deleteCard(card.id);
  };

  return (
    <>
      <div className="page-head">
        <h1>
          カード <small>{cards.length}枚</small>
        </h1>
        <div className="btn-row">
          <button type="button" className="btn btn--primary" onClick={() => navigate('/cards/new')}>
            ＋ 新しいカード
          </button>
          <button type="button" className="btn" onClick={addSamples}>
            サンプルを追加
          </button>
          <button type="button" className="btn" onClick={() => setDialog('export')} disabled={cards.length === 0}>
            書き出し
          </button>
          <button type="button" className="btn" onClick={() => setDialog('import')}>
            取り込み
          </button>
        </div>
      </div>

      {message && (
        <div className="notice" onClick={() => setMessage(null)}>
          {message}
        </div>
      )}
      {hasNewDraft && (
        <div className="notice">
          作成途中のカードがあります。
          <button type="button" className="btn btn--small" onClick={() => navigate('/cards/new')}>
            続きを編集
          </button>
        </div>
      )}
      {invalidCount > 0 && <div className="notice notice--ng">ルール違反のカードが{invalidCount}枚あります。編集して直すまでデッキでは使えません。</div>}

      <div className="filters">
        <div className="chips">
          {(['all', ...RARITIES, 'curse'] as RarityFilter[]).map((r) => (
            <button key={r} type="button" className={cx('chip', rarity === r && 'is-active')} onClick={() => setRarity(r)}>
              {r === 'all' ? 'すべて' : r === 'curse' ? '呪い' : RARITY_LABEL[r]}
            </button>
          ))}
        </div>
        <select value={type} onChange={(e) => setType(e.target.value as CardType | 'all')} aria-label="種類で絞り込み">
          <option value="all">すべての種類</option>
          {CARD_TYPES.map((t) => (
            <option key={t} value={t}>
              {CARD_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </div>

      {cards.length === 0 ? (
        <div className="empty">
          <p>まだカードがありません。</p>
          <p>「＋ 新しいカード」で作るか、「サンプルを追加」で作成例と見本の8枚を入れてみてください。</p>
        </div>
      ) : (
        <div className="card-grid">
          {shown.map(({ card, a }) => (
            <div key={card.id} className="card-grid__item">
              <CardView card={card} analysis={a} size="sm" onClick={() => navigate(`/cards/${encodeURIComponent(card.id)}`)} />
              <div className="card-grid__actions">
                <span className="card-grid__pts">
                  {formatPoints(a.points.total)}/{a.points.cap}pt
                </span>
                <button type="button" className="btn btn--small" onClick={() => duplicate(card)}>
                  複製
                </button>
                <button type="button" className="btn btn--small btn--danger" onClick={() => remove(card)}>
                  削除
                </button>
              </div>
            </div>
          ))}
          {shown.length === 0 && <p className="hint">条件に合うカードはありません。</p>}
        </div>
      )}

      {dialog === 'export' && (
        <ExportDialog
          title="カードとデッキを書き出す"
          bundle={buildExport(cards, decks)}
          filename={`cardgame-${todayStamp()}.json`}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'import' && <ImportDialog onClose={() => setDialog(null)} />}
    </>
  );
}
