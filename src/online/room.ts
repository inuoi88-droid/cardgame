/**
 * オンライン対戦の部屋の処理（純粋関数）。
 * 時刻・乱数・トークンのハッシュは呼び出し側が渡す。
 * 完全な対戦状態（room.state）はサーバーの中だけにあり、プレイヤーには roomView()（viewFor の結果）だけを返す。
 */
import { BALANCE } from '../engine/balance.ts';
import { analyzeDeck } from '../engine/deck.ts';
import { parseCard, parseDeck } from '../engine/io.ts';
import type { CardDef, Deck } from '../engine/types.ts';
import { normalizeRules, type MatchRules } from '../engine/fields.ts';
import { toLeaderId, type LeaderId } from '../engine/leaders.ts';
import { applyAction } from '../engine/battle/apply.ts';
import { other } from '../engine/battle/core.ts';
import { createGame } from '../engine/battle/setup.ts';
import type { Action, GameState, PlayerId } from '../engine/battle/types.ts';
import { viewFor } from '../engine/battle/view.ts';
import { NAME_MAX_LENGTH, normalizeName } from './codes.ts';
import type { ErrorReason, RoomStatus, RoomView } from './protocol.ts';

const O = BALANCE.online;

/** 相手を「接続中」とみなす、最後の通信からの時間 */
export const CONNECTED_WITHIN_MS = 30_000;
/** 部屋を消すまでの、最後の操作からの時間 */
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
/** 送られてくるカード・デッキの大きさの上限（いたずら対策） */
export const MAX_CARDS = 60;
export const MAX_ENTRIES = 60;
/** 時間切れのときに自動で進める手数の上限（無限に続かないように） */
const AUTO_STEP_LIMIT = 50;

export interface Seat {
  name: string;
  tokenHash: string;
  /** 最後に通信があった時刻 */
  lastSeen: number;
  /** 続けて時間切れになった回数 */
  timeouts: number;
  /** リーダー（MTG 要素 △ バッチD。無い古い部屋は none） */
  leader?: LeaderId;
}

export interface RoomRecord {
  code: string;
  status: RoomStatus;
  /** 更新のたびに+1（同時送信の検出と通知に使う） */
  version: number;
  state: GameState | null;
  seats: Seat[];
  /**
   * 相手が入るまで預かる、作成者のデッキ。rules は部屋を作ったときに選んだ対戦のルール（MTG 要素 △ バッチD）。
   * DB の列を増やさないよう、入室前はここに、対戦が始まったら GameState.rules に持つ
   */
  hostDeck: { deck: Deck; cards: CardDef[]; rules?: MatchRules } | null;
  /** 今の手番（またはマリガン）の締め切り */
  deadline: number | null;
  updatedAt: number;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string; reason?: ErrorReason };

export const fail = <T>(error: string, reason?: ErrorReason): Result<T> => ({ ok: false, error, ...(reason ? { reason } : {}) });

/** 送られてきたデッキとカードを検証する（データの形・カード作成ルール・デッキのルール） */
export function checkDeck(rawDeck: unknown, rawCards: unknown): Result<{ deck: Deck; cards: CardDef[] }> {
  const d = parseDeck(rawDeck);
  if (!d.ok) return fail(`デッキの形式が正しくありません：${d.error}`, 'invalid');
  if (d.value.entries.length > MAX_ENTRIES) return fail('デッキのカードの種類が多すぎます', 'invalid');
  if (!Array.isArray(rawCards) || rawCards.length > MAX_CARDS) return fail('カードのデータが正しくありません', 'invalid');
  const cards: CardDef[] = [];
  for (const raw of rawCards) {
    const c = parseCard(raw);
    if (!c.ok) return fail(`カードの形式が正しくありません：${c.error}`, 'invalid');
    cards.push(c.value);
  }
  const byId = new Map(cards.map((c) => [c.id, c]));
  const a = analyzeDeck(d.value, byId);
  if (!a.valid) return fail(`デッキがルール違反です：${a.violations[0]?.message ?? ''}`, 'invalid');
  // デッキで使うカードだけを残す
  const used = new Set(d.value.entries.map((e) => e.cardId));
  return { ok: true, value: { deck: d.value, cards: [...byId.values()].filter((c) => used.has(c.id)) } };
}

export interface PlayerInput {
  name: unknown;
  deck: unknown;
  cards: unknown;
  /** リーダー（MTG 要素 △ バッチD。無い・知らない値は none） */
  leader?: unknown;
}

