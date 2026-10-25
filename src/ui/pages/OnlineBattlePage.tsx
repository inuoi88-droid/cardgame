/**
 * オンライン対戦：相手待ち →（ドラフトの部屋はドラフト → できたデッキの確認）→ 対戦（残り時間・相手の接続状態を表示）→
 * 決着したら「同じデッキでもう一戦」（両者が押すと次の対戦。決定事項 #119）
 */
import { useEffect, useRef, useState } from 'react';
import { BALANCE, LEADERS, battle } from '../../engine/index.ts';
import { rulesSummary } from '../battle/matchOptions.ts';
import type { RoomView } from '../../online/protocol.ts';
import { BattleBoard } from '../battle/BattleBoard.tsx';
import { ONLINE_OPP_PORTRAIT } from '../battle/portraits.ts';
import { UiIcon } from '../components/UiIcon.tsx';
import { useConfirm } from '../components/ConfirmDialog.tsx';
import { useToast } from '../components/Toast.tsx';
import { loadOnlineSession, type OnlineSession } from '../online/client.ts';
import { WARN_SECONDS } from '../online/config.ts';
import { useOnlineRoom } from '../online/useOnlineRoom.ts';
import { navigate } from '../router.ts';
import { cx } from '../util.ts';
import { DraftBoard, DeckPanel } from '../draft/DraftBoard.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { CardDetail } from '../components/CardDetail.tsx';
import type { CardDef } from '../../engine/index.ts';
import { DeckCopySheet } from '../copy/DeckCopySheet.tsx';
import { OppDeckButton } from '../copy/OppDeckButton.tsx';
import { recordOpponent, resultFor } from '../copy/history.ts';
import { opponentDeckOf } from '../copy/roomDeck.ts';
import { FriendRequestButton } from '../social/FriendRequestButton.tsx';
import { leaveRoom } from '../social/enterRoom.ts';
import { InviteToRoomSheet } from '../social/InviteFriendSheet.tsx';
import { sourceLabel } from '../social/socialLogic.ts';
import { useSocial, useSocialBoost } from '../social/socialStore.ts';
import '../draft/draft.css';
import '../social/social.css';

export function OnlineBattlePage() {
  const [session] = useState(() => loadOnlineSession());
  if (!session) {
    return (
      <div className="panel">
        <p>参加中の部屋はありません。</p>
        <button type="button" className="btn btn--primary" onClick={() => navigate('/online')}>
          オンライン対戦のロビーへ
        </button>
      </div>
    );
  }
  return <OnlineRoomScreen session={session} />;
}

/** 部屋を出てロビーへ（サーバーにも出ると伝える：決着後なら相手の「もう一戦」は待たなくなる。決定事項 #124） */
const leave = () => {
  void leaveRoom();
  navigate('/online');
};

