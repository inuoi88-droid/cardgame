// Edge Function「cardgame」：オンライン対戦の受付（Deno）。
// 処理の中身は engine.js（src/online と src/engine をまとめたもの。npm run build:server で作る）にあり、
// ここでは本物の DB（cardgame.rooms への直接接続）・時刻・暗号学的乱数・Realtime の通知をつなぐだけ。
// 本人確認は独自のトークンで行うため、Supabase の JWT 検証は使わない（verify_jwt = false）。
import postgres from 'npm:postgres@3.4.5';
import { handleBody } from './engine.js';

interface Seat {
  name: string;
  tokenHash: string;
  lastSeen: number;
  timeouts: number;
}
interface RoomRecord {
  code: string;
  status: 'waiting' | 'drafting' | 'playing' | 'ended';
  version: number;
  state: unknown;
  seats: Seat[];
  hostDeck: unknown;
  deadline: number | null;
  updatedAt: number;
  /** 部屋の形式・ドラフト・両者のデッキ・再戦の印（決定事項 #115。古い部屋は null） */
  meta?: unknown;
}

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

type Row = {
  code: string;
  status: RoomRecord['status'];
  version: number;
  state: unknown;
  seats: Seat[];
  host_deck: unknown;
  meta: unknown;
  deadline_ms: number | null;
  updated_ms: number;
};

const fromRow = (r: Row): RoomRecord => ({
  code: r.code,
  status: r.status,
  version: r.version,
  state: r.state,
  seats: r.seats,
  hostDeck: r.host_deck,
  meta: r.meta,
  deadline: r.deadline_ms,
  updatedAt: r.updated_ms,
});

// deno-lint-ignore no-explicit-any
const json = (tx: any, v: unknown) => (v === null || v === undefined ? null : tx.json(v));
const time = (ms: number | null) => (ms === null ? null : new Date(ms));

const store = {
  async insert(room: RoomRecord): Promise<boolean> {
    const rows = await sql`
      insert into cardgame.rooms (code, status, version, state, seats, host_deck, meta, deadline, updated_at)
      values (${room.code}, ${room.status}, ${room.version}, ${json(sql, room.state)}, ${json(sql, room.seats)},
              ${json(sql, room.hostDeck)}, ${json(sql, room.meta)}, ${time(room.deadline)}, ${time(room.updatedAt)})
      on conflict (code) do nothing
      returning code`;
    return rows.length === 1;
  },
  async update<T>(code: string, fn: (room: RoomRecord | null) => { save: RoomRecord | null; value: T }): Promise<T> {
    return await sql.begin(async (tx) => {
      const rows = await tx<Row[]>`
        select code, status, version, state, seats, host_deck, meta,
               (extract(epoch from deadline) * 1000)::float8 as deadline_ms,
               (extract(epoch from updated_at) * 1000)::float8 as updated_ms
        from cardgame.rooms where code = ${code} for update`;
      const { save, value } = fn(rows[0] ? fromRow(rows[0]) : null);
      if (save) {
        await tx`
          update cardgame.rooms set
            status = ${save.status}, version = ${save.version}, state = ${json(tx, save.state)},
            seats = ${json(tx, save.seats)}, host_deck = ${json(tx, save.hostDeck)}, meta = ${json(tx, save.meta)},
            deadline = ${time(save.deadline)}, updated_at = ${time(save.updatedAt)}
          where code = ${code}`;
      }
      return value;
    }) as T;
  },
  async removeOlderThan(ms: number): Promise<void> {
    await sql`delete from cardgame.rooms where updated_at < ${new Date(ms)}`;
  },
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

const deps = {
  store,
  now: () => Date.now(),
  randomInt,
  newToken: () => hex(crypto.getRandomValues(new Uint8Array(32))),
  hash: async (token: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))),
  async notify(code: string, version: number) {
    const res = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ messages: [{ topic: `cardgame:${code}`, event: 'update', payload: { version } }] }),
    });
    if (!res.ok) throw new Error(`broadcast ${res.status}: ${await res.text()}`);
  },
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
  const { status, body } = await handleBody(await req.text(), deps);
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
});
