/**
 * みんなの広場・運営・公式カードの上書き（決定事項 #141）の SQL の保存場所（supabase/functions/cardgame/sqlStore.ts の makePlazaStore）と
 * メモリの保存場所（src/online/plaza/memoryStore.ts）に同じ操作を流し、返事が同じになるかを比べる。手元の Postgres が要る（Supabase には当てない）。
 *   1. 空のデータベースに supabase/migrations/*.sql を順に当てる（anon・authenticated のロールが無ければ先に作る）
 *   2. npm i --no-save postgres@3.4.5
 *   3. PGURL=postgres://postgres@localhost:5432/sotest node scripts/sql-plaza-check.mts
 * 表の中身は最初に消す（cardgame スキーマの表だけ）。差が無ければ「diffs 0」
 */
import postgres from 'postgres';
import { createHash } from 'node:crypto';
import { createMemoryPlazaStore, handleBody, MemoryStore, staffPasswordHash } from '../src/online/index.ts';
import { OFFICIAL_CARDS } from '../src/official/index.ts';
import { PRESET_DECKS } from '../src/presets.ts';
import { makePlazaStore, makeRoomStore, makeSocialStore } from '../supabase/functions/cardgame/sqlStore.ts';

const url = process.env.PGURL;
if (!url) throw new Error('PGURL を指定してください（手元の Postgres。Supabase には当てない）');
const sql = postgres(url, { prepare: false, max: 4, onnotice: () => {} });
await sql.unsafe(
  `truncate cardgame.rooms, cardgame.players, cardgame.friendships, cardgame.friend_requests, cardgame.invites, cardgame.matches, cardgame.shared_decks,
   cardgame.rate_events, cardgame.admin_settings, cardgame.staff, cardgame.public_items, cardgame.official_cards, cardgame.official_card_history restart identity cascade`,
);
const hash = async (t: string) => createHash('sha256').update(t).digest('hex');
const PASSWORD = 'check-password';
const stored = await staffPasswordHash(PASSWORD, 'chk', 7, hash);
await sql`insert into cardgame.admin_settings (key, value) values ('staff_password', ${stored})`;

function deps(store: any, social: any, plaza: any) {
  let now = 1_800_000_000_000;
  let tok = 0;
  let rnd = 12345;
  return {
    tick: (ms: number) => (now += ms),
    d: {
      store,
      social,
      plaza,
      now: () => now,
      randomInt: (n: number) => {
        rnd = (rnd * 1103515245 + 12345) % 2147483648;
        return rnd % n;
      },
      newToken: () => createHash('sha256').update(String(tok++)).digest('hex'),
      hash,
      notify: async () => {},
    },
  };
}
const mem = new MemoryStore();
const A = deps(mem, mem, createMemoryPlazaStore({ staffPassword: stored }));
const B = deps(makeRoomStore(sql), makeSocialStore(sql), makePlazaStore(sql));

