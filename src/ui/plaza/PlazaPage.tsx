/**
 * みんなの広場（#/plaza。決定事項 #141）：運営が公開したカード・デッキを誰でも見て、自分のカード・デッキにコピーできる。
 * 新しい順。運営はここで取り下げられる（自分が公開したものも）。公開そのものはカード・デッキの詳細の「広場に公開」から。
 */
import { useCallback, useEffect, useState } from 'react';
import type { CardDef, Deck } from '../../engine/index.ts';
import type { PlazaCursor, PublicKind } from '../../online/plaza/types.ts';
import type { PublicItemFull, PublicItemView } from '../../online/plaza/protocol.ts';
import { CardDetail } from '../components/CardDetail.tsx';
import { useConfirm } from '../components/ConfirmDialog.tsx';
import { useToast } from '../components/Toast.tsx';
import { CardSourceTabs } from '../components/CardSourceTabs.tsx';
import { UiIcon } from '../components/UiIcon.tsx';
import { DeckCopySheet } from '../copy/DeckCopySheet.tsx';
import { openCollection, runCopy } from '../copy/applyCopy.ts';
import { navigate } from '../router.ts';
import { cx } from '../util.ts';
import { PlazaCardItem, PlazaDeckItem, plazaDate } from './PlazaItems.tsx';
import { callPlaza, plazaAct, useStaff } from './plazaStore.ts';
import './plaza.css';

type Tab = 'all' | PublicKind;
const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'すべて' },
  { id: 'card', label: 'カード' },
  { id: 'deck', label: 'デッキ' },
];


