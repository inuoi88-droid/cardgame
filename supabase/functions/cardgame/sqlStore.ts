// Edge Function「cardgame」の保存場所：cardgame スキーマの表への SQL（postgres.js）。
// 部屋（RoomStore。rooms）とフレンド機能（SocialStore。players・friendships・friend_requests・invites・matches・shared_decks。決定事項 #121）。
// 約束（メソッドの意味）は src/online/http.ts の RoomStore と src/online/social/types.ts の SocialStore。
// 同じ約束のメモリ版は src/online/social/memoryStore.ts（手元のサーバーとテスト）。
// このファイルは Deno 専用の API を使わない（Node でも手元の Postgres に当てて試せる：docs/ONLINE_SOCIAL.md）。
// 時刻は DB では timestamptz、受け渡しはエポックミリ秒。

// deno-lint-ignore no-explicit-any
type Sql = any;
// deno-lint-ignore no-explicit-any
type Json = any;

/** 部屋の席（src/online/room.ts の Seat。ここでは中身を見ない） */
interface RoomRecord {
  code: string;
  status: 'waiting' | 'drafting' | 'playing' | 'ended';
  version: number;
  state: Json;
  seats: Json[];
  hostDeck: Json;
  deadline: number | null;
  updatedAt: number;
  /** 部屋の形式・ドラフト・両者のデッキ・再戦の印・公開（決定事項 #115・#121。古い部屋は null） */
  meta?: Json;
}

const ms = (column: string) => `(extract(epoch from ${column}) * 1000)::float8`;
const time = (v: number | null | undefined) => (v === null || v === undefined ? null : new Date(v));
const json = (tx: Sql, v: unknown) => (v === null || v === undefined ? null : tx.json(v));
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

// ---------------------------------------------------------------------------
// 部屋
// ---------------------------------------------------------------------------

type RoomRow = {
  code: string;
  status: RoomRecord['status'];
  version: number;
  state: unknown;
  seats: Json[];
  host_deck: unknown;
  meta: unknown;
  deadline_ms: number | null;
  updated_ms: number;
};

const fromRoomRow = (r: RoomRow): RoomRecord => ({
  code: r.code,
  status: r.status,
  version: r.version,
  state: r.state,
  seats: r.seats,
  hostDeck: r.host_deck,
  meta: r.meta,
  deadline: num(r.deadline_ms),
  updatedAt: Number(r.updated_ms),
});

export function makeRoomStore(sql: Sql) {
  return {
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
      return (await sql.begin(async (tx: Sql) => {
        const rows = await tx.unsafe(
          `select code, status, version, state, seats, host_deck, meta,
                  ${ms('deadline')} as deadline_ms, ${ms('updated_at')} as updated_ms
           from cardgame.rooms where code = $1 for update`,
          [code],
        );
        const { save, value } = fn(rows[0] ? fromRoomRow(rows[0] as RoomRow) : null);
        if (save) {
          await tx`
            update cardgame.rooms set
              status = ${save.status}, version = ${save.version}, state = ${json(tx, save.state)},
              seats = ${json(tx, save.seats)}, host_deck = ${json(tx, save.hostDeck)}, meta = ${json(tx, save.meta)},
              deadline = ${time(save.deadline)}, updated_at = ${time(save.updatedAt)}
            where code = ${code}`;
        }
        return value;
      })) as T;
    },
    async removeOlderThan(t: number): Promise<void> {
      await sql`delete from cardgame.rooms where updated_at < ${new Date(t)}`;
    },
  };
}

// ---------------------------------------------------------------------------
// フレンド機能
// ---------------------------------------------------------------------------

interface PlayerRecord {
  id: string;
  secretHash: string;
  friendCode: string;
  inboxId: string;
  linkToken: string;
  name: string;
  createdAt: number;
  lastSeen: number;
  roomCode: string | null;
  roomStatus: RoomRecord['status'] | null;
  roomSeen: number | null;
}
interface InviteRecord {
  id: string;
  from: string;
  to: string;
  roomCode: string;
  mode: 'deck' | 'draft';
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'accepted' | 'declined';
}
interface MatchRecord {
  id: string;
  roomCode: string;
  game: number;
  players: [string, string];
  winner: 0 | 1 | null;
  mode: 'deck' | 'draft';
  at: number;
}
interface SharedDeckRecord {
  ownerId: string;
  deckId: string;
  name: string;
  count: number;
  deck: Json;
  cards: Json[];
  updatedAt: number;
}
interface PresenceUpdate {
  playerId: string;
  seen?: number;
  room?: { code: string; status: RoomRecord['status']; at: number };
}

