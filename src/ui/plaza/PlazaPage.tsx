/**
 * みんなの広場（#/plaza。決定事項 #141）：運営が公開したカード・デッキを誰でも見て、自分のカード・デッキにコピーできる。
 * 新しい順。運営はここで取り下げられる（自分が公開したものも）。公開そのものはカード・デッキの詳細の「広場に公開」から。
 */
import { useCallback, useEffect, useState } from 'react';
import type { CardDef, Deck } from '../../engine/index.ts';
import type { PlazaCursor, PublicKind } from '../../online/plaza/types.ts';
import type { PublicItemFull, PublicItemView } from '../../online/plaza/protocol.ts';
import { CardArtOf } from '../components/CardArt.tsx';
import { CardDetail } from '../components/CardDetail.tsx';
import { useConfirm } from '../components/ConfirmDialog.tsx';
import { useToast } from '../components/Toast.tsx';
import { UiIcon } from '../components/UiIcon.tsx';
import { DeckCopySheet } from '../copy/DeckCopySheet.tsx';
import { openCollection, runCopy } from '../copy/applyCopy.ts';
import { navigate } from '../router.ts';
import { cx } from '../util.ts';
import { callPlaza, plazaAct, useStaff } from './plazaStore.ts';
import './plaza.css';

type Tab = 'all' | PublicKind;
const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'すべて' },
  { id: 'card', label: 'カード' },
  { id: 'deck', label: 'デッキ' },
];

const dateText = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
};

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
      <p className="hint">運営が公開したカードとデッキです。押すと中身が見られ、自分のカード・デッキにコピーできます。{staff && '公開はカード・デッキの詳細の「広場に公開」から。'}</p>
      <div className="tabs plaza__tabs" role="tablist" aria-label="種類">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={cx('tab', tab === t.id && 'is-active')} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {status === 'loading' && <p className="hint">読み込んでいます…</p>}
      {status === 'error' && (
        <div className="notice notice--ng">
          {error ?? '読み込めませんでした'}
          <button type="button" className="btn btn--small" onClick={() => void load(null)}>
            もう一度
          </button>
        </div>
      )}
      {status === 'ready' && items.length === 0 && <p className="plaza__empty">まだ何も公開されていません。</p>}
      <ul className="plaza__list">
        {items.map((it) => (
          <li key={it.id} className="plaza__item">
            <button type="button" className="plaza__tile" onClick={() => void show(it)}>
              <span className="plaza__art" aria-hidden="true">
                {it.cover ? <CardArtOf card={it.cover} size={64} /> : <UiIcon name="gi:chest" />}
              </span>
              <span className="plaza__main">
                <b className="plaza__name u-name">{it.name}</b>
                <span className="plaza__meta">
                  {it.kind === 'deck' ? `デッキ・${it.count}枚` : 'カード'}・{it.owner.name}・{dateText(it.updatedAt)}
                </span>
              </span>
            </button>
            {staff && (
              <button type="button" className="btn btn--small btn--ghost plaza__remove" onClick={() => void remove(it)} aria-label={`「${it.name}」を取り下げる`}>
                取り下げ
              </button>
            )}
          </li>
        ))}
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
          status={<span>公開：{open.owner.name}（{dateText(open.updatedAt)}）</span>}
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
