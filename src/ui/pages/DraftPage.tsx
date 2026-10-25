/**
 * CPU 戦のドラフト（#/battle/draft。決定事項 #119）。
 * 既定は公式カード「黎明の大陸」で、オンラインと同じ「場から交互に取る」形式（表向きの場6枚から CPU と交互に1枚ずつ取り、取るたびに山から補充。
 * 1回で2枚入り、15回ずつで30枚）。できたデッキで、そのまま CPU と戦う（後から取り始めた人が先攻）。
 * 選べるもの：カードの山（公式／あなたのカード＋プリセット）・形式（交互に取る／3枚から1枚（ひとりで）＝今までの形式）・CPU の強さ。
 * ドラフトの判断はエンジン（engine/draft）。乱数のシードだけ UI が Math.random で決める（エンジンの外）。
 * 途中のドラフトは localStorage（cardgame.v1.cpuDraft）に置き、開き直したら続きから（読めなければ最初から）。
 */
import { InviteChip } from '../social/InviteNotices.tsx';
import { useEffect, useMemo, useState } from 'react';
import { ai, BALANCE, draft, uniqueName, type CardDef } from '../../engine/index.ts';
import { PRESET_DECKS } from '../../presets.ts';
import { OFFICIAL_CARDS, OFFICIAL_SET } from '../../official/index.ts';
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
import { DraftBoard } from '../draft/DraftBoard.tsx';
import '../draft/draft.css';
import { navigate } from '../router.ts';
import { UiIcon, type UiIconName } from '../components/UiIcon.tsx';
import { actions, getState, useStore } from '../store.ts';
import { cx, uuid } from '../util.ts';
import { MedalGroup } from '../battle/Medal.tsx';
import { CPU_PIPS, CPU_PORTRAIT } from '../battle/portraits.ts';

const D = BALANCE.draft;
const ME: 0 = 0;
const CPU: 1 = 1;
/** CPU が1枚取るまでの間（ミリ秒。考えているのが見えるように） */
const CPU_PICK_MS = 750;
/** おまかせで自分の分を取るまでの間 */
const AUTO_PICK_MS = 450;
const STORE_KEY = 'cardgame.v1.cpuDraft';

/** ドラフトの山：公式カード（既定）か、あなたのカード＋プリセットのカード */
type PoolKind = 'official' | 'own';
/** 形式：場から交互に取る（既定）か、3枚から1枚をひとりで */
type Format = 'field' | 'solo';

const POOL_CHOICES: { id: PoolKind; label: string; note: string; gi: UiIconName }[] = [
  { id: 'official', label: `公式カード「${OFFICIAL_SET.name}」`, note: 'オンラインのドラフト戦と同じ約120種類（レジェンドなし）', gi: 'book-cover' },
  { id: 'own', label: 'あなたのカード＋プリセット', note: 'カード置き場のカードとプリセットデッキのカード（ルール違反・レジェンドは除く）', gi: 'card-play' },
];
const FORMAT_CHOICES: { id: Format; label: string; note: string; gi: UiIconName }[] = [
  {
    id: 'field',
    label: '交互に取る',
    note: `表向きの場${D.field}枚から CPU と交互に1枚ずつ。取るたびに山から1枚補充（オンラインと同じ）`,
    gi: 'card-pick',
  },
  { id: 'solo', label: `${D.offer}枚から1枚（ひとりで）`, note: `${D.offer}枚ずつ見せられて1枚選ぶのを${D.rounds}回。CPU は別に同じ山から選ぶ`, gi: 'card-draw' },
];

/** 保存する途中のドラフト（場から交互に取る形式） */
interface SavedDraft {
  v: 1;
  state: draft.DraftState;
  level: ai.CpuLevel;
  pool: PoolKind;
  /** CPU のばらつきのシード */
  seed: number;
  /** 自分の分をおまかせで取る */
  auto: boolean;
}

function loadSaved(): SavedDraft | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SavedDraft;
    if (!s || s.v !== 1 || !s.state || s.state.v !== 1 || !Array.isArray(s.state.field) || !ai.isCpuLevel(s.level)) return null;
    return { ...s, pool: s.pool === 'own' ? 'own' : 'official', auto: s.auto === true, seed: typeof s.seed === 'number' ? s.seed : 0 };
  } catch {
    return null;
  }
}
function storeSaved(s: SavedDraft | null): void {
  try {
    if (s) localStorage.setItem(STORE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORE_KEY);
  } catch {
    // 保存できなくても、このページを開いている間は続けられる
  }
}

