/**
 * 相手のデッキを見て、コピーする（決定事項 #122）。スマホは下からのシート、PC は中央のモーダル。
 * 戦った相手のデッキ（CPU 戦・オンライン・ドラフト）とフレンドが公開したデッキで共用する。
 *
 * - 上：枚数・レアリティごとの枚数・すでに持っている種類の数、コスト分布
 * - 一覧：コスト順の行。行を押すとカードの詳細、右の枠でカードを選ぶ（2枚以上あるカードは選ぶと枚数の −／＋）
 * - 下（固定）：何も選んでいなければ「デッキごとコピー」、選んでいれば「選んだカードをコピー」「選んだカードでデッキを作る」
 * すでに同じカードを持っていれば増やさない（行に「すでに持っています」）。増えたカードはグループ「<相手の名前>から」に入る。
 */
import { useMemo, useState } from 'react';
import { BALANCE, RARITIES, RARITY_LABEL, type CardDef, type Deck } from '../../engine/index.ts';
import { CardArtOf } from '../components/CardArt.tsx';
import { CardDetail } from '../components/CardDetail.tsx';
import { CostCurve } from '../components/CostCurve.tsx';
import { RarityGem } from '../components/cardParts.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { useToast } from '../components/Toast.tsx';
import { UiIcon } from '../components/UiIcon.tsx';
import { navigate } from '../router.ts';
import { useStore } from '../store.ts';
import { cx } from '../util.ts';
import { runCopy, type CopyKind } from './applyCopy.ts';
import { deckCounts, ownedCardIds, selectAll, selectionTotal } from './copyLogic.ts';
import './copy.css';

export interface DeckCopySheetProps {
  /** シートの見出し（例：「たろうのデッキ」） */
  title: string;
  /** 相手の名前（デッキ名「<相手の名前>のデッキ（コピー）」・グループ名「<相手の名前>から」に使う） */
  sourceName: string;
  deck: Deck;
  cards: CardDef[];
  onClose(): void;
}

interface Row {
  card: CardDef;
  count: number;
  owned: boolean;
}