export function createRoom(input: PlayerInput & { rules?: unknown }, ctx: { now: number; code: string; tokenHash: string }): Result<RoomRecord> {
  const checked = checkDeck(input.deck, input.cards);
  if (!checked.ok) return checked;
  const rules = normalizeRules(input.rules);
  const leader = toLeaderId(input.leader);
  return {
    ok: true,
    value: {
      code: ctx.code,
      status: 'waiting',
      version: 1,
      state: null,
      seats: [{ name: normalizeName(input.name), tokenHash: ctx.tokenHash, lastSeen: ctx.now, timeouts: 0, ...(leader !== 'none' ? { leader } : {}) }],
      hostDeck: { ...checked.value, ...(rules ? { rules } : {}) },
      deadline: null,
      updatedAt: ctx.now,
    },
  };
}

/** 2人目が入って対戦を始める。先攻・後攻はシードから決まる */
export function joinRoom(room: RoomRecord, input: PlayerInput, ctx: { now: number; tokenHash: string; seed: number }): Result<RoomRecord> {
  if (room.status !== 'waiting' || room.seats.length !== 1 || !room.hostDeck) return fail('この部屋はもう対戦が始まっています', 'invalid');
  const checked = checkDeck(input.deck, input.cards);
  if (!checked.ok) return checked;
  const host = room.seats[0]!;
  let name = normalizeName(input.name);
  if (name === host.name) name = `${[...name].slice(0, NAME_MAX_LENGTH - 3).join('')}（2）`;
  const leader = toLeaderId(input.leader);
  const rules = normalizeRules(room.hostDeck.rules);
  const created = createGame({
    seed: ctx.seed,
    players: [
      { name: host.name, deck: room.hostDeck.deck, cards: room.hostDeck.cards, leader: toLeaderId(host.leader) },
      { name, deck: checked.value.deck, cards: checked.value.cards, leader },
    ],
    ...(rules ? { rules } : {}),
  });
  if (!created.ok) return fail(created.error, 'invalid');
  return {
    ok: true,
    value: {
      ...room,
      status: 'playing',
      version: room.version + 1,
      state: created.state,
      seats: [host, { name, tokenHash: ctx.tokenHash, lastSeen: ctx.now, timeouts: 0, ...(leader !== 'none' ? { leader } : {}) }],
      hostDeck: null,
      deadline: ctx.now + O.mulliganSeconds * 1000,
      updatedAt: ctx.now,
    },
  };
}

export function seatOf(room: RoomRecord, tokenHash: string): PlayerId | null {
  const i = room.seats.findIndex((s) => s.tokenHash === tokenHash);
  return i === 0 || i === 1 ? i : null;
}

/** 通信があったことを記録する（版は上げない） */
export function touch(room: RoomRecord, seat: PlayerId, now: number): RoomRecord {
  return { ...room, seats: room.seats.map((s, i) => (i === seat ? { ...s, lastSeen: now } : s)) };
}

/** 状態を進めた部屋。手番やフェーズが変わったら締め切りを置き直す */
function advance(room: RoomRecord, seats: Seat[], next: GameState, now: number, resetDeadline: boolean): RoomRecord {
  const prev = room.state!;
  const changedTurn = next.phase !== prev.phase || next.turnIndex !== prev.turnIndex;
  const deadline =
    next.phase === 'ended'
      ? null
      : resetDeadline || changedTurn
        ? now + (next.phase === 'mulligan' ? O.mulliganSeconds : O.turnSeconds) * 1000
        : room.deadline;
  return {
    ...room,
    seats,
    state: next,
    status: next.phase === 'ended' ? 'ended' : 'playing',
    version: room.version + 1,
    deadline,
    updatedAt: now,
  };
}

/** 相手の動きと関係なく、いつ送っても意味が変わらない行動（両者が同時に送るマリガンなど） */
const ORDER_FREE: ReadonlySet<Action['type']> = new Set(['mulligan', 'concede']);

/**
 * プレイヤーの行動。先に applyTimeouts() を済ませた部屋に対して呼ぶ。
 * 送り主が見ていた版が今の版と違えば（相手が先に動いた・時間切れが起きた）やり直してもらう。
 * ただしマリガンと降参は、今の状態で検証できれば受け付ける。
 */
