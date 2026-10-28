/**
 * みんなの広場の一覧の1件（開かなくても中身がわかる形）。
 * - カード：一覧の小さいカードの面（CardView sm。コスト・レアリティ・種類・攻撃力と体力・効果の文）
 * - デッキ：デッキ箱の中身（DeckBoxFace：代表カード・枚数・レアリティの数・ミニのコスト分布）と「主なカード」。
 *   一覧にはデッキの中身が無いので、画面に入ったデッキだけ中身（plazaGet）を2本ずつ取りに行き、この画面の間は覚えておく
 */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { RARITIES, type CardDef, type Rarity } from '../../engine/index.ts';
import type { PublicItemFull, PublicItemView } from '../../online/plaza/protocol.ts';
import { deckSummary, type DeckSummary } from '../battle/deckSummary.ts';
import { CardView } from '../components/CardView.tsx';
import { DeckBoxFace } from '../components/DeckBox.tsx';
import { callPlaza } from './plazaStore.ts';

export const plazaDate = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
};

// ---------------------------------------------------------------- デッキの中身の取り寄せ（画面に入ったものだけ・2本ずつ）

/** 取り寄せた中身（id と更新の時刻で覚える。公開し直されたら取り直す） */
const fulls = new Map<string, PublicItemFull | 'missing'>();
const waiting: { key: string; id: string; done: (v: PublicItemFull | 'missing' | null) => void }[] = [];
let running = 0;
const LANES = 2;

const keyOf = (it: PublicItemView) => `${it.id}:${it.updatedAt}`;

function pump(): void {
  while (running < LANES && waiting.length > 0) {
    const job = waiting.shift()!;
    running += 1;
    void callPlaza({ op: 'plazaGet', id: job.id })
      .then((res) => {
        // 消えていた（取り下げ）ものは覚える。通信の失敗は覚えない（次に見えたとき取り直す）
        const v = res.ok ? res.item : res.reason === 'notFound' ? 'missing' : null;
        if (v) fulls.set(job.key, v);
        job.done(v);
      })
      .catch(() => job.done(null))
      .finally(() => {
        running -= 1;
        pump();
      });
  }
}

/** 覚えている中身（開くときに取り直さずに使う） */
export function cachedPlazaItem(it: PublicItemView): PublicItemFull | undefined {
  const v = fulls.get(keyOf(it));
  return v && v !== 'missing' ? v : undefined;
}

/** 画面に入ったら中身を取り寄せる */
function useDeckFull(it: PublicItemView, ref: RefObject<HTMLElement | null>): PublicItemFull | 'missing' | undefined {
  const key = keyOf(it);
  const [v, setV] = useState<PublicItemFull | 'missing' | undefined>(() => fulls.get(key));
  useEffect(() => {
    const known = fulls.get(key);
    if (known) {
      setV(known);
      return;
    }
    const el = ref.current;
    if (!el) return;
    let alive = true;
    let queued = false;
    const want = () => {
      if (queued) return;
      queued = true;
      waiting.push({ key, id: it.id, done: (x) => alive && x && setV(x) });
      pump();
    };
    if (typeof IntersectionObserver === 'undefined') {
      want();
      return () => {
        alive = false;
      };
    }
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        io.disconnect();
        want();
      }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => {
      alive = false;
      io.disconnect();
      // まだ順番待ちなら外す（すぐ別の画面へ移ったとき、見えないデッキを取りに行かない）
      const i = waiting.findIndex((w) => w.key === key);
      if (i >= 0) waiting.splice(i, 1);
    };
  }, [key, it.id, ref]);
  return v;
}

/** 主なカード：枚数の多い順に3枚まで「名前×枚数」 */
export function mainCardsText(full: PublicItemFull): string {
  const byId = new Map((full.cards ?? []).map((c) => [c.id, c]));
  const top = [...(full.deck?.entries ?? [])]
    .filter((e) => byId.has(e.cardId))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((e) => `${byId.get(e.cardId)!.name}×${e.count}`);
  return top.length > 0 ? `主なカード：${top.join('・')}` : '';
}

// ---------------------------------------------------------------- 1件

export function PlazaCardItem({ it, card, onOpen, removeButton }: { it: PublicItemView; card: CardDef; onOpen: () => void; removeButton?: ReactNode }) {
  return (
    <li className="plaza__item plaza__item--card">
      <CardView card={card} size="sm" onClick={onOpen} actionLabel={`カード「${it.name}」を見る（${it.owner.name}）`} />
      <span className="plaza__by">
        <span className="u-name">{it.owner.name}</span>・{plazaDate(it.updatedAt)}
      </span>
      {removeButton}
    </li>
  );
}

const EMPTY_SUMMARY = (it: PublicItemView): DeckSummary => ({
  total: it.count,
  best: it.cover ?? undefined,
  gems: Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>,
  curve: [],
});

export function PlazaDeckItem({ it, onOpen, removeButton }: { it: PublicItemView; onOpen: (full?: PublicItemFull) => void; removeButton?: ReactNode }) {
  const ref = useRef<HTMLLIElement>(null);
  const full = useDeckFull(it, ref);
  const loaded = full && full !== 'missing' ? full : undefined;
  const s = loaded?.deck ? deckSummary(loaded.deck, loaded.cards ?? []) : EMPTY_SUMMARY(it);
  const note = loaded ? mainCardsText(loaded) : full === 'missing' ? '取り下げられました' : '中身を読み込んでいます…';
  const name = it.name || '（名前なし）';
  return (
    <li ref={ref} className="dbox plaza__item plaza__item--deck">
      <button type="button" className="dbox__open" onClick={() => onOpen(loaded)} aria-label={`デッキ「${name}」を見る（${it.count}枚・${it.owner.name}）`} />
      <DeckBoxFace s={s} name={name} count={it.count} note={note} ng={false} />
      <span className="plaza__by">
        <span className="u-name">{it.owner.name}</span>・{plazaDate(it.updatedAt)}
      </span>
      {removeButton}
    </li>
  );
}
