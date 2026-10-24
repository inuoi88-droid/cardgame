/**
 * 1回の送信の処理（純粋関数）。Edge Function は DB から部屋を読み、これを呼び、結果を保存して返すだけにする。
 * 時間切れの処理と「接続中」の記録は、どの送信でも最初に行う。
 */
import type { CardDef } from '../engine/types.ts';
import { ONLINE_DRAFT_CARDS } from './draftCards.ts';
import type { OnlineResponse, ParsedRequest } from './protocol.ts';
import {
  applyTimeouts,
  createRoom,
  handleAction,
  handleAuto,
  handleRematch,
  handleTake,
  isExpired,
  joinRoom,
  roomView,
  seatOf,
  touch,
  type Result,
  type RoomRecord,
} from './room.ts';

export interface ServeDeps {
  now: number;
  /** create・join：新しく発行したトークンのハッシュ。state・action：送られてきたトークンのハッシュ */
  tokenHash: string;
  /** create：新しい部屋コード */
  code: string;
  /** join：対戦（ドラフトの部屋はドラフト）のシード。rematch：次の対戦のシード */
  seed: number;
  /** ドラフトに使うカード（無ければ公式のカード ONLINE_DRAFT_CARDS） */
  draftPool?: readonly CardDef[];
}

export interface ServeResult {
  /** 保存する部屋（null なら保存しない） */
  save: RoomRecord | null;
  /** 新しい部屋なら true（insert する） */
  insert: boolean;
  /** 版が上がったので、部屋の購読者に知らせる */
  notify: boolean;
  response: OnlineResponse;
}

const NOT_FOUND: OnlineResponse = { ok: false, error: '部屋が見つかりません。コードを確かめてください', reason: 'notFound' };

/** room は req.code の部屋（create のときと見つからないときは null） */
export function serve(req: ParsedRequest, room: RoomRecord | null, deps: ServeDeps): ServeResult {
  const { now } = deps;
  const none = (response: OnlineResponse): ServeResult => ({ save: null, insert: false, notify: false, response });

  if (req.op === 'create') {
    const r = createRoom(req, { now, code: deps.code, tokenHash: deps.tokenHash });
    if (!r.ok) return none(r);
    return { save: r.value, insert: true, notify: false, response: { ok: true, ...roomView(r.value, 0, now) } };
  }

  if (!room || isExpired(room, now)) return none(NOT_FOUND);

  if (req.op === 'join') {
    const r = joinRoom(room, req, { now, tokenHash: deps.tokenHash, seed: deps.seed, pool: deps.draftPool ?? ONLINE_DRAFT_CARDS });
    if (!r.ok) return none(r);
    return { save: r.value, insert: false, notify: true, response: { ok: true, ...roomView(r.value, 1, now) } };
  }

  const seat = seatOf(room, deps.tokenHash);
  if (seat === null) return none({ ok: false, error: 'この部屋の参加者ではありません', reason: 'auth' });
  const current = touch(applyTimeouts(room, now), seat, now);
  const changed = current.version !== room.version;

  if (req.op === 'state') {
    return { save: current, insert: false, notify: changed, response: { ok: true, ...roomView(current, seat, now) } };
  }

  let r: Result<RoomRecord>;
  if (req.op === 'take') r = handleTake(current, seat, req.version, req.cardId, now);
  else if (req.op === 'auto') r = handleAuto(current, seat, req.on, now);
  else if (req.op === 'rematch') r = handleRematch(current, seat, now, deps.seed);
  else r = handleAction(current, seat, req.version, req.action, now);
  if (!r.ok) return { save: current, insert: false, notify: changed, response: r };
  return { save: r.value, insert: false, notify: r.value.version !== room.version, response: { ok: true, ...roomView(r.value, seat, now) } };
}
