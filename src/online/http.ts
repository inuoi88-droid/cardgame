/**
 * Edge Function の受付の中身。DB・時刻・乱数・ハッシュ・通知は外から渡す（Vitest でも同じものを試せる）。
 * Edge Function（supabase/functions/cardgame/index.ts）は、これに本物の DB などをつなぐだけにする。
 */
import { generateCode } from './codes.ts';
import { MAX_BODY_CHARS, parseRequest, type OnlineResponse } from './protocol.ts';
import { ROOM_TTL_MS, type RoomRecord } from './room.ts';
import { serve, type ServeResult } from './server.ts';

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
}

export interface HttpResult {
  status: number;
  body: OnlineResponse;
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
  const parsed = parseRequest(raw);
  if (!parsed.ok) return { status: 400, body: { ok: false, error: parsed.error, reason: 'invalid' } };
  const req = parsed.value;

  try {
    const now = deps.now();
    if (req.op === 'create') {
      await deps.store.removeOlderThan(now - ROOM_TTL_MS);
      const token = deps.newToken();
      const tokenHash = await deps.hash(token);
      for (let i = 0; i < CODE_TRIES; i++) {
        const code = generateCode(deps.randomInt);
        const r = serve(req, null, { now, tokenHash, code, seed: 0 });
        if (!r.save) return { status: 200, body: r.response };
        if (await deps.store.insert(r.save)) return { status: 200, body: withToken(r.response, token) };
      }
      return { status: 503, body: { ok: false, error: '部屋を作れませんでした。もう一度お試しください' } };
    }

    const token = req.op === 'join' ? deps.newToken() : req.token;
    const tokenHash = await deps.hash(token);
    const seed = deps.randomInt(SEED_RANGE);
    const r: ServeResult = await deps.store.update(req.code, (room) => {
      const result = serve(req, room, { now, tokenHash, code: req.code, seed });
      return { save: result.save, value: result };
    });
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
