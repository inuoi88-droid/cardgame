/** オンライン対戦：相手待ち → 対戦（残り時間・相手の接続状態を表示） */
import { useEffect, useState } from 'react';
import { BALANCE, LEADERS, battle } from '../../engine/index.ts';
import { rulesSummary } from '../battle/matchOptions.ts';
import type { RoomView } from '../../online/protocol.ts';
import { BattleBoard } from '../battle/BattleBoard.tsx';
import { ONLINE_OPP_PORTRAIT } from '../battle/portraits.ts';
import { UiIcon } from '../components/UiIcon.tsx';
import { useConfirm } from '../components/ConfirmDialog.tsx';
import { clearOnlineSession, loadOnlineSession, type OnlineSession } from '../online/client.ts';
import { WARN_SECONDS } from '../online/config.ts';
import { useOnlineRoom } from '../online/useOnlineRoom.ts';
import { navigate } from '../router.ts';
import { cx } from '../util.ts';

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

const leave = () => {
  clearOnlineSession();
  navigate('/online');
};

function OnlineRoomScreen({ session }: { session: OnlineSession }) {
  const r = useOnlineRoom(session);
  const { room } = r;

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
  if (room.status === 'waiting' || !room.view) return <WaitingRoom code={room.code} online={r.online} room={room} />;

  const opp = battle.other(room.seat);
  const oppName = room.names[opp] ?? '相手';
  return (
    <BattleBoard
      view={room.view}
      me={room.seat}
      onAction={r.send}
      error={r.error}
      busy={r.busy}
      opponentLabel={oppName}
      opponentPortrait={ONLINE_OPP_PORTRAIT}
      status={<OnlineStatus room={room} online={r.online} serverNow={r.serverNow} />}
      resultButtons={
        <button type="button" className="btn btn--primary" onClick={leave}>
          ロビーに戻る
        </button>
      }
    />
  );
}

function WaitingRoom({ code, online, room }: { code: string; online: boolean; room: RoomView }) {
  const leader = room.leaders?.[0] ?? 'none';
  const confirm = useConfirm();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(code).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };
  return (
    <section className="panel online-wait">
      <h1>相手を待っています…</h1>
      <p>この部屋コードを相手に伝えてください。相手が「コードで入る」に入力すると対戦が始まります。</p>
      <div className="online-wait__code" aria-label="部屋コード">
        {code}
      </div>
      <p className="hint">
        このルールで対戦：{rulesSummary(room.rules)}
        {leader !== 'none' && `・あなたのリーダー ${LEADERS[leader].name}`}
      </p>
      <div className="btn-row">
        <button type="button" className="btn" onClick={copy}>
          {copied ? 'コピーしました' : 'コードをコピー'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            if (await confirm({ title: 'この部屋をやめますか？', message: '部屋コードは使えなくなります。', okLabel: 'やめる', danger: true })) leave();
          }}
        >
          やめる
        </button>
      </div>
      {!online && <p className="text-ng">サーバーにつながりません（自動でつなぎ直します）</p>}
    </section>
  );
}

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
      {!online && <span className="online-chip online-chip--ng">通信できません</span>}
    </span>
  );
}
