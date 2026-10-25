/**
 * 対戦の結果に置く「フレンド申請」（決定事項 #123）。相手の席がプレイヤーに結び付いているとき（RoomView.opponentFriendCode）だけ出す。
 * もうフレンドなら出さない。申請済みなら押せない札、相手から申請が届いていれば「申請を承認」。
 */
import { useState } from 'react';
import { useToast } from '../components/Toast.tsx';
import { UiIcon } from '../components/UiIcon.tsx';
import { friendStateOf } from './socialLogic.ts';
import { socialAct, useSocial } from './socialStore.ts';

export function FriendRequestButton({ roomCode, friendCode, name }: { roomCode: string; friendCode: string | undefined; name: string }) {
  const { snap } = useSocial();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const state = friendStateOf(snap, friendCode);
  if (!friendCode || !snap || state === 'self' || state === 'friend') return null;
  if (state === 'outgoing') {
    return (
      <button type="button" className="btn" disabled>
        <UiIcon name="shaking-hands" />
        <span className="btn__label">申請しました</span>
      </button>
    );
  }
  const go = async () => {
    setBusy(true);
    const res =
      state === 'incoming' ? await socialAct({ op: 'friendRespond', friendCode, accept: true }) : await socialAct({ op: 'friendRequestRoom', code: roomCode });
    setBusy(false);
    if (!res.ok) {
      toast({ text: res.error, kind: 'ng' });
      return;
    }
    const became = state === 'incoming' || ('result' in res && res.result !== 'requested');
    toast({ text: became ? `${name}さんとフレンドになりました` : `${name}さんにフレンド申請を送りました（承認されるとフレンドになります）`, kind: 'ok' });
  };
  return (
    <button type="button" className="btn" disabled={busy} onClick={() => void go()} title="この対戦相手とフレンドになると、対戦に招待しあったり成績を見たりできます">
      <UiIcon name="shaking-hands" />
      <span className="btn__label">{state === 'incoming' ? '申請を承認' : 'フレンド申請'}</span>
    </button>
  );
}