export function DraftPage() {
  const { cards } = useStore();
  const confirm = useConfirm();
  const [poolKind, setPoolKind] = useState<PoolKind>('official');
  const [format, setFormat] = useState<Format>('field');
  const [level, setLevel] = useState<ai.CpuLevel>('normal');
  const pool = useMemo(() => draftPool(poolKind === 'official' ? OFFICIAL_CARDS : [...cards, ...PRESET_DECKS.flatMap((p) => p.cards)]), [cards, poolKind]);
  const [field, setField] = useState<SavedDraft | null>(() => loadSaved());
  const [solo, setSolo] = useState<{ pool: CardDef[]; level: ai.CpuLevel } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startField = () => {
    const seed = Math.floor(Math.random() * 2 ** 31);
    const r = draft.createDraft({ seed, pool });
    if (!r.ok) {
      setError(`${r.error}。「${FORMAT_CHOICES[1]!.label}」か公式カードで遊んでください。`);
      return;
    }
    const s: SavedDraft = { v: 1, state: r.value, level, pool: poolKind, seed: Math.floor(Math.random() * 2 ** 31), auto: false };
    storeSaved(s);
    setField(s);
    setError(null);
    window.scrollTo(0, 0);
  };

  const start = () => {
    if (format === 'field') startField();
    else {
      setSolo({ pool, level });
      setError(null);
    }
  };

  const quit = async () => {
    if (!(await confirm({ title: 'ドラフトをやめますか？', message: 'ここまで取ったカードは消えます。', okLabel: 'やめる', danger: true }))) return;
    storeSaved(null);
    setField(null);
  };

  if (field) return <FieldDraft saved={field} onChange={(s) => (storeSaved(s), setField(s))} onQuit={() => void quit()} onAgain={() => (storeSaved(null), setField(null))} />;
  if (solo) return <SoloDraft pool={solo.pool} level={solo.level} onExit={() => setSolo(null)} />;

  const minPool = format === 'field' ? 1 : D.offer;
  return (
    <>
      <div className="page-head">
        <h1>ドラフト戦</h1>
        <button type="button" className="btn btn--ghost" onClick={() => navigate('/battle')}>
          <UiIcon name="crossed-swords" />
          CPU 戦の準備へ
        </button>
      </div>
      <section className="panel dsetup">
        <p>
          {format === 'field'
            ? `表向きの場にいつも${D.field}枚。CPU と交互に1枚ずつ取り、取るたびに伏せた山から1枚補充されます。1回で${D.copies}枚ずつデッキに入り、${D.takes}回ずつで${D.takes * D.copies}枚のデッキが完成。そのデッキで CPU と戦います（後から取り始めた人が先攻）。`
            : `カードの山から${D.offer}枚ずつ見せられ、1枚を選ぶのを${D.rounds}回くり返します（1回で${D.copies}枚ずつ入る）。できた${D.rounds * D.copies}枚のデッキで、同じ山からドラフトした CPU と戦います。`}
        </p>
        <div>
          <div className="setup__sechead">
            <h2>カードの山</h2>
            <a className="dlink" href="#/official">
              <UiIcon name="book-cover" />
              公式カードを見る
            </a>
          </div>
          <Choices name="draft-pool" options={POOL_CHOICES} value={poolKind} onChange={setPoolKind} />
          <p className="hint">
            {pool.length}種類。デッキのルール（レアリティの枚数・同名の上限）を破るカードは取れません。
          </p>
        </div>
        <div>
          <h2>形式</h2>
          <Choices name="draft-format" options={FORMAT_CHOICES} value={format} onChange={setFormat} />
        </div>
        <div>
          <h2>CPU の強さ</h2>
          <MedalGroup label="CPU の強さ" name="draft-level" value={level} onChange={setLevel} options={ai.CPU_LEVELS.map((l) => ({ id: l, label: ai.CPU_LEVEL_LABEL[l], gi: CPU_PORTRAIT[l], pips: CPU_PIPS[l] }))} />
        </div>
      </section>
      {error && <div className="notice notice--ng">{error}</div>}
      <div className="setup__startbar">
        <span className="setup__sum">
          <b>{POOL_CHOICES.find((c) => c.id === poolKind)!.label}</b>
          <br />
          {FORMAT_CHOICES.find((c) => c.id === format)!.label}・強さ {ai.CPU_LEVEL_LABEL[level]}
        </span>
        <button type="button" className="btn btn--primary btn--big" disabled={pool.length < minPool} onClick={start}>
          ドラフトを始める
        </button>
      </div>
    </>
  );
}

