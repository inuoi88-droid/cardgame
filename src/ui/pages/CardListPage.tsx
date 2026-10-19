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
import { useConfirm } from '../components/ConfirmDialog.tsx';
import { ExportDialog, ImportDialog } from '../components/ImportExport.tsx';
import { useToast } from '../components/Toast.tsx';
import { navigate } from '../router.ts';
import { NEW_DRAFT, actions, cardDrafts, getState, useStore } from '../store.ts';
import { SAMPLE_CARDS } from '../../samples.ts';
import { cx, todayStamp, uuid } from '../util.ts';

type RarityFilter = Rarity | 'curse' | 'all';

export function CardListPage() {
  const { cards, decks } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const [rarity, setRarity] = useState<RarityFilter>('all');
  const [type, setType] = useState<CardType | 'all'>('all');
  const [dialog, setDialog] = useState<'import' | 'export' | null>(null);
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
    if (m.addedCards > 0) toast({ text: `サンプルを${m.addedCards}枚追加しました`, kind: 'ok' });
    else toast({ text: 'サンプルはすでに追加されています', kind: 'info' });
  };

  const duplicate = (card: CardDef) => {
    const taken = new Set(getState().cards.map((c) => normalizeName(c.name)));
    const copy = { ...card, id: uuid(), name: uniqueName(card.name, taken) };
    actions.saveCard(copy);
    toast({ text: `「${copy.name}」として複製しました`, kind: 'ok', action: { label: '編集', onClick: () => navigate(`/cards/${encodeURIComponent(copy.id)}`) } });
  };

  const remove = async (card: CardDef) => {
    const usedIn = decks.filter((d) => d.entries.some((e) => e.cardId === card.id));
    const ok = await confirm({
      title: `「${card.name}」を削除しますか？`,
      message:
        usedIn.length > 0
          ? `このカードは ${usedIn.map((d) => `「${d.name}」`).join('')} で使われています。削除するとデッキが不完全になります。`
          : '削除したあと、しばらくの間は「元に戻す」で戻せます。',
      okLabel: '削除',
      danger: true,
    });
    if (!ok) return;
    const index = getState().cards.findIndex((c) => c.id === card.id);
    actions.deleteCard(card.id);
    toast({ text: `「${card.name}」を削除しました`, kind: 'info', action: { label: '元に戻す', onClick: () => actions.restoreCard(card, index) } });
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

      {hasNewDraft && (
        <div className="notice">
          作成途中のカードがあります。
          <button type="button" className="btn btn--small" onClick={() => navigate('/cards/new')}>
            続きを編集
          </button>
        </div>
      )}
      {invalidCount > 0 && <div className="notice notice--ng">要修正のカードが{invalidCount}枚あります。編集して直すまでデッキでは使えません。</div>}

      <div className="filters">
        <div className="chips" role="group" aria-label="レアリティで絞り込み">
          {(['all', ...RARITIES, 'curse'] as RarityFilter[]).map((r) => (
            <button key={r} type="button" className={cx('chip', rarity === r && 'is-active')} aria-pressed={rarity === r} onClick={() => setRarity(r)}>
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
          <p>「＋ 新しいカード」で作るか、「サンプルを追加」で作成例と見本の{SAMPLE_CARDS.length}枚を入れてみてください。</p>
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
                <button type="button" className="btn btn--small btn--danger" onClick={() => void remove(card)}>
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