export function DeckCopySheet({ title, sourceName, deck, cards, onClose }: DeckCopySheetProps) {
  const store = useStore();
  const toast = useToast();
  const [select, setSelect] = useState<Record<string, number>>({});
  const [zoom, setZoom] = useState<Row | null>(null);
  const owned = useMemo(() => ownedCardIds(store.cards, cards), [store.cards, cards]);
  const rows = useMemo<Row[]>(() => {
    const byId = new Map(cards.map((c) => [c.id, c]));
    return [...deckCounts(deck)]
      .flatMap(([id, count]) => {
        const card = byId.get(id);
        return card ? [{ card, count, owned: owned.has(id) }] : [];
      })
      .sort((a, b) => a.card.cost - b.card.cost || a.card.name.localeCompare(b.card.name, 'ja'));
  }, [deck, cards, owned]);
  const total = rows.reduce((s, r) => s + r.count, 0);
  const rarity = RARITIES.map((r) => ({ rarity: r, n: rows.filter((x) => x.card.rarity === r).reduce((s, x) => s + x.count, 0) })).filter((x) => x.n > 0);
  const ownedKinds = rows.filter((r) => r.owned).length;
  const picked = selectionTotal(select);
  const pickedKinds = Object.keys(select).length;

  const set = (id: string, n: number, max: number) =>
    setSelect((s) => {
      const next = { ...s };
      const v = Math.max(0, Math.min(max, n));
      if (v > 0) next[id] = v;
      else delete next[id];
      return next;
    });

  const copy = (kind: CopyKind) => {
    const r = runCopy(kind, { sourceName, deck, cards, select });
    const grp = r.groupName ? `（グループ「${r.groupName}」）` : '';
    const reusedNote = r.reused > 0 ? `・${r.reused}種類はすでに持っています` : '';
    if (r.deck) {
      const id = r.deck.id;
      toast({
        text: `デッキ「${r.deck.name}」を作りました（カード${r.added}種類を追加${reusedNote}）`,
        kind: 'ok',
        action: { label: 'デッキを開く', onClick: () => navigate(`/decks/${encodeURIComponent(id)}`) },
      });
    } else if (r.added > 0) {
      toast({
        text: `カード${r.added}種類をカード置き場に追加しました${grp}${reusedNote}`,
        kind: 'ok',
        action: { label: 'カード置き場で見る', onClick: () => navigate('/cards') },
      });
    } else {
      toast({ text: '選んだカードはすべてすでに持っています', kind: 'info', action: { label: 'カード置き場で見る', onClick: () => navigate('/cards') } });
    }
    onClose();
  };

  return (
    <Sheet open title={title} onClose={onClose} desktop="modal" className="dcopy-sheet">
      <div className="dcopy">
        <div className="dcopy__sum">
          <span className="dcopy__count">
            <b>{total}</b>/{BALANCE.deck.size}枚
          </span>
          {rarity.map((r) => (
            <span key={r.rarity} className="dcopy__rar">
              <RarityGem rarity={r.rarity} />
              {RARITY_LABEL[r.rarity]} {r.n}
            </span>
          ))}
          {ownedKinds > 0 && (
            <span className="dcopy__ownedsum">
              <UiIcon name="check-mark" />
              {ownedKinds}種類は持っています
            </span>
          )}
        </div>
        {rows.length > 0 && <CostCurve deck={deck} cards={cards} compact />}

        {rows.length === 0 ? (
          <p className="hint">デッキの中身が届いていません。</p>
        ) : (
          <>
            <div className="dcopy__tools">
              <span className="dcopy__toolnote">右の枠で選ぶと一部だけコピーできます</span>
              <button type="button" className="btn btn--small" onClick={() => setSelect(selectAll(deck))} disabled={picked === total}>
                全部選ぶ
              </button>
              <button type="button" className="btn btn--small" onClick={() => setSelect({})} disabled={picked === 0}>
                選択を外す
              </button>
            </div>
            <ul className="dcopy__rows" aria-label={`${title}のカード`}>
              {rows.map((r) => {
                const n = select[r.card.id] ?? 0;
                return (
                  <li key={r.card.id} className={cx('dcopy__row', n > 0 && 'is-sel')}>
                    <button type="button" className="dcopy__card" onClick={() => setZoom(r)} aria-label={`${r.card.name}（${r.count}枚）の詳細を見る`}>
                      <span className="dcopy__cost" aria-label={`コスト${r.card.cost}`}>
                        {r.card.cost}
                      </span>
                      <CardArtOf card={r.card} size="1.6em" />
                      <span className="dcopy__name">
                        <span className="dcopy__title">{r.card.name}</span>
                        {r.owned && <span className="dcopy__owned">すでに持っています</span>}
                      </span>
                      <RarityGem rarity={r.card.rarity} withLabel="sr" />
                      <b className="dcopy__n">×{r.count}</b>
                    </button>
                    {n > 0 && r.count > 1 ? (
                      <span className="dcopy__step" role="group" aria-label={`${r.card.name}をコピーする枚数`}>
                        <button type="button" className="dcopy__sb" onClick={() => set(r.card.id, n - 1, r.count)} aria-label="1枚減らす">
                          −
                        </button>
                        <output className="dcopy__sn" aria-live="polite">
                          {n}
                        </output>
                        <button type="button" className="dcopy__sb" onClick={() => set(r.card.id, n + 1, r.count)} disabled={n >= r.count} aria-label="1枚増やす">
                          ＋
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="dcopy__pick"
                        role="checkbox"
                        aria-checked={n > 0}
                        aria-label={`${r.card.name}を選ぶ`}
                        onClick={() => set(r.card.id, n > 0 ? 0 : r.count, r.count)}
                      >
                        <span className="dcopy__box" aria-hidden="true" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {rows.length > 0 && (
          <div className="dcopy__foot">
            {picked === 0 ? (
              <>
                <p className="dcopy__footnote">足りないカードをカード置き場に足し、デッキ「{sourceName}のデッキ（コピー）」を作ります。</p>
                <button type="button" className="btn btn--primary dcopy__main" onClick={() => copy('deck')}>
                  <UiIcon name="files" />
                  デッキごとコピー
                </button>
              </>
            ) : (
              <>
                <p className="dcopy__footnote" role="status">
                  {picked}枚（{pickedKinds}種類）を選んでいます
                </p>
                <div className="dcopy__btns">
                  <button type="button" className="btn btn--primary" onClick={() => copy('cards')}>
                    <UiIcon name="files" />
                    選んだカードをコピー
                  </button>
                  <button type="button" className="btn" onClick={() => copy('selectionDeck')}>
                    選んだカードでデッキを作る
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {zoom && (
        <CardDetail
          card={zoom.card}
          onClose={() => setZoom(null)}
          hideValidity
          status={`このデッキに${zoom.count}枚${zoom.owned ? '・すでに持っています' : ''}`}
          actions={
            <button
              type="button"
              className="btn"
              onClick={() => {
                const n = select[zoom.card.id] ?? 0;
                set(zoom.card.id, n > 0 ? 0 : zoom.count, zoom.count);
                setZoom(null);
              }}
            >
              {(select[zoom.card.id] ?? 0) > 0 ? '選択を外す' : `選ぶ（${zoom.count}枚）`}
            </button>
          }
        />
      )}
    </Sheet>
  );
}