export function PlazaPage() {
  const staff = useStaff();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>('all');
  const [items, setItems] = useState<PublicItemView[]>([]);
  const [next, setNext] = useState<PlazaCursor | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<PublicItemFull | null>(null);
  const [deckOpen, setDeckOpen] = useState<PublicItemFull | null>(null);
  const [word, setWord] = useState('');

  const load = useCallback(
    async (more: PlazaCursor | null) => {
      if (!more) setStatus('loading');
      const res = await callPlaza({ op: 'plazaList', ...(tab === 'all' ? {} : { kind: tab }), ...(more ? { before: more } : {}) });
      if (!res.ok) {
        setStatus('error');
        setError(res.error);
        return;
      }
      setItems((xs) => (more ? [...xs, ...res.items] : res.items));
      setNext(res.next);
      setStatus('ready');
    },
    [tab],
  );
  useEffect(() => {
    void load(null);
  }, [load]);

  const show = async (it: PublicItemView) => {
    const res = await callPlaza({ op: 'plazaGet', id: it.id });
    if (!res.ok) {
      toast({ text: res.error, kind: 'ng' });
      if (res.reason === 'notFound') setItems((xs) => xs.filter((x) => x.id !== it.id));
      return;
    }
    if (res.item.kind === 'deck') setDeckOpen(res.item);
    else setOpen(res.item);
  };

  const remove = async (it: PublicItemView) => {
    setOpen(null);
    setDeckOpen(null);
    const ok = await confirm({ title: `「${it.name}」を取り下げますか？`, message: '広場から消えます（コピーした人の手元のカード・デッキは消えません）。', okLabel: '取り下げる', danger: true });
    if (!ok) return;
    const res = await plazaAct({ op: 'plazaRemove', id: it.id });
    if (!res.ok) {
      toast({ text: res.error, kind: 'ng' });
      return;
    }
    setItems((xs) => xs.filter((x) => x.id !== it.id));
    toast({ text: `「${it.name}」を取り下げました`, kind: 'info' });
  };

  const copyCard = (item: PublicItemFull, card: CardDef) => {
    const deck: Deck = { v: 1, id: `plaza-${item.id}`, name: item.name, entries: [{ cardId: card.id, count: 1 }] };
    const r = runCopy('cards', { sourceName: item.owner.name, deck, cards: [card] });
    setOpen(null);
    toast({
      text: r.added > 0 ? `「${card.name}」を自分のカードにコピーしました` : `「${card.name}」はもう持っています`,
      kind: 'ok',
      ...(r.groupId ? { action: { label: 'カード置き場で見る', onClick: () => openCollection(r.groupId, navigate) } } : {}),
    });
  };

  const needle = word.trim().toLowerCase();
  const shown = needle ? items.filter((it) => `${it.name} ${it.owner.name}`.toLowerCase().includes(needle)) : items;

  return (
    <div className="plaza">
      <div className="page-head">
        <h1>みんなの広場</h1>
        {staff && (
          <span className="badge badge--legend plaza__staff">
            <UiIcon name="gi:podium" />
            運営
          </span>
        )}
      </div>
      <CardSourceTabs current="plaza" />
      <p className="hint">運営が公開したカードとデッキです。押すと全文や中身が見られ、自分のカード・デッキにコピーできます。{staff && '公開はカード・デッキの詳細の「広場に公開」から。'}</p>
      <div className="tabs plaza__tabs" role="tablist" aria-label="種類">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={cx('tab', tab === t.id && 'is-active')} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <input type="search" className="input plaza__search" value={word} onChange={(e) => setWord(e.target.value)} placeholder="名前・公開した人で絞り込み" aria-label="名前・公開した人で絞り込み" maxLength={40} />
      {status === 'loading' && <p className="hint">読み込んでいます…</p>}
      {status === 'error' && (
        <div className="notice notice--ng">
          {error ?? '読み込めませんでした'}
          <button type="button" className="btn btn--small" onClick={() => void load(null)}>
            もう一度
          </button>
        </div>
      )}
      {status === 'ready' && items.length > 0 && shown.length === 0 && <p className="plaza__empty">「{word.trim()}」に合うものはありません。{next && '「もっと見る」で古いものも探せます。'}</p>}
      {status === 'ready' && items.length === 0 && <p className="plaza__empty">まだ何も公開されていません。</p>}
      {/* 開かなくても中身がわかる一覧：カードは小さいカードの面、デッキはデッキ箱（代表カード・コスト分布・主なカード） */}
      <ul className="plaza__list">
        {shown.map((it) => {
          const removeButton = staff ? (
            <button type="button" className="btn btn--small btn--ghost plaza__remove" onClick={() => void remove(it)} aria-label={`「${it.name}」を取り下げる`}>
              取り下げ
            </button>
          ) : undefined;
          if (it.kind === 'card' && it.cover) return <PlazaCardItem key={it.id} it={it} card={it.cover} onOpen={() => void show(it)} removeButton={removeButton} />;
          if (it.kind === 'deck') return <PlazaDeckItem key={it.id} it={it} onOpen={(full) => (full ? setDeckOpen(full) : void show(it))} removeButton={removeButton} />;
          return (
            <li key={it.id} className="plaza__item">
              <button type="button" className="plaza__tile" onClick={() => void show(it)}>
                <span className="plaza__art" aria-hidden="true">
                  <UiIcon name="gi:chest" />
                </span>
                <span className="plaza__main">
                  <b className="plaza__name u-name">{it.name}</b>
                  <span className="plaza__meta">
                    {it.owner.name}・{plazaDate(it.updatedAt)}
                  </span>
                </span>
              </button>
              {removeButton}
            </li>
          );
        })}
      </ul>
      {next && status === 'ready' && (
        <div className="btn-row plaza__more">
          <button type="button" className="btn" onClick={() => void load(next)}>
            もっと見る
          </button>
        </div>
      )}
      {open?.card && (
        <CardDetail
          card={open.card}
          onClose={() => setOpen(null)}
          status={<span>公開：{open.owner.name}（{plazaDate(open.updatedAt)}）</span>}
          actions={
            <>
              <button type="button" className="btn btn--primary" onClick={() => copyCard(open, open.card!)}>
                自分のカードにコピー
              </button>
              {staff && (
                <button type="button" className="btn btn--danger" onClick={() => void remove(open)}>
                  取り下げ
                </button>
              )}
            </>
          }
        />
      )}
      {deckOpen?.deck && <DeckCopySheet title={`「${deckOpen.name}」（${deckOpen.owner.name}）`} sourceName={deckOpen.owner.name} deck={deckOpen.deck} cards={deckOpen.cards ?? []} onClose={() => setDeckOpen(null)} />}
    </div>
  );
}