function OnlineRoomScreen({ session }: { session: OnlineSession }) {
  const r = useOnlineRoom(session);
  const { room } = r;
  /** この画面でドラフト中を見たか（見ていれば、ドラフトが終わって対戦が始まったときに、まずできたデッキを見せる） */
  const sawDrafting = useRef(false);
  const [decksSeen, setDecksSeen] = useState(false);
  const [decksOpen, setDecksOpen] = useState(false);
  if (room?.status === 'drafting') sawDrafting.current = true;
  // 再戦（2戦目から）が始まったら、何戦目か・なぜその人が先攻かを一度だけ知らせる
  const toast = useToast();
  const games = room?.games ?? 0;
  const firstOfGame = room?.view?.first;
  const seat = room?.seat;
  const announced = useRef(games);
  /** 決着した対戦の勝者（再戦が始まったときの説明に使う。undefined はまだ見ていない） */
  const lastWinner = useRef<battle.PlayerId | null | undefined>(undefined);
  if (room?.status === 'ended' && room.view?.result) lastWinner.current = room.view.result.winner;
  // 決着したら相手のデッキを「対戦した相手」に記録する（決定事項 #122。1対戦1件）
  const [oppOpen, setOppOpen] = useState(false);
  const oppDeck = room ? opponentDeckOf(room) : null;
  const recordId = room && oppDeck && room.status === 'ended' ? `online-${room.code}-${room.games ?? 1}-${oppDeck.name}` : null;
  useEffect(() => {
    if (!room || !oppDeck || !recordId) return;
    recordOpponent({
      id: recordId,
      at: Date.now(),
      source: room.mode === 'draft' ? 'draft' : 'online',
      opponentName: sourceLabel(oppDeck.name, room.opponentFriendCode),
      deck: oppDeck.deck,
      cards: oppDeck.cards,
      result: resultFor(room.view?.result, room.seat),
      ...(room.opponentFriendCode ? { friendCode: room.opponentFriendCode } : {}),
    });
    // 決着した対戦ごとに1回
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId]);
  useEffect(() => {
    if (games <= 1 || announced.current >= games || firstOfGame === undefined || seat === undefined) return;
    announced.current = games;
    const mine = firstOfGame === seat;
    const prev = lastWinner.current;
    const why =
      prev === undefined
        ? `${mine ? 'あなた' : '相手'}が先攻です`
        : prev === null
          ? `前の対戦は引き分けだったので、前に後攻だった${mine ? 'あなた' : '相手'}が先攻です`
          : `前の対戦で負けた${mine ? 'あなた' : '相手'}が先攻です`;
    toast({ text: `${games}戦目：${why}`, duration: 6000 });
  }, [games, firstOfGame, seat, toast]);

  if (r.fatal) {
    return (
      <div className="panel">
        <p className="text-ng">{r.fatal}</p>
        <p className="hint">部屋は最後の操作から24時間で消えます。</p>
        <button type="button" className="btn btn--primary" onClick={leave}>
          ロビーに戻る
        </button>
      </div>
    );
  }
  if (!room) {
    return <div className="panel">{r.online ? '部屋に接続しています…' : 'サーバーにつながりません。通信環境を確かめてください（自動でつなぎ直します）'}</div>;
  }
  if (room.status === 'drafting' && room.draft) return <OnlineDraft room={room} r={r} />;
  if (room.status === 'waiting' || !room.view) return <WaitingRoom code={room.code} online={r.online} room={room} />;

  const opp = battle.other(room.seat);
  const oppName = room.names[opp] ?? '相手';
  /** 「同じデッキでもう一戦」ができる（再戦できる部屋で、相手がまだ部屋にいる） */
  const canRematch = !!room.rematch && !room.opponentLeft;
  // ドラフトが終わった直後（1戦目のマリガン中）：両者のデッキを見せてから対戦の画面へ
  if (room.draft?.done && sawDrafting.current && !decksSeen && (room.games ?? 1) === 1 && room.view.phase === 'mulligan') {
    return (
      <>
        <div className="page-head">
          <h1>ドラフト戦</h1>
        </div>
        <DraftBoard
          view={room.draft}
          me={room.seat}
          names={[room.names[0] || 'プレイヤー', room.names[1] || 'プレイヤー']}
          oppGi={ONLINE_OPP_PORTRAIT}
          onTake={() => undefined}
          doneNote={
            <>
              対戦が始まっています。先攻は{room.view.first === room.seat ? 'あなた' : <span className="u-name">{oppName}</span>}
              （後から取り始めた人）。<MulliganLeft room={room} serverNow={r.serverNow} />
            </>
          }
          doneActions={
            <button type="button" className="btn btn--primary btn--big" onClick={() => setDecksSeen(true)}>
              対戦へ
            </button>
          }
        />
      </>
    );
  }

  return (
    <>
      <BattleBoard
        key={room.games ?? 1}
        view={room.view}
        me={room.seat}
        onAction={r.send}
        error={r.error}
        busy={r.busy}
        opponentLabel={oppName}
        opponentPortrait={ONLINE_OPP_PORTRAIT}
        status={<OnlineStatus room={room} online={r.online} serverNow={r.serverNow} />}
        menuItems={
          room.draft?.done ? (
            <button type="button" className="btn" onClick={() => setDecksOpen(true)}>
              <UiIcon name="card-pick" />
              <span className="menu-list__text">
                ドラフトのデッキを見る
                <small>あなたと相手のデッキ（公開）</small>
              </span>
            </button>
          ) : undefined
        }
        resultButtons={
          <>
            {canRematch && <RematchButton room={room} busy={r.busy} onRematch={r.rematch} />}
            {room.rematch && room.opponentLeft && (
              <span className="rematch-note" role="status">
                <span className="u-name">{oppName}</span>は部屋を出ました（もう一戦はできません）
              </span>
            )}
            {oppDeck && <OppDeckButton onClick={() => setOppOpen(true)} />}
            <FriendRequestButton roomCode={room.code} friendCode={room.opponentFriendCode} name={oppName} />
            <button type="button" className={cx('btn', !canRematch && 'btn--primary')} onClick={leave}>
              ロビーに戻る
            </button>
          </>
        }
        endPrimary={canRematch ? <RematchButton room={room} busy={r.busy} onRematch={r.rematch} compact /> : undefined}
        endActions={
          oppDeck || room.opponentFriendCode ? (
            <>
              {oppDeck && <OppDeckButton onClick={() => setOppOpen(true)} />}
              <FriendRequestButton roomCode={room.code} friendCode={room.opponentFriendCode} name={oppName} />
            </>
          ) : undefined
        }
      />
      {decksOpen && room.draft && <DraftDecksSheet room={room} onClose={() => setDecksOpen(false)} />}
      {oppOpen && oppDeck && (
        <DeckCopySheet title={`「${oppDeck.name}」のデッキ`} sourceName={sourceLabel(oppDeck.name, room?.opponentFriendCode)} deck={oppDeck.deck} cards={oppDeck.cards} onClose={() => setOppOpen(false)} />
      )}
    </>
  );
}

