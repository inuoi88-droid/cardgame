/**
 * ドラフト戦（MTG 要素 △ バッチD：#119 リミテッドのアレンジ。CPU 戦だけ）。
 * カードの山から3枚ずつ見せられて1枚を選ぶのを15回くり返し（1回で2枚ずつ入る）、30枚のデッキを作って CPU と戦う。
 * 選び方の判断は battle/draft.ts（純粋な関数）。乱数は UI の Math.random（エンジンの外）
 */
import { useMemo, useState } from 'react';
import { ai, BALANCE, uniqueName, type CardDef } from '../../engine/index.ts';
import { PRESET_DECKS } from '../../presets.ts';
import { CardDetail } from '../components/CardDetail.tsx';
import { CardArtOf } from '../components/CardArt.tsx';
import { CardView } from '../components/CardView.tsx';
import { useConfirm } from '../components/ConfirmDialog.tsx';
import { CostCurve } from '../components/CostCurve.tsx';
import { useToast } from '../components/Toast.tsx';
import { addPick, cardsOf, countTotal, deckFromCounts, draftPool, makeOffer, runCpuDraft, type DraftCounts } from '../battle/draft.ts';
import { loadSession, startSession } from '../battle/session.ts';
import { summarizeCard } from '../battle/summary.ts';
import '../battle/battle.css';
import { navigate } from '../router.ts';
import { actions, useStore } from '../store.ts';
import { cx, uuid } from '../util.ts';

const D = BALANCE.draft;

interface Draft {
  round: number;
  counts: DraftCounts;
  offer: CardDef[];
}

