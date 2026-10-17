/** CPU 戦。状態は手元で持ち、CPU の手番は1手ずつ間を置いて進める */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ai, battle } from '../../engine/index.ts';
import { BattleBoard } from '../battle/BattleBoard.tsx';
import { CPU, HUMAN, clearSession, loadSession, saveSession, startSession, type BattleSession } from '../battle/session.ts';
import { navigate } from '../router.ts';

/** CPU の1手ごとの間（ミリ秒） */
const CPU_DELAY = 650;

export function BattlePage() {
  const [session, setSession] = useState<BattleSession | null>(() => loadSession());
  if (!session) {
    return (
      <div className="panel">
        <p>進行中の対戦はありません。</p>
        <button type="button" className="btn btn--primary" onClick={() => navigate('/battle')}>
          対戦の準備へ
        </button>
      </div>
    );
  }
  return <CpuBattle session={session} setSession={setSession} />;
}

function CpuBattle({ session, setSession }: { session: BattleSession; setSession: (s: BattleSession | null) => void }) {
  const state = session.state;
  const view = useMemo(() => battle.viewFor(state, HUMAN), [state]);
  const [error, setError] = useState<string | null>(null);

  const commit = useCallback(
    (next: battle.GameState) => {
      const s = { ...session, state: next };
      saveSession(s);
      setSession(s);
    },
    [session, setSession],
  );

  const onAction = (action: battle.Action) => {
    const r = battle.applyAction(state, action);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    commit(r.state);
  };

  // CPU の手番：1手ずつ間を置いて進める
  useEffect(() => {
    if (!ai.cpuShouldAct(state, CPU)) return;
    const t = setTimeout(
      () => {
        const action = ai.cpuAction(state, CPU, state.log.length + state.turnIndex * 7919);
        const r = battle.applyAction(state, action);
        if (r.ok) commit(r.state);
      },
      state.phase === 'mulligan' ? 300 : CPU_DELAY,
    );
    return () => clearTimeout(t);
  }, [state, commit]);

  return (
    <BattleBoard
      view={view}
      me={HUMAN}
      onAction={onAction}
      error={error}
      opponentLabel="CPU"
      resultButtons={
        <>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              const r = startSession(session.setup);
              if (r.ok) setSession(r.session);
            }}
          >
            同じデッキでもう一度
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              clearSession();
              setSession(null);
              navigate('/battle');
            }}
          >
            対戦の準備に戻る
          </button>
        </>
      }
    />
  );
}
