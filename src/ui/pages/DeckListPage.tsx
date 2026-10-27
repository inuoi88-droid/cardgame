/**
 * デッキ一覧。UI2「黒鉄と金の卓」（決定事項 #111 の D）：管理画面の板と文字ボタンの並びをやめ、デッキ箱のタイルを並べる。
 * - タイル（押せば編集）：鉄の板。代表カードの絵と枚数、銘板にデッキ名（人の入力なので --font-title）、レアリティの宝石の数、
 *   ミニのコスト分布（鉄の柱）、1行の注記。要修正は深紅の封蝋を押して最後に並べる
 * - 複製・書き出し・削除はタイルの右上の「⋯」のメニュー（削除は深紅）。取り込みは見出しの行の形のボタン
 */
import { useMemo, useState } from 'react';
import { BALANCE, analyzeDeck, exportDeck, type Deck, type ExportBundle } from '../../engine/index.ts';
import { DeckBox } from '../components/DeckBox.tsx';
import { useConfirm } from '../components/ConfirmDialog.tsx';
import { ExportDialog, ImportDialog } from '../components/ImportExport.tsx';
import { useToast } from '../components/Toast.tsx';
import { UiIcon } from '../components/UiIcon.tsx';
import { navigate } from '../router.ts';
import { actions, getState, useStore } from '../store.ts';
import { todayStamp, uuid } from '../util.ts';
import { OpponentHistory } from '../copy/OpponentHistory.tsx';
import { shareBlock, shareDeckNow, unshareDeckNow } from '../social/sharing.ts';
import { sharedDeckIds } from '../social/socialLogic.ts';
import { useSocial } from '../social/socialStore.ts';
import { publishDeck, useStaff } from '../plaza/plazaStore.ts';

export function DeckListPage() {
  const { cards, decks } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const [importing, setImporting] = useState(false);
  // フレンドに公開中のデッキ（決定事項 #123。サーバーの様子から）
  const shared = sharedDeckIds(useSocial().snap);
  const toggleShare = async (deck: Deck) => {
    const name = deck.name || '（名前なし）';
    if (shared.has(deck.id)) {
      const e = await unshareDeckNow(deck.id);
      toast(e ? { text: e, kind: 'ng' } : { text: `「${name}」のフレンドへの公開をやめました`, kind: 'info' });
      return;
    }
    const block = shareBlock(deck, cards);
    if (block) {
      toast({ text: `「${name}」は公開できません：${block}`, kind: 'ng' });
      return;
    }
    const e = await shareDeckNow(deck, cards);
    toast(
      e
        ? { text: e, kind: 'ng' }
        : { text: `「${name}」をフレンドに公開しました。直して保存すると、公開中のものも新しくなります`, kind: 'ok', action: { label: 'フレンドへ', onClick: () => navigate('/online/friends') } },
    );
  };
  // みんなの広場に公開（運営だけ。決定事項 #141）
  const staff = useStaff();
  const publish = async (deck: Deck) => {
    const name = deck.name || '（名前なし）';
    const e = await publishDeck(deck, cards);
    toast(e ? { text: e, kind: 'ng' } : { text: `「${name}」をみんなの広場に公開しました。もう一度公開すると今の中身に置き換わります`, kind: 'ok', action: { label: '広場へ', onClick: () => navigate('/plaza') } });
  };
  const [exporting, setExporting] = useState<{ bundle: ExportBundle; name: string } | null>(null);
  // 使えるデッキが先、要修正は最後（同じ中では保存の順）
  const rows = useMemo(() => {
    const all = decks.map((deck) => ({ deck, a: analyzeDeck(deck, cardsById) }));
    return [...all.filter((r) => r.a.valid), ...all.filter((r) => !r.a.valid)];
  }, [decks, cardsById]);

  const remove = async (deck: Deck) => {
    const ok = await confirm({
      title: `デッキ「${deck.name}」を削除しますか？`,
      message: `カードは消えません。削除したあと、しばらくの間は「元に戻す」で戻せます。${shared.has(deck.id) ? 'フレンドへの公開もやめます。' : ''}`,
      okLabel: '削除',
      danger: true,
    });
    if (!ok) return;
    // 公開中なら公開もやめる（消したデッキがフレンドに見え続けないように）
    if (shared.has(deck.id)) void unshareDeckNow(deck.id);
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
            <UiIcon name="quill-ink" />
            新しいデッキ
          </button>
          <button type="button" className="btn page-head__iconbtn" onClick={() => setImporting(true)} aria-label="デッキを取り込む" title="取り込み">
            <UiIcon name="files" />
            <span className="page-head__lbl">取り込み</span>
          </button>
        </div>
      </div>

      {decks.length === 0 ? (
        <div className="empty empty--hero">
          <UiIcon name="open-chest" />
          <p className="empty__title">まだデッキがありません</p>
          <p>作ったカードを{BALANCE.deck.size}枚選んで、最初のデッキを組みましょう。</p>
          <div className="btn-row">
            <button type="button" className="btn btn--primary btn--small" onClick={() => navigate('/decks/new')}>
              デッキを組む
            </button>
            <button type="button" className="btn btn--small" onClick={() => setImporting(true)}>
              ファイルから取り込む
            </button>
          </div>
        </div>
      ) : (
        <ul className="dboxes">
          {rows.map(({ deck, a }) => (
            <DeckBox
              key={deck.id}
              deck={deck}
              a={a}
              cards={cards}
              onOpen={() => navigate(`/decks/${encodeURIComponent(deck.id)}`)}
              onDuplicate={() => duplicate(deck)}
              onExport={() => setExporting({ bundle: exportDeck(deck, cardsById), name: deck.name })}
              onRemove={() => void remove(deck)}
              shared={shared.has(deck.id)}
              onShare={() => void toggleShare(deck)}
              {...(staff && a.valid ? { onPublish: () => void publish(deck) } : {})}
            />
          ))}
        </ul>
      )}

      <OpponentHistory />

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
