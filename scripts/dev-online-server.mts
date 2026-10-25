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
 *
 * フレンド機能（決定事項 #121。docs/ONLINE_SOCIAL.md）も同じメモリの保存場所で動く（プレイヤー・フレンド・招待・公開デッキ・成績）。
 * 自分あての通知（cardgame:inbox:<inboxId>）は届かないので、画面は hello を定期的に送って気づく。通知の代わりに端末に1行出す。
 * GET / で部屋とプレイヤーと報告の一覧（鍵は出さない）。
 * プレイヤーを作る回数の上限は、全体の上限だけを見る（送り元の鍵 clientKey は渡さない。同じ PC の複数のブラウザで試せるように。決定事項 #124）。
 */
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { createServer } from 'node:http';
import { handleBody, MAX_BODY_CHARS, MemoryFeedbackStore, MemoryStore, type HttpDeps } from '../src/online/index.ts';

const PORT = Number(process.env.PORT ?? 8787);

const store = new MemoryStore();
const feedback = new MemoryFeedbackStore();
const deps: HttpDeps = {
  store,
  social: store,
  feedback,
  now: () => Date.now(),
  randomInt: (n) => randomInt(n),
  newToken: () => randomBytes(32).toString('hex'),
  hash: async (t) => createHash('sha256').update(t).digest('hex'),
  notify: async () => {},
  notifyInbox: async (inboxId, kind) => {
    const p = [...store.players.values()].find((x) => x.inboxId === inboxId);
    console.log(`${new Date().toISOString()} inbox → ${p?.name ?? '?'}（${p?.friendCode ?? '?'}）: ${kind}`);
  },
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
    const rooms = [...store.rooms.values()].map(
      (r) => `${r.code} ${r.status} v${r.version} ${r.meta?.mode ?? 'deck'}${r.meta?.listed ? ' 公開' : ''} ${r.seats.map((s) => s.name + (s.friendCode ? `(${s.friendCode})` : '')).join(' / ')}`,
    );
    const players = [...store.players.values()].map((p) => `${p.friendCode} ${p.name}`);
    const reports = feedback.list.map((f) => `#${f.id} ${f.kind}/${f.topic} ${f.source} ${f.status} カード${f.cards.length} ${f.body.slice(0, 40).replace(/\n/g, ' ')}`);
    const text = `cardgame dev server\n[部屋]\n${rooms.join('\n')}\n[プレイヤー]\n${players.join('\n')}\n[フレンド] ${store.friendshipList.length} 組・申請 ${store.requestList.length} 件・成績 ${store.matches.size} 戦\n[報告]\n${reports.join('\n')}\n`;
    res.writeHead(200, { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' }).end(text);
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
      // 状態の取得・生存の合図・一覧は多いので出さない
      if (op !== 'state' && op !== 'hello' && op !== 'list') {
        const detail = !out.ok ? ` ${out.error}` : 'code' in out && 'version' in out ? ` ${out.code} ${out.status} v${out.version}` : '';
        console.log(`${new Date().toISOString()} ${op} → ${status}${detail}`);
      }
      res.writeHead(status, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(out));
    });
  });
}).listen(PORT, () => {
  console.log(`cardgame dev server: http://localhost:${PORT}`);
  console.log(`画面は http://localhost:5173/?server=http://localhost:${PORT}#/online で開く（npm run dev）`);
});