/** ドラフト中：場から交互に取る（残り時間は部屋の締め切りから） */
function OnlineDraft({ room, r }: { room: RoomView; r: ReturnType<typeof useOnlineRoom> }) {
  const view = room.draft!;
  const left = useSecondsLeft(room.deadline, r.serverNow);
  const opp = battle.other(room.seat);
  return (
    <>
      <div className="page-head">
        <h1>ドラフト戦</h1>
        <a className="dlink" href="#/official" target="_blank" rel="noreferrer">
          <UiIcon name="book-cover" />
          公式カードを見る
        </a>
      </div>
      <DraftBoard
        view={view}
        me={room.seat}
        names={[room.names[0] || 'プレイヤー', room.names[1] || 'プレイヤー']}
        oppGi={ONLINE_OPP_PORTRAIT}
        timeLeft={view.turn === null ? null : left}
        warnSeconds={10}
        timerHint={`1回の制限時間は${BALANCE.online.draftPickSeconds}秒。時間切れになると「おまかせ」で代わりに取ります（負けにはなりません）`}
        timeouts={room.timeouts[room.seat]}
        busy={r.busy}
        onTake={r.take}
        onAuto={r.setAuto}
        error={r.error}
        status={
          <>
            <span className={cx('dstat', !room.opponentConnected && 'is-out')} title="相手の接続状態">
              <span className={cx('online-dot', room.opponentConnected ? 'is-on' : 'is-off')} aria-hidden="true" />
              <span className="u-name">{room.names[opp] ?? '相手'}</span>
              {!room.opponentConnected && '（切断中）'}
            </span>
            {!r.online && <span className="dstat is-out">通信できません</span>}
          </>
        }
      />
      <p className="hint">
        1回の制限時間は{BALANCE.online.draftPickSeconds}秒。時間切れになると「おまかせ」で代わりに取ります（負けにはなりません）。
        {BALANCE.online.timeoutLoseCount}回続けて時間切れになると、自分で取るまでおまかせのままです。
      </p>
    </>
  );
}

/** 残り秒（サーバーの時計で。0.5秒ごとに描き直す） */
function useSecondsLeft(deadline: number | null, serverNow: () => number): number | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (deadline === null) return;
    const t = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(t);
  }, [deadline]);
  return deadline === null ? null : Math.max(0, Math.ceil((deadline - serverNow()) / 1000));
}

function MulliganLeft({ room, serverNow }: { room: RoomView; serverNow: () => number }) {
  const left = useSecondsLeft(room.deadline, serverNow);
  if (left === null) return null;
  // 残りが少なくなったら赤く（デッキを見ている間にマリガンの時間が切れないように）
  return <span className={cx(left <= WARN_SECONDS && 'text-ng')}>マリガンの残り {left}秒。</span>;
}

