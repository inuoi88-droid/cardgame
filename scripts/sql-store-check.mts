/**
 * Edge Function の SQL の保存場所（supabase/functions/cardgame/sqlStore.ts）と、メモリの保存場所（src/online/social/memoryStore.ts）に
 * 同じ操作（登録・申請・リンク・公開デッキ・公開の部屋・招待・対戦・再戦・成績・鍵の作り直し）を流し、返事が同じになるかを比べる（決定事項 #121）。
 * 手元の Postgres が要る（Supabase には当てない）。使い方：
 *   1. 空のデータベースに supabase/migrations/*.sql を順に当てる（anon・authenticated のロールが無ければ先に作る）
 *   2. npm i --no-save postgres@3.4.5
 *   3. PGURL=postgres://postgres@localhost:5432/sotest node scripts/sql-store-check.mts
 * 表の中身は最初に消す（cardgame スキーマの表だけ）。差が無ければ「diffs 0」
 */
import postgres from 'postgres';
import { createHash } from 'node:crypto';
import { handleBody, MemoryStore } from '../src/online/index.ts';
import { PRESET_DECKS } from '../src/presets.ts';
import { makeRoomStore, makeSocialStore } from '../supabase/functions/cardgame/sqlStore.ts';

const url = process.env.PGURL;
if (!url) throw new Error('PGURL を指定してください（手元の Postgres。Supabase には当てない）');
const sql = postgres(url, { prepare: false, max: 4, onnotice: () => {} });
await sql.unsafe(`truncate cardgame.rooms, cardgame.players, cardgame.friendships, cardgame.friend_requests, cardgame.invites, cardgame.matches, cardgame.shared_decks, cardgame.rate_events cascade`);
const [POISON, BEASTS] = PRESET_DECKS;
const POOL = PRESET_DECKS.flatMap((p) => p.cards);

function deps(store, social) {
  let now = 1_800_000_000_000;
  let tok = 0;
  let rnd = 12345;
  const inbox = [];
  return {
    inbox,
    tick: (ms) => (now += ms),
    d: {
      store, social,
      now: () => now,
      randomInt: (n) => { rnd = (rnd * 1103515245 + 12345) % 2147483648; return rnd % n; },
      newToken: () => createHash('sha256').update(String(tok++)).digest('hex'),
      hash: async (t) => createHash('sha256').update('h' + t).digest('hex'),
      notify: async () => {},
      notifyInbox: async (id, e) => { inbox.push([id, e]); },
      draftPool: POOL,
    },
  };
}

