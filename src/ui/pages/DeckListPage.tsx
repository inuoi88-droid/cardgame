/** デッキ一覧 */
import { useMemo, useState } from 'react';
import { BALANCE, analyzeDeck, exportDeck, type Deck, type ExportBundle } from '../../engine/index.ts';
import { useConfirm } from '../components/ConfirmDialog.tsx';
import { ExportDialog, ImportDialog } from '../components/ImportExport.tsx';
import { useToast } from '../components/Toast.tsx';
import { navigate } from '../router.ts';
import { actions, getState, useStore } from '../store.ts';
import { cx, todayStamp, uuid } from '../util.ts';

export function DeckListPage() {
  const { cards, decks } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState<{ bundle: ExportBundle; name: string } | null>(null);

  const remove = async (deck: Deck) => {
    const ok = await confirm({
      title: `デッキ「${deck.name}」を削除しますか？`,
      message: 'カードは消えません。削除したあと、しばらくの間は「元に戻す」で戻せます。',
      okLabel: '削除',
      danger: true,
    });
    if (!ok) return;
    const index = getState().decks.findIndex((d) => d.id === deck.id);
    actions.deleteDeck(deck.id);
    toast({ text: `デッキ「${deck.name}」を削除しました`, kind: 'info', action: { label: '元に戻す', onClick: () => actions.restoreDeck(deck, index) } });
  };

  const duplicate = (deck: Deck) => {
    const copy = { ...deck, id: uuid(), name: `${deck.name}のコピー` };
    actions.saveDeck(copy);
    toast({ text: `「${copy.name}」として複製しました`, kind: 'ok', action: { label: '編集', onClick: () => navigate(`/decks/${encodeURIComponent(copy.id)}`) } });
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
          <p>「＋ 新しいデッキ」から、作ったカードを{BALANCE.deck.size}枚選んでデッキにしましょう。</p>
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
                    {a.valid ? <span className="text-ok">　✓ 使用できます</span> : <span className="text-ng">　✗ 要修正 {a.violations.length}件</span>}
                  </span>
                  {!a.valid && <span className="deck-list__reason">{a.violations[0]?.message}</span>}
                </button>
                <div className="btn-row">
                  <button type="button" className="btn btn--small" onClick={() => navigate(`/decks/${encodeURIComponent(deck.id)}`)}>
                    編集
                  </button>
                  <button type="button" className="btn btn--small" onClick={() => duplicate(deck)}>
                    複製
                  </button>
                  <button type="button" className="btn btn--small" onClick={() => setExporting({ bundle: exportDeck(deck, cardsById), name: deck.name })}>
                    書き出し
                  </button>
                  <button type="button" className="btn btn--small btn--danger" onClick={() => void remove(deck)}>
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
