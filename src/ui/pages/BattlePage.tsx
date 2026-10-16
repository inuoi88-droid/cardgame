/** 対戦画面（CPU 戦）。表示は viewFor() で相手の非公開情報を隠した状態から作る */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ai, battle, type CardDef } from '../../engine/index.ts';
import '../battle/battle.css';
import { HandCard, LogPanel, MonsterTile, PlayerPanel } from '../battle/parts.tsx';
import { CPU, HUMAN, clearSession, loadSession, saveSession, startSession, type BattleSession } from '../battle/session.ts';
import { CardView } from '../components/CardView.tsx';
import { Modal } from '../components/controls.tsx';
import { navigate } from '../router.ts';
import { cx } from '../util.ts';

type GameState = battle.GameState;
type TargetRef = battle.TargetRef;

type Selection = null | { kind: 'card'; uid: string; enemy?: TargetRef; ally?: string } | { kind: 'attacker'; uid: string };

const sameRef = (a: TargetRef, b: TargetRef) =>
  a.kind === 'player' ? b.kind === 'player' && a.player === b.player : b.kind === 'monster' && a.uid === b.uid;

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
  return <Battle session={session} setSession={setSession} />;
}

function Battle({ session, setSession }: { session: BattleSession; setSession: (s: BattleSession | null) => void }) {
  const state = session.state;
  const view = useMemo(() => battle.viewFor(state, HUMAN), [state]);
  const [sel, setSel] = useState<Selection>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ def: CardDef; monster?: battle.Monster } | null>(null);
  const [pile, setPile] = useState<{ player: battle.PlayerId; kind: 'discard' | 'exile' } | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [resultHidden, setResultHidden] = useState(false);

  const commit = useCallback(
    (next: GameState) => {
      const s = { ...session, state: next };
      saveSession(s);
      setSession(s);
    },
    [session, setSession],
  );

  const apply = (action: battle.Action) => {
    const r = battle.applyAction(state, action);
    if (!r.ok) {
      setToast(r.error);
      return;
    }
    setSel(null);
    setToast(null);
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

  const me = view.players[HUMAN];
  const opp = view.players[CPU];
  const myTurn = view.phase === 'main' && view.active === HUMAN && !view.pending;

  // 選択中のカード・攻撃モンスターの情報
  const selCard = sel?.kind === 'card' ? me.hand.find((c) => c.uid === sel.uid) : undefined;
  const info = selCard ? battle.playInfo(view, HUMAN, selCard) : null;
  const needEnemy = sel?.kind === 'card' && info && info.enemyTargets.length > 0 && !sel.enemy;
  const needAlly = sel?.kind === 'card' && info && info.allyTargets.length > 0 && !sel.ally;
  const attacker = sel?.kind === 'attacker' ? battle.findMonster(view, sel.uid) : undefined;
  const attackTargets = attacker ? battle.attackTargets(view, attacker) : [];

  const isTarget = (t: TargetRef): boolean => {
    if (needEnemy && info!.enemyTargets.some((x) => sameRef(x, t))) return true;
    if (!needEnemy && needAlly && t.kind === 'monster' && info!.allyTargets.includes(t.uid)) return true;
    if (attacker && attackTargets.some((x) => sameRef(x, t))) return true;
    return false;
  };

  const tryPlay = (next: Extract<Selection, { kind: 'card' }>) => {
    const card = me.hand.find((c) => c.uid === next.uid)!;
    const i = battle.playInfo(view, HUMAN, card);
    const ready = (i.enemyTargets.length === 0 || next.enemy) && (i.allyTargets.length === 0 || next.ally);
    if (ready) {
      apply({ type: 'playCard', player: HUMAN, cardUid: next.uid, chosen: { ...(next.enemy ? { enemy: next.enemy } : {}), ...(next.ally ? { ally: next.ally } : {}) } });
    } else {
      setSel(next);
    }
  };

  const onTarget = (t: TargetRef) => {
    if (sel?.kind === 'card' && isTarget(t)) {
      if (needEnemy) tryPlay({ ...sel, enemy: t });
      else if (t.kind === 'monster') tryPlay({ ...sel, ally: t.uid });
      return true;
    }
    if (sel?.kind === 'attacker' && isTarget(t)) {
      apply({ type: 'attack', player: HUMAN, attackerUid: sel.uid, target: t });
      return true;
    }
    return false;
  };

  const onMonster = (m: battle.Monster) => {
    const t: TargetRef = { kind: 'monster', uid: m.uid };
    if (onTarget(t)) return;
    if (m.controller === HUMAN && myTurn && !battle.attackBlockReason(view, m)) {
      setSel(sel?.kind === 'attacker' && sel.uid === m.uid ? null : { kind: 'attacker', uid: m.uid });
      return;
    }
    const def = view.cards[m.card.cardId];
    if (def) setDetail({ def, monster: m });
    if (m.controller === HUMAN && myTurn) setToast(battle.attackBlockReason(view, m));
  };

  const onHand = (card: battle.CardInst) => {
    if (sel?.kind === 'card' && sel.uid === card.uid) {
      setSel(null);
      return;
    }
    setToast(null);
    if (!myTurn) {
      const def = view.cards[card.cardId];
      if (def) setDetail({ def });
      return;
    }
    setSel({ kind: 'card', uid: card.uid });
  };

  const hint = (() => {
    if (view.phase === 'mulligan') return me.mulligan.done ? 'CPU が手札を決めています…' : '最初の手札を決めてください';
    if (view.phase === 'ended') return '対戦終了';
    if (view.pending) return view.pending.player === HUMAN ? '選んでください' : 'CPU が選んでいます…';
    if (view.active !== HUMAN) return 'CPU の番です…';
    if (attacker) return `「${view.cards[attacker.card.cardId]?.name}」の攻撃先を選んでください（光っているもの）`;
    if (selCard) {
      if (selCard.cardId === battle.NOISE_CARD_ID) return 'ノイズ：エナジー1で除外できます';
      if (info?.blocked) return info.blocked;
      if (needEnemy) return '対象を選んでください（光っている相手側）';
      if (needAlly) return '自分のモンスターを選んでください（光っているもの）';
    }
    return 'カードを使うか、モンスターで攻撃してください';
  })();

  const selDef = selCard ? view.cards[selCard.cardId] : undefined;

  return (
    <div className="battle">
      <div className="battle__main">
        <div className="battle__head">
          <span>
            {view.turnIndex > 0 ? `通算${view.turnIndex}ターン目・` : ''}
            {view.phase === 'main' ? (view.active === HUMAN ? 'あなたの番' : 'CPU の番') : view.phase === 'mulligan' ? 'マリガン' : '終了'}
          </span>
          <span className="btn-row">
            <button type="button" className="btn btn--small battle__logbtn" onClick={() => setLogOpen(true)}>
              ログ
            </button>
            <button
              type="button"
              className="btn btn--small"
              onClick={() => {
                if (view.phase !== 'ended' && !confirm('降参しますか？')) return;
                if (view.phase !== 'ended') apply({ type: 'concede', player: HUMAN });
              }}
              disabled={view.phase === 'ended'}
            >
              降参
            </button>
          </span>
        </div>

        <PlayerPanel
          ps={opp}
          isMe={false}
          active={view.active === CPU && view.phase === 'main'}
          targetable={isTarget({ kind: 'player', player: CPU })}
          onClick={() => onTarget({ kind: 'player', player: CPU })}
          onPile={(kind) => setPile({ player: CPU, kind })}
        />
        <div className="board board--opp">
          {opp.board.length === 0 && <span className="board__empty">（相手の場にモンスターはいません）</span>}
          {opp.board.map((m) => (
            <MonsterTile
              key={m.uid}
              m={m}
              def={view.cards[m.card.cardId]}
              ready={false}
              selected={false}
              targetable={isTarget({ kind: 'monster', uid: m.uid })}
              flags={battle.keywordFlags(view, m)}
              onClick={() => onMonster(m)}
            />
          ))}
        </div>
        <div className="board board--me">
          {me.board.length === 0 && <span className="board__empty">（あなたの場にモンスターはいません）</span>}
          {me.board.map((m) => (
            <MonsterTile
              key={m.uid}
              m={m}
              def={view.cards[m.card.cardId]}
              ready={myTurn && !battle.attackBlockReason(view, m)}
              selected={sel?.kind === 'attacker' && sel.uid === m.uid}
              targetable={isTarget({ kind: 'monster', uid: m.uid })}
              flags={battle.keywordFlags(view, m)}
              onClick={() => onMonster(m)}
            />
          ))}
        </div>
        <PlayerPanel
          ps={me}
          isMe
          active={view.active === HUMAN && view.phase === 'main'}
          targetable={false}
          onClick={() => undefined}
          onPile={(kind) => setPile({ player: HUMAN, kind })}
        />
        <div className="hand">
          {me.hand.map((c) => {
            const i = battle.playInfo(view, HUMAN, c);
            return (
              <HandCard
                key={c.uid}
                card={c}
                def={view.cards[c.cardId]}
                cost={i.cost}
                playable={myTurn && (c.cardId === battle.NOISE_CARD_ID ? me.energy >= i.cost : !i.blocked)}
                selected={sel?.kind === 'card' && sel.uid === c.uid}
                onClick={() => onHand(c)}
              />
            );
          })}
          {me.hand.length === 0 && <span className="board__empty">（手札なし）</span>}
        </div>
      </div>

      <aside className="battle__log">
        <h2>ログ</h2>
        <LogPanel log={view.log} me={HUMAN} />
      </aside>

      <div className="battle-bar">
        <div className="battle-bar__hint">
          {toast ? <span className="text-ng">{toast}</span> : hint}
          {selDef && sel?.kind === 'card' && (
            <span className="battle-bar__sel">
              「{selDef.name}」コスト{info?.cost}
            </span>
          )}
        </div>
        <div className="btn-row">
          {selCard && selCard.cardId === battle.NOISE_CARD_ID && myTurn && (
            <button type="button" className="btn btn--primary" onClick={() => apply({ type: 'removeNoise', player: HUMAN, cardUid: selCard.uid })}>
              ノイズを除外
            </button>
          )}
          {selCard && selDef && info && !info.blocked && info.enemyTargets.length === 0 && info.allyTargets.length === 0 && (
            <button type="button" className="btn btn--primary" onClick={() => tryPlay({ kind: 'card', uid: selCard.uid })}>
              使う
            </button>
          )}
          {selCard && needAlly && !needEnemy && info?.allyTargets.includes(selCard.uid) && (
            <button type="button" className="btn btn--primary" onClick={() => tryPlay({ ...(sel as Extract<Selection, { kind: 'card' }>), ally: selCard.uid })}>
              このモンスター自身
            </button>
          )}
          {selDef && (
            <button type="button" className="btn" onClick={() => setDetail({ def: selDef })}>
              詳細
            </button>
          )}
          {sel && (
            <button type="button" className="btn" onClick={() => setSel(null)}>
              やめる
            </button>
          )}
          {view.phase === 'ended' ? (
            <button type="button" className="btn btn--primary" onClick={() => setResultHidden(false)}>
              結果を見る
            </button>
          ) : (
            <button type="button" className="btn btn--primary" disabled={!myTurn} onClick={() => apply({ type: 'endTurn', player: HUMAN })}>
              ターン終了
            </button>
          )}
        </div>
      </div>

      {view.phase === 'mulligan' && !me.mulligan.done && <MulliganDialog view={view} onAction={apply} />}
      {view.pending && view.pending.player === HUMAN && <ChoiceDialog view={view} onAction={apply} />}
      {view.phase === 'ended' && view.result && !resultHidden && (
        <ResultDialog
          result={view.result}
          onHide={() => setResultHidden(true)}
          onAgain={() => {
            const r = startSession(session.setup);
            if (r.ok) setSession(r.session);
          }}
          onBack={() => {
            clearSession();
            setSession(null);
            navigate('/battle');
          }}
        />
      )}
      {detail && (
        <Modal title={detail.def.name} onClose={() => setDetail(null)}>
          <div className="preview-modal">
            <CardView card={detail.def} />
          </div>
          {detail.monster && (
            <p className="hint" style={{ textAlign: 'center' }}>
              いまの状態：攻撃力{detail.monster.attack}・体力{detail.monster.hp}/{detail.monster.maxHp}・守備力{detail.monster.defense}
              {detail.monster.sealed ? '・封印中' : ''}
            </p>
          )}
        </Modal>
      )}
      {pile && (
        <Modal title={`${view.players[pile.player].name}の${pile.kind === 'discard' ? '捨て札' : '除外'}`} onClose={() => setPile(null)}>
          <ul className="pile-list">
            {view.players[pile.player][pile.kind].map((c) => (
              <li key={c.uid}>
                {view.cards[c.cardId]?.icon ?? '📛'} {battle.cardName(view, c.cardId)}
                {c.copy ? '（コピー）' : ''}
              </li>
            ))}
            {view.players[pile.player][pile.kind].length === 0 && <li className="hint">なし</li>}
          </ul>
        </Modal>
      )}
      {logOpen && (
        <Modal title="ログ" onClose={() => setLogOpen(false)}>
          <LogPanel log={view.log} me={HUMAN} />
        </Modal>
      )}
    </div>
  );
}