async function scenario(env) {
  const out = [];
  const call = async (b) => { env.tick(1000); const r = (await handleBody(JSON.stringify(b), env.d)).body; out.push(r); return r; };
  const a = await call({ op: 'register', name: 'A' });
  const b = await call({ op: 'register', name: 'B' });
  const c = await call({ op: 'register', name: 'C' });
  await call({ op: 'hello', secret: a.secret, name: 'アキ' });
  await call({ op: 'friendRequest', secret: a.secret, friendCode: b.friendCode });
  await call({ op: 'friendRequest', secret: a.secret, friendCode: b.friendCode });
  await call({ op: 'hello', secret: b.secret });
  await call({ op: 'friendRespond', secret: b.secret, friendCode: a.friendCode, accept: true });
  await call({ op: 'friendRequest', secret: c.secret, friendCode: a.friendCode });
  await call({ op: 'friendRespond', secret: a.secret, friendCode: c.friendCode, accept: false });
  // 断られたばかりの申請は黙って受け流す（決定事項 #124）
  await call({ op: 'friendRequest', secret: c.secret, friendCode: a.friendCode });
  await call({ op: 'hello', secret: a.secret });
  const link = await call({ op: 'inviteLink', secret: c.secret, rotate: true });
  await call({ op: 'linkInfo', secret: a.secret, friendCode: link.friendCode, token: link.token });
  await call({ op: 'friendByLink', secret: a.secret, friendCode: link.friendCode, token: link.token });
  await call({ op: 'linkInfo', secret: a.secret, friendCode: link.friendCode, token: link.token });
  await call({ op: 'shareDeck', secret: a.secret, deck: POISON.deck, cards: POISON.cards });
  await call({ op: 'shareDeck', secret: a.secret, deck: { ...BEASTS.deck, id: 'x2' }, cards: BEASTS.cards });
  await call({ op: 'shareDeck', secret: a.secret, deck: { ...POISON.deck, name: '改' }, cards: POISON.cards });
  await call({ op: 'friendDecks', secret: b.secret, friendCode: a.friendCode });
  await call({ op: 'friendDecks', secret: b.secret, friendCode: a.friendCode, deckId: 'x2' });
  await call({ op: 'unshareDeck', secret: a.secret, deckId: 'x2' });
  await call({ op: 'shareDeck', secret: a.secret, deck: { ...POISON.deck, id: 'big', name: 'x'.repeat(500) }, cards: POISON.cards.map((c, i) => ({ ...c, description: 'あ'.repeat(80 + i) })) });
  // 相手待ちのまま閉じた公開の部屋は一覧から消え、入れない
  const gone = await call({ op: 'create', name: 'A', deck: POISON.deck, cards: POISON.cards, secret: a.secret, listed: true });
  await call({ op: 'close', code: gone.code, token: gone.token });
  await call({ op: 'join', code: gone.code, name: 'B', deck: BEASTS.deck, cards: BEASTS.cards });
  const pub = await call({ op: 'create', name: 'A', deck: POISON.deck, cards: POISON.cards, secret: a.secret, listed: true, rules: { field: 'none', dayNight: true }, leader: 'knight' });
  const dr = await call({ op: 'create', mode: 'draft', name: 'D', listed: true });
  await call({ op: 'list' });
  const inv = await call({ op: 'invite', secret: a.secret, friendCode: b.friendCode, roomCode: pub.code });
  env.tick(9 * 60_000);
  await call({ op: 'state', code: pub.code, token: pub.token });
  await call({ op: 'invite', secret: a.secret, friendCode: b.friendCode, roomCode: pub.code });
  env.tick(90_000);
  await call({ op: 'state', code: pub.code, token: pub.token });
  await call({ op: 'hello', secret: b.secret });
  await call({ op: 'inviteRespond', secret: b.secret, inviteId: inv.inviteId, accept: true });
  const j = await call({ op: 'join', code: pub.code, name: 'B', deck: BEASTS.deck, cards: BEASTS.cards, secret: b.secret });
  await call({ op: 'list' });
  await call({ op: 'hello', secret: c.secret });
  let st = await call({ op: 'state', code: pub.code, token: pub.token });
  await call({ op: 'action', code: pub.code, token: j.token, version: st.version, action: { type: 'concede', player: 1 } });
  await call({ op: 'friendRequestRoom', secret: b.secret, code: pub.code });
  await call({ op: 'rematch', code: pub.code, token: pub.token });
  st = await call({ op: 'rematch', code: pub.code, token: j.token });
  await call({ op: 'action', code: pub.code, token: pub.token, version: st.version, action: { type: 'concede', player: 0 } });
  await call({ op: 'hello', secret: a.secret });
  await call({ op: 'hello', secret: b.secret });
  env.tick(70_000);
  await call({ op: 'hello', secret: c.secret });
  const inv2room = await call({ op: 'create', mode: 'draft', name: 'A', secret: a.secret });
  const inv2 = await call({ op: 'invite', secret: a.secret, friendCode: c.friendCode, roomCode: inv2room.code });
  await call({ op: 'inviteRespond', secret: c.secret, inviteId: inv2.inviteId, accept: false });
  await call({ op: 'hello', secret: a.secret });
  await call({ op: 'friendRemove', secret: a.secret, friendCode: c.friendCode });
  const rot = await call({ op: 'rotateSecret', secret: c.secret });
  await call({ op: 'hello', secret: c.secret });
  await call({ op: 'hello', secret: rot.secret });
  const next = 'ab'.repeat(32);
  await call({ op: 'rotateSecret', secret: rot.secret, next });
  await call({ op: 'hello', secret: next });
  await call({ op: 'state', code: dr.code, token: dr.token });
  return { out, inbox: env.inbox };
}

const mem = new MemoryStore();
const m = await scenario(deps(mem, mem));
const sqlEnv = deps(makeRoomStore(sql), makeSocialStore(sql));
const s = await scenario(sqlEnv);
let diffs = 0;
for (let i = 0; i < m.out.length; i++) {
  const canon = (v) => JSON.stringify(v, (k, val) => (val && typeof val === 'object' && !Array.isArray(val) ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => (a < b ? -1 : 1))) : val));
  const x = canon(m.out[i]);
  const y = canon(s.out[i]);
  if (x !== y) { diffs++; console.log('DIFF at', i, '\nmem:', x.slice(0, 600), '\nsql:', y.slice(0, 600)); }
}
console.log('responses', m.out.length, 'diffs', diffs, 'inbox same', JSON.stringify(m.inbox) === JSON.stringify(s.inbox));
console.log('断られた返事（閉じた部屋への join・作り直す前の鍵の hello の2件のはず）:', m.out.filter((r) => !r.ok).map((r) => r.error));
await sql.end();