export function DraftPage() {
  const { cards, decks } = useStore();
  const confirm = useConfirm();
  const toast = useToast();
  const pool = useMemo(() => draftPool([...cards, ...PRESET_DECKS.flatMap((p) => p.cards)]), [cards]);
  const [level, setLevel] = useState<ai.CpuLevel>('normal');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [zoom, setZoom] = useState<CardDef | null>(null);
  const [saved, setSaved] = useState(false);

  const start = () => {
    setSaved(false);
    setDraft({ round: 1, counts: {}, offer: makeOffer(pool, {}, Math.random) });
  };
  const pick = (def: CardDef) => {
    if (!draft) return;
    const counts = addPick(draft.counts, def);
    const done = draft.round >= D.rounds || countTotal(counts) >= BALANCE.deck.size;
    setDraft({ round: draft.round + 1, counts, offer: done ? [] : makeOffer(pool, counts, Math.random) });
    setZoom(null);
  };
  const finished = draft !== null && (draft.offer.length === 0 || countTotal(draft.counts) >= BALANCE.deck.size);
  const myCards = draft ? cardsOf(draft.counts, pool) : [];
  const deck = draft ? deckFromCounts(draft.counts, `draft-${uuid()}`, 'ドラフトのデッキ') : null;

  const battle = async () => {
    if (!draft || !deck) return;
    const ongoing = loadSession();
    if (
      ongoing &&
      ongoing.state.phase !== 'ended' &&
      !(await confirm({ title: '途中の対戦を破棄しますか？', message: '進行中の CPU 戦は続きから再開できなくなります。', okLabel: '破棄して始める', danger: true }))
    )
      return;
    const cpuCounts = runCpuDraft(pool, Math.random);
    const r = startSession({
      myDeck: deck,
      myCards,
      myDeckName: 'ドラフトのデッキ',
      cpuDeck: deckFromCounts(cpuCounts, 'draft-cpu', 'CPU のドラフト'),
      cpuCards: cardsOf(cpuCounts, pool),
      cpuDeckName: 'ドラフト',
      cpuLevel: level,
    });
    if (!r.ok) {
      toast({ text: r.error, kind: 'ng' });
      return;
    }
    navigate('/battle/play');
  };

  /** デッキとして保存：コレクションに無いカード（プリセットのカード）は、名前が重ならないように写して加える */
  const save = () => {
    if (!draft) return;
    const own = new Set(cards.map((c) => c.id));
    const taken = new Set(cards.map((c) => c.name.trim()));
    const idMap = new Map<string, string>();
    for (const c of myCards) {
      if (own.has(c.id)) continue;
      const id = uuid();
      const name = uniqueName(c.name, taken);
      taken.add(name);
      idMap.set(c.id, id);
      actions.saveCard({ ...c, id, name });
    }
    const entries = Object.entries(draft.counts).map(([cardId, count]) => ({ cardId: idMap.get(cardId) ?? cardId, count }));
    actions.saveDeck({ v: 1, id: uuid(), name: uniqueName('ドラフトのデッキ', new Set(decks.map((d) => d.name.trim()))), entries });
    setSaved(true);
    toast({ text: 'デッキに保存しました（プリセットのカードはカード一覧にも加えました）', kind: 'ok' });
  };

  return (
    <>
      <div className="page-head">
        <h1>ドラフト戦</h1>
        <button type="button" className="btn btn--ghost" onClick={() => navigate('/battle')}>
          CPU 戦の準備へ
        </button>
      </div>
      {!draft && (
        <section className="panel">
          <p>
            カードの山から{D.offer}枚ずつ見せられ、1枚を選ぶのを{D.rounds}回くり返します（1回で{D.copies}枚ずつデッキに入る）。できた{D.rounds * D.copies}
            枚のデッキで、同じ山からドラフトした CPU と戦います。
          </p>
          <p className="hint">
            山はあなたのカードとプリセットのカード（{pool.length}種類。ルール違反・レジェンドは除く）。レアリティの枚数・同名の上限を破るカードは出ません。
          </p>
          <div className="choice-list choice-list--row" role="radiogroup" aria-label="CPU の強さ">
            {ai.CPU_LEVELS.map((l) => (
              <label key={l} className={cx('choice', level === l && 'is-active')}>
                <input type="radio" name="draft-level" checked={level === l} onChange={() => setLevel(l)} />
                <span>
                  <b>CPU：{ai.CPU_LEVEL_LABEL[l]}</b>
                </span>
              </label>
            ))}
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn--primary btn--big" disabled={pool.length < D.offer} onClick={start}>
              ドラフトを始める
            </button>
          </div>
        </section>
      )}
      {draft && !finished && (
        <section className="panel draft">
          <div className="draft__head">
            <h2>
              {draft.round} / {D.rounds} 回目
            </h2>
            <span className="badge">デッキ {countTotal(draft.counts)} / {BALANCE.deck.size}枚</span>
          </div>
          <p className="hint">1枚選ぶと{D.copies}枚入ります。カードを押すと大きく見られます。</p>
          <div className="draft__offer">
            {draft.offer.map((c) => (
              <div key={c.id} className="draft__cand">
                <CardView card={c} size="sm" onClick={() => setZoom(c)} actionLabel={`${c.name}を大きく見る`} />
                <p className="draft__sum">{summarizeCard(c, 28)}</p>
                <button type="button" className="btn btn--primary" onClick={() => pick(c)}>
                  これを選ぶ
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      {draft && (
        <section className="panel">
          <h2>{finished ? 'デッキができました' : 'いまのデッキ'}</h2>
          {deck && countTotal(draft.counts) > 0 && <CostCurve deck={deck} cards={myCards} />}
          <div className="setup__cards draft__picked">
            {myCards.map((c) => (
              <button key={c.id} type="button" className="setup__card" onClick={() => setZoom(c)} aria-label={`${c.name}（${draft.counts[c.id]}枚）を詳しく見る`}>
                <CardArtOf card={c} size="1.6em" />
                {c.name}
                <b>×{draft.counts[c.id]}</b>
              </button>
            ))}
          </div>
          {finished && (
            <div className="btn-row">
              <button type="button" className="btn btn--primary btn--big" onClick={() => void battle()}>
                対戦へ
              </button>
              <button type="button" className="btn" disabled={saved} onClick={save}>
                {saved ? '保存しました' : 'デッキとして保存'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={start}>
                もう一度ドラフト
              </button>
            </div>
          )}
        </section>
      )}
      {zoom && (
        <CardDetail
          card={zoom}
          onClose={() => setZoom(null)}
          actions={
            draft && !finished && draft.offer.some((c) => c.id === zoom.id) ? (
              <button type="button" className="btn btn--primary" onClick={() => pick(zoom)}>
                これを選ぶ（{D.copies}枚入る）
              </button>
            ) : undefined
          }
        />
      )}
    </>
  );
}
