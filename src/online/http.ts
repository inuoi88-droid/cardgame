/**
 * Edge Function の受付の中身。DB・時刻・乱数・ハッシュ・通知は外から渡す（Vitest でも同じものを試せる）。
 * Edge Function（supabase/functions/cardgame/index.ts）は、これに本物の DB などをつなぐだけにする。
 */
import type { CardDef } from '../engine/types.ts';
import { generateCode } from './codes.ts';
import { MAX_BODY_CHARS, parseRequest, type OnlineResponse } from './protocol.ts';
import { ROOM_TTL_MS, type RoomRecord, type SeatPlayer } from './room.ts';
import { serve, type ServeResult } from './server.ts';
import { handleSocial, type InboxEvent } from './social/handlers.ts';
import { isSocialOp, parseSocialRequest, type SocialResponse } from './social/protocol.ts';
import { matchRecordOf, presenceUpdates } from './social/rooms.ts';
import type { MatchRecord, PresenceUpdate, SocialStore } from './social/types.ts';

/** 部屋の保存場所 */
export interface RoomStore {
  /** 新しい部屋を入れる。同じコードの部屋がもうあれば false */
  insert(room: RoomRecord): Promise<boolean>;
  /** 部屋を読み、fn の結果の save を書き戻すまでを、ほかの送信と混ざらないように行う（行ロック） */
  update<T>(code: string, fn: (room: RoomRecord | null) => { save: RoomRecord | null; value: T }): Promise<T>;
  /** 最後の操作が time より前の部屋を消す */
  removeOlderThan(time: number): Promise<void>;
}

export interface HttpDeps {
  store: RoomStore;
  now(): number;
  /** 0 以上 n 未満の暗号学的乱数 */
  randomInt(n: number): number;
  /** 新しいトークン（16進64文字） */
  newToken(): string;
  /** トークンのハッシュ（DB にはこれだけを保存する） */
  hash(token: string): Promise<string>;
  /** 部屋の版が上がったことを、購読しているブラウザに知らせる（中身は送らない） */
  notify(code: string, version: number): Promise<void>;
  log?(message: string): void;
  /** ドラフトに使うカード（無ければ公式のカード。テストと開発用のサーバーで差し替える） */
  draftPool?: readonly CardDef[];
  /**
   * フレンド機能の保存場所（決定事項 #121）。無ければフレンド機能の操作は unsupported、create・join の secret は断る
   * （部屋の対戦そのものは今までどおり動く）
   */
  social?: SocialStore;
  /** 自分あての通知（Realtime の cardgame:inbox:<inboxId>、event 'social'、payload { kind }）。無ければ知らせない */
  notifyInbox?(inboxId: string, event: InboxEvent): Promise<void>;
}

export interface HttpResult {
  status: number;
  body: OnlineResponse | SocialResponse;
}

const CODE_TRIES = 5;
const SEED_RANGE = 0x7fffffff;

