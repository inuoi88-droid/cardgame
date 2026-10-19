/** 対戦の準備：自分のデッキと CPU のデッキを選んで開始 */
import { useMemo, useState } from 'react';
import { PRESET_DECKS } from '../../presets.ts';
import { DeckPicker } from '../battle/DeckPicker.tsx';
import { pickChoice, useDeckChoices } from '../battle/deckChoices.ts';
import { loadSession, startSession } from '../battle/session.ts';
import { navigate } from '../router.ts';
import { cx } from '../util.ts';

export function BattleSetupPage() {
  const myChoices = useDeckChoices();
  const existing = useMemo(() => loadSession(), []);
  const [mine, setMine] = useState<string>('');
  const [cpu, setCpu] = useState<string>('random');
  const [error, setError] = useState<string | null>(null);

  const selected = pickChoice(myChoices, mine);

  const start = () => {
    if (!selected?.valid) return;
    const preset = cpu === 'random' ? PRESET_DECKS[Math.floor(Math.random() * PRESET_DECKS.length)]! : PRESET_DECKS.find((p) => p.id === cpu)!;
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

  return (
    <>
      <div className="page-head">
        <h1>CPU と対戦</h1>
      </div>
      {existing && existing.state.phase !== 'ended' && (
        <div className="notice">
          対戦の途中です（{existing.setup.myDeckName} 対 {existing.setup.cpuDeckName}）。
          <button type="button" className="btn btn--small btn--primary" onClick={() => navigate('/battle/play')}>
            続きから再開
          </button>
        </div>
      )}
      <section className="panel">
        <h2>あなたのデッキ</h2>
        <DeckPicker choices={myChoices} selected={selected} onSelect={setMine} />
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
      </section>
      {error && <div className="notice notice--ng">{error}</div>}
      <div className="btn-row">
        <button type="button" className="btn btn--primary btn--big" disabled={!selected?.valid} onClick={start}>
          対戦開始（先攻・後攻はランダム）
        </button>
      </div>
    </>
  );
}