/** jsonb はキーの並びを変えるので、キーを並べ替えてから比べる */
const canon = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as object).sort(([x], [y]) => (x < y ? -1 : 1)).map(([k, x]) => [k, canon(x)])) : v;
let diffs = 0;
async function both(label: string, body: (s: string) => unknown): Promise<[any, any]> {
  const ra = (await handleBody(JSON.stringify(body('a')), A.d as any)).body;
  const rb = (await handleBody(JSON.stringify(body('b')), B.d as any)).body;
  A.tick(1000);
  B.tick(1000);
  const ja = JSON.stringify(canon(ra));
  const jb = JSON.stringify(canon(rb));
  if (ja !== jb) {
    diffs++;
    console.log(`DIFF ${label}\n  mem: ${ja.slice(0, 400)}\n  sql: ${jb.slice(0, 400)}`);
  } else console.log(`ok   ${label}`);
  return [ra, rb];
}
const secrets: Record<string, Record<string, string>> = { a: {}, b: {} };
for (const name of ['運営', '友人', 'ゲスト']) {
  const [ra, rb] = await both(`register ${name}`, () => ({ op: 'register', name }));
  secrets.a![name] = ra.secret;
  secrets.b![name] = rb.secret;
}
const sec = (name: string) => (s: string) => secrets[s]![name]!;
await both('staffLogin wrong', (s) => ({ op: 'staffLogin', secret: sec('運営')(s), password: 'nope' }));
await both('staffLogin', (s) => ({ op: 'staffLogin', secret: sec('運営')(s), password: PASSWORD }));
await both('staffLogin friend', (s) => ({ op: 'staffLogin', secret: sec('友人')(s), password: PASSWORD }));
await both('plazaMe', (s) => ({ op: 'plazaMe', secret: sec('運営')(s) }));
await both('publish (guest)', (s) => ({ op: 'plazaPublish', secret: sec('ゲスト')(s), kind: 'card', card: PRESET_DECKS[0]!.cards[0] }));
const ids: Record<string, string[]> = { a: [], b: [] };
for (const [i, c] of PRESET_DECKS[0]!.cards.slice(0, 3).entries()) {
  const [ra, rb] = await both(`publish card ${i}`, (s) => ({ op: 'plazaPublish', secret: sec(i === 2 ? '友人' : '運営')(s), kind: 'card', card: c }));
  ids.a!.push(ra.item.id);
  ids.b!.push(rb.item.id);
}
await both('republish card 0', (s) => ({ op: 'plazaPublish', secret: sec('運営')(s), kind: 'card', card: { ...PRESET_DECKS[0]!.cards[0]!, name: '改名' } }));
const P = PRESET_DECKS[1]!;
await both('publish deck', (s) => ({ op: 'plazaPublish', secret: sec('運営')(s), kind: 'deck', deck: P.deck, cards: P.cards }));
await both('list', () => ({ op: 'plazaList' }));
await both('list cards', () => ({ op: 'plazaList', kind: 'card' }));
const [la] = await both('list deck', () => ({ op: 'plazaList', kind: 'deck' }));
await both('get deck', (s) => ({ op: 'plazaGet', id: s === 'a' ? la.items[0].id : la.items[0].id }));
await both('get card', (s) => ({ op: 'plazaGet', id: ids[s]![1] }));
await both('remove by guest', (s) => ({ op: 'plazaRemove', secret: sec('ゲスト')(s), id: ids[s]![1] }));
await both('remove by friend(staff)', (s) => ({ op: 'plazaRemove', secret: sec('友人')(s), id: ids[s]![1] }));
await both('plazaMe after', (s) => ({ op: 'plazaMe', secret: sec('運営')(s) }));
const base = OFFICIAL_CARDS.find((c) => c.rarity === 'common' && !c.stats)!;
await both('official list 0', () => ({ op: 'officialList' }));
await both('official save', (s) => ({ op: 'officialSave', secret: sec('運営')(s), card: { ...base, name: '書き換え' } }));
await both('official save 2', (s) => ({ op: 'officialSave', secret: sec('友人')(s), card: { ...base, name: '書き換え2' } }));
await both('official list', () => ({ op: 'officialList' }));
await both('official list same', () => ({ op: 'officialList', since: 2 }));
await both('official reset', (s) => ({ op: 'officialReset', secret: sec('運営')(s), cardId: base.id }));
await both('official history', (s) => ({ op: 'officialHistory', secret: sec('運営')(s), cardId: base.id }));
await both('official list after reset', () => ({ op: 'officialList' }));
// プリセットデッキの書き換え（決定事項 #148。同じ表・同じ版）
const PR = PRESET_DECKS[1]!;
const prEdited = { id: PR.deck.id, deck: PR.deck, cards: PR.cards.map((c, i) => (i === 0 ? { ...c, name: `${c.name}改` } : c)) };
await both('preset save', (s) => ({ op: 'presetSave', secret: sec('友人')(s), preset: prEdited }));
await both('official list with preset', () => ({ op: 'officialList' }));
await both('preset reset', (s) => ({ op: 'presetReset', secret: sec('運営')(s), presetId: PR.deck.id }));
await both('preset history', (s) => ({ op: 'presetHistory', secret: sec('運営')(s), presetId: PR.deck.id }));
await both('staffLogout', (s) => ({ op: 'staffLogout', secret: sec('運営')(s) }));
await both('plazaMe logout', (s) => ({ op: 'plazaMe', secret: sec('運営')(s) }));
console.log(`diffs ${diffs}`);
await sql.end();
