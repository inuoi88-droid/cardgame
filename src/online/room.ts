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
import { createGame, type PlayerSetup } from '../engine/battle/setup.ts';
import { randInt } from '../engine/battle/rng.ts';
import type { Action, GameState, PlayerId } from '../engine/battle/types.ts';
import { viewFor } from '../engine/battle/view.ts';
import {
  applyTake,
  autoPick,
  battleFirstAfterDraft,
  compactDraft,
  createDraft,
  draftDecks,
  draftTurn,
  draftView,
  isDraftDone,
} from '../engine/draft/field.ts';
import type { DraftState } from '../engine/draft/types.ts';
import { NAME_MAX_LENGTH, normalizeName } from './codes.ts';
import type { ErrorReason, RoomMode, RoomStatus, RoomView } from './protocol.ts';

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
/** 対戦のシードの範囲（http.ts と同じ） */
const SEED_RANGE = 0x7fffffff;
/** ドラフトの「おまかせ」の強さ */
const AUTO_PICK_LEVEL = 'normal';

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
  /** 今の手番（またはマリガン・ドラフトのピック）の締め切り */
  deadline: number | null;
  updatedAt: number;
  /**
   * 部屋の形式・ドラフト・再戦のための情報（決定事項 #115。DB の列 meta。無い古い部屋は自分のデッキの部屋で、再戦はできない）
   */
  meta?: RoomMeta | null;
}

/** 対戦に使うデッキ（再戦でも同じものを使う） */
export interface RoomDeck {
  deck: Deck;
  cards: CardDef[];
}