const PLAYER_COLS = `id, secret_hash, friend_code, inbox_id, link_token, name, ${ms('created_at')} as created_ms, ${ms('last_seen')} as seen_ms,
  room_code, room_status, ${ms('room_seen')} as room_ms`;

// deno-lint-ignore no-explicit-any
const fromPlayer = (r: any): PlayerRecord => ({
  id: r.id,
  secretHash: r.secret_hash,
  friendCode: r.friend_code,
  inboxId: r.inbox_id,
  linkToken: r.link_token,
  name: r.name,
  createdAt: Number(r.created_ms),
  lastSeen: Number(r.seen_ms),
  roomCode: r.room_code ?? null,
  roomStatus: r.room_status ?? null,
  roomSeen: num(r.room_ms),
});

const INVITE_COLS = `id, from_id, to_id, room_code, mode, status, ${ms('created_at')} as created_ms, ${ms('expires_at')} as expires_ms`;

// deno-lint-ignore no-explicit-any
const fromInvite = (r: any): InviteRecord => ({
  id: r.id,
  from: r.from_id,
  to: r.to_id,
  roomCode: r.room_code,
  mode: r.mode,
  status: r.status,
  createdAt: Number(r.created_ms),
  expiresAt: Number(r.expires_ms),
});

/** 部屋の要約：ドラフトの山・両者のデッキ・対戦の状態は読まない（meta は mode・rules・listed だけ） */
const SUMMARY_COLS = `code, status, seats,
  case when meta is null then null
       else jsonb_strip_nulls(jsonb_build_object('mode', meta -> 'mode', 'rules', meta -> 'rules', 'listed', meta -> 'listed')) end as meta,
  host_deck -> 'rules' as rules, ${ms('updated_at')} as updated_ms`;

// deno-lint-ignore no-explicit-any
const fromSummary = (r: any) => ({
  code: r.code,
  status: r.status,
  seats: r.seats,
  meta: r.meta ?? null,
  rules: r.rules ?? null,
  updatedAt: Number(r.updated_ms),
});

