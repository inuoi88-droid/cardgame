/** 対戦の準備：自分のデッキと CPU のデッキを選んで開始 */
import { useMemo, useState } from 'react';
import { analyzeDeck } from '../../engine/index.ts';
import { PRESET_DECKS } from '../../presets.ts';
import { loadSession, startSession, type BattleSession } from '../battle/session.ts';
import { navigate } from '../router.ts';
import { useStore } from '../store.ts';
import { cx } from '../util.ts';

interface DeckChoice {
  key: string;
  label: string;
  note: string;
  valid: boolean;
  setup: () => Pick<BattleSession['setup'], 'myDeck' | 'myCards' | 'myDeckName'>;
}

export function BattleSetupPage() {
  const { cards, decks } = useStore();
  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const existing = useMemo(() => loadSession(), []);
  const [mine, setMine] = useState<string>('');
  const [cpu, setCpu] = useState<string>('random');
  const [error, setError] = useState<string | null>(null);

  const myChoices: DeckChoice[] = [
    ...decks.map((d) => {
      const a = analyzeDeck(d, cardsById);
      return {
        key: `deck:${d.id}`,
        label: d.name || '（名前なし）',
        note: a.valid ? `${a.total}枚` : `使えません：${a.violations[0]?.message ?? ''}`,
        valid: a.valid,
        setup: () => ({
          myDeck: d,
          myCards: d.entries.map((e) => cardsById.get(e.cardId)).filter((c) => c !== undefined),
          myDeckName: d.name,
        }),
      };
    }),
    ...PRESET_DECKS.map((p) => ({
      key: `preset:${p.id}`,
      label: `${p.name}（プリセット）`,
      note: p.description,
      valid: true,
      setup: () => ({ myDeck: p.deck, myCards: p.cards, myDeckName: p.name }),
    })),
  ];
  const selected = myChoices.find((c) => c.key === mine) ?? myChoices.find((c) => c.valid);

  const start = () => {
    if (!selected?.valid) return;
    const preset = cpu === 'random' ? PRESET_DECKS[Math.floor(Math.random() * PRESET_DECKS.length)]! : PRESET_DECKS.find((p) => p.id === cpu)!;
    const r = startSession({ ...selected.setup(), cpuDeck: preset.deck, cpuCards: preset.cards, cpuDeckName: preset.name });
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
        <div className="choice-list">
          {myChoices.map((c) => (
            <label key={c.key} className={cx('choice', !c.valid && 'is-disabled', selected?.key === c.key && 'is-active')}>
              <input type="radio" name="mine" disabled={!c.valid} checked={selected?.key === c.key} onChange={() => setMine(c.key)} />
              <span>
                <b>{c.label}</b>
                <small className={c.valid ? '' : 'text-ng'}>{c.note}</small>
              </span>
            </label>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>CPU のデッキ</h2>
        <div className="choice-list">
          {[{ id: 'random', name: 'ランダム', description: '3つのプリセットからランダムに選ぶ' }, ...PRESET_DECKS].map((p) => (
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