/** 選択肢の札（ラジオ。サファイアの縁で選んだものが分かる） */
function Choices<T extends string>({ name, options, value, onChange }: { name: string; options: { id: T; label: string; note: string; gi: UiIconName }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="dsetup__choices" role="radiogroup">
      {options.map((c) => (
        <label key={c.id} className="dchoice">
          <input type="radio" name={name} checked={value === c.id} onChange={() => onChange(c.id)} />
          <UiIcon name={c.gi} />
          <b>{c.label}</b>
          <small>{c.note}</small>
        </label>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- 場から交互に取る（CPU と）

function FieldDraft({ saved, onChange, onQuit, onAgain }: { saved: SavedDraft; onChange: (s: SavedDraft) => void; onQuit: () => void; onAgain: () => void }) {
  const { state, level, auto } = saved;
  const toast = useToast();
  const confirm = useConfirm();
  const view = useMemo(() => draft.draftView(state, ME), [state]);
  const turn = draft.draftTurn(state);
  const [saving, setSaving] = useState(false);

  // CPU の番（と、おまかせの自分の番）は少し待ってから取る
  useEffect(() => {
    if (turn === null) return;
    if (turn === ME && !auto) return;
    const t = setTimeout(
      () => {
        const id = draft.autoPick(state, turn, turn === CPU ? level : 'normal', saved.seed);
        if (!id) return;
        const r = draft.applyTake(state, turn, id);
        if (r.ok) onChange({ ...saved, state: r.state });
      },
      turn === CPU ? CPU_PICK_MS : AUTO_PICK_MS,
    );
    return () => clearTimeout(t);
  }, [state, turn, auto, level, saved, onChange]);

  const take = (cardId: string) => {
    const r = draft.applyTake(state, ME, cardId);
    if (!r.ok) {
      toast({ text: r.error, kind: 'ng' });
      return;
    }
    onChange({ ...saved, state: r.state });
  };

  const decks = useMemo(() => draft.draftDecks(state, ['ドラフトのデッキ', 'CPU のドラフト']), [state]);

  const battle = async () => {
    const ongoing = loadSession();
    if (
      ongoing &&
      ongoing.state.phase !== 'ended' &&
      !(await confirm({ title: '途中の対戦を破棄しますか？', message: '進行中の CPU 戦は続きから再開できなくなります。', okLabel: '破棄して始める', danger: true }))
    )
      return;
    const r = startSession({
      myDeck: decks[ME].deck,
      myCards: decks[ME].cards,
      myDeckName: 'ドラフトのデッキ',
      cpuDeck: decks[CPU].deck,
      cpuCards: decks[CPU].cards,
      cpuDeckName: 'ドラフト',
      cpuLevel: level,
      draft: true,
      first: draft.battleFirstAfterDraft(state),
    });
    if (!r.ok) {
      toast({ text: r.error, kind: 'ng' });
      return;
    }
    navigate('/battle/play');
  };

  const save = () => {
    setSaving(true);
    saveDraftDeck(draft.draftCounts(state, ME), decks[ME].cards, toast);
  };

  const first = draft.battleFirstAfterDraft(state);
  return (
    <>
      <div className="page-head">
        <h1>ドラフト戦</h1>
        {!view.done && (
          <button type="button" className="btn btn--ghost" onClick={onQuit}>
            <UiIcon name="exit-door" />
            やめる
          </button>
        )}
      </div>
      <DraftBoard
        view={view}
        me={ME}
        names={['あなた', 'CPU']}
        oppGi={CPU_PORTRAIT[level]}
        thinking={turn === CPU}
        status={<InviteChip />}
        onTake={take}
        onAuto={(on) => onChange({ ...saved, auto: on })}
        doneNote={
          <>
            対戦では{first === ME ? 'あなた' : 'CPU'}が先攻です（後から取り始めた人が先攻）。CPU の強さ {ai.CPU_LEVEL_LABEL[level]}。
          </>
        }
        doneActions={
          <>
            <button type="button" className="btn" disabled={saving} onClick={save}>
              {saving ? '保存しました' : 'デッキとして保存'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={onAgain}>
              もう一度ドラフト
            </button>
            <button type="button" className="btn btn--primary btn--big" onClick={() => void battle()}>
              対戦へ
            </button>
          </>
        }
      />
    </>
  );
}

/** デッキとして保存：コレクションに無いカード（公式・プリセットのカード）は、名前が重ならないように写して加える */
function saveDraftDeck(counts: DraftCounts, used: readonly CardDef[], toast: ReturnType<typeof useToast>) {
  const { cards, decks } = getState();
  const own = new Set(cards.map((c) => c.id));
  const taken = new Set(cards.map((c) => c.name.trim()));
  const idMap = new Map<string, string>();
  for (const c of used) {
    if (own.has(c.id)) continue;
    const id = uuid();
    const name = uniqueName(c.name, taken);
    taken.add(name);
    idMap.set(c.id, id);
    actions.saveCard({ ...c, id, name });
  }
  const entries = Object.entries(counts).map(([cardId, count]) => ({ cardId: idMap.get(cardId) ?? cardId, count }));
  actions.saveDeck({ v: 1, id: uuid(), name: uniqueName('ドラフトのデッキ', new Set(decks.map((d) => d.name.trim()))), entries });
  toast({ text: idMap.size > 0 ? 'デッキに保存しました（使ったカードはカード置き場にも加えました）' : 'デッキに保存しました', kind: 'ok' });
}

// ---------------------------------------------------------------- 3枚から1枚（ひとりで。今までの形式）

interface Solo {
  round: number;
  counts: DraftCounts;
  offer: CardDef[];
}

function SoloDraft({ pool, level, onExit }: { pool: CardDef[]; level: ai.CpuLevel; onExit: () => void }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [d, setD] = useState<Solo>(() => ({ round: 1, counts: {}, offer: makeOffer(pool, {}, Math.random) }));
  const [zoom, setZoom] = useState<CardDef | null>(null);
  const [saved, setSaved] = useState(false);

  const restart = () => {
    setSaved(false);
    setD({ round: 1, counts: {}, offer: makeOffer(pool, {}, Math.random) });
  };
  const pick = (def: CardDef) => {
    const counts = addPick(d.counts, def);
    const done = d.round >= D.rounds || countTotal(counts) >= BALANCE.deck.size;
    setD({ round: d.round + 1, counts, offer: done ? [] : makeOffer(pool, counts, Math.random) });
    setZoom(null);
  };
  const finished = d.offer.length === 0 || countTotal(d.counts) >= BALANCE.deck.size;
  const myCards = cardsOf(d.counts, pool);
  const deck = deckFromCounts(d.counts, `draft-${d.round}`, 'ドラフトのデッキ');

  const battle = async () => {
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

  return (
    <>
      <div className="page-head">
        <h1>ドラフト戦</h1>
        <button type="button" className="btn btn--ghost" onClick={onExit}>
          <UiIcon name="exit-door" />
          準備に戻る
        </button>
      </div>
      {!finished && (
        <section className="panel draft">
          <div className="draft__head">
            <h2>
              {d.round} / {D.rounds} 回目
            </h2>
            <span className="badge">
              デッキ {countTotal(d.counts)} / {BALANCE.deck.size}枚
            </span>
          </div>
          <p className="hint">1枚選ぶと{D.copies}枚入ります。カードを押すと大きく見られます。</p>
          <div className="draft__offer">
            {d.offer.map((c) => (
              <div key={c.id} className="draft__cand">
                <CardView card={c} size="sm" onClick={() => setZoom(c)} actionLabel={`${c.name}を大きく見る`} />
                <p className="draft__sum">{summarizeCard(c, 28)}</p>
                {/* 1画面に3つ出るので金にしない（サファイアの縁の小さな主ボタン。UI2） */}
                <button type="button" className="btn btn--primary btn--small" onClick={() => pick(c)}>
                  これを選ぶ
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="panel">
        <h2>{finished ? 'デッキができました' : 'いまのデッキ'}</h2>
        {countTotal(d.counts) > 0 && <CostCurve deck={deck} cards={myCards} />}
        <div className="setup__cards draft__picked">
          {myCards.map((c) => (
            <button key={c.id} type="button" className="setup__card" onClick={() => setZoom(c)} aria-label={`${c.name}（${d.counts[c.id]}枚）を詳しく見る`}>
              <CardArtOf card={c} size="1.6em" />
              {c.name}
              <b>×{d.counts[c.id]}</b>
            </button>
          ))}
        </div>
        {finished && (
          <div className="btn-row">
            <button type="button" className="btn btn--primary btn--big" onClick={() => void battle()}>
              対戦へ
            </button>
            <button
              type="button"
              className={cx('btn')}
              disabled={saved}
              onClick={() => {
                saveDraftDeck(d.counts, myCards, toast);
                setSaved(true);
              }}
            >
              {saved ? '保存しました' : 'デッキとして保存'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={restart}>
              もう一度ドラフト
            </button>
          </div>
        )}
      </section>
      {zoom && (
        <CardDetail
          card={zoom}
          onClose={() => setZoom(null)}
          actions={
            !finished && d.offer.some((c) => c.id === zoom.id) ? (
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