/**
 * 「同じデッキでもう一戦」：押したら相手を待つ。相手が押したかも出す（結果ダイアログでは金のボタンのすぐ下に）。
 * compact は決着後の操作バーの主役（短い言葉。相手が押していれば印を添える。決定事項 #124）
 */
function RematchButton({ room, busy, onRematch, compact = false }: { room: RoomView; busy: boolean; onRematch: () => void; compact?: boolean }) {
  const mine = room.rematch?.[room.seat] ?? false;
  if (compact) {
    const theirs = room.rematch?.[battle.other(room.seat)] ?? false;
    return (
      <button type="button" className="btn btn--primary rematch-bar" disabled={mine || busy} onClick={onRematch} aria-label={`同じデッキでもう一戦（${rematchText(room)}）`}>
        <UiIcon name="anticlockwise-rotation" />
        {mine ? '待っています' : 'もう一戦'}
        {theirs && !mine && <span className="rematch-bar__dot" aria-hidden="true" />}
      </button>
    );
  }
  return (
    <>
      <button type="button" className="btn btn--primary" disabled={mine || busy} onClick={onRematch}>
        <UiIcon name="anticlockwise-rotation" />
        {mine ? '相手を待っています…' : '同じデッキでもう一戦'}
      </button>
      <span className="rematch-note" role="status" aria-live="polite">
        {rematchText(room)}
      </span>
    </>
  );
}

function rematchText(room: RoomView): string {
  const opp = battle.other(room.seat);
  const name = room.names[opp] ?? '相手';
  const [m, o] = [room.rematch?.[room.seat] ?? false, room.rematch?.[opp] ?? false];
  if (m && o) return '次の対戦を始めています…';
  if (o) return `${name}は「もう一戦」を押しています`;
  if (m) return `${name}が押すと始まります${room.opponentConnected ? '' : '（相手は切断中）'}`;
  return `${name}はまだ押していません${room.opponentConnected ? '' : '（切断中）'}`;
}

/** 対戦中のメニューから：ドラフトでできた両者のデッキ */
function DraftDecksSheet({ room, onClose }: { room: RoomView; onClose: () => void }) {
  const [zoom, setZoom] = useState<{ card: CardDef; text: string } | null>(null);
  const opp = battle.other(room.seat);
  const oppName = room.names[opp] ?? '相手';
  const d = room.draft!;
  return (
    <Sheet open title="ドラフトのデッキ" onClose={onClose} desktop="modal">
      <div className="dboard__decks">
        <DeckPanel title="あなたのデッキ" label="あなたのデッキ" owner={room.seat} taken={d.taken[room.seat]} gi="visored-helm" onCard={(card, n) => setZoom({ card, text: `あなたのデッキに${n}枚` })} />
        <DeckPanel
          title={
            <>
              <span className="u-name">{oppName}</span>のデッキ
            </>
          }
          label={`${oppName}のデッキ`}
          owner={opp}
          taken={d.taken[opp]}
          gi={ONLINE_OPP_PORTRAIT}
          onCard={(card, n) => setZoom({ card, text: `${oppName}のデッキに${n}枚` })}
        />
      </div>
      {zoom && <CardDetail card={zoom.card} status={zoom.text} onClose={() => setZoom(null)} />}
    </Sheet>
  );
}

