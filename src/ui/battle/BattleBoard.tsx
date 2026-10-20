/**
 * 対戦画面の本体。CPU 戦とオンライン対戦で共用する。
 * - 表示は viewFor() で相手の非公開情報を隠した状態（view）から作り、行動は onAction で親に渡す
 * - 画面は 100dvh の固定レイアウト（ページはスクロールしない。場だけ内部スクロール）
 * - 相手の行動は useReplay（イベント再生層）が順に演出する。どこかをタップすると残りを一気に反映する
 * - 操作はドラッグ＆ドロップ（useDrag・dragLogic）：手札のカードを場（対象のあるカードは光る対象）へ、
 *   攻撃できるモンスターを相手へ。タップ（クリック）はどのカードでも詳細を開く。
 *   詳細の「使う」「攻撃する」からは、候補ボタンで対象を選ぶ（キーボード・ドラッグしにくいとき用）
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { battle, getEffect, type CardDef } from '../../engine/index.ts';
import { CardView } from '../components/CardView.tsx';
import { useConfirm } from '../components/ConfirmDialog.tsx';
import { Modal } from '../components/controls.tsx';
import { useIsPhone, useMediaQuery } from '../components/dialogUtil.ts';
import { Sheet } from '../components/Sheet.tsx';
import { useToast } from '../components/Toast.tsx';
import { navigate } from '../router.ts';
import { cx } from '../util.ts';
import './battle.css';
import { CardDetailBody, CardDetailSheet, NoiseDetailBody } from './CardDetail.tsx';
import { CardRow, ChoiceDialog, MulliganDialog, ResultDialog, ZoomModal } from './dialogs.tsx';
import { DragLayer } from './DragLayer.tsx';
import { resolveDrop, parseSpot, targetKey, type DragSource } from './dragLogic.ts';
import { keyOf } from './events.ts';
import { logNamesOf } from './logFormat.ts';
import { HandCard, LogPanel, LogText, MonsterTile, PlayerPanel } from './parts.tsx';
import { useBattleDrag, type DropResult } from './useDrag.ts';
import { useReplay } from './useReplay.ts';

type GameState = battle.GameState;
type TargetRef = battle.TargetRef;

type Selection = null | { kind: 'card'; uid: string; enemy?: TargetRef; ally?: string } | { kind: 'attacker'; uid: string };

/** 詳細を開いているもの */
type Detail =
  | { kind: 'hand'; uid: string }
  | { kind: 'monster'; uid: string }
  | { kind: 'card'; cardId: string }
  | { kind: 'power'; player: battle.PlayerId; uid: string };

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
  /** マリガン・選択ダイアログの中に出す残り時間（オンライン） */
  timeLeft?: ReactNode;
  /** 新しい状態の演出を再生し終えたとき（演出がなければすぐ）。CPU 戦が次の手を打つ合図に使う */
  onReplayDone?: () => void;
  /** メニュー（⋯）に足す項目（「対戦の準備に戻る」など） */
  menuItems?: ReactNode;
}

/** 攻撃できない理由を、タイルに出す短い言葉にする */
function shortBlock(reason: string | null): string | null {
  if (!reason) return null;
  if (reason.includes('場に出たターン')) return '次のターンから';
  if (reason.includes('もう攻撃')) return '攻撃済み';
  if (reason.includes('凍結')) return '凍結中';
  if (reason.includes('混乱')) return '混乱中';
  if (reason.includes('裏切')) return '裏切り';
  return null;
}