export function handleAction(room: RoomRecord, seat: PlayerId, version: number, action: Action, now: number): Result<RoomRecord> {
  if (room.status !== 'playing' || !room.state) return fail('対戦中ではありません', 'invalid');
  if (action.player !== seat) return fail('自分の行動ではありません', 'auth');
  if (version !== room.version && !ORDER_FREE.has(action.type)) return fail('状態が更新されました。もう一度操作してください', 'version');
  const r = applyAction(room.state, action);
  if (!r.ok) return fail(r.error, 'invalid');
  // 自分で動いたら、続けて時間切れになった回数は0に戻す
  const seats = room.seats.map((s, i) => (i === seat ? { ...s, timeouts: 0 } : s));
  return { ok: true, value: advance(room, seats, r.state, now, false) };
}

/** 時間切れで自動的に選ぶ（必要な最低限の数だけ、先頭から） */
function autoChoice(g: GameState): Action | null {
  if (!g.pending) return null;
  return { type: 'choose', player: g.pending.player, picks: g.pending.options.slice(0, g.pending.min).map((o) => o.id) };
}

/**
 * 締め切りを過ぎていれば時間切れを処理する（決定事項 #57）。過ぎていなければそのまま返す。
 * - マリガン中：まだ決めていないプレイヤーは今の手札で開始する。
 * - 対戦中：遅れたのは選択待ちならその選択の持ち主、そうでなければ手番のプレイヤー。
 *   選択を自動で済ませ、手番のプレイヤーが遅れたのならターンを終える。
 * - 続けて規定回数の時間切れになったプレイヤーは負け。
 * 処理のあとは新しい締め切りを置く（同じ時間切れを何度も数えないように）。
 */
export function applyTimeouts(room: RoomRecord, now: number): RoomRecord {
  if (room.status !== 'playing' || !room.state || room.deadline === null || now <= room.deadline) return room;
  let g = room.state;
  const seats = room.seats.map((s) => ({ ...s }));
  const step = (a: Action): boolean => {
    const r = applyAction(g, a);
    if (r.ok) g = r.state;
    return r.ok;
  };
  /** 時間切れを1回数える。負けになったら true */
  const strike = (p: PlayerId): boolean => {
    const s = seats[p]!;
    s.timeouts += 1;
    if (s.timeouts < O.timeoutLoseCount) return false;
    step({ type: 'concede', player: p, reason: 'timeout' });
    return true;
  };

  if (g.phase === 'mulligan') {
    for (const p of [0, 1] as const) {
      if (g.phase !== 'mulligan' || g.players[p].mulligan.done) continue;
      if (!strike(p)) step({ type: 'mulligan', player: p, mode: 'keep' });
    }
  } else if (g.phase === 'main') {
    const late: PlayerId = g.pending ? g.pending.player : g.active;
    const turn = g.turnIndex;
    if (!strike(late)) {
      for (let i = 0; i < AUTO_STEP_LIMIT && g.phase === 'main' && g.turnIndex === turn; i++) {
        const choice = autoChoice(g);
        if (choice) {
          if (!step(choice)) break;
          continue;
        }
        // 相手の選択待ちで遅れただけなら、手番のプレイヤーのターンは終えない
        if (late !== g.active) break;
        if (!step({ type: 'endTurn', player: g.active })) break;
      }
    }
  }
  return advance(room, seats, g, now, true);
}

/** 1人のプレイヤーに返す部屋の様子（相手の非公開情報は隠す） */
export function roomView(room: RoomRecord, seat: PlayerId, now: number): RoomView {
  const opp = room.seats[other(seat)];
  return {
    code: room.code,
    seat,
    status: room.status,
    version: room.version,
    view: room.state ? viewFor(room.state, seat) : null,
    deadline: room.deadline,
    serverNow: now,
    names: [room.seats[0]?.name ?? '', room.seats[1]?.name ?? null],
    opponentConnected: opp ? now - opp.lastSeen <= CONNECTED_WITHIN_MS : false,
    timeouts: [room.seats[0]?.timeouts ?? 0, room.seats[1]?.timeouts ?? 0],
    ...roomRules(room),
    leaders: [toLeaderId(room.seats[0]?.leader), room.seats[1] ? toLeaderId(room.seats[1].leader) : null],
  };
}

/** 部屋のルール（MTG 要素 △ バッチD）：入室前は預かったデッキに、対戦が始まったら対戦の状態にある */
function roomRules(room: RoomRecord): { rules?: MatchRules } {
  const rules = normalizeRules(room.hostDeck?.rules ?? room.state?.rules);
  return rules ? { rules } : {};
}

export function isExpired(room: RoomRecord, now: number): boolean {
  return now - room.updatedAt > ROOM_TTL_MS;
}
