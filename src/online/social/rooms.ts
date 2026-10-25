/**
 * 部屋とフレンド機能のつなぎ目（決定事項 #121。純粋関数）：決着の記録・「見かけた」の記録・公開の部屋の一覧の見え方。
 * http.ts が部屋の送信の前後の部屋から作り、保存は SocialStore に任せる（serve() は純粋なまま）
 */
import { normalizeRules } from '../../engine/fields.ts';
import { toLeaderId } from '../../engine/leaders.ts';
import type { PlayerId } from '../../engine/battle/types.ts';
import type { RoomRecord } from '../room.ts';
import type { ListedRoomView } from './protocol.ts';
import { PRESENCE_STEP_MS, type MatchRecord, type PresenceUpdate, type RoomSummary } from './types.ts';

/** 対戦が決着した送信なら、その1戦の記録（両方の席がプレイヤーに結び付いているときだけ。再戦の決着も1戦ずつ） */
export function matchRecordOf(before: RoomRecord | null, after: RoomRecord | null, now: number): MatchRecord | null {
  if (!after || after.status !== 'ended' || before?.status === 'ended') return null;
  const result = after.state?.result;
  const p0 = after.seats[0]?.playerId;
  const p1 = after.seats[1]?.playerId;
  if (!result || !p0 || !p1) return null;
  const game = after.meta?.games ?? 1;
  return {
    id: `${after.code}-${game}-${now}`,
    roomCode: after.code,
    game,
    players: [p0, p1],
    winner: result.winner,
    mode: after.meta?.mode === 'draft' ? 'draft' : 'deck',
    at: now,
  };
}

/**
 * 部屋の送信で記録する「見かけた」。送った席のプレイヤーは PRESENCE_STEP_MS ごとに1回（毎回 DB に書かないように）、
 * 部屋の状態が変わったとき（入室・ドラフトの終わり・決着・再戦）は送った人も相手も今の状態を書く（相手の「対戦中」がすぐ消えるように）
 */
export function presenceUpdates(before: RoomRecord | null, after: RoomRecord | null, seat: PlayerId | null, now: number): PresenceUpdate[] {
  if (!after || seat === null) return [];
  const out: PresenceUpdate[] = [];
  const changed = before?.status !== after.status;
  const me = after.seats[seat];
  const prevSeen = before?.seats[seat]?.lastSeen;
  if (me?.playerId && (changed || prevSeen === undefined || Math.floor(prevSeen / PRESENCE_STEP_MS) !== Math.floor(now / PRESENCE_STEP_MS))) {
    out.push({ playerId: me.playerId, seen: now, room: { code: after.code, status: after.status, at: now } });
  }
  const opp = after.seats[seat === 0 ? 1 : 0];
  if (changed && opp?.playerId) out.push({ playerId: opp.playerId, room: { code: after.code, status: after.status, at: opp.lastSeen } });
  return out;
}

/** 部屋の要約（メモリの保存場所が使う。SQL は同じ形を列から作る） */
export function summaryOf(room: RoomRecord): RoomSummary {
  const m = room.meta;
  return {
    code: room.code,
    status: room.status,
    seats: room.seats,
    meta: m ? { mode: m.mode, ...(m.rules ? { rules: m.rules } : {}), ...(m.listed ? { listed: true } : {}), ...(m.closed ? { closed: true } : {}) } : null,
    rules: room.hostDeck?.rules ?? null,
    updatedAt: room.updatedAt,
  };
}

/** 一覧に出せる公開の部屋か（待機中・閉じていない・1人・公開・作成者が minSeen 以降に通信） */
export function isListable(r: RoomSummary, minSeen: number): boolean {
  return r.status === 'waiting' && !r.meta?.closed && r.seats.length === 1 && r.meta?.listed === true && (r.seats[0]?.lastSeen ?? 0) >= minSeen;
}

export function listedRoomView(r: RoomSummary): ListedRoomView {
  const host = r.seats[0]!;
  const rules = normalizeRules(r.rules ?? r.meta?.rules);
  return {
    code: r.code,
    hostName: host.name,
    mode: r.meta?.mode === 'draft' ? 'draft' : 'deck',
    ...(rules ? { rules } : {}),
    leader: toLeaderId(host.leader),
    since: r.updatedAt,
    hostSeen: host.lastSeen,
  };
}