function WaitingRoom({ code, online, room }: { code: string; online: boolean; room: RoomView }) {
  const leader = room.leaders?.[0] ?? 'none';
  const confirm = useConfirm();
  const [copied, setCopied] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const { snap } = useSocial();
  // 招待の返事を早めに知る
  useSocialBoost();
  const invites = (snap?.sentInvites ?? []).filter((i) => i.roomCode === code);
  const copy = () => {
    void navigator.clipboard?.writeText(code).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };
  return (
    <section className="panel online-wait">
      <h1>相手を待っています…</h1>
      <p>
        {room.listed ? (
          <>
            「募集中の部屋」に出ています。だれかが入ると
          </>
        ) : (
          <>この部屋コードを相手に伝えてください。相手が「コードで入る」に入力すると</>
        )}
        {room.mode === 'draft' ? 'ドラフトが始まります（公式カード。デッキは要りません）。' : '対戦が始まります。'}
      </p>
      <p className="online-wait__vis">
        <UiIcon name={room.listed ? 'open-gate' : 'locked-door'} />
        {room.listed ? '公開の部屋（コードでも入れます）' : '合言葉の部屋（一覧には出ません）'}
      </p>
      <div className="online-wait__code" aria-label="部屋コード">
        {code}
      </div>
      <p className="hint">
        このルールで対戦：{rulesSummary(room.rules)}
        {leader !== 'none' && `・あなたのリーダー ${LEADERS[leader].name}`}
      </p>
      {invites.length > 0 && (
        <ul className="online-wait__invites" aria-live="polite">
          {invites.map((i) => (
            <li key={i.id} className={cx('wait-inv', `wait-inv--${i.status}`)}>
              <UiIcon name="envelope" />
              <span>
                <span className="u-name">{i.to.name}</span>さん：{INVITE_STATUS[i.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="btn-row">
        <button type="button" className="btn" onClick={copy}>
          {copied ? 'コピーしました' : 'コードをコピー'}
        </button>
        {snap && (
          <button type="button" className="btn" onClick={() => setInviteOpen(true)}>
            <UiIcon name="envelope" />
            フレンドを招待
          </button>
        )}
        <button
          type="button"
          className="btn"
          onClick={async () => {
            const ok = await confirm({
              title: 'この部屋を閉じますか？',
              message: room.listed ? '「募集中の部屋」から消え、この部屋コードでは入れなくなります。' : 'この部屋コードでは入れなくなります。送った招待も無効になります。',
              okLabel: '閉じる',
            });
            if (ok) leave();
          }}
        >
          やめる
        </button>
      </div>
      {!online && <p className="text-ng">サーバーにつながりません（自動でつなぎ直します）</p>}
      {inviteOpen && <InviteToRoomSheet roomCode={code} onClose={() => setInviteOpen(false)} />}
    </section>
  );
}

const INVITE_STATUS = { pending: '招待を送りました（返事待ち）', accepted: '参加します。まもなく入ってきます', declined: '今回は断られました', expired: '招待の期限が切れました' } as const;

/** 見出しに出す：残り時間・相手の接続状態・時間切れの回数 */
function OnlineStatus({ room, online, serverNow }: { room: RoomView; online: boolean; serverNow: () => number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(t);
  }, []);
  const view = room.view!;
  const me = room.seat;
  const opp = battle.other(me);
  const left = room.deadline === null ? null : Math.max(0, Math.ceil((room.deadline - serverNow()) / 1000));
  const whose: battle.PlayerId | 'both' | null =
    view.phase === 'mulligan' ? 'both' : view.phase === 'main' ? (view.pending ? view.pending.player : view.active) : null;
  const limit = BALANCE.online.timeoutLoseCount;
  return (
    <span className="online-status">
      {left !== null && whose !== null && (
        <span className={cx('online-chip', (whose === me || whose === 'both') && left <= WARN_SECONDS && 'online-chip--ng')} title="この手番の残り時間">
          <UiIcon name="gi:stopwatch" className="online-chip__gi" />
          {whose === 'both' ? '' : whose === me ? 'あなた ' : '相手 '}
          {left}秒
        </span>
      )}
      <span className={cx('online-chip', !room.opponentConnected && 'online-chip--ng')} title="相手の接続状態">
        <span className={cx('online-dot', room.opponentConnected ? 'is-on' : 'is-off')} aria-hidden="true" />
        {room.names[opp] ?? '相手'}
        {!room.opponentConnected && '（切断中）'}
      </span>
      {room.timeouts[me] > 0 && view.phase !== 'ended' && (
        <span className="online-chip online-chip--ng" title={`${limit}回続けて時間切れになると負け`}>
          時間切れ {room.timeouts[me]}/{limit}
        </span>
      )}
      {room.status === 'ended' && room.rematch && room.opponentLeft && <span className="online-chip">相手は部屋を出ました</span>}
      {room.status === 'ended' && room.rematch && !room.opponentLeft && (
        <span className={cx('online-chip', room.rematch[opp] && 'online-chip--ok')} title="「同じデッキでもう一戦」">
          <UiIcon name="anticlockwise-rotation" className="online-chip__gi" />
          {room.rematch[opp] ? '相手はもう一戦を希望' : room.rematch[me] ? '相手の返事待ち' : '再戦できます'}
        </span>
      )}
      {!online && <span className="online-chip online-chip--ng">通信できません</span>}
    </span>
  );
}
