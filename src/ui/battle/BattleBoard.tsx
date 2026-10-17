/**
 * 対戦画面の本体。CPU 戦とオンライン対戦で共用する。
 * 表示は viewFor() で相手の非公開情報を隠した状態（view）から作り、行動は onAction で親に渡す。
 */
import { useEffect, useState, type ReactNode } from 'react';
import { BALANCE, battle, type CardDef } from '../../engine/index.ts';
import { CardView } from '../components/CardView.tsx';
import { Modal } from '../components/controls.tsx';
import { cx } from '../util.ts';
import './battle.css';
import { HandCard, LogPanel, MonsterTile, PlayerPanel } from './parts.tsx';

type GameState = battle.GameState;
type TargetRef = battle.TargetRef;

type Selection = null | { kind: 'card'; uid: string; enemy?: TargetRef; ally?: string } | { kind: 'attacker'; uid: string };

const sameRef = (a: TargetRef, b: TargetRef) =>
  a.kind === 'player' ? b.kind === 'player' && a.player === b.player : b.kind === 'monster' && a.uid === b.uid;

export interface BattleBoardProps {
  /** 自分から見える状態（viewFor の結果） */
  view: GameState;
  me: battle.PlayerId;
  /** 行動を送る（画面側で事前に検証済み） */
  onAction: (a: battle.Action) => void;
  /** 親からのエラー（サーバーに断られたなど） */
  error?: string | null;
  /** 通信中で操作を受け付けない */
  busy?: boolean;
  /** 見出しに出す情報（残り時間、相手の接続状態など） */
  status?: ReactNode;
  /** 相手の呼び方（「CPU」「相手」など） */
  opponentLabel: string;
  /** 結果ダイアログに出すボタン */
  resultButtons: ReactNode;
}

