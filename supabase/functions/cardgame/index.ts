// Edge Function「cardgame」：オンライン対戦とフレンド機能とプレイヤーからの報告（決定事項 #129）の受付（Deno）。
// 処理の中身は engine.js（src/online と src/engine をまとめたもの。npm run build:server で作る）にあり、
// ここでは本物の DB（cardgame スキーマへの直接接続。SQL は sqlStore.ts）・時刻・暗号学的乱数・Realtime の通知をつなぐだけ。
// 本人確認は独自のトークン（部屋）とプレイヤーの鍵（フレンド機能。決定事項 #121）で行うため、Supabase の JWT 検証は使わない（verify_jwt = false）。
// デプロイするファイル：index.ts・sqlStore.ts・engine.js の3つ。
import postgres from 'npm:postgres@3.4.5';
import { handleBody } from './engine.js';
import { makeFeedbackStore, makeRoomStore, makeSocialStore } from './sqlStore.ts';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 4, idle_timeout: 20 });
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

/** Realtime に通知するための鍵（新しい秘密鍵があればそれ、なければ従来の service_role） */
function serverKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    if (typeof keys.default === 'string') return keys.default;
  } catch {
    // 従来の鍵を使う
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}
const KEY = serverKey();

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

function randomInt(n: number): number {
  // 偏りが出ないよう、n の倍数に収まらない値は引き直す
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0]! < limit) return buf[0]! % n;
  }
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** Realtime の broadcast（中身は小さな印だけ。ブラウザは受け取ったら取り直す） */
async function broadcast(topic: string, event: string, payload: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: KEY },
    body: JSON.stringify({ messages: [{ topic, event, payload }] }),
  });
  if (!res.ok) throw new Error(`broadcast ${res.status}: ${await res.text()}`);
}

/**
 * 送り元を表す鍵（決定事項 #124。プレイヤーを作る回数の上限に使う）。x-forwarded-for の最初の IP の SHA-256 の先頭32文字。
 * 生の IP は渡さず、DB の回数の記録（cardgame.rate_events）にもハッシュだけが1週間残る
 */
async function clientKey(req: Request): Promise<string | undefined> {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || req.headers.get('x-real-ip')?.trim() || '';
  if (!ip) return undefined;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`cardgame-client:${ip}`));
  return hex(new Uint8Array(digest)).slice(0, 32);
}

const store = makeRoomStore(sql);
const social = makeSocialStore(sql);
const feedback = makeFeedbackStore(sql);

const deps = {
  store,
  social,
  feedback,
  now: () => Date.now(),
  randomInt,
  newToken: () => hex(crypto.getRandomValues(new Uint8Array(32))),
  hash: async (token: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))),
  /** 部屋の版が上がった：cardgame:<部屋コード> の update { version } */
  notify: (code: string, version: number) => broadcast(`cardgame:${code}`, 'update', { version }),
  /** 本人あての知らせ：cardgame:inbox:<inboxId> の social { kind }（決定事項 #121） */
  notifyInbox: (inboxId: string, kind: string) => broadcast(`cardgame:inbox:${inboxId}`, 'social', { kind }),
  log: (message: string) => console.error(message),
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST で送ってください' }), {
      status: 405,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
  const { status, body } = await handleBody(await req.text(), deps, { clientKey: await clientKey(req) });
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
});
