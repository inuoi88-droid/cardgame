/** 対戦の準備：自分のデッキと CPU のデッキを選んで開始。選んだデッキの中身（種類・コストの内訳とカード）を見せ、前回の選択を覚える */
import { useMemo, useState } from 'react';
import type { CardDef } from '../../engine/index.ts';
import { PRESET_DECKS } from '../../presets.ts';
import { CardView } from '../components/CardView.tsx';
import { useConfirm } from '../components/ConfirmDialog.tsx';
import { Modal } from '../components/controls.tsx';
import { DeckPicker } from '../battle/DeckPicker.tsx';
import { pickChoice, useDeckChoices } from '../battle/deckChoices.ts';
import { clearSession, loadSession, loadSetupPrefs, saveSetupPrefs, startSession } from '../battle/session.ts';
import { breakdownDeck } from '../battle/summary.ts';
import '../battle/battle.css';
import { navigate } from '../router.ts';
import { cx } from '../util.ts';
import type { Deck } from '../../engine/index.ts';

/** デッキの中身：種類・コストの内訳と、カード（タップで全文） */
function DeckContents({ deck, cards, onCard }: { deck: Deck; cards: CardDef[]; onCard: (def: CardDef) => void }) {
  const b = useMemo(() => breakdownDeck(deck, cards), [deck, cards]);
  return (
    <div className="setup__deck">
      <h3>デッキの中身（{b.total}枚）</h3>
      <div className="setup__counts">
        {b.byType.map((t) => (
          <span key={t.label} className="badge">
            {t.label} {t.count}
          </span>
        ))}
        {b.byCost.map((c) => (
          <span key={c.cost} className="badge badge--sm">
            コスト{c.cost}：{c.count}
          </span>
        ))}
      </div>
      <div className="setup__cards">
        {b.cards.map(({ def, count }) => (
          <button key={def.id} type="button" className="setup__card" onClick={() => onCard(def)} aria-label={`${def.name}（${count}枚）を詳しく見る`}>
            <span aria-hidden="true">{def.icon}</span>
            {def.name}
            <b>×{count}</b>
          </button>
        ))}
      </div>
    </div>
  );
}

export function BattleSetupPage() {
  const myChoices = useDeckChoices();
  const confirm = useConfirm();
  const [existing, setExisting] = useState(() => loadSession());
  const prefs = useMemo(() => loadSetupPrefs(), []);
  const [mine, setMine] = useState<string>(prefs?.mine ?? '');
  const [cpu, setCpu] = useState<string>(prefs && (prefs.cpu === 'random' || PRESET_DECKS.some((p) => p.id === prefs.cpu)) ? prefs.cpu : 'random');
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<CardDef | null>(null);

  const selected = pickChoice(myChoices, mine);
  const cpuPreset = PRESET_DECKS.find((p) => p.id === cpu);
  const ongoing = existing && existing.state.phase !== 'ended' ? existing : null;

  const start = async () => {
    if (!selected?.valid) return;
    if (ongoing) {
      const ok = await confirm({
        title: '途中の対戦を破棄しますか？',
        message: `${ongoing.setup.myDeckName} 対 ${ongoing.setup.cpuDeckName} の対戦は続きから再開できなくなります。`,
        okLabel: '破棄して始める',
        danger: true,
      });
      if (!ok) return;
    }
    const preset = cpu === 'random' ? PRESET_DECKS[Math.floor(Math.random() * PRESET_DECKS.length)]! : PRESET_DECKS.find((p) => p.id === cpu)!;
    saveSetupPrefs({ mine: selected.key, cpu });
    const r = startSession({
      myDeck: selected.deck,
      myCards: selected.cards,
      myDeckName: selected.name,
      cpuDeck: preset.deck,
      cpuCards: preset.cards,
      cpuDeckName: preset.name,
    });
    if (!r.ok) {
      setError(r.error);
      return;
    }
    navigate('/battle/play');
  };

  const discard = async () => {
    if (!ongoing) return;
    const ok = await confirm({ title: '途中の対戦を破棄しますか？', message: '続きから再開できなくなります。', okLabel: '破棄する', danger: true });
    if (!ok) return;
    clearSession();
    setExisting(null);
  };

  const hasOwnDeck = myChoices.some((c) => c.key.startsWith('deck:'));

  return (
    <>
      <div className="page-head">
        <h1>CPU と対戦</h1>
      </div>
      {ongoing && (
        <div className="notice setup__row">
          <span>
            対戦の途中です（{ongoing.setup.myDeckName} 対 {ongoing.setup.cpuDeckName}・あなたの{ongoing.state.players[0].turnsTaken}ターン目）
          </span>
          <button type="button" className="btn btn--primary" onClick={() => navigate('/battle/play')}>
            続きから再開
          </button>
          <button type="button" className="btn btn--danger" onClick={() => void discard()}>
            途中の対戦を破棄
          </button>
        </div>
      )}
      <section className="panel">
        <h2>あなたのデッキ</h2>
        {!hasOwnDeck && (
          <p className="hint">
            自分のデッキはまだありません。プリセットで遊べます。
            <button type="button" className="btn btn--ghost" onClick={() => navigate('/decks')}>
              デッキを作る
            </button>
          </p>
        )}
        <DeckPicker
          choices={myChoices}
          selected={selected}
          onSelect={(k) => {
            setMine(k);
            setError(null);
          }}
        />
        {selected && <DeckContents deck={selected.deck} cards={selected.cards} onCard={setZoom} />}
      </section>
      <section className="panel">
        <h2>CPU のデッキ</h2>
        <div className="choice-list">
          {[{ id: 'random', name: 'ランダム', description: `${PRESET_DECKS.length}つのプリセットからランダムに選ぶ` }, ...PRESET_DECKS].map((p) => (
            <label key={p.id} className={cx('choice', cpu === p.id && 'is-active')}>
              <input type="radio" name="cpu" checked={cpu === p.id} onChange={() => setCpu(p.id)} />
              <span>
                <b>{p.name}</b>
                <small>{p.description}</small>
              </span>
            </label>
          ))}
        </div>
        {cpuPreset && <DeckContents deck={cpuPreset.deck} cards={cpuPreset.cards} onCard={setZoom} />}
        <div className="setup__cpu">
          {/* TODO(coordinator): CPU の強さの選択を ai の Strategy につなぐ。今は1種類なので表示だけ */}
          <button type="button" className="chip" disabled aria-disabled="true" title="強さの選択は準備中です">
            強さ：ふつう
          </button>
          <small className="hint">強さの選択は準備中です</small>
        </div>
      </section>
      {error && <div className="notice notice--ng">{error}</div>}
      <div className="btn-row">
        <button type="button" className="btn btn--primary btn--big" disabled={!selected?.valid} onClick={() => void start()}>
          対戦開始（先攻・後攻はランダム）
        </button>
      </div>
      {zoom && (
        <Modal title={zoom.name} onClose={() => setZoom(null)} size="sm">
          <div className="preview-modal">
            <CardView card={zoom} />
          </div>
        </Modal>
      )}
    </>
  );
}
