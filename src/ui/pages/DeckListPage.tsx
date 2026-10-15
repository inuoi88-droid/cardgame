/** デッキ一覧 */
import { useMemo, useState } from 'react';
import { analyzeDeck, exportDeck, type Deck, type ExportBundle } from '../../engine/index.ts';
import { ExportDialog, ImportDialog } from '../components/ImportExport.tsx';
import { navigate } from '../router.ts';
import { actions, useStore } from '../store.ts';
import { cx, todayStamp, uuid } from '../util.ts';

export function DeckListPage() {
  const { cards, decks } = useStore();
  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState<{ bundle: ExportBundle; name: string } | null>(null);

  const remove = (deck: Deck) => {
    if (confirm(`デッキ「${deck.name}」を削除しますか？（カードは消えません）`)) actions.deleteDeck(deck.id);
  };

  return (
    <>
      <div className="page-head">
        <h1>
          デッキ <small>{decks.length}個</small>
        </h1>
        <div className="btn-row">
          <button type="button" className="btn btn--primary" onClick={() => navigate('/decks/new')}>
            ＋ 新しいデッキ
          </button>
          <button type="button" className="btn" onClick={() => setImporting(true)}>
            取り込み
          </button>
        </div>
      </div>

      {decks.length === 0 ? (
        <div className="empty">
          <p>まだデッキがありません。</p>
          <p>「＋ 新しいデッキ」から、作ったカードを30枚選んでデッキにしましょう。</p>
        </div>
      ) : (
        <ul className="deck-list">
          {decks.map((deck) => {
            const a = analyzeDeck(deck, cardsById);
            return (
              <li key={deck.id} className={cx('panel deck-list__item', !a.valid && 'is-ng')}>
                <button type="button" className="deck-list__main" onClick={() => navigate(`/decks/${encodeURIComponent(deck.id)}`)}>
                  <b>{deck.name || '（名前なし）'}</b>
                  <span className="deck-list__meta">
                    {a.total} / {a.size}枚
                    {a.valid ? <span className="text-ok">　✓ 使用できます</span> : <span className="text-ng">　✗ ルール違反 {a.violations.length}件</span>}
                  </span>
                  {!a.valid && <span className="deck-list__reason">{a.violations[0]?.message}</span>}
                </button>
                <div className="btn-row">
                  <button type="button" className="btn btn--small" onClick={() => navigate(`/decks/${encodeURIComponent(deck.id)}`)}>
                    編集
                  </button>
                  <button
                    type="button"
                    className="btn btn--small"
                    onClick={() => actions.saveDeck({ ...deck, id: uuid(), name: `${deck.name}のコピー` })}
                  >
                    複製
                  </button>
                  <button type="button" className="btn btn--small" onClick={() => setExporting({ bundle: exportDeck(deck, cardsById), name: deck.name })}>
                    書き出し
                  </button>
                  <button type="button" className="btn btn--small btn--danger" onClick={() => remove(deck)}>
                    削除
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {importing && <ImportDialog onClose={() => setImporting(false)} />}
      {exporting && (
        <ExportDialog
          title={`デッキ「${exporting.name}」を書き出す`}
          bundle={exporting.bundle}
          filename={`deck-${todayStamp()}.json`}
          onClose={() => setExporting(null)}
        />
      )}
    </>
  );
}