function MulliganDialog({ view, onAction }: { view: GameState; onAction: (a: battle.Action) => void }) {
  const me = view.players[HUMAN];
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const nextSize = battle.nextFullMulliganSize(view, HUMAN);
  const toggle = (uid: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(uid)) n.delete(uid);
      else n.add(uid);
      return n;
    });
  return (
    <Modal title="最初の手札（マリガン）" onClose={() => undefined} closable={false}>
      <p className="hint">
        {view.first === HUMAN ? 'あなたが先攻です。' : 'あなたは後攻です。'}
        全部引き直すと1回目は同じ枚数、2回目からは1枚ずつ減ります。選んだカードだけの引き直しは1回だけで、それで手札が決まります。
      </p>
      <div className="mull-grid">
        {me.hand.map((c) => {
          const def = view.cards[c.cardId];
          return (
            <button key={c.uid} type="button" className={cx('mull-card', picked.has(c.uid) && 'is-picked')} onClick={() => toggle(c.uid)}>
              {def ? <CardView card={def} size="sm" /> : 'ノイズ'}
              {picked.has(c.uid) && <span className="mull-card__mark">戻す</span>}
            </button>
          );
        })}
      </div>
      <div className="btn-row modal__foot">
        <button type="button" className="btn btn--primary" onClick={() => onAction({ type: 'mulligan', player: HUMAN, mode: 'keep' })}>
          この手札で始める
        </button>
        <button
          type="button"
          className="btn"
          disabled={picked.size === 0 || picked.size >= me.hand.length}
          onClick={() => onAction({ type: 'mulligan', player: HUMAN, mode: 'partial', cardUids: [...picked] })}
        >
          選んだ{picked.size}枚を引き直す
        </button>
        <button type="button" className="btn" disabled={nextSize < 1} onClick={() => onAction({ type: 'mulligan', player: HUMAN, mode: 'all' })}>
          全部引き直す（{nextSize}枚）
        </button>
      </div>
    </Modal>
  );
}