export function BattleBoard({ view, me, onAction, error, busy = false, status, opponentLabel, resultButtons, timeLeft, onReplayDone, menuItems }: BattleBoardProps) {
  const opp = battle.other(me);
  const confirm = useConfirm();
  const toast = useToast();
  const phone = useIsPhone(919);
  const canHover = useMediaQuery('(hover: hover) and (pointer: fine)');
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [sel, setSel] = useState<Selection>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [pile, setPile] = useState<{ player: battle.PlayerId; kind: 'discard' | 'exile' } | null>(null);
  const [zoom, setZoom] = useState<CardDef | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [resultHidden, setResultHidden] = useState(false);
  // 結果ダイアログは演出が終わって少し待ってから出す（演出を飛ばしたタップで閉じてしまわないように）
  const [resultReady, setResultReady] = useState(false);
  const [hover, setHover] = useState<{ el: HTMLElement; def: CardDef } | null>(null);
  const skipEndConfirm = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const replay = useReplay(view, me, onReplayDone);
  const ended = view.phase === 'ended' && !!view.result;
  useEffect(() => {
    if (!ended || replay.playing) {
      setResultReady(false);
      return;
    }
    const t = setTimeout(() => setResultReady(true), 450);
    return () => clearTimeout(t);
  }, [ended, replay.playing]);

  // 新しい対戦が始まったら、ターン終了の確認の設定を戻す
  useEffect(() => {
    if (view.phase === 'mulligan') skipEndConfirm.current = false;
  }, [view.phase]);

  useEffect(() => {
    if (error) toast({ text: error, kind: 'ng' });
  }, [error, toast]);

  const act = useCallback(
    (action: battle.Action) => {
      if (busy) return;
      const reason = battle.validateAction(view, action);
      if (reason) {
        toast({ text: reason, kind: 'ng' });
        return;
      }
      setSel(null);
      onAction(action);
    },
    [busy, view, onAction, toast],
  );

  const mine = view.players[me];
  const theirs = view.players[opp];
  const myTurn = view.phase === 'main' && view.active === me && !view.pending && !busy;
  const infos = useMemo(() => new Map(mine.hand.map((c) => [c.uid, battle.playInfo(view, me, c)])), [view, me, mine.hand]);
  const isPlayable = (c: battle.CardInst) => {
    const i = infos.get(c.uid)!;
    return myTurn && (c.cardId === battle.NOISE_CARD_ID ? mine.energy >= i.cost : !i.blocked);
  };
  const playableCount = mine.hand.filter(isPlayable).length;
  const readyAttackers = myTurn ? mine.board.filter((m) => !battle.attackBlockReason(view, m)) : [];
  const nothingLeft = myTurn && playableCount === 0 && readyAttackers.length === 0;
  const names = useMemo(() => logNamesOf(view), [view]);

  // ---------------------------------------------------------------- 対象選択（詳細の「使う」・ドラッグで足りない選択）
  const selCard = sel?.kind === 'card' ? mine.hand.find((c) => c.uid === sel.uid) : undefined;
  const info = selCard ? infos.get(selCard.uid)! : null;
  const selDef = selCard ? view.cards[selCard.cardId] : undefined;
  const needEnemy = sel?.kind === 'card' && info && info.enemyTargets.length > 0 && !sel.enemy;
  const needAlly = sel?.kind === 'card' && info && info.allyTargets.length > 0 && !sel.ally;
  const attacker = sel?.kind === 'attacker' ? battle.findMonster(view, sel.uid) : undefined;
  const attackTargets = attacker ? battle.attackTargets(view, attacker) : [];

  /** 今選べる対象の一覧（バーの候補ボタンにも使う） */
  const candidates: TargetRef[] = needEnemy
    ? info!.enemyTargets
    : needAlly
      ? info!.allyTargets.filter((u) => u !== selCard?.uid).map((uid): TargetRef => ({ kind: 'monster', uid }))
      : attacker
        ? attackTargets
        : [];

  // 対象選択に入ったら最初の候補を見えるところへ
  const selKey = sel ? `${sel.kind}:${sel.uid}:${needEnemy ? 'e' : needAlly ? 'a' : ''}` : '';
  useEffect(() => {
    if (!selKey || candidates.length === 0) return;
    const first = candidates[0]!;
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-fx="${first.kind === 'player' ? (first.player === me ? 'me' : 'opp') : first.uid}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey]);

  // 対象選択中は Esc でやめる
  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel]);

  const confirmWarnings = async (i: battle.PlayInfo, def: CardDef): Promise<boolean> => {
    if (i.warnings.length === 0) return true;
    const capOnly = i.warnings.every((w) => battle.isPowerCapWarning(w));
    return confirm({
      title: capOnly ? `「${def.name}」を使うと古いパワーが消えます` : `「${def.name}」は発動しない効果があります`,
      message: (
        <>
          <ul className="warn-list">
            {i.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <p>{capOnly ? '使いますか？' : '発動しない効果はエナジーを払うだけになります。使いますか？'}</p>
        </>
      ),
      okLabel: 'それでも使う',
      cancelLabel: 'やめる',
    });
  };

  const tryPlay = async (next: Extract<Selection, { kind: 'card' }>) => {
    const card = mine.hand.find((c) => c.uid === next.uid);
    if (!card) return;
    const i = infos.get(card.uid)!;
    const ready = (i.enemyTargets.length === 0 || next.enemy) && (i.allyTargets.length === 0 || next.ally);
    if (!ready) {
      setSel(next);
      return;
    }
    const def = view.cards[card.cardId];
    if (def && !(await confirmWarnings(i, def))) {
      setSel(null);
      return;
    }
    act({ type: 'playCard', player: me, cardUid: next.uid, chosen: { ...(next.enemy ? { enemy: next.enemy } : {}), ...(next.ally ? { ally: next.ally } : {}) } });
  };

  const onTarget = (t: TargetRef) => {
    if (!candidates.some((x) => sameRef(x, t))) return false;
    if (sel?.kind === 'card') {
      if (needEnemy) void tryPlay({ ...sel, enemy: t });
      else if (t.kind === 'monster') void tryPlay({ ...sel, ally: t.uid });
      return true;
    }
    if (sel?.kind === 'attacker') {
      act({ type: 'attack', player: me, attackerUid: sel.uid, target: t });
      return true;
    }
    return false;
  };

  // ---------------------------------------------------------------- ドラッグ＆ドロップ
  const cardSource = (c: battle.CardInst): DragSource => {
    const i = infos.get(c.uid)!;
    const noise = c.cardId === battle.NOISE_CARD_ID;
    let blocked = i.blocked;
    if (!myTurn) blocked = view.phase === 'main' && view.active !== me ? `${opponentLabel}のターンです` : '今は使えません';
    else if (noise && mine.energy < i.cost) blocked = `エナジーが足りません（必要${i.cost}・残り${mine.energy}）`;
    else if (blocked === 'エナジーが足りません') blocked = `エナジーが足りません（必要${i.cost}・残り${mine.energy}）`;
    return { kind: 'card', uid: c.uid, noise, blocked, enemyTargets: i.enemyTargets, allyTargets: i.allyTargets };
  };
  const attackerSource = (m: battle.Monster): DragSource => ({
    kind: 'attacker',
    uid: m.uid,
    blocked: myTurn ? battle.attackBlockReason(view, m) : view.active !== me ? `${opponentLabel}のターンです` : '今は攻撃できません',
    targets: myTurn ? battle.attackTargets(view, m) : [],
  });

  /** 攻撃できない相手に落としたときの理由 */
  const attackMiss = (t: TargetRef): string => {
    if (t.kind === 'player') {
      if (t.player === me) return '自分は攻撃できません';
      return battle.targetableTaunts(view, opp).length ? '挑発のモンスターがいるので、先にそちらを攻撃します' : 'プレイヤーは攻撃できません';
    }
    const m = battle.findMonster(view, t.uid);
    if (!m) return 'そこは攻撃できません';
    if (m.controller === me) return '自分のモンスターは攻撃できません';
    if (m.stealth) return '隠密中のモンスターは攻撃できません';
    if (battle.targetableTaunts(view, opp).length) return '挑発のモンスターがいるので、先にそちらを攻撃します';
    return 'そのモンスターは攻撃できません';
  };

  const onDrop = (src: DragSource, key: string | null): DropResult => {
    const d = resolveDrop(src, parseSpot(key));
    const back = (text: string) => {
      toast({ text, kind: 'ng', duration: 2600 });
      return 'back' as const;
    };
    switch (d.t) {
      case 'cancel':
        return 'back';
      case 'invalid': {
        if (src.kind === 'attacker' && d.attempt?.target) return back(attackMiss(d.attempt.target));
        if (src.kind === 'card' && d.attempt?.enemy) {
          const i = infos.get(src.uid);
          if (i?.tauntLimited) return back(battle.NOTE_TAUNT_LIMITED);
          const t = d.attempt.enemy;
          const m = t.kind === 'monster' ? battle.findMonster(view, t.uid) : undefined;
          if (m && m.controller !== me) {
            if (m.stealth) return back('隠密中のモンスターは対象に選べません');
            if (battle.keywordFlags(view, m).hexproof) return back('呪禁のモンスターは、カードの対象に選べません');
          }
          if (t.kind === 'player' && t.player === opp && i && !i.enemyTargets.some((x) => x.kind === 'player')) return back('このカードはモンスターしか選べません');
        }
        return back(d.reason);
      }
      case 'noise':
        act({ type: 'removeNoise', player: me, cardUid: src.uid });
        return 'ok';
      case 'attack':
        act({ type: 'attack', player: me, attackerUid: src.uid, target: d.target });
        return 'ok';
      case 'play':
        void tryPlay({ kind: 'card', uid: src.uid, ...d.chosen });
        return 'ok';
      case 'need':
        setSel({ kind: 'card', uid: src.uid, ...d.chosen });
        return 'ok';
    }
  };

  const drag = useBattleDrag({ rootRef, onDrop, zoneSelector: '.battle__board', reduceMotion });
  const dragging = drag.drag?.phase === 'drag' ? drag.drag : null;
  const dragTargets = useMemo(() => new Set(dragging ? dragging.plan.targets.map(targetKey) : []), [dragging]);
  /** 光らせる対象か（ドラッグ中はドラッグの候補、対象選択中はその候補） */
  const isLit = (t: TargetRef): boolean => (dragging ? dragTargets.has(targetKey(t)) : candidates.some((x) => sameRef(x, t)));
  const isHover = (t: TargetRef): boolean => !!dragging && dragging.hover === targetKey(t) && dragTargets.has(dragging.hover);

  // 状態が進んだら選択とドラッグを解く
  useEffect(() => {
    setSel(null);
    setHover(null);
    drag.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.log.length, view.turnIndex, view.phase]);

  // ---------------------------------------------------------------- タップ（詳細）
  const onMonsterTap = (m: battle.Monster) => {
    if (drag.consumeClick()) return;
    if (sel && onTarget({ kind: 'monster', uid: m.uid })) return;
    setDetail({ kind: 'monster', uid: m.uid });
  };

  const onHandTap = (card: battle.CardInst) => {
    if (drag.consumeClick()) return;
    setSel(null);
    setDetail({ kind: 'hand', uid: card.uid });
  };

  const endTurn = async () => {
    const left = [playableCount > 0 ? `使えるカードが${playableCount}枚` : '', readyAttackers.length > 0 ? `攻撃できるモンスターが${readyAttackers.length}体` : ''].filter(Boolean);
    if (left.length > 0 && !skipEndConfirm.current) {
      let dontAsk = false;
      const ok = await confirm({
        title: 'ターンを終了しますか？',
        message: (
          <>
            <p>{left.join('、')}残っています（エナジー {mine.energy}）。</p>
            <label className="check">
              <input type="checkbox" onChange={(e) => (dontAsk = e.target.checked)} />
              この対戦ではもう確認しない
            </label>
          </>
        ),
        okLabel: 'ターン終了',
        cancelLabel: '戻る',
      });
      if (!ok) return;
      if (dontAsk) skipEndConfirm.current = true;
    }
    act({ type: 'endTurn', player: me });
  };

  const concede = async () => {
    setMenuOpen(false);
    if (view.phase === 'ended') return;
    const ok = await confirm({ title: '降参しますか？', message: 'この対戦はあなたの負けになります。', okLabel: '降参する', danger: true });
    if (ok) act({ type: 'concede', player: me });
  };

  const hint = (() => {
    if (busy) return '送信中…';
    if (view.phase === 'mulligan') return mine.mulligan.done ? `${opponentLabel}が手札を決めています…` : '最初の手札を決めてください';
    if (view.phase === 'ended') return '対戦は終了しました';
    if (view.pending) return view.pending.player === me ? '選んでください' : `${opponentLabel}が選んでいます…`;
    if (view.active !== me) return `${opponentLabel}のターンです…`;
    if (attacker) return `「${view.cards[attacker.card.cardId]?.name}」の攻撃先を選んでください`;
    if (selCard) {
      if (info?.blocked) return info.blocked;
      const fight = selDef?.effects.some((e) => getEffect(e.id)?.targetRule === 'fight') ?? false;
      if (needEnemy) return `「${selDef?.name}」の${fight ? '戦わせる相手モンスター' : '対象'}を選んでください${info?.tauntLimited ? `（${battle.NOTE_TAUNT_LIMITED}）` : ''}`;
      if (needAlly) return `「${selDef?.name}」${fight ? 'で戦わせる' : 'をかける'}自分のモンスターを選んでください`;
      return `「${selDef?.name}」を使いますか？`;
    }
    if (nothingLeft) return 'できることはもうありません。ターンを終了しましょう';
    return phone ? 'カードを上へドラッグで使用・タップで詳細' : 'カードを場へドラッグして使う・モンスターを相手へドラッグして攻撃（クリックで詳細）';
  })();

  const turnLabel =
    view.phase === 'mulligan'
      ? 'マリガン'
      : view.phase === 'ended'
        ? '対戦終了'
        : view.active === me
          ? `あなたの${mine.turnsTaken}ターン目`
          : `${opponentLabel}の${theirs.turnsTaken}ターン目`;
  // 見出しの札は「選択待ち」のときだけ（誰の番かは見出しの文言とパネルの光で分かる）
  const phaseLabel = view.phase === 'main' && view.pending ? (view.pending.player === me ? 'あなたが選択中' : '相手が選択中') : null;

  const targetLabel = (t: TargetRef): string => {
    if (t.kind === 'player') return t.player === me ? 'あなた' : `相手プレイヤー ❤${theirs.hp}`;
    const m = battle.findMonster(view, t.uid);
    const def = m ? view.cards[m.card.cardId] : undefined;
    return m ? `${def?.icon ?? ''}${def?.name ?? '？'} ⚔${battle.effectiveAttack(m)} ❤${m.hp}` : '？';
  };

  /** 場の並び：今のモンスターに、消える途中のモンスター（幽霊）を元の位置へ差し込む */
  const boardOf = (p: battle.PlayerId) => {
    const list: { m: battle.Monster; ghost: boolean }[] = view.players[p].board.map((m) => ({ m, ghost: false }));
    for (const g of replay.ghosts.values()) {
      if (g.m.controller !== p) continue;
      list.splice(Math.min(g.index, list.length), 0, { m: g.m, ghost: true });
    }
    return list;
  };

  const renderBoard = (p: battle.PlayerId) => {
    const isMine = p === me;
    const rows = boardOf(p);
    return (
      <div className={cx('board', isMine ? 'board--me' : 'board--opp', rows.length > 3 && 'board--many', rows.length > 6 && 'board--dense')} aria-label={isMine ? 'あなたの場' : '相手の場'}>
        {rows.length === 0 && <span className="board__empty">{isMine ? 'あなたの場：モンスターなし' : '相手の場：モンスターなし'}</span>}
        {rows.map(({ m, ghost }) => {
          const ref: TargetRef = { kind: 'monster', uid: m.uid };
          const ready = isMine && myTurn && !battle.attackBlockReason(view, m);
          return (
            <MonsterTile
              key={m.uid}
              m={m}
              def={view.cards[m.card.cardId]}
              ownerTurns={view.players[m.controller].turnsTaken}
              isMine={isMine}
              ready={ready}
              blockLabel={isMine && myTurn ? shortBlock(battle.attackBlockReason(view, m)) : null}
              selected={sel?.kind === 'attacker' && sel.uid === m.uid}
              targetable={!ghost && isLit(ref)}
              dropHover={!ghost && isHover(ref)}
              dragging={dragging?.src.kind === 'attacker' && dragging.src.uid === m.uid}
              flags={battle.keywordFlags(view, m)}
              onClick={() => (ghost ? undefined : onMonsterTap(m))}
              onDetail={ghost ? undefined : () => setDetail({ kind: 'monster', uid: m.uid })}
              onPointerDown={
                isMine && !ghost && view.phase === 'main'
                  ? (e) => {
                      // タッチでは攻撃できるモンスターだけつかめる（それ以外は場のスクロールに任せる）
                      if (e.pointerType !== 'mouse' && !ready) return;
                      drag.begin(e, 'board', () => attackerSource(m));
                    }
                  : undefined
              }
              floats={replay.floats[m.uid]}
              flash={replay.flash[m.uid]}
              hidden={replay.hidden.has(m.uid)}
              dying={ghost && (replay.ghosts.get(m.uid)?.dying ?? false)}
            />
          );
        })}
      </div>
    );
  };

  const revealDef = replay.reveal ? view.cards[replay.reveal.cardId] : undefined;
  const oppRef: TargetRef = { kind: 'player', player: opp };
  const meRef: TargetRef = { kind: 'player', player: me };
  const dragCard = drag.drag?.src.kind === 'card' ? mine.hand.find((c) => c.uid === drag.drag!.src.uid) : undefined;

  /** 詳細シートの中身と操作 */
  const renderDetail = (): ReactNode => {
    if (!detail) return null;
    const close = () => setDetail(null);
    if (detail.kind === 'hand') {
      const card = mine.hand.find((c) => c.uid === detail.uid);
      if (!card) return null;
      const i = infos.get(card.uid)!;
      const def = view.cards[card.cardId];
      const src = cardSource(card);
      const playable = isPlayable(card);
      if (!def) {
        return (
          <CardDetailSheet
            title="ノイズ"
            onClose={close}
            actions={
              <>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={!playable}
                  onClick={() => {
                    close();
                    act({ type: 'removeNoise', player: me, cardUid: card.uid });
                  }}
                >
                  除外する（⚡{i.cost}）
                </button>
                {!playable && src.blocked && <span className="cdetail__why">{src.blocked}</span>}
              </>
            }
          >
            <NoiseDetailBody cost={i.cost} />
          </CardDetailSheet>
        );
      }
      const targeted = i.enemyTargets.length > 0 || i.allyTargets.length > 0;
      return (
        <CardDetailSheet
          title={def.name}
          onClose={close}
          actions={
            <>
              <button
                type="button"
                className="btn btn--primary"
                disabled={!playable}
                onClick={() => {
                  close();
                  if (targeted) setSel({ kind: 'card', uid: card.uid });
                  else void tryPlay({ kind: 'card', uid: card.uid });
                }}
              >
                {targeted ? '対象を選んで使う' : '使う'}（⚡{i.cost}）
              </button>
              {!playable && src.blocked && <span className="cdetail__why">{src.blocked}</span>}
            </>
          }
        >
          <CardDetailBody def={def} extras={{ cost: i.cost, notes: myTurn ? i.warnings : [], where: '手札' }} />
        </CardDetailSheet>
      );
    }
    if (detail.kind === 'monster') {
      const m = battle.findMonster(view, detail.uid);
      const def = m ? view.cards[m.card.cardId] : undefined;
      if (!m || !def) return null;
      const isMine = m.controller === me;
      const reason = isMine && myTurn ? battle.attackBlockReason(view, m) : null;
      return (
        <CardDetailSheet
          title={def.name}
          onClose={close}
          actions={
            isMine && myTurn ? (
              <>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={!!reason}
                  onClick={() => {
                    close();
                    setSel({ kind: 'attacker', uid: m.uid });
                  }}
                >
                  ⚔ 攻撃する
                </button>
                {reason && <span className="cdetail__why">{reason}</span>}
              </>
            ) : undefined
          }
        >
          <CardDetailBody def={def} extras={{ monster: m, flags: battle.keywordFlags(view, m), ownerTurns: view.players[m.controller].turnsTaken, where: isMine ? 'あなたの場' : `${opponentLabel}の場` }} />
        </CardDetailSheet>
      );
    }
    if (detail.kind === 'power') {
      const pw = view.players[detail.player].powers.find((x) => x.uid === detail.uid);
      if (!pw) return null;
      const def = view.cards[pw.cardId];
      return (
        <CardDetailSheet title={`${pw.name}（パワー）`} onClose={close}>
          {def ? (
            <CardDetailBody def={def} extras={{ power: pw, where: detail.player === me ? 'あなたのパワー' : `${opponentLabel}のパワー` }} />
          ) : (
            <p>{pw.name}</p>
          )}
        </CardDetailSheet>
      );
    }
    const def = view.cards[detail.cardId];
    if (!def) return null;
    return (
      <CardDetailSheet title={def.name} onClose={close}>
        <CardDetailBody def={def} />
      </CardDetailSheet>
    );
  };

  const openCard = (cardId: string) => {
    if (view.cards[cardId]) setDetail({ kind: 'card', cardId });
  };
  const lastLog = view.log.length ? view.log[view.log.length - 1]! : null;

  return (
    <div
      ref={rootRef}
      className={cx('battle', replay.playing && 'is-replaying', dragging && 'is-dragging', dragging && `is-dragging--${dragging.plan.mode}`)}
      onPointerDownCapture={replay.playing ? replay.skip : undefined}
    >
      <header className="battle__head">
        <div className="battle__turn">
          <b>{turnLabel}</b>
          {phaseLabel && <span className={cx('badge', view.pending?.player === me ? 'badge--mine' : 'badge--enemy')}>{phaseLabel}</span>}
        </div>
        <div className="battle__status">{status}</div>
        <div className="battle__headbtns">
          <button type="button" className="btn btn--small btn--ghost battle__logbtn" onClick={() => setLogOpen(true)}>
            ログ
          </button>
          <button type="button" className="btn btn--small btn--ghost btn--icon" aria-label="メニュー" onClick={() => setMenuOpen(true)}>
            ⋯
          </button>
        </div>
      </header>

      <div className="battle__pp battle__pp--opp">
        <PlayerPanel
          ps={theirs}
          isMe={false}
          roleLabel="相手"
          active={view.active === opp && view.phase === 'main'}
          targetable={isLit(oppRef)}
          dropHover={isHover(oppRef)}
          dropKey={targetKey(oppRef)}
          onClick={() => onTarget(oppRef)}
          onPile={(kind) => setPile({ player: opp, kind })}
          onPower={(pw) => setDetail({ kind: 'power', player: opp, uid: pw.uid })}
          floats={replay.floats[keyOf(oppRef)]}
          flash={replay.flash[keyOf(oppRef)]}
          hpShown={replay.hp[opp]}
        />
      </div>
      <div className="battle__board battle__board--opp">{renderBoard(opp)}</div>
      <div className="battle__board battle__board--me">{renderBoard(me)}</div>
      <div className="battle__pp battle__pp--me">
        <PlayerPanel
          ps={mine}
          isMe
          roleLabel="あなた"
          active={view.active === me && view.phase === 'main'}
          targetable={isLit(meRef)}
          dropHover={isHover(meRef)}
          dropKey={targetKey(meRef)}
          onClick={() => onTarget(meRef)}
          onPile={(kind) => setPile({ player: me, kind })}
          onPower={(pw) => setDetail({ kind: 'power', player: me, uid: pw.uid })}
          floats={replay.floats[keyOf(meRef)]}
          flash={replay.flash[keyOf(meRef)]}
          hpShown={replay.hp[me]}
        />
      </div>

      <div className={cx('battle__hand', !myTurn && 'is-dim')} data-drop="hand">
        <div className="hand__meta">
          <span>手札 {mine.hand.length}枚</span>
          {myTurn && <span className={cx('hand__usable', playableCount > 0 && 'is-some')}>使える：{playableCount}枚</span>}
          {!myTurn && view.phase === 'main' && <span className="hand__wait">{view.pending ? '選択待ち' : `${opponentLabel}のターン`}</span>}
          {dragging && <span className="hand__drop">手札に戻すと取り消し</span>}
        </div>
        <div className="hand" role="list" aria-label="手札（押すと詳細、場へドラッグで使う）">
          {mine.hand.map((c) => (
            <HandCard
              key={c.uid}
              card={c}
              def={view.cards[c.cardId]}
              info={infos.get(c.uid)!}
              energy={mine.energy}
              playable={isPlayable(c)}
              selected={sel?.kind === 'card' && sel.uid === c.uid}
              dim={!myTurn}
              dragging={drag.drag?.src.kind === 'card' && drag.drag.src.uid === c.uid ? drag.drag.plan.mode : null}
              onClick={() => onHandTap(c)}
              onDetail={() => setDetail({ kind: 'hand', uid: c.uid })}
              onPointerDown={view.phase === 'main' ? (e) => drag.begin(e, 'hand', () => cardSource(c)) : undefined}
              onHover={canHover ? (el) => setHover(el && view.cards[c.cardId] ? { el, def: view.cards[c.cardId]! } : null) : undefined}
            />
          ))}
          {mine.hand.length === 0 && (
            <span className="board__empty hand__empty">
              {view.phase === 'main' && view.active !== me ? `${opponentLabel}のターン中です。次のあなたのターンに5枚引きます` : '手札なし'}
            </span>
          )}
        </div>
      </div>

      <aside className="battle__log" aria-label="ログ">
        <h2>ログ</h2>
        {!phone && <LogPanel log={view.log} me={me} names={names} onCard={openCard} />}
      </aside>

      <div className="battle-bar">
        <button type="button" className="battle-bar__ticker" onClick={() => setLogOpen(true)} aria-live="polite" aria-label="直近の出来事（タップでログ）">
          <span className="battle-bar__tickicon" aria-hidden="true">
            ›
          </span>
          <span className="battle-bar__ticktext">
            <LogText text={replay.ticker || lastLog?.text || ''} names={names} me={me} />
          </span>
        </button>
        {candidates.length > 0 && (
          <div className="battle-bar__cands" role="group" aria-label="対象の候補">
            {candidates.map((t) => (
              <button key={keyOf(t)} type="button" className="btn btn--small cand" onClick={() => onTarget(t)}>
                {targetLabel(t)}
              </button>
            ))}
          </div>
        )}
        <div className="battle-bar__row">
          <div className={cx('battle-bar__hint', nothingLeft && !sel && 'is-ok')} aria-live="polite">
            {hint}
          </div>
          <div className="battle-bar__btns">
            {selCard && needAlly && !needEnemy && info?.allyTargets.includes(selCard.uid) && (
              <button type="button" className="btn btn--primary" onClick={() => void tryPlay({ ...(sel as Extract<Selection, { kind: 'card' }>), ally: selCard.uid })}>
                このモンスター自身
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
              !sel && (
                <button type="button" className={cx('btn btn--primary battle-bar__end', nothingLeft && 'is-pulse')} disabled={!myTurn} onClick={() => void endTurn()}>
                  ターン終了
                  {myTurn && <span className="battle-bar__energy">⚡{mine.energy}</span>}
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* 演出のオーバーレイ */}
      {replay.banner && (
        <div className={cx('fx-banner', `fx-banner--${replay.banner.tone}`, replay.banner.big && 'fx-banner--big')} aria-hidden="true">
          {replay.banner.text}
        </div>
      )}
      {replay.reveal && revealDef && (
        <div className="fx-reveal" aria-hidden="true">
          <div className="fx-reveal__card">
            <CardView card={revealDef} />
          </div>
          <div className="fx-reveal__text">
            {opponentLabel}が「{revealDef.name}」を使った
          </div>
        </div>
      )}
      {hover && canHover && !sel && !drag.drag && !detail && <HoverPreview anchor={hover.el} def={hover.def} />}
      {drag.drag && (
        <DragLayer
          drag={drag.drag}
          subscribe={drag.subscribe}
          getPos={drag.getPos}
          rootRef={rootRef}
          ghost={
            dragCard ? (
              <HandCard
                card={dragCard}
                def={view.cards[dragCard.cardId]}
                info={infos.get(dragCard.uid)!}
                energy={mine.energy}
                playable={isPlayable(dragCard)}
                selected={false}
                dim={false}
                onClick={() => undefined}
                ghost
              />
            ) : null
          }
        />
      )}

      {view.phase === 'mulligan' && !mine.mulligan.done && !busy && <MulliganDialog view={view} me={me} onAction={act} timeLeft={timeLeft} />}
      {view.pending && view.pending.player === me && !busy && <ChoiceDialog view={view} me={me} onAction={act} timeLeft={timeLeft} />}
      {ended && resultReady && !resultHidden && (
        <ResultDialog view={view} me={me} onHide={() => setResultHidden(true)}>
          {resultButtons}
        </ResultDialog>
      )}
      {renderDetail()}
      {pile && (
        <Modal title={`${pile.player === me ? 'あなた' : opponentLabel}の${pile.kind === 'discard' ? '捨て札' : '除外'}（${view.players[pile.player][pile.kind].length}枚）`} onClose={() => setPile(null)}>
          <div className="crow-list">
            {view.players[pile.player][pile.kind].map((c) => {
              const def = view.cards[c.cardId];
              return <CardRow key={c.uid} def={def} label={battle.cardName(view, c.cardId)} picked={false} mark="" onToggle={() => def && setZoom(def)} onZoom={setZoom} />;
            })}
            {view.players[pile.player][pile.kind].length === 0 && <p className="hint">なし</p>}
          </div>
        </Modal>
      )}
      <ZoomModal def={zoom} onClose={() => setZoom(null)} />
      {phone && (
        <Sheet open={logOpen} title="ログ" onClose={() => setLogOpen(false)}>
          <LogPanel log={view.log} me={me} names={names} onCard={openCard} />
        </Sheet>
      )}
      <Sheet open={menuOpen} title="メニュー" onClose={() => setMenuOpen(false)} desktop="modal">
        <div className="menu-list">
          <button
            type="button"
            className="btn"
            onClick={() => {
              setMenuOpen(false);
              navigate('/rules');
            }}
          >
            📖 ルールを見る
          </button>
          {menuItems}
          <button type="button" className="btn btn--danger" disabled={view.phase === 'ended'} onClick={() => void concede()}>
            🏳 降参する
          </button>
        </div>
      </Sheet>
    </div>
  );
}

/** PC でカードにマウスを乗せたとき、手札の上に全文のカードを出す */
function HoverPreview({ anchor, def }: { anchor: HTMLElement; def: CardDef }) {
  const r = anchor.getBoundingClientRect();
  const W = 250;
  const H = 350;
  const left = Math.max(8, Math.min(window.innerWidth - W - 8, r.left + r.width / 2 - W / 2));
  const top = Math.max(8, r.top - H - 10);
  return (
    <div className="hand-preview" style={{ left, top }} aria-hidden="true">
      <CardView card={def} />
    </div>
  );
}
