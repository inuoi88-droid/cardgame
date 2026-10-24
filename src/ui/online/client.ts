/** Edge Function の呼び出し、Realtime の購読、部屋の合言葉の保存（再接続用） */
import { RealtimeClient, type RealtimeChannel } from '@supabase/realtime-js';
import type { OnlineRequest, OnlineResponse } from '../../online/protocol.ts';
import { FUNCTION_URL, LOCAL_SERVER_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config.ts';

/** 通信そのものの失敗（サーバーの返事がない）も含めた結果 */
export type ClientResponse = OnlineResponse | { ok: false; error: string; reason: 'network' };

export async function callServer(req: OnlineRequest): Promise<ClientResponse> {
  try {
    const res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify(req),
    });
    const body = (await res.json().catch(() => null)) as OnlineResponse | null;
    if (body && typeof body === 'object' && 'ok' in body) return body;
    return { ok: false, error: `サーバーから正しい返事がありません（${res.status}）`, reason: 'network' };
  } catch {
    return { ok: false, error: 'サーバーにつながりません。通信環境を確かめてください', reason: 'network' };
  }
}

let realtime: RealtimeClient | null = null;

/** 部屋の「版が上がった」通知を購読する。戻り値で購読をやめる */
export function subscribeRoom(code: string, onUpdate: (version: number) => void): () => void {
  // 手元の開発用サーバーには通知が無い（定期的な取得で進む）
  if (LOCAL_SERVER_URL) return () => {};
  realtime ??= new RealtimeClient(`${SUPABASE_URL}/realtime/v1`, { params: { apikey: SUPABASE_PUBLISHABLE_KEY } });
  let channel: RealtimeChannel | null = realtime.channel(`cardgame:${code}`, { config: { broadcast: { self: false }, private: false } });
  channel
    .on('broadcast', { event: 'update' }, (msg) => {
      const v = (msg.payload as { version?: unknown } | undefined)?.version;
      if (typeof v === 'number') onUpdate(v);
    })
    .subscribe();
  return () => {
    if (channel && realtime) void realtime.removeChannel(channel);
    channel = null;
  };
}

/** 参加中の部屋（同じブラウザで開き直したら、これで戻る） */
export interface OnlineSession {
  v: 1;
  code: string;
  token: string;
}

const SESSION_KEY = 'cardgame.v1.online';
const NAME_KEY = 'cardgame.v1.onlineName';

export function loadOnlineSession(): OnlineSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as OnlineSession;
    return s && s.v === 1 && typeof s.code === 'string' && typeof s.token === 'string' ? s : null;
  } catch {
    return null;
  }
}

export function saveOnlineSession(s: OnlineSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    // 保存できなくても、このページを開いている間は遊べる
  }
}

export function clearOnlineSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // 何もしない
  }
}

export function loadOnlineName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveOnlineName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // 何もしない
  }
}
