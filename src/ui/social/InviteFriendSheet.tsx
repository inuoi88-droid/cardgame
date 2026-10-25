/**
 * フレンドを対戦に招待する（決定事項 #123）。
 * - InviteFriendSheet：フレンドのタブから（参加中の部屋を抜けてよいかは、開く前に確かめておく）。形式（自分のデッキ／ドラフト）を選ぶ → 合言葉の部屋（一覧に出さない）を作って招待を送り、
 *   相手待ちの画面へ（招待の返事はそこに出る）
 * - InviteToRoomSheet：相手待ちの部屋から、フレンドを選んで招待する
 */
import { useState } from 'react';
import type { FriendView } from '../../online/social/protocol.ts';
import type { RoomMode } from '../../online/protocol.ts';
import { DeckPicker } from '../battle/DeckPicker.tsx';
import { pickChoice, useDeckChoices } from '../battle/deckChoices.ts';
import { Sheet } from '../components/Sheet.tsx';
import { useToast } from '../components/Toast.tsx';
import { UiIcon } from '../components/UiIcon.tsx';
import { loadOnlineName } from '../online/client.ts';
import { cx } from '../util.ts';
import { enterRoom, goToRoom, loadOnlineDeckKey, saveOnlineDeckKey } from './enterRoom.ts';
import { PRESENCE_LABEL } from './socialLogic.ts';
import { socialAct, useSocial } from './socialStore.ts';
import '../draft/draft.css';
import './social.css';

export function InviteFriendSheet({ friend, onClose }: { friend: FriendView; onClose: () => void }) {
  const { snap } = useSocial();
  const choices = useDeckChoices();
  const toast = useToast();
  const [mode, setMode] = useState<RoomMode>('deck');
  const [deckKey, setDeckKey] = useState(() => loadOnlineDeckKey());
  const selected = pickChoice(choices, deckKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = mode === 'draft' || !!selected;

  const go = async () => {
    if (busy || !ready) return;
    setBusy(true);
    setError(null);
    if (mode === 'deck' && selected) saveOnlineDeckKey(selected.key);
    const room = await enterRoom({
      op: 'create',
      name: snap?.me.name || loadOnlineName(),
      ...(mode === 'draft' ? { mode: 'draft' as const } : { deck: selected!.deck, cards: selected!.cards }),
      listed: false,
    });
    if (!room.ok) {
      setBusy(false);
      setError(room.error);
      return;
    }
    const res = await socialAct({ op: 'invite', friendCode: friend.friendCode, roomCode: room.code });
    setBusy(false);
    // 招待が送れなくても部屋はできている（相手待ちの画面から送り直せる）
    if (!res.ok) toast({ text: `部屋はできましたが、招待を送れませんでした（${res.error}）。相手待ちの画面から送り直せます`, kind: 'ng' });
    goToRoom();
  };

  return (
    <Sheet open title={`「${friend.name}」さんを対戦に招待`} onClose={onClose} desktop="modal" className="join-sheet">
      <p className="hint">
        合言葉の部屋（「募集中の部屋」には出ない）を作って、<span className="u-name">{friend.name}</span>
        さんに招待を送ります。相手の画面に知らせが出て、1タップで入れます（{friend.presence === 'offline' ? 'いまはオフラインです。開いたときに届きます' : PRESENCE_LABEL[friend.presence]}）。
      </p>
      <div className="lobby__mode" role="radiogroup" aria-label="部屋の形式">
        <label className="dchoice">
          <input type="radio" name="invite-mode" checked={mode === 'deck'} onChange={() => setMode('deck')} />
          <UiIcon name="chest" />
          <b>自分のデッキ</b>
          <small>お互いに自分で作ったデッキで戦う</small>
        </label>
        <label className="dchoice">
          <input type="radio" name="invite-mode" checked={mode === 'draft'} onChange={() => setMode('draft')} />
          <UiIcon name="card-pick" />
          <b>ドラフト（公式カード）</b>
          <small>公式カードの場から交互に取ってデッキを作る</small>
        </label>
      </div>
      {mode === 'deck' && (
        <>
          <h3 className="join-sheet__h">使うデッキ</h3>
          <DeckPicker choices={choices} selected={selected} onSelect={setDeckKey} name="invite-deck" />
        </>
      )}
      {error && <p className="notice notice--ng">{error}</p>}
      <div className="modal__foot join-sheet__foot">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          やめる
        </button>
        <button type="button" className="btn btn--primary btn--big" disabled={busy || !ready} onClick={() => void go()}>
          {busy ? '部屋を作っています…' : '招待する'}
        </button>
      </div>
    </Sheet>
  );
}

export function InviteToRoomSheet({ roomCode, onClose }: { roomCode: string; onClose: () => void }) {
  const { snap } = useSocial();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const friends = snap?.friends ?? [];
  const sent = new Set((snap?.sentInvites ?? []).filter((i) => i.roomCode === roomCode && i.status === 'pending').map((i) => i.to.friendCode));
  const invite = async (f: FriendView) => {
    setBusy(f.friendCode);
    const res = await socialAct({ op: 'invite', friendCode: f.friendCode, roomCode });
    setBusy(null);
    toast(res.ok ? { text: `${f.name}さんに招待を送りました`, kind: 'ok' } : { text: res.error, kind: 'ng' });
  };
  return (
    <Sheet open title="フレンドを招待" onClose={onClose} desktop="modal">
      {friends.length === 0 ? (
        <p className="hint">まだフレンドがいません。オンラインの「フレンド」のタブで、フレンドコードか招待リンクで増やせます。</p>
      ) : (
        <ul className="friends__list">
          {friends.map((f) => (
            <li key={f.friendCode} className="friend">
              <PresenceDot presence={f.presence} />
              <span className="friend__text">
                <b className="u-name">{f.name}</b>
                <small>{PRESENCE_LABEL[f.presence]}</small>
              </span>
              <button type="button" className="btn btn--small" disabled={busy !== null || f.presence === 'battle'} onClick={() => void invite(f)}>
                <UiIcon name="envelope" />
                {sent.has(f.friendCode) ? '送り直す' : f.presence === 'battle' ? '対戦中' : '招待'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

/** 在室の印（丸い点の色と形を変える。色だけに頼らないよう、名前の下に言葉も出す） */
/** 在室の点（unknown：サーバーにつながらず、今の様子が分からない） */
export function PresenceDot({ presence }: { presence: FriendView['presence'] | 'unknown' }) {
  return <span className={cx('presence', `presence--${presence}`)} aria-hidden="true" />;
}
