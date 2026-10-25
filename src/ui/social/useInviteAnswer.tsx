/**
 * 届いた対戦の招待に答える（アプリのどこからでも：上の知らせ・ロビーのフレンドのタブ。決定事項 #123）。
 * 参加：参加中の部屋があれば抜けてよいか確かめ → inviteRespond（受ける）→ 返ってきた部屋に join。
 * 自分のデッキの部屋はデッキを選ぶシート（JoinSheet）を挟む。ドラフトの部屋はそのまま入る。
 * 期限切れ（部屋が始まった・10分を過ぎた）は知らせて取り直す。
 */
import { useState, type ReactNode } from 'react';
import type { CardDef, Deck } from '../../engine/index.ts';
import { DRAFT_FEATURE, type RoomMode } from '../../online/protocol.ts';
import type { InviteView } from '../../online/social/protocol.ts';
import { useConfirm } from '../components/ConfirmDialog.tsx';
import { useToast } from '../components/Toast.tsx';
import { loadOnlineName } from '../online/client.ts';
import { rulesSummary } from '../battle/matchOptions.ts';
import { confirmLeaveRoom, enterRoom, goToRoom } from './enterRoom.ts';
import { JoinSheet } from './JoinSheet.tsx';
import { refreshSocial, socialAct } from './socialStore.ts';

export const MODE_LABEL: Record<RoomMode, string> = { deck: '自分のデッキ', draft: 'ドラフト（公式カード）' };

export function useInviteAnswer(): { accept: (inv: InviteView) => Promise<void>; decline: (inv: InviteView) => Promise<void>; busy: string | null; sheet: ReactNode } {
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [joining, setJoining] = useState<{ inv: InviteView; code: string; mode: RoomMode } | null>(null);

  const join = async (code: string, deck: { deck: Deck; cards: CardDef[] } | null): Promise<string | null> => {
    const r = await enterRoom({ op: 'join', code, name: loadOnlineName(), ...(deck ?? {}), features: [DRAFT_FEATURE] });
    if (!r.ok) return r.error;
    setJoining(null);
    goToRoom();
    return null;
  };

  const accept = async (inv: InviteView) => {
    if (busy) return;
    if (!(await confirmLeaveRoom(confirm))) return;
    setBusy(inv.id);
    const res = await socialAct({ op: 'inviteRespond', inviteId: inv.id, accept: true });
    setBusy(null);
    if (!res.ok) {
      toast({ text: res.reason === 'expired' || res.reason === 'notFound' ? `${inv.from.name}さんの招待は期限が切れています（部屋が始まったか、時間が過ぎました）` : res.error, kind: 'ng' });
      void refreshSocial();
      return;
    }
    const room = res.room;
    if (!room) {
      toast({ text: '部屋が見つかりませんでした', kind: 'ng' });
      return;
    }
    if (room.mode === 'draft') {
      setBusy(inv.id);
      const e = await join(room.code, null);
      setBusy(null);
      if (e) toast({ text: e, kind: 'ng' });
      return;
    }
    setJoining({ inv, code: room.code, mode: room.mode });
  };

  const decline = async (inv: InviteView) => {
    if (busy) return;
    setBusy(inv.id);
    const res = await socialAct({ op: 'inviteRespond', inviteId: inv.id, accept: false });
    setBusy(null);
    if (!res.ok && res.reason !== 'expired' && res.reason !== 'notFound') toast({ text: res.error, kind: 'ng' });
    else void refreshSocial();
  };

  const sheet = joining ? (
    <JoinSheet
      title={`「${joining.inv.from.name}」さんの部屋に入る`}
      mode={joining.mode}
      info={
        <p>
          <span className="u-name">{joining.inv.from.name}</span>さんからの招待（{MODE_LABEL[joining.mode]}・{rulesSummary(joining.inv.rules)}）
        </p>
      }
      onJoin={(c) => join(joining.code, c ? { deck: c.deck, cards: c.cards } : null)}
      onClose={() => setJoining(null)}
    />
  ) : null;

  return { accept, decline, busy, sheet };
}