export function makeSocialStore(sql: Sql) {
  const q = (text: string, params: unknown[] = []) => sql.unsafe(text, params);
  return {
    async insertPlayer(p: PlayerRecord): Promise<boolean> {
      const rows = await sql`
        insert into cardgame.players (id, secret_hash, friend_code, inbox_id, link_token, name, created_at, last_seen)
        values (${p.id}, ${p.secretHash}, ${p.friendCode}, ${p.inboxId}, ${p.linkToken}, ${p.name}, ${time(p.createdAt)}, ${time(p.lastSeen)})
        on conflict do nothing
        returning id`;
      return rows.length === 1;
    },
    async playerBySecretHash(h: string): Promise<PlayerRecord | null> {
      const rows = await q(`select ${PLAYER_COLS} from cardgame.players where secret_hash = $1`, [h]);
      return rows[0] ? fromPlayer(rows[0]) : null;
    },
    async playerByFriendCode(code: string): Promise<PlayerRecord | null> {
      const rows = await q(`select ${PLAYER_COLS} from cardgame.players where friend_code = $1`, [code]);
      return rows[0] ? fromPlayer(rows[0]) : null;
    },
    async playersByIds(ids: readonly string[]): Promise<PlayerRecord[]> {
      if (ids.length === 0) return [];
      const rows = await q(`select ${PLAYER_COLS} from cardgame.players where id = any($1::text[])`, [[...ids]]);
      return rows.map(fromPlayer);
    },
    async updatePlayer(id: string, patch: Partial<Pick<PlayerRecord, 'name' | 'secretHash' | 'linkToken' | 'lastSeen'>>): Promise<void> {
      const set: Record<string, unknown> = {};
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.secretHash !== undefined) set.secret_hash = patch.secretHash;
      if (patch.linkToken !== undefined) set.link_token = patch.linkToken;
      if (patch.lastSeen !== undefined) set.last_seen = time(patch.lastSeen);
      if (Object.keys(set).length === 0) return;
      await sql`update cardgame.players set ${sql(set)} where id = ${id}`;
    },
    async updatePresence(updates: readonly PresenceUpdate[]): Promise<void> {
      for (const u of updates) {
        if (u.seen !== undefined && u.room) {
          await sql`
            update cardgame.players set last_seen = greatest(last_seen, ${time(u.seen)}),
              room_code = ${u.room.code}, room_status = ${u.room.status}, room_seen = ${time(u.room.at)}
            where id = ${u.playerId}`;
        } else if (u.room) {
          await sql`
            update cardgame.players set room_code = ${u.room.code}, room_status = ${u.room.status}, room_seen = ${time(u.room.at)}
            where id = ${u.playerId}`;
        } else if (u.seen !== undefined) {
          await sql`update cardgame.players set last_seen = greatest(last_seen, ${time(u.seen)}) where id = ${u.playerId}`;
        }
      }
    },

    async friendships(id: string) {
      const rows = await q(`select a, b, ${ms('since')} as since_ms from cardgame.friendships where a = $1 or b = $1`, [id]);
      // deno-lint-ignore no-explicit-any
      return rows.map((r: any) => ({ a: r.a, b: r.b, since: Number(r.since_ms) }));
    },
    async addFriendship(a: string, b: string, at: number): Promise<void> {
      const [x, y] = a < b ? [a, b] : [b, a];
      await sql.begin(async (tx: Sql) => {
        await tx`insert into cardgame.friendships (a, b, since) values (${x}, ${y}, ${time(at)}) on conflict do nothing`;
        await tx`delete from cardgame.friend_requests where (from_id = ${a} and to_id = ${b}) or (from_id = ${b} and to_id = ${a})`;
      });
    },
    async removeFriendship(a: string, b: string): Promise<void> {
      const [x, y] = a < b ? [a, b] : [b, a];
      await sql.begin(async (tx: Sql) => {
        await tx`delete from cardgame.friendships where a = ${x} and b = ${y}`;
        await tx`delete from cardgame.friend_requests where (from_id = ${a} and to_id = ${b}) or (from_id = ${b} and to_id = ${a})`;
      });
    },

    async requests(id: string) {
      const rows = await q(`select from_id, to_id, ${ms('created_at')} as at_ms from cardgame.friend_requests where from_id = $1 or to_id = $1`, [id]);
      // deno-lint-ignore no-explicit-any
      const all = rows.map((r: any) => ({ from: r.from_id as string, to: r.to_id as string, at: Number(r.at_ms) }));
      // deno-lint-ignore no-explicit-any
      return { incoming: all.filter((r: any) => r.to === id), outgoing: all.filter((r: any) => r.from === id) };
    },
    async addRequest(r: { from: string; to: string; at: number }): Promise<void> {
      await sql`insert into cardgame.friend_requests (from_id, to_id, created_at) values (${r.from}, ${r.to}, ${time(r.at)}) on conflict do nothing`;
    },
    async removeRequest(from: string, to: string): Promise<void> {
      await sql`delete from cardgame.friend_requests where from_id = ${from} and to_id = ${to}`;
    },

    async insertInvite(i: InviteRecord): Promise<void> {
      await sql`
        insert into cardgame.invites (id, from_id, to_id, room_code, mode, status, created_at, expires_at)
        values (${i.id}, ${i.from}, ${i.to}, ${i.roomCode}, ${i.mode}, ${i.status}, ${time(i.createdAt)}, ${time(i.expiresAt)})`;
    },
    async invite(id: string): Promise<InviteRecord | null> {
      const rows = await q(`select ${INVITE_COLS} from cardgame.invites where id = $1`, [id]);
      return rows[0] ? fromInvite(rows[0]) : null;
    },
    async updateInvite(id: string, patch: Partial<Pick<InviteRecord, 'status' | 'expiresAt' | 'createdAt'>>): Promise<void> {
      const set: Record<string, unknown> = {};
      if (patch.status !== undefined) set.status = patch.status;
      if (patch.expiresAt !== undefined) set.expires_at = time(patch.expiresAt);
      if (patch.createdAt !== undefined) set.created_at = time(patch.createdAt);
      if (Object.keys(set).length === 0) return;
      await sql`update cardgame.invites set ${sql(set)} where id = ${id}`;
    },
    async invites(id: string, since: number) {
      const rows = await q(`select ${INVITE_COLS} from cardgame.invites where (from_id = $1 or to_id = $1) and created_at >= $2`, [id, new Date(since)]);
      const all = rows.map(fromInvite);
      return { received: all.filter((i: InviteRecord) => i.to === id), sent: all.filter((i: InviteRecord) => i.from === id) };
    },
    async removeInvitesOlderThan(t: number): Promise<void> {
      await sql`delete from cardgame.invites where created_at < ${new Date(t)}`;
    },

    async insertMatch(m: MatchRecord): Promise<void> {
      await sql`
        insert into cardgame.matches (id, room_code, game, p0, p1, winner, mode, ended_at)
        values (${m.id}, ${m.roomCode}, ${m.game}, ${m.players[0]}, ${m.players[1]}, ${m.winner}, ${m.mode}, ${time(m.at)})
        on conflict (id) do nothing`;
    },
    async records(me: string, others: readonly string[]) {
      if (others.length === 0) return [];
      const rows = await q(
        `select case when p0 = $1 then p1 else p0 end as opp,
                count(*) filter (where (winner = 0 and p0 = $1) or (winner = 1 and p1 = $1))::int as win,
                count(*) filter (where (winner = 0 and p1 = $1) or (winner = 1 and p0 = $1))::int as loss,
                count(*) filter (where winner is null)::int as draw
         from cardgame.matches
         where (p0 = $1 and p1 = any($2::text[])) or (p1 = $1 and p0 = any($2::text[]))
         group by 1`,
        [me, [...others]],
      );
      // deno-lint-ignore no-explicit-any
      return rows.map((r: any) => ({ opponentId: r.opp, win: Number(r.win), loss: Number(r.loss), draw: Number(r.draw) }));
    },

    async putSharedDeck(d: SharedDeckRecord): Promise<void> {
      await sql`
        insert into cardgame.shared_decks (owner_id, deck_id, name, card_count, deck, cards, updated_at)
        values (${d.ownerId}, ${d.deckId}, ${d.name}, ${d.count}, ${sql.json(d.deck)}, ${sql.json(d.cards)}, ${time(d.updatedAt)})
        on conflict (owner_id, deck_id) do update set
          name = excluded.name, card_count = excluded.card_count, deck = excluded.deck, cards = excluded.cards, updated_at = excluded.updated_at`;
    },
    async removeSharedDeck(ownerId: string, deckId: string): Promise<void> {
      await sql`delete from cardgame.shared_decks where owner_id = ${ownerId} and deck_id = ${deckId}`;
    },
    async sharedDeckSummaries(ownerIds: readonly string[]) {
      if (ownerIds.length === 0) return [];
      const rows = await q(
        `select owner_id, deck_id, name, card_count, ${ms('updated_at')} as updated_ms from cardgame.shared_decks where owner_id = any($1::text[])`,
        [[...ownerIds]],
      );
      // deno-lint-ignore no-explicit-any
      return rows.map((r: any) => ({ ownerId: r.owner_id, deckId: r.deck_id, name: r.name, count: Number(r.card_count), updatedAt: Number(r.updated_ms) }));
    },
    async sharedDecks(ownerId: string, deckId?: string) {
      const rows =
        deckId === undefined
          ? await q(`select owner_id, deck_id, name, card_count, deck, cards, ${ms('updated_at')} as updated_ms from cardgame.shared_decks where owner_id = $1`, [ownerId])
          : await q(
              `select owner_id, deck_id, name, card_count, deck, cards, ${ms('updated_at')} as updated_ms from cardgame.shared_decks where owner_id = $1 and deck_id = $2`,
              [ownerId, deckId],
            );
      // deno-lint-ignore no-explicit-any
      return rows.map((r: any) => ({
        ownerId: r.owner_id,
        deckId: r.deck_id,
        name: r.name,
        count: Number(r.card_count),
        deck: r.deck,
        cards: r.cards,
        updatedAt: Number(r.updated_ms),
      }));
    },

    async listedRooms(minSeen: number, limit: number) {
      // rooms.listed は meta の listed から作る生成列（部分インデックス rooms_listed_idx）
      const rows = await q(
        `select ${SUMMARY_COLS} from cardgame.rooms
         where listed and status = 'waiting' and (seats -> 0 ->> 'lastSeen')::float8 >= $1
         order by updated_at desc limit $2`,
        [minSeen, limit],
      );
      return rows.map(fromSummary);
    },
    async roomSummaries(codes: readonly string[]) {
      if (codes.length === 0) return [];
      const rows = await q(`select ${SUMMARY_COLS} from cardgame.rooms where code = any($1::text[])`, [[...codes]]);
      return rows.map(fromSummary);
    },
  };
}