export async function handleBody(text: string, deps: HttpDeps): Promise<HttpResult> {
  if (text.length > MAX_BODY_CHARS) return { status: 413, body: { ok: false, error: '送るデータが大きすぎます', reason: 'invalid' } };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { status: 400, body: { ok: false, error: '送信の形式が正しくありません', reason: 'invalid' } };
  }
  if (typeof raw === 'object' && raw !== null && isSocialOp((raw as { op?: unknown }).op)) return socialBody(raw, deps);
  const parsed = parseRequest(raw);
  if (!parsed.ok) return { status: 400, body: { ok: false, error: parsed.error, reason: 'invalid' } };
  const req = parsed.value;

  try {
    const now = deps.now();
    // フレンド機能のプレイヤー（決定事項 #121。secret を送ったときだけ席に結び付ける）
    let player: SeatPlayer | undefined;
    if ((req.op === 'create' || req.op === 'join') && req.secret !== undefined) {
      const found = await seatPlayer(req.secret, deps);
      if (!found.ok) return { status: 200, body: found.body };
      player = found.player;
    }
    const withPlayer = player ? { player } : {};

    if (req.op === 'create') {
      await deps.store.removeOlderThan(now - ROOM_TTL_MS);
      const token = deps.newToken();
      const tokenHash = await deps.hash(token);
      for (let i = 0; i < CODE_TRIES; i++) {
        const code = generateCode(deps.randomInt);
        const r = serve(req, null, { now, tokenHash, code, seed: 0, ...withPlayer });
        if (!r.save) return { status: 200, body: r.response };
        if (await deps.store.insert(r.save)) {
          await afterRoom(null, presenceUpdates(null, r.save, 0, now), deps);
          return { status: 200, body: withToken(r.response, token) };
        }
      }
      return { status: 503, body: { ok: false, error: '部屋を作れませんでした。もう一度お試しください' } };
    }

    const token = req.op === 'join' ? deps.newToken() : req.token;
    const tokenHash = await deps.hash(token);
    const seed = deps.randomInt(SEED_RANGE);
    let match: MatchRecord | null = null;
    let presence: PresenceUpdate[] = [];
    const r: ServeResult = await deps.store.update(req.code, (room) => {
      const result = serve(req, room, { now, tokenHash, code: req.code, seed, ...(deps.draftPool ? { draftPool: deps.draftPool } : {}), ...withPlayer });
      // 決着の記録と「見かけた」は、部屋の前後から作る（保存は部屋の書き込みのあと。失敗しても対戦は止めない）
      if (deps.social) {
        match = matchRecordOf(room, result.save, now);
        presence = presenceUpdates(room, result.save, result.response.ok ? result.response.seat : null, now);
      }
      return { save: result.save, value: result };
    });
    await afterRoom(match, presence, deps);
    if (r.notify && r.save) {
      try {
        await deps.notify(r.save.code, r.save.version);
      } catch (e) {
        // 通知に失敗しても、相手のブラウザは定期的に状態を取りに来るので進行は止まらない
        deps.log?.(`notify failed: ${String(e)}`);
      }
    }
    return { status: 200, body: req.op === 'join' ? withToken(r.response, token) : r.response };
  } catch (e) {
    deps.log?.(`error: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    return { status: 500, body: { ok: false, error: 'サーバーでエラーが起きました。少し待ってからもう一度お試しください' } };
  }
}

function withToken(res: OnlineResponse, token: string): OnlineResponse {
  return res.ok ? { ...res, token } : res;
}

async function seatPlayer(secret: string, deps: HttpDeps): Promise<{ ok: true; player: SeatPlayer } | { ok: false; body: OnlineResponse }> {
  if (!deps.social) return { ok: false, body: { ok: false, error: 'このサーバーはフレンド機能に対応していません', reason: 'player' } };
  const p = await deps.social.playerBySecretHash(await deps.hash(secret));
  if (!p) return { ok: false, body: { ok: false, error: 'プレイヤー情報が見つかりません。引き継ぎコードを確かめてください', reason: 'player' } };
  return { ok: true, player: { id: p.id, friendCode: p.friendCode } };
}

/** 部屋の送信のあとの、決着の記録と「見かけた」の保存（失敗しても対戦は止めない） */
async function afterRoom(match: MatchRecord | null, presence: PresenceUpdate[], deps: HttpDeps): Promise<void> {
  if (!deps.social) return;
  try {
    if (match) await deps.social.insertMatch(match);
    if (presence.length > 0) await deps.social.updatePresence(presence);
  } catch (e) {
    deps.log?.(`social after room failed: ${String(e)}`);
  }
}

async function socialBody(raw: unknown, deps: HttpDeps): Promise<HttpResult> {
  const parsed = parseSocialRequest(raw);
  if (!parsed.ok) return { status: 400, body: { ok: false, error: parsed.error, reason: 'invalid' } };
  if (!deps.social) return { status: 200, body: { ok: false, error: 'このサーバーはフレンド機能に対応していません', reason: 'unsupported' } };
  try {
    const body = await handleSocial(parsed.value, {
      store: deps.social,
      now: deps.now(),
      randomInt: deps.randomInt,
      newToken: deps.newToken,
      hash: deps.hash,
      ...(deps.notifyInbox ? { notifyInbox: deps.notifyInbox } : {}),
      ...(deps.log ? { log: deps.log } : {}),
    });
    return { status: 200, body };
  } catch (e) {
    deps.log?.(`error: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    return { status: 500, body: { ok: false, error: 'サーバーでエラーが起きました。少し待ってからもう一度お試しください' } };
  }
}