export interface RoomMeta {
  mode: RoomMode;
  /** 対戦のルール（ドラフトの部屋は入室前からここ。再戦でも同じものを使う） */
  rules?: MatchRules;
  /** ドラフトの状態（山の順番と乱数を含むのでサーバーの中だけ。終わったら compactDraft で小さくして記録に残す） */
  draft?: DraftState | null;
  /** ドラフトの「おまかせ」（席ごと。続けて時間切れになったか、自分で選んだ） */
  auto?: [boolean, boolean];
  /** 両者のデッキ（対戦が始まったら入る。再戦に使う） */
  decks?: [RoomDeck, RoomDeck];
  /** 「同じデッキでもう一戦」を押したか（席ごと。対戦が終わったときだけ意味がある） */
  rematch?: [boolean, boolean];
  /** この部屋で始めた対戦の数 */
  games?: number;
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

export function roomMode(room: RoomRecord): RoomMode {
  return room.meta?.mode === 'draft' ? 'draft' : 'deck';
}

export function createRoom(input: PlayerInput & { rules?: unknown; mode?: unknown }, ctx: { now: number; code: string; tokenHash: string }): Result<RoomRecord> {
  const rules = normalizeRules(input.rules);
  const leader = toLeaderId(input.leader);
  if (input.mode === 'draft') {
    // ドラフトの部屋：デッキは要らない（入室したら場から交互に取る）
    return {
      ok: true,
      value: {
        code: ctx.code,
        status: 'waiting',
        version: 1,
        state: null,
        seats: [{ name: normalizeName(input.name), tokenHash: ctx.tokenHash, lastSeen: ctx.now, timeouts: 0, ...(leader !== 'none' ? { leader } : {}) }],
        hostDeck: null,
        deadline: null,
        updatedAt: ctx.now,
        meta: { mode: 'draft', ...(rules ? { rules } : {}) },
      },
    };
  }
  const checked = checkDeck(input.deck, input.cards);
  if (!checked.ok) return checked;
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

/**
 * 2人目が入る。自分のデッキの部屋はすぐ対戦を始め（先攻・後攻はシードから決まる）、ドラフトの部屋はドラフトを始める。
 * pool はドラフトに使うカード（ドラフトの部屋だけ使う）
 */
export function joinRoom(
  room: RoomRecord,
  input: PlayerInput,
  ctx: { now: number; tokenHash: string; seed: number; pool?: readonly CardDef[] },
): Result<RoomRecord> {
  if (room.status !== 'waiting' || room.seats.length !== 1) return fail('この部屋はもう対戦が始まっています', 'invalid');
  const host = room.seats[0]!;
  let name = normalizeName(input.name);
  if (name === host.name) name = `${[...name].slice(0, NAME_MAX_LENGTH - 3).join('')}（2）`;
  const leader = toLeaderId(input.leader);
  const guest: Seat = { name, tokenHash: ctx.tokenHash, lastSeen: ctx.now, timeouts: 0, ...(leader !== 'none' ? { leader } : {}) };

  if (roomMode(room) === 'draft') {
    const created = createDraft({ seed: ctx.seed, pool: ctx.pool ?? [] });
    if (!created.ok) return fail(`ドラフトを始められません：${created.error}`, 'invalid');
    const next: RoomRecord = {
      ...room,
      status: 'drafting',
      version: room.version + 1,
      seats: [host, guest],
      hostDeck: null,
      meta: { ...room.meta!, draft: created.value, auto: [false, false] },
      updatedAt: ctx.now,
    };
    return { ok: true, value: progressDraft(next, ctx.now) };
  }

  if (!room.hostDeck) return fail('この部屋はもう対戦が始まっています', 'invalid');
  const checked = checkDeck(input.deck, input.cards);
  if (!checked.ok) return checked;
  const rules = normalizeRules(room.hostDeck.rules);
  const decks: [RoomDeck, RoomDeck] = [
    { deck: room.hostDeck.deck, cards: room.hostDeck.cards },
    { deck: checked.value.deck, cards: checked.value.cards },
  ];
  const seats = [host, guest];
  const started = startGame({ ...room, seats, meta: { mode: 'deck', ...(rules ? { rules } : {}) } }, decks, ctx.seed, undefined, ctx.now);
  if (!started.ok) return started;
  return { ok: true, value: { ...started.value, version: room.version + 1 } };
}

/**
 * 両者のデッキで対戦を始めた部屋（版は上げない）。入室・ドラフトの終わり・再戦で使う。
 * 続けて時間切れになった回数・再戦の印は0に戻し、デッキは再戦のために meta に残す
 */
function startGame(room: RoomRecord, decks: [RoomDeck, RoomDeck], seed: number, first: PlayerId | undefined, now: number): Result<RoomRecord> {
  const rules = normalizeRules(room.meta?.rules ?? room.hostDeck?.rules);
  const created = createGame({
    seed,
    players: [setupOf(room, decks, 0), setupOf(room, decks, 1)],
    ...(first !== undefined ? { first } : {}),
    ...(rules ? { rules } : {}),
  });
  if (!created.ok) return fail(created.error, 'invalid');
  const meta: RoomMeta = { ...(room.meta ?? { mode: 'deck' }), decks, rematch: [false, false], games: (room.meta?.games ?? 0) + 1 };
  delete meta.auto;
  if (rules) meta.rules = rules;
  return {
    ok: true,
    value: {
      ...room,
      status: 'playing',
      state: created.state,
      seats: room.seats.map((s) => ({ ...s, timeouts: 0 })),
      hostDeck: null,
      deadline: now + O.mulliganSeconds * 1000,
      updatedAt: now,
      meta,
    },
  };
}

function setupOf(room: RoomRecord, decks: [RoomDeck, RoomDeck], p: PlayerId): PlayerSetup {
  const seat = room.seats[p]!;
  return { name: seat.name, deck: decks[p].deck, cards: decks[p].cards, leader: toLeaderId(seat.leader) };
}

/**
 * ドラフトを進めた部屋（版は1つ上げる）：手番の人が「おまかせ」なら代わりに取り、終わったら対戦を始める
 * （後から取り始めた人が先攻。シードはドラフトの乱数から決める＝サーバーの中だけの値）。終わっていなければピックの締め切りを置き直す
 */
function progressDraft(room: RoomRecord, now: number): RoomRecord {
  let draft = room.meta!.draft!;
  const auto = room.meta!.auto ?? [false, false];
  for (let i = 0; i < AUTO_STEP_LIMIT; i++) {
    const turn = draftTurn(draft);
    if (turn === null || !auto[turn]) break;
    const next = autoTake(draft, turn);
    if (!next) break;
    draft = next;
  }
  const next: RoomRecord = { ...room, meta: { ...room.meta!, draft, auto }, updatedAt: now };
  if (!isDraftDone(draft)) return { ...next, status: 'drafting', version: room.version + 1, deadline: now + O.draftPickSeconds * 1000 };
  const seedState = { rng: draft.rng };
  const seed = randInt(seedState, SEED_RANGE);
  const decks = draftDecks(draft);
  const started = startGame({ ...next, meta: { ...next.meta!, draft: compactDraft(draft) } }, decks, seed, battleFirstAfterDraft(draft), now);
  // ドラフトのカードはどれもデッキのルールを守るので、ここで失敗するのはエンジンの不具合
  if (!started.ok) throw new Error(`draft game failed: ${started.error}`);
  return { ...started.value, version: room.version + 1 };
}

/** おまかせで1枚取ったドラフト（取れるものが無ければ null） */
function autoTake(draft: DraftState, p: PlayerId): DraftState | null {
  const cardId = autoPick(draft, p, AUTO_PICK_LEVEL);
  if (!cardId) return null;
  const r = applyTake(draft, p, cardId);
  return r.ok ? r.state : null;
}

/** ドラフトで1枚取る。先に applyTimeouts() を済ませた部屋に対して呼ぶ。送り主が見ていた版が今と違えばやり直してもらう */
export function handleTake(room: RoomRecord, seat: PlayerId, version: number, cardId: string, now: number): Result<RoomRecord> {
  const draft = room.meta?.draft;
  if (room.status !== 'drafting' || !draft) return fail('ドラフト中ではありません', 'invalid');
  if (version !== room.version) return fail('状態が更新されました。もう一度選んでください', 'version');
  const r = applyTake(draft, seat, cardId);
  if (!r.ok) return fail(r.error, 'invalid');
  // 自分で取ったら、続けて時間切れになった回数を0に戻し、おまかせもやめる
  const seats = room.seats.map((s, i) => (i === seat ? { ...s, timeouts: 0 } : s));
  const auto = withSeat(room.meta?.auto, seat, false);
  return { ok: true, value: progressDraft({ ...room, seats, meta: { ...room.meta!, draft: r.state, auto } }, now) };
}

/** ドラフトの「おまかせ」を入れる・切る（いつ送ってもよい。入れたときに自分の番なら、すぐ代わりに取る） */
export function handleAuto(room: RoomRecord, seat: PlayerId, on: boolean, now: number): Result<RoomRecord> {
  if (room.status !== 'drafting' || !room.meta?.draft) return fail('ドラフト中ではありません', 'invalid');
  const seats = on ? room.seats : room.seats.map((s, i) => (i === seat ? { ...s, timeouts: 0 } : s));
  const auto = withSeat(room.meta.auto, seat, on);
  const next: RoomRecord = { ...room, seats, meta: { ...room.meta, auto } };
  // 締め切りは、おまかせで手番が進んだときだけ置き直す
  const progressed = progressDraft(next, now);
  return { ok: true, value: progressed.meta?.draft?.picks.length === room.meta.draft.picks.length ? { ...progressed, deadline: room.deadline } : progressed };
}

/**
 * 「同じデッキでもう一戦」（対戦が終わったあと。両者が押したら、同じデッキ・新しいシードで次の対戦を始める）。
 * 先攻は前の対戦で負けた人、引き分けなら前の対戦で後攻だった人
 */
export function handleRematch(room: RoomRecord, seat: PlayerId, now: number, seed: number): Result<RoomRecord> {
  if (room.status !== 'ended' || !room.state) return fail('対戦が終わっていません', 'invalid');
  const decks = room.meta?.decks;
  if (!decks) return fail('この部屋では再戦できません', 'invalid');
  const rematch = withSeat(room.meta?.rematch, seat, true);
  if (room.meta?.rematch?.[seat]) return { ok: true, value: room };
  if (!rematch[0] || !rematch[1]) {
    return { ok: true, value: { ...room, meta: { ...room.meta!, rematch }, version: room.version + 1, updatedAt: now } };
  }
  const prev = room.state;
  const first: PlayerId = prev.result && prev.result.winner !== null ? other(prev.result.winner) : other(prev.first);
  const started = startGame(room, decks, seed, first, now);
  if (!started.ok) return started;
  return { ok: true, value: { ...started.value, version: room.version + 1 } };
}

function withSeat(flags: readonly [boolean, boolean] | undefined, seat: PlayerId, on: boolean): [boolean, boolean] {
  const out: [boolean, boolean] = [flags?.[0] ?? false, flags?.[1] ?? false];
  out[seat] = on;
  return out;
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
  if (room.status === 'drafting') return draftTimeout(room, now);
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

/**
 * ドラフトの時間切れ（決定事項 #115）：遅れた人の代わりにおまかせで1枚取る。ドラフトの時間切れでは負けにならず、
 * 続けて timeoutLoseCount 回になったら、その人は「おまかせ」になる（自分で取るか、おまかせを切るまで、番が来たらすぐ代わりに取る）
 */
function draftTimeout(room: RoomRecord, now: number): RoomRecord {
  const draft = room.meta?.draft;
  if (!draft || room.deadline === null || now <= room.deadline) return room;
  const late = draftTurn(draft);
  if (late === null) return room;
  const seats = room.seats.map((s, i) => (i === late ? { ...s, timeouts: s.timeouts + 1 } : s));
  const auto = withSeat(room.meta!.auto, late, (room.meta!.auto?.[late] ?? false) || seats[late]!.timeouts >= O.timeoutLoseCount);
  const taken = autoTake(draft, late) ?? draft;
  return progressDraft({ ...room, seats, meta: { ...room.meta!, draft: taken, auto } }, now);
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
    mode: roomMode(room),
    ...draftPart(room, seat),
    ...(room.status === 'ended' && room.meta?.decks ? { rematch: [room.meta.rematch?.[0] ?? false, room.meta.rematch?.[1] ?? false] as [boolean, boolean] } : {}),
    ...(room.meta?.games ? { games: room.meta.games } : {}),
  };
}

/** ドラフトの見え方（伏せた山の中身・順番と乱数は送らない。枚数だけ） */
function draftPart(room: RoomRecord, seat: PlayerId): Pick<RoomView, 'draft'> {
  const draft = room.meta?.draft;
  if (!draft) return {};
  const auto = room.meta?.auto;
  return { draft: { ...draftView(draft, seat), auto: [auto?.[0] ?? false, auto?.[1] ?? false] } };
}

/** 部屋のルール（MTG 要素 △ バッチD）：入室前は預かったデッキ（ドラフトの部屋は meta）に、対戦が始まったら対戦の状態にある */
function roomRules(room: RoomRecord): { rules?: MatchRules } {
  const rules = normalizeRules(room.hostDeck?.rules ?? room.meta?.rules ?? room.state?.rules);
  return rules ? { rules } : {};
}

export function isExpired(room: RoomRecord, now: number): boolean {
  return now - room.updatedAt > ROOM_TTL_MS;
}