function ChoiceDialog({ view, onAction }: { view: GameState; onAction: (a: battle.Action) => void }) {
  const p = view.pending!;
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) =>
    setPicked((s) => (s.includes(id) ? s.filter((x) => x !== id) : p.max === 1 ? [id] : s.length < p.max ? [...s, id] : s));
  return (
    <Modal title="選択" onClose={() => undefined} closable={false}>
      <p>{p.prompt}</p>
      <div className="mull-grid">
        {p.options.map((o) => {
          const def = o.cardId ? view.cards[o.cardId] : undefined;
          return (
            <button key={o.id} type="button" className={cx('mull-card', picked.includes(o.id) && 'is-picked')} onClick={() => toggle(o.id)}>
              {def ? <CardView card={def} size="sm" /> : <span className="choice-label">{o.label}</span>}
              {picked.includes(o.id) && <span className="mull-card__mark">選択</span>}
            </button>
          );
        })}
      </div>
      <div className="btn-row modal__foot">
        <button
          type="button"
          className="btn btn--primary"
          disabled={picked.length < p.min || picked.length > p.max}
          onClick={() => onAction({ type: 'choose', player: HUMAN, picks: picked })}
        >
          決定（{picked.length}/{p.max}）
        </button>
      </div>
    </Modal>
  );
}

function ResultDialog({ result, onAgain, onBack, onHide }: { result: battle.GameResult; onAgain: () => void; onBack: () => void; onHide: () => void }) {
  const title = result.winner === null ? '引き分け' : result.winner === HUMAN ? 'あなたの勝ち！' : 'あなたの負け…';
  const why = result.reason === 'turnLimit' ? '30ターンが経過しました' : result.reason === 'concede' ? '降参で決着しました' : 'HPが0になりました';
  return (
    <Modal title={title} onClose={onHide}>
      <p className={cx('result-title', result.winner === HUMAN ? 'text-ok' : result.winner === null ? '' : 'text-ng')}>{title}</p>
      <p className="hint" style={{ textAlign: 'center' }}>
        {why}
      </p>
      <div className="btn-row" style={{ justifyContent: 'center' }}>
        <button type="button" className="btn btn--primary" onClick={onAgain}>
          同じデッキでもう一度
        </button>
        <button type="button" className="btn" onClick={onHide}>
          盤面とログを見る
        </button>
        <button type="button" className="btn" onClick={onBack}>
          対戦の準備に戻る
        </button>
      </div>
    </Modal>
  );
}
