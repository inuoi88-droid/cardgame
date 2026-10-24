/**
 * 手元で試すためのオンライン対戦のサーバー（決定事項 #115）。Edge Function「cardgame」と同じ src/online の handleBody を、
 * メモリの部屋置き場（再起動で消える）と Node の http でつなぐ。Supabase には何もつながない。
 *
 *   npm run dev:server            … http://localhost:8787 で待つ（PORT=9000 npm run dev:server で変えられる）
 *   npm run dev                   … 別の端末で画面を起動し、2つのブラウザ（または通常とプライベートのウィンドウ）で
 *                                   http://localhost:5173/?server=http://localhost:8787#/online を開く
 *                                   （VITE_ONLINE_URL=http://localhost:8787 npm run dev でもよい。src/ui/online/config.ts）
 *
 * Realtime の通知は無いので、ブラウザは数秒おきの取得（POLL_MS）で最新になる。
 * 同じブラウザの2つのタブは参加中の部屋の記録（localStorage）を共有するので、別のブラウザかプライベートのウィンドウを使う。
 */
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { createServer } from 'node:http';
import { handleBody, MAX_BODY_CHARS, type HttpDeps, type RoomRecord, type RoomStore } from '../src/online/index.ts';

const PORT = Number(process.env.PORT ?? 8787);

class MemoryStore implements RoomStore {
  rooms = new Map<string, RoomRecord>();
  async insert(room: RoomRecord) {
    if (this.rooms.has(room.code)) return false;
    this.rooms.set(room.code, structuredClone(room));
    return true;
  }
  // 1つのプロセスの中で await をはさまずに読み書きするので、ほかの送信と混ざらない
  async update<T>(code: string, fn: (room: RoomRecord | null) => { save: RoomRecord | null; value: T }) {
    const current = this.rooms.get(code);
    const r = fn(current ? structuredClone(current) : null);
    if (r.save) this.rooms.set(code, structuredClone(r.save));
    return r.value;
  }
  async removeOlderThan(time: number) {
    for (const [code, room] of this.rooms) if (room.updatedAt < time) this.rooms.delete(code);
  }
}

const store = new MemoryStore();
const deps: HttpDeps = {
  store,
  now: () => Date.now(),
  randomInt: (n) => randomInt(n),
  newToken: () => randomBytes(32).toString('hex'),
  hash: async (t) => createHash('sha256').update(t).digest('hex'),
  notify: async () => {},
  log: (m) => console.error(m),
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS).end();
    return;
  }
  if (req.method === 'GET') {
    const rooms = [...store.rooms.values()].map((r) => `${r.code} ${r.status} v${r.version} ${r.meta?.mode ?? 'deck'} ${r.seats.map((s) => s.name).join(' / ')}`);
    res.writeHead(200, { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' }).end(`cardgame dev server\n${rooms.join('\n')}\n`);
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { ...CORS, 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: false, error: 'POST で送ってください' }));
    return;
  }
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (chunk: string) => {
    body += chunk;
    if (body.length > MAX_BODY_CHARS * 2) req.destroy();
  });
  req.on('end', () => {
    void handleBody(body, deps).then(({ status, body: out }) => {
      const op = (() => {
        try {
          return (JSON.parse(body) as { op?: string }).op ?? '?';
        } catch {
          return '?';
        }
      })();
      if (op !== 'state') console.log(`${new Date().toISOString()} ${op} → ${status}${out.ok ? ` ${out.code} ${out.status} v${out.version}` : ` ${out.error}`}`);
      res.writeHead(status, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(out));
    });
  });
}).listen(PORT, () => {
  console.log(`cardgame dev server: http://localhost:${PORT}`);
  console.log(`画面は http://localhost:5173/?server=http://localhost:${PORT}#/online で開く（npm run dev）`);
});