export function BattleBoard({ view, me, onAction, error, busy = false, status, opponentLabel, resultButtons }: BattleBoardProps) {
  const opp = battle.other(me);
  const [sel, setSel] = useState<Selection>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ def: CardDef; monster?: battle.Monster } | null>(null);
  const [pile, setPile] = useState<{ player: battle.PlayerId; kind: 'discard' | 'exile' } | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [resultHidden, setResultHidden] = useState(false);

  // 状態が進んだら選択を解く
  useEffect(() => {
    setSel(null);
    setToast(null);
  }, [view.log.length, view.turnIndex, view.phase]);

  useEffect(() => {
    if (error) setToast(error);
  }, [error]);

  const act = (action: battle.Action) => {
    if (busy) return;
    const reason = battle.validateAction(view, action);
    if (reason) {
      setToast(reason);
      return;
    }
    setSel(null);
    setToast(null);
    onAction(action);
  };

  const mine = view.players[me];
  const theirs = view.players[opp];
  const myTurn = view.phase === 'main' && view.active === me && !view.pending && !busy;

  // 選択中のカード・攻撃モンスターの情報
  const selCard = sel?.kind === 'card' ? mine.hand.find((c) => c.uid === sel.uid) : undefined;
  const info = selCard ? battle.playInfo(view, me, selCard) : null;
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
    const card = mine.hand.find((c) => c.uid === next.uid)!;
    const i = battle.playInfo(view, me, card);
    const ready = (i.enemyTargets.length === 0 || next.enemy) && (i.allyTargets.length === 0 || next.ally);
    if (ready) {
      act({ type: 'playCard', player: me, cardUid: next.uid, chosen: { ...(next.enemy ? { enemy: next.enemy } : {}), ...(next.ally ? { ally: next.ally } : {}) } });
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
      act({ type: 'attack', player: me, attackerUid: sel.uid, target: t });
      return true;
    }
    return false;
  };

  const onMonster = (m: battle.Monster) => {
    const t: TargetRef = { kind: 'monster', uid: m.uid };
    if (onTarget(t)) return;
    if (m.controller === me && myTurn && !battle.attackBlockReason(view, m)) {
      setSel(sel?.kind === 'attacker' && sel.uid === m.uid ? null : { kind: 'attacker', uid: m.uid });
      return;
    }
    const def = view.cards[m.card.cardId];
    if (def) setDetail({ def, monster: m });
    if (m.controller === me && myTurn) setToast(battle.attackBlockReason(view, m));
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
    if (view.phase === 'mulligan') return mine.mulligan.done ? `${opponentLabel}が手札を決めています…` : '最初の手札を決めてください';
    if (view.phase === 'ended') return '対戦終了';
    if (view.pending) return view.pending.player === me ? '選んでください' : `${opponentLabel}が選んでいます…`;
    if (view.active !== me) return `${opponentLabel}の番です…`;
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
          <span className="battle__turn">
            {view.turnIndex > 0 ? `通算${view.turnIndex}ターン目・` : ''}
            {view.phase === 'main' ? (view.active === me ? 'あなたの番' : `${opponentLabel}の番`) : view.phase === 'mulligan' ? 'マリガン' : '終了'}
          </span>
          {status}
          <span className="btn-row">
            <button type="button" className="btn btn--small battle__logbtn" onClick={() => setLogOpen(true)}>
              ログ
            </button>
            <button
              type="button"
              className="btn btn--small"
              onClick={() => {
                if (view.phase !== 'ended' && !confirm('降参しますか？')) return;
                if (view.phase !== 'ended') act({ type: 'concede', player: me });
              }}
              disabled={view.phase === 'ended'}
            >
              降参
            </button>
          </span>
        </div>

        <PlayerPanel
          ps={theirs}
          isMe={false}
          active={view.active === opp && view.phase === 'main'}
          targetable={isTarget({ kind: 'player', player: opp })}
          onClick={() => onTarget({ kind: 'player', player: opp })}
          onPile={(kind) => setPile({ player: opp, kind })}
        />
        <div className="board board--opp">
          {theirs.board.length === 0 && <span className="board__empty">（相手の場にモンスターはいません）</span>}
          {theirs.board.map((m) => (
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
          {mine.board.length === 0 && <span className="board__empty">（あなたの場にモンスターはいません）</span>}
          {mine.board.map((m) => (
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
          ps={mine}
          isMe
          active={view.active === me && view.phase === 'main'}
          targetable={false}
          onClick={() => undefined}
          onPile={(kind) => setPile({ player: me, kind })}
        />
        <div className="hand">
          {mine.hand.map((c) => {
            const i = battle.playInfo(view, me, c);
            return (
              <HandCard
                key={c.uid}
                card={c}
                def={view.cards[c.cardId]}
                cost={i.cost}
                playable={myTurn && (c.cardId === battle.NOISE_CARD_ID ? mine.energy >= i.cost : !i.blocked)}
                selected={sel?.kind === 'card' && sel.uid === c.uid}
                onClick={() => onHand(c)}
              />
            );
          })}
          {mine.hand.length === 0 && <span className="board__empty">（手札なし）</span>}
        </div>
      </div>

      <aside className="battle__log">
        <h2>ログ</h2>
        <LogPanel log={view.log} me={me} />
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
            <button type="button" className="btn btn--primary" onClick={() => act({ type: 'removeNoise', player: me, cardUid: selCard.uid })}>
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
            <button type="button" className="btn btn--primary" disabled={!myTurn} onClick={() => act({ type: 'endTurn', player: me })}>
              ターン終了
            </button>
          )}
        </div>
      </div>

      {view.phase === 'mulligan' && !mine.mulligan.done && !busy && <MulliganDialog view={view} me={me} onAction={act} />}
      {view.pending && view.pending.player === me && !busy && <ChoiceDialog view={view} me={me} onAction={act} />}
      {view.phase === 'ended' && view.result && !resultHidden && (
        <ResultDialog result={view.result} me={me} onHide={() => setResultHidden(true)}>
          {resultButtons}
        </ResultDialog>
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
          <LogPanel log={view.log} me={me} />
        </Modal>
      )}
    </div>
  );
}

function MulliganDialog({ view, me, onAction }: { view: GameState; me: battle.PlayerId; onAction: (a: battle.Action) => void }) {
  const mine = view.players[me];
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const nextSize = battle.nextFullMulliganSize(view, me);
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
        {view.first === me ? 'あなたが先攻です。' : 'あなたは後攻です。'}
        全部引き直すと1回目は同じ枚数、2回目からは1枚ずつ減ります。選んだカードだけの引き直しは1回だけで、それで手札が決まります。
      </p>
      <div className="mull-grid">
        {mine.hand.map((c) => {
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
        <button type="button" className="btn btn--primary" onClick={() => onAction({ type: 'mulligan', player: me, mode: 'keep' })}>
          この手札で始める
        </button>
        <button
          type="button"
          className="btn"
          disabled={picked.size === 0 || picked.size >= mine.hand.length}
          onClick={() => onAction({ type: 'mulligan', player: me, mode: 'partial', cardUids: [...picked] })}
        >
          選んだ{picked.size}枚を引き直す
        </button>
        <button type="button" className="btn" disabled={nextSize < 1} onClick={() => onAction({ type: 'mulligan', player: me, mode: 'all' })}>
          全部引き直す（{nextSize}枚）
        </button>
      </div>
    </Modal>
  );
}

function ChoiceDialog({ view, me, onAction }: { view: GameState; me: battle.PlayerId; onAction: (a: battle.Action) => void }) {
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
          onClick={() => onAction({ type: 'choose', player: me, picks: picked })}
        >
          決定（{picked.length}/{p.max}）
        </button>
      </div>
    </Modal>
  );
}

function ResultDialog({ result, me, onHide, children }: { result: battle.GameResult; me: battle.PlayerId; onHide: () => void; children: ReactNode }) {
  const title = result.winner === null ? '引き分け' : result.winner === me ? 'あなたの勝ち！' : 'あなたの負け…';
  const why =
    result.reason === 'turnLimit'
      ? `両者が${BALANCE.battle.maxTurns}ターンを終えました`
      : result.reason === 'timeout'
        ? `${result.winner === me ? '相手が' : ''}${BALANCE.online.timeoutLoseCount}回続けて時間切れになりました`
        : result.reason === 'concede'
          ? '降参で決着しました'
          : 'HPが0になりました';
  return (
    <Modal title={title} onClose={onHide}>
      <p className={cx('result-title', result.winner === me ? 'text-ok' : result.winner === null ? '' : 'text-ng')}>{title}</p>
      <p className="hint" style={{ textAlign: 'center' }}>
        {why}
      </p>
      <div className="btn-row" style={{ justifyContent: 'center' }}>
        {children}
        <button type="button" className="btn" onClick={onHide}>
          盤面とログを見る
        </button>
      </div>
    </Modal>
  );
}
