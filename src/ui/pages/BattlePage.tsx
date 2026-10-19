/**
 * CPU 戦。状態は手元で持つ。
 * CPU の手番は「1手打つ → その演出（イベント再生）を見せ終える → 少し考えて次の手」の順に進める。
 * 演出を飛ばした（タップ・動きを減らす設定）ときは、すぐ次の手に進む。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ai, battle } from '../../engine/index.ts';
import { BattleBoard } from '../battle/BattleBoard.tsx';
import { CPU, HUMAN, clearSession, loadSession, saveSession, sessionLevel, startSession, type BattleSession } from '../battle/session.ts';
import { navigate } from '../router.ts';

/** 演出を見せ終えてから CPU が次の手を打つまでの間（ミリ秒） */
const CPU_THINK = 280;
/** マリガンの決定までの間 */
const CPU_MULLIGAN = 300;

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
  const level = sessionLevel(session);
  const view = useMemo(() => battle.viewFor(state, HUMAN), [state]);
  const [error, setError] = useState<string | null>(null);
  // 演出を見せ終えた状態（これと今の状態が同じなら、CPU は次の手を打ってよい）。開いた直後は見せる演出がない
  const [idleFor, setIdleFor] = useState<battle.GameState>(state);
  const stateRef = useRef(state);
  stateRef.current = state;

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

  const onReplayDone = useCallback(() => setIdleFor(stateRef.current), []);

  // CPU の手番：前の手の演出が終わってから、次の1手を打つ
  useEffect(() => {
    if (idleFor !== state) return;
    if (!ai.cpuShouldAct(state, CPU)) return;
    const t = setTimeout(
      () => {
        const action = ai.cpuAction(state, CPU, state.log.length + state.turnIndex * 7919, level);
        const r = battle.applyAction(state, action);
        if (r.ok) commit(r.state);
      },
      state.phase === 'mulligan' ? CPU_MULLIGAN : CPU_THINK,
    );
    return () => clearTimeout(t);
  }, [state, idleFor, commit, level]);

  const backToSetup = () => {
    clearSession();
    setSession(null);
    navigate('/battle');
  };

  return (
    <BattleBoard
      view={view}
      me={HUMAN}
      onAction={onAction}
      error={error}
      opponentLabel="CPU"
      onReplayDone={onReplayDone}
      menuItems={
        <button type="button" className="btn" onClick={() => navigate('/battle')}>
          ⏸ 中断して準備画面へ（続きから再開できます）
        </button>
      }
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
          <button type="button" className="btn" onClick={backToSetup}>
            対戦の準備に戻る
          </button>
        </>
      }
    />
  );
}
