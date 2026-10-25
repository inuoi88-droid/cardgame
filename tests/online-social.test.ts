// フレンド機能・公開の部屋・対戦成績・相手のデッキ（決定事項 #121）：サーバーの中身だけで試す。倍率1
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { BALANCE, battle, type CardDef } from '../src/engine/index.ts';
import { PRESET_DECKS } from '../src/presets.ts';
import { CODE_ALPHABET } from '../src/online/codes.ts';
import { parseRequest, type OnlineResponse, type RoomView } from '../src/online/protocol.ts';
import type { RoomRecord } from '../src/online/room.ts';
import { serve, type ServeDeps } from '../src/online/server.ts';
import {
  FRIEND_CODE_LENGTH,
  INVITE_KEEP_MS,
  INVITE_TTL_MS,
  MAX_FRIENDS,
  MAX_LISTED_ROOMS,
  MAX_PENDING_INVITES,
  MAX_PENDING_REQUESTS,
  MAX_SHARED_DECKS,
  MemoryStore,
  PRESENCE_STEP_MS,
  handleBody,
  normalizeFriendCode,
  type HttpDeps,
  type InboxEvent,
  type SocialOk,
  type SocialOp,
  type SocialResponse,
} from '../src/online/index.ts';
import { matchRecordOf, presenceUpdates } from '../src/online/social/rooms.ts';

const [POISON, BEASTS] = PRESET_DECKS as unknown as [(typeof PRESET_DECKS)[number], (typeof PRESET_DECKS)[number]];
const POOL: CardDef[] = PRESET_DECKS.flatMap((p) => p.cards);
const T0 = 1_800_000_000_000;
const D = BALANCE.draft;
const HOST = 'a'.repeat(64);
const GUEST = 'b'.repeat(64);
const tokenOf = (p: battle.PlayerId) => (p === 0 ? HOST : GUEST);

function ok(res: OnlineResponse): RoomView {
  if (!res.ok) throw new Error(res.error);
  return res;
}

/** serve() だけを使う部屋1つのサーバー役 */
class FakeServer {
  room: RoomRecord | null = null;
  now = T0;
  send(raw: unknown, tokenHash: string, extra: Partial<ServeDeps> = {}): OnlineResponse {
    const parsed = parseRequest(JSON.parse(JSON.stringify(raw)));
    if (!parsed.ok) return { ok: false, error: parsed.error, reason: 'invalid' };
    const r = serve(parsed.value, parsed.value.op === 'create' ? null : this.room, { code: 'ABC234', seed: 7, draftPool: POOL, tokenHash, now: this.now, ...extra });
    if (r.save) this.room = JSON.parse(JSON.stringify(r.save)) as RoomRecord;
    return JSON.parse(JSON.stringify(r.response)) as OnlineResponse;
  }
  state(p: battle.PlayerId): RoomView {
    return ok(this.send({ op: 'state', code: 'ABC234', token: tokenOf(p) }, tokenOf(p)));
  }
  action(p: battle.PlayerId, action: battle.Action): OnlineResponse {
    return this.send({ op: 'action', code: 'ABC234', token: tokenOf(p), version: this.room!.version, action }, tokenOf(p));
  }
  rematch(p: battle.PlayerId): OnlineResponse {
    return this.send({ op: 'rematch', code: 'ABC234', token: tokenOf(p) }, tokenOf(p));
  }
}

function deckRoom() {
  const s = new FakeServer();
  const created = ok(s.send({ op: 'create', name: 'ホスト', deck: POISON.deck, cards: POISON.cards }, HOST));
  const joined = ok(s.send({ op: 'join', code: 'ABC234', name: 'ゲスト', deck: BEASTS.deck, cards: BEASTS.cards }, GUEST));
  return { s, created, joined };
}

function draftRoom() {
  const s = new FakeServer();
  ok(s.send({ op: 'create', mode: 'draft', name: 'ホスト' }, HOST));
  const joined = ok(s.send({ op: 'join', code: 'ABC234', name: 'ゲスト', features: ['draft'] }, GUEST));
  return { s, joined };
}

function finishDraft(s: FakeServer): RoomView {
  let v: RoomView | null = null;
  for (let i = 0; i < 2 * D.takes; i++) {
    const d = s.room!.meta!.draft!;
    const turn = d.picks.length % 2 === 0 ? d.first : battle.other(d.first);
    const view = s.state(turn);
    const t = view.draft!.takeable.find((x) => x.ok)!;
    v = ok(s.send({ op: 'take', code: 'ABC234', token: tokenOf(turn), version: view.version, cardId: t.cardId }, tokenOf(turn)));
  }
  return v!;
}

describe('相手のデッキ（RoomView.opponentDeck）', () => {
  it('自分のデッキの部屋：待機中・対戦中は無く、決着すると相手が出したデッキが見える。再戦が始まるとまた消える', () => {
    const { s, created, joined } = deckRoom();
    expect(created.opponentDeck).toBeUndefined();
    expect(joined.opponentDeck).toBeUndefined();
    expect(s.state(0).opponentDeck).toBeUndefined();
    // 対戦中の返事には、相手のデッキの ID もカードの定義も入らない（相手だけが持つカード）
    const onlyBeasts = BEASTS.cards.filter((c) => !POISON.cards.some((p) => p.id === c.id));
    expect(onlyBeasts.length).toBeGreaterThan(0);
    const hostView = JSON.stringify(s.state(0));
    expect(hostView).not.toContain(`"${BEASTS.deck.id}"`);

    ok(s.action(1, { type: 'concede', player: 1 }));
    const host = s.state(0);
    const guest = s.state(1);
    expect(host.opponentDeck).toEqual({ name: BEASTS.deck.name, deck: s.room!.meta!.decks![1].deck, cards: s.room!.meta!.decks![1].cards });
    expect(guest.opponentDeck!.deck.id).toBe(POISON.deck.id);
    expect(guest.opponentDeck!.cards.map((c) => c.id).sort()).toEqual(POISON.cards.filter((c) => POISON.deck.entries.some((e) => e.cardId === c.id)).map((c) => c.id).sort());

    ok(s.rematch(0));
    expect(s.state(0).opponentDeck).toBeDefined(); // 片方が押しただけなら、まだ決着した状態
    const again = ok(s.rematch(1));
    expect(again.status).toBe('playing');
    expect(again.opponentDeck).toBeUndefined();
  });

  it('ドラフトの部屋：ドラフト中・対戦中は無く、決着すると相手がドラフトで作ったデッキが見える', () => {
    const { s, joined } = draftRoom();
    expect(joined.opponentDeck).toBeUndefined();
    const started = finishDraft(s);
    expect(started.status).toBe('playing');
    expect(started.opponentDeck).toBeUndefined();
    expect(s.state(1).opponentDeck).toBeUndefined();
    ok(s.action(0, { type: 'concede', player: 0 }));
    const guest = s.state(1);
    const theirs = s.room!.meta!.decks![0];
    expect(guest.opponentDeck).toEqual({ name: theirs.deck.name, deck: theirs.deck, cards: theirs.cards });
    expect(guest.opponentDeck!.deck.entries.reduce((n, e) => n + e.count, 0)).toBe(2 * D.takes);
  });
});

// ---------------------------------------------------------------------------
// 受付（handleBody）＋メモリの保存場所で、フレンド機能の操作を通す
// ---------------------------------------------------------------------------

type Body = OnlineResponse | SocialResponse;

function world(opts: { social?: boolean } = {}) {
  const store = new MemoryStore();
  let now = T0;
  const inbox: [string, InboxEvent][] = [];
  const deps: HttpDeps = {
    store,
    ...(opts.social === false ? {} : { social: store }),
    now: () => now,
    randomInt: (n) => randomInt(n),
    newToken: () => randomBytes(32).toString('hex'),
    hash: async (t) => createHash('sha256').update(t).digest('hex'),
    notify: async () => {},
    notifyInbox: async (id, e) => {
      inbox.push([id, e]);
    },
    draftPool: POOL,
  };
  /** 返事はすべて控える（他人の秘密が入っていないかを最後にまとめて調べる） */
  const seen: { to: string | null; body: Body }[] = [];
  const raw = async (body: unknown, to: string | null = null) => {
    const r = await handleBody(JSON.stringify(body), deps);
    seen.push({ to, body: r.body });
    return r;
  };
  const call = async (body: unknown, to: string | null = null): Promise<Body> => (await raw(body, to)).body;
  const tick = (ms: number) => (now += ms);
  const at = () => now;

  async function player(name: string) {
    const r = sok(await call({ op: 'register', name }), 'register');
    seen.at(-1)!.to = r.secret; // register の返事は本人だけが受け取る
    const rec = (await store.playerByFriendCode(r.friendCode))!;
    const me = { ...r, id: rec.id, linkToken: rec.linkToken, secretHash: rec.secretHash };
    const s = <K extends SocialOp>(op: K, extra: Record<string, unknown> = {}) => call({ op, secret: r.secret, ...extra }, r.secret);
    return {
      ...me,
      hello: async (extra: Record<string, unknown> = {}) => sok(await s('hello', extra), 'hello'),
      s,
    };
  }
  return { store, deps, inbox, seen, raw, call, tick, at, player };
}

type Who = Awaited<ReturnType<ReturnType<typeof world>['player']>>;

function sok<K extends SocialOp>(r: Body, op: K): SocialOk<K> {
  if (!r.ok) throw new Error(r.error);
  expect((r as { op?: string }).op).toBe(op);
  return r as unknown as SocialOk<K>;
}
function rok(r: Body): RoomView & { token?: string } {
  if (!r.ok) throw new Error(r.error);
  return r as RoomView & { token?: string };
}

async function befriend(a: Who, b: Who) {
  sok(await a.s('friendRequest', { friendCode: b.friendCode }), 'friendRequest');
  sok(await b.s('friendRespond', { friendCode: a.friendCode, accept: true }), 'friendRespond');
}

/** 自分のデッキの部屋で2人が対戦を始める（secret を付ければ席に結び付く） */
async function startDeckGame(w: ReturnType<typeof world>, host: Who | null, guest: Who | null, extra: Record<string, unknown> = {}) {
  const created = rok(await w.call({ op: 'create', name: host?.name ?? 'ホスト', deck: POISON.deck, cards: POISON.cards, ...(host ? { secret: host.secret } : {}), ...extra }));
  const joined = rok(await w.call({ op: 'join', code: created.code, name: guest?.name ?? 'ゲスト', deck: BEASTS.deck, cards: BEASTS.cards, ...(guest ? { secret: guest.secret } : {}) }));
  return { code: created.code, tokens: [created.token!, joined.token!] as [string, string], created, joined };
}

async function concede(w: ReturnType<typeof world>, code: string, token: string, p: battle.PlayerId) {
  const room = w.store.rooms.get(code)!;
  return rok(await w.call({ op: 'action', code, token, version: room.version, action: { type: 'concede', player: p } }));
}

describe('プレイヤー（register・hello・rotateSecret）', () => {
  it('register は鍵を1回だけ返し、サーバーには鍵のハッシュだけが残る', async () => {
    const w = world();
    const r = sok(await w.call({ op: 'register', name: '  アキ  ' }), 'register');
    expect(r.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(r.inboxId).toMatch(/^[0-9a-f]{32}$/);
    expect(r.friendCode).toMatch(new RegExp(`^[${CODE_ALPHABET}]{${FRIEND_CODE_LENGTH}}$`));
    expect(r.name).toBe('アキ');
    expect(JSON.stringify([...w.store.players.values()])).not.toContain(r.secret);
    // 名前が無ければ既定の名前
    expect(sok(await w.call({ op: 'register' }), 'register').name).toBe('プレイヤー');
  });

  it('hello：自分のまわりの様子。名前を変えられる。鍵が違えば auth、形が違えば 400', async () => {
    const w = world();
    const a = await w.player('アキ');
    const h = await a.hello();
    expect(h.me).toEqual({ name: 'アキ', friendCode: a.friendCode, inboxId: a.inboxId });
    expect(h).toMatchObject({ friends: [], incoming: [], outgoing: [], invites: [], sentInvites: [], sharedDecks: [], serverNow: w.at() });
    expect((await a.hello({ name: 'アキラ' })).me.name).toBe('アキラ');
    expect((await a.hello()).me.name).toBe('アキラ');
    expect(await w.call({ op: 'hello', secret: 'f'.repeat(64) })).toMatchObject({ ok: false, reason: 'auth' });
    const bad = await w.raw({ op: 'hello', secret: 'xyz' });
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('rotateSecret：新しい鍵が返り、前の鍵は使えなくなる（フレンドコードは同じ）', async () => {
    const w = world();
    const a = await w.player('アキ');
    const r = sok(await a.s('rotateSecret'), 'rotateSecret');
    expect(r.secret).not.toBe(a.secret);
    expect(await w.call({ op: 'hello', secret: a.secret })).toMatchObject({ ok: false, reason: 'auth' });
    const h = sok(await w.call({ op: 'hello', secret: r.secret }), 'hello');
    expect(h.me.friendCode).toBe(a.friendCode);
  });

  it('フレンド機能の無いサーバー：フレンドの操作は unsupported、create の secret は断る（secret 無しの部屋は今までどおり）', async () => {
    const w = world({ social: false });
    expect(await w.call({ op: 'register', name: 'A' })).toMatchObject({ ok: false, reason: 'unsupported' });
    expect(await w.call({ op: 'create', name: 'A', deck: POISON.deck, cards: POISON.cards, secret: 'a'.repeat(64) })).toMatchObject({ ok: false, reason: 'player' });
    rok(await w.call({ op: 'create', name: 'A', deck: POISON.deck, cards: POISON.cards }));
  });
});

describe('フレンド申請（コード・部屋の相手）', () => {
  it('コードで申請 → 相手に届き（通知も）→ 受けるとお互いのフレンド。もう一度申請しても already', async () => {
    const w = world();
    const a = await w.player('アキ');
    const b = await w.player('ベン');
    const r = sok(await a.s('friendRequest', { friendCode: b.friendCode.toLowerCase().replace(/(....)/, '$1-') }), 'friendRequest');
    expect(r.result).toBe('requested');
    expect(r.outgoing).toEqual([{ friendCode: b.friendCode, name: 'ベン', at: w.at() }]);
    expect(w.inbox).toEqual([[b.inboxId, 'friendRequest']]);
    expect((await b.hello()).incoming).toEqual([{ friendCode: a.friendCode, name: 'アキ', at: w.at() }]);
    // 2回送っても申請は1つ・通知も増えない
    expect(sok(await a.s('friendRequest', { friendCode: b.friendCode }), 'friendRequest').outgoing).toHaveLength(1);
    expect(w.inbox).toHaveLength(1);

    w.tick(1000);
    const acc = sok(await b.s('friendRespond', { friendCode: a.friendCode, accept: true }), 'friendRespond');
    expect(acc.incoming).toEqual([]);
    expect(acc.friends).toEqual([
      { friendCode: a.friendCode, name: 'アキ', presence: 'online', lastSeen: T0, since: w.at(), record: { win: 0, loss: 0, draw: 0 }, decks: 0 },
    ]);
    expect(w.inbox.at(-1)).toEqual([a.inboxId, 'friendAdded']);
    const ha = await a.hello();
    expect(ha.friends.map((f) => f.friendCode)).toEqual([b.friendCode]);
    expect(ha.outgoing).toEqual([]);
    expect(sok(await a.s('friendRequest', { friendCode: b.friendCode }), 'friendRequest').result).toBe('already');
    // もう一度受けても何も起きない
    sok(await b.s('friendRespond', { friendCode: a.friendCode, accept: true }), 'friendRespond');
    expect(w.store.friendshipList).toHaveLength(1);
  });

  it('申請し合ったら、すぐフレンド。断る・取り消す・やめる', async () => {
    const w = world();
    const [a, b, c] = [await w.player('A'), await w.player('B'), await w.player('C')];
    sok(await a.s('friendRequest', { friendCode: b.friendCode }), 'friendRequest');
    expect(sok(await b.s('friendRequest', { friendCode: a.friendCode }), 'friendRequest').result).toBe('friends');
    expect(w.store.requestList).toEqual([]);

    sok(await c.s('friendRequest', { friendCode: a.friendCode }), 'friendRequest');
    const declined = sok(await a.s('friendRespond', { friendCode: c.friendCode, accept: false }), 'friendRespond');
    expect(declined.incoming).toEqual([]);
    expect((await c.hello()).outgoing).toEqual([]);
    // 無い申請を受けようとすると notFound、断るのは何度でもよい
    expect(await a.s('friendRespond', { friendCode: c.friendCode, accept: true })).toMatchObject({ ok: false, reason: 'notFound' });
    sok(await a.s('friendRespond', { friendCode: c.friendCode, accept: false }), 'friendRespond');

    // 送った申請を取り消す
    sok(await c.s('friendRequest', { friendCode: b.friendCode }), 'friendRequest');
    expect(sok(await c.s('friendRemove', { friendCode: b.friendCode }), 'friendRemove').outgoing).toEqual([]);
    expect((await b.hello()).incoming).toEqual([]);

    // フレンドをやめる（どちらからでも。何度でも）
    expect(sok(await b.s('friendRemove', { friendCode: a.friendCode }), 'friendRemove').friends).toEqual([]);
    expect((await a.hello()).friends).toEqual([]);
    sok(await b.s('friendRemove', { friendCode: a.friendCode }), 'friendRemove');
  });

  it('自分あて・無いコード・形の違うコードは断る', async () => {
    const w = world();
    const a = await w.player('A');
    expect(await a.s('friendRequest', { friendCode: a.friendCode })).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await a.s('friendRequest', { friendCode: 'ZZZZZZZZ' })).toMatchObject({ ok: false, reason: 'notFound' });
    expect((await w.raw({ op: 'friendRequest', secret: a.secret, friendCode: 'O0O0O0O0' })).status).toBe(400);
    expect(normalizeFriendCode(' abcd-efgh ')).toBe('ABCDEFGH');
    expect(normalizeFriendCode('ABCDEFG')).toBeNull();
  });

  it('対戦した部屋の相手に申請できる（対戦中・決着後）。座っていない部屋・相手が未登録の部屋はだめ', async () => {
    const w = world();
    const [a, b, c] = [await w.player('A'), await w.player('B'), await w.player('C')];
    const { code, tokens } = await startDeckGame(w, a, b);
    const r = sok(await b.s('friendRequestRoom', { code: code.toLowerCase() }), 'friendRequestRoom');
    expect(r).toMatchObject({ result: 'requested', outgoing: [{ friendCode: a.friendCode, name: 'A' }] });
    await concede(w, code, tokens[0], 0);
    expect(sok(await a.s('friendRequestRoom', { code }), 'friendRequestRoom').result).toBe('friends');
    expect(await c.s('friendRequestRoom', { code })).toMatchObject({ ok: false, reason: 'notFound' });
    expect(await c.s('friendRequestRoom', { code: 'ZZZ222' })).toMatchObject({ ok: false, reason: 'notFound' });
    // 相手が secret を送っていない（古い画面）
    const g2 = await startDeckGame(w, c, null);
    expect(await c.s('friendRequestRoom', { code: g2.code })).toMatchObject({ ok: false, reason: 'invalid', error: '相手はフレンド機能を使っていません' });
    // まだ相手がいない
    const lone = rok(await w.call({ op: 'create', name: 'C', deck: POISON.deck, cards: POISON.cards, secret: c.secret }));
    expect(await c.s('friendRequestRoom', { code: lone.code })).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('上限：フレンド100人・送った申請50件・相手の受け取った申請50件', async () => {
    const w = world();
    const a = await w.player('A');
    const b = await w.player('B');
    // フレンドを上限まで（保存場所に直接入れる）
    for (let i = 0; i < MAX_FRIENDS; i++) await w.store.addFriendship(a.id, `x${String(i).padStart(31, '0')}`, T0);
    expect(await a.s('friendRequest', { friendCode: b.friendCode })).toMatchObject({ ok: false, reason: 'limit' });
    expect(await b.s('friendRequest', { friendCode: a.friendCode })).toMatchObject({ ok: false, reason: 'limit' });
    w.store.friendshipList = [];
    for (let i = 0; i < MAX_PENDING_REQUESTS; i++) await w.store.addRequest({ from: a.id, to: `y${i}`, at: T0 });
    expect(await a.s('friendRequest', { friendCode: b.friendCode })).toMatchObject({ ok: false, reason: 'limit' });
    w.store.requestList = [];
    for (let i = 0; i < MAX_PENDING_REQUESTS; i++) await w.store.addRequest({ from: `z${i}`, to: b.id, at: T0 });
    expect(await a.s('friendRequest', { friendCode: b.friendCode })).toMatchObject({ ok: false, reason: 'limit', error: '相手が受け取った申請がいっぱいです' });
  });
});

describe('招待リンク（inviteLink・friendByLink）', () => {
  it('リンクを開いて確かめると、すぐフレンド。作り直すと前のリンクは使えない', async () => {
    const w = world();
    const [a, b, c] = [await w.player('A'), await w.player('B'), await w.player('C')];
    const link = sok(await a.s('inviteLink'), 'inviteLink');
    expect(link).toMatchObject({ friendCode: a.friendCode, token: a.linkToken });
    expect(sok(await a.s('inviteLink'), 'inviteLink').token).toBe(link.token); // 作り直さなければ同じ
    const r = sok(await b.s('friendByLink', { friendCode: link.friendCode, token: link.token }), 'friendByLink');
    expect(r.friend).toEqual({ friendCode: a.friendCode, name: 'A' });
    expect(r.friends.map((f) => f.friendCode)).toEqual([a.friendCode]);
    expect(w.inbox.at(-1)).toEqual([a.inboxId, 'friendAdded']);
    // 2回開いても同じ
    sok(await b.s('friendByLink', { friendCode: link.friendCode, token: link.token }), 'friendByLink');
    expect(w.store.friendshipList).toHaveLength(1);
    // 自分のリンク
    expect(await a.s('friendByLink', { friendCode: link.friendCode, token: link.token })).toMatchObject({ ok: false, reason: 'invalid' });
    // 作り直し
    const fresh = sok(await a.s('inviteLink', { rotate: true }), 'inviteLink');
    expect(fresh.token).not.toBe(link.token);
    expect(await c.s('friendByLink', { friendCode: link.friendCode, token: link.token })).toMatchObject({ ok: false, reason: 'notFound' });
    sok(await c.s('friendByLink', { friendCode: fresh.friendCode, token: fresh.token }), 'friendByLink');
    // 鍵の形が違う
    expect((await w.raw({ op: 'friendByLink', secret: c.secret, friendCode: a.friendCode, token: 'abc' })).status).toBe(400);
  });

  it('リンクでも上限は守る。届いていた申請はフレンドになると消える', async () => {
    const w = world();
    const [a, b] = [await w.player('A'), await w.player('B')];
    sok(await a.s('friendRequest', { friendCode: b.friendCode }), 'friendRequest');
    sok(await a.s('friendByLink', { friendCode: b.friendCode, token: b.linkToken }), 'friendByLink');
    expect(w.store.requestList).toEqual([]);
    const c = await w.player('C');
    for (let i = 0; i < MAX_FRIENDS; i++) await w.store.addFriendship(c.id, `x${String(i).padStart(31, '0')}`, T0);
    expect(await a.s('friendByLink', { friendCode: c.friendCode, token: c.linkToken })).toMatchObject({ ok: false, reason: 'limit' });
  });
});

describe('部屋の席とプレイヤー（create・join の secret）', () => {
  it('両方が結び付いた部屋では、お互いのフレンドコードだけが見える（内部の ID・鍵は見えない）', async () => {
    const w = world();
    const [a, b] = [await w.player('A'), await w.player('B')];
    const { created, joined, code, tokens } = await startDeckGame(w, a, b);
    expect(created.opponentFriendCode).toBeUndefined(); // まだ相手がいない
    expect(joined.opponentFriendCode).toBe(a.friendCode);
    expect(rok(await w.call({ op: 'state', code, token: tokens[0] })).opponentFriendCode).toBe(b.friendCode);
    expect(w.store.rooms.get(code)!.seats.map((s) => s.playerId)).toEqual([a.id, b.id]);
    for (const v of [created, joined]) {
      const json = JSON.stringify(v);
      for (const x of [a.id, b.id, a.secret, b.secret, a.inboxId, b.inboxId, a.secretHash, b.secretHash]) expect(json).not.toContain(x);
    }
  });

  it('片方だけが結び付いた部屋・古い画面どうしの部屋ではフレンドコードを出さない', async () => {
    const w = world();
    const a = await w.player('A');
    const g = await startDeckGame(w, a, null);
    expect(g.joined.opponentFriendCode).toBeUndefined();
    expect(rok(await w.call({ op: 'state', code: g.code, token: g.tokens[0] })).opponentFriendCode).toBeUndefined();
    const old = await startDeckGame(w, null, null);
    expect(old.joined.opponentFriendCode).toBeUndefined();
    expect(w.store.rooms.get(old.code)!.seats.every((s) => s.playerId === undefined)).toBe(true);
  });

  it('鍵が無効なら reason player で断る。自分の部屋には入れない', async () => {
    const w = world();
    const a = await w.player('A');
    expect(await w.call({ op: 'create', name: 'A', deck: POISON.deck, cards: POISON.cards, secret: 'c'.repeat(64) })).toMatchObject({ ok: false, reason: 'player' });
    expect((await w.raw({ op: 'create', name: 'A', deck: POISON.deck, cards: POISON.cards, secret: 'nothex' })).status).toBe(400);
    const created = rok(await w.call({ op: 'create', name: 'A', deck: POISON.deck, cards: POISON.cards, secret: a.secret }));
    expect(await w.call({ op: 'join', code: created.code, name: 'A2', deck: BEASTS.deck, cards: BEASTS.cards, secret: a.secret })).toMatchObject({
      ok: false,
      error: '自分が作った部屋には入れません',
    });
    expect(await w.call({ op: 'join', code: created.code, name: 'B', deck: BEASTS.deck, cards: BEASTS.cards, secret: 'd'.repeat(64) })).toMatchObject({ ok: false, reason: 'player' });
    expect(w.store.rooms.get(created.code)!.status).toBe('waiting');
  });
});

describe('対戦成績と「対戦中」', () => {
  it('決着ごとに記録し（再戦も）、フレンドの成績に出る。古い画面の相手との対戦は記録しない', async () => {
    const w = world();
    const [a, b] = [await w.player('A'), await w.player('B')];
    await befriend(a, b);
    const g = await startDeckGame(w, a, b);
    w.tick(1000);
    await concede(w, g.code, g.tokens[1], 1); // B の負け
    expect([...w.store.matches.values()]).toEqual([
      { id: `${g.code}-1-${w.at()}`, roomCode: g.code, game: 1, players: [a.id, b.id], winner: 0, mode: 'deck', at: w.at() },
    ]);
    // 状態を取り直しても2つにならない
    rok(await w.call({ op: 'state', code: g.code, token: g.tokens[0] }));
    expect(w.store.matches.size).toBe(1);
    // 再戦 → 今度は A の負け
    rok(await w.call({ op: 'rematch', code: g.code, token: g.tokens[0] }));
    rok(await w.call({ op: 'rematch', code: g.code, token: g.tokens[1] }));
    w.tick(1000);
    await concede(w, g.code, g.tokens[0], 0);
    // 3戦目は引き分け（決着の状態を直接作る）
    rok(await w.call({ op: 'rematch', code: g.code, token: g.tokens[0] }));
    rok(await w.call({ op: 'rematch', code: g.code, token: g.tokens[1] }));
    const room = w.store.rooms.get(g.code)!;
    const prev = JSON.parse(JSON.stringify(room)) as RoomRecord;
    room.state!.phase = 'ended';
    room.state!.result = { winner: null, reason: 'turnLimit' };
    room.status = 'ended';
    expect(matchRecordOf(prev, room, w.at())).toMatchObject({ game: 3, winner: null });
    await w.store.insertMatch(matchRecordOf(prev, room, w.at())!);

    expect((await a.hello()).friends[0]!.record).toEqual({ win: 1, loss: 1, draw: 1 });
    expect((await b.hello()).friends[0]!.record).toEqual({ win: 1, loss: 1, draw: 1 });

    const c = await w.player('C');
    const old = await startDeckGame(w, c, null);
    await concede(w, old.code, old.tokens[1], 1);
    expect(w.store.matches.size).toBe(3);
  });

  it('ドラフトの部屋の決着も記録する（mode draft）', async () => {
    const w = world();
    const [a, b] = [await w.player('A'), await w.player('B')];
    const created = rok(await w.call({ op: 'create', mode: 'draft', name: 'A', secret: a.secret }));
    const joined = rok(await w.call({ op: 'join', code: created.code, name: 'B', features: ['draft'], secret: b.secret }));
    expect(joined.status).toBe('drafting');
    const room = w.store.rooms.get(created.code)!;
    // ドラフトを飛ばして対戦中にする（ドラフトの流れは online-draft.test.ts）
    const { s } = draftRoom();
    finishDraft(s);
    room.status = 'playing';
    room.state = s.room!.state;
    room.meta = { ...s.room!.meta!, mode: 'draft' };
    await concede(w, created.code, joined.token!, 1);
    expect([...w.store.matches.values()][0]).toMatchObject({ mode: 'draft', winner: 0, players: [a.id, b.id] });
  });

  it('フレンドの在室：部屋で対戦中は battle、決着でその場で online、60秒通信が無ければ offline', async () => {
    const w = world();
    const [a, b] = [await w.player('A'), await w.player('B')];
    await befriend(a, b);
    const c = await w.player('C');
    await befriend(c, a);
    const g = await startDeckGame(w, a, b);
    const friendOf = async (who: Who, fc: string) => (await who.hello()).friends.find((f) => f.friendCode === fc)!;
    expect((await friendOf(c, a.friendCode)).presence).toBe('battle');
    w.tick(30_000);
    rok(await w.call({ op: 'state', code: g.code, token: g.tokens[0] }));
    w.tick(40_000);
    expect((await friendOf(c, a.friendCode)).presence).toBe('battle');
    // B が降参 → A は相手の操作で決着したが、すぐ battle ではなくなる
    await concede(w, g.code, g.tokens[1], 1);
    expect((await friendOf(c, a.friendCode)).presence).toBe('online');
    w.tick(61_000);
    expect((await friendOf(c, a.friendCode)).presence).toBe('offline');
    const f = await friendOf(c, a.friendCode);
    expect(f.lastSeen).toBe(w.at() - 61_000 - 40_000);
    // 対戦の画面を閉じた（部屋の送信が止まった）まま hello だけ来るなら online
    const g2 = await startDeckGame(w, a, c);
    expect((await friendOf(b, a.friendCode)).presence).toBe('battle');
    w.tick(61_000);
    await a.hello();
    expect((await friendOf(b, a.friendCode)).presence).toBe('online');
    expect(g2.code).toBeTruthy();
  });

  it('「見かけた」は20秒ごとに1回だけ書く（状態が変わったときは毎回）', () => {
    const base = { code: 'ABC234', version: 1, state: null, hostDeck: null, deadline: null, updatedAt: T0 } as const;
    const seat = (playerId: string | undefined, lastSeen: number) => ({ name: 'x', tokenHash: 'h', lastSeen, timeouts: 0, ...(playerId ? { playerId, friendCode: 'F' } : {}) });
    const before: RoomRecord = { ...base, status: 'playing', seats: [seat('p0', T0), seat('p1', T0)] };
    const same: RoomRecord = { ...before, seats: [seat('p0', T0 + 1000), seat('p1', T0)] };
    expect(presenceUpdates(before, same, 0, T0 + 1000)).toEqual([]);
    const later = T0 + PRESENCE_STEP_MS;
    expect(presenceUpdates(before, same, 0, later)).toEqual([{ playerId: 'p0', seen: later, room: { code: 'ABC234', status: 'playing', at: later } }]);
    const ended: RoomRecord = { ...same, status: 'ended' };
    expect(presenceUpdates(before, ended, 0, T0 + 1000)).toEqual([
      { playerId: 'p0', seen: T0 + 1000, room: { code: 'ABC234', status: 'ended', at: T0 + 1000 } },
      { playerId: 'p1', room: { code: 'ABC234', status: 'ended', at: T0 } },
    ]);
    expect(presenceUpdates(before, { ...ended, seats: [seat(undefined, T0), seat(undefined, T0)] }, 0, T0)).toEqual([]);
  });
});

describe('公開の部屋（create の listed・list）', () => {
  it('公開の部屋だけが、新しい順に並ぶ。入られた・作成者が30秒以上来ない部屋は出ない', async () => {
    const w = world();
    const a = await w.player('A');
    const pub = rok(await w.call({ op: 'create', name: 'アキ', deck: POISON.deck, cards: POISON.cards, leader: 'knight', rules: { field: 'none', dayNight: true }, listed: true, secret: a.secret }));
    expect(pub.listed).toBe(true);
    rok(await w.call({ op: 'create', name: '非公開', deck: POISON.deck, cards: POISON.cards }));
    w.tick(1000);
    const draftPub = rok(await w.call({ op: 'create', mode: 'draft', name: 'ドラ', listed: true }));
    const l = sok(await w.call({ op: 'list' }), 'list');
    expect(l.rooms).toEqual([
      { code: draftPub.code, hostName: 'ドラ', mode: 'draft', leader: 'none', since: T0 + 1000, hostSeen: T0 + 1000 },
      { code: pub.code, hostName: 'アキ', mode: 'deck', rules: { dayNight: true }, leader: 'knight', since: T0, hostSeen: T0 },
    ]);
    // 一覧に鍵・内部の ID・デッキの中身は入らない
    const json = JSON.stringify(l);
    for (const x of [a.id, a.secret, POISON.deck.id, 'tokenHash', 'playerId', 'friendCode']) expect(json).not.toContain(x);

    // 作成者が状態を取りに来ている間は出続け、来なくなったら消える
    w.tick(25_000);
    rok(await w.call({ op: 'state', code: pub.code, token: pub.token }));
    w.tick(10_000);
    expect(sok(await w.call({ op: 'list' }), 'list').rooms.map((r) => r.code)).toEqual([pub.code]);
    // 入られたら消える（入るのは普通の join）
    rok(await w.call({ op: 'join', code: pub.code, name: 'B', deck: BEASTS.deck, cards: BEASTS.cards }));
    expect(sok(await w.call({ op: 'list' }), 'list').rooms).toEqual([]);
    expect(w.store.rooms.get(pub.code)!.meta?.listed).toBeUndefined();
  });

  it('件数の上限と、公開の指定の形', async () => {
    const w = world();
    for (let i = 0; i < MAX_LISTED_ROOMS + 5; i++) rok(await w.call({ op: 'create', mode: 'draft', name: `R${i}`, listed: true }));
    expect(sok(await w.call({ op: 'list' }), 'list').rooms).toHaveLength(MAX_LISTED_ROOMS);
    expect((await w.raw({ op: 'create', mode: 'draft', name: 'x', listed: 'yes' })).status).toBe(400);
  });
});

describe('対戦への招待（invite・inviteRespond）', () => {
  async function setup() {
    const w = world();
    const [a, b, c] = [await w.player('A'), await w.player('B'), await w.player('C')];
    await befriend(a, b);
    const room = rok(await w.call({ op: 'create', mode: 'draft', name: 'A', secret: a.secret, rules: { field: 'none', dayNight: true } }));
    return { w, a, b, c, room };
  }

  it('フレンドを自分の相手待ちの部屋に招待 → 相手に届き（通知も）→ 受けると部屋コードが返り、そのまま入れる', async () => {
    const { w, a, b, room } = await setup();
    const inv = sok(await a.s('invite', { friendCode: b.friendCode, roomCode: room.code }), 'invite');
    expect(inv.inviteId).toMatch(/^[0-9a-f]{32}$/);
    expect(inv.sentInvites).toEqual([
      { id: inv.inviteId, to: { friendCode: b.friendCode, name: 'B' }, roomCode: room.code, mode: 'draft', status: 'pending', at: w.at(), expiresAt: w.at() + INVITE_TTL_MS },
    ]);
    expect(w.inbox.at(-1)).toEqual([b.inboxId, 'invite']);
    const hb = await b.hello();
    expect(hb.invites).toEqual([
      { id: inv.inviteId, from: { friendCode: a.friendCode, name: 'A' }, roomCode: room.code, mode: 'draft', rules: { dayNight: true }, at: w.at(), expiresAt: w.at() + INVITE_TTL_MS },
    ]);
    // 同じ部屋にもう一度招待しても1つ（期限が延びる）
    w.tick(60_000);
    const again = sok(await a.s('invite', { friendCode: b.friendCode, roomCode: room.code }), 'invite');
    expect(again.inviteId).toBe(inv.inviteId);
    expect(again.sentInvites).toHaveLength(1);
    expect(again.sentInvites[0]!.expiresAt).toBe(w.at() + INVITE_TTL_MS);

    const acc = sok(await b.s('inviteRespond', { inviteId: inv.inviteId, accept: true }), 'inviteRespond');
    expect(acc.room).toEqual({ code: room.code, mode: 'draft' });
    expect(acc.invites).toEqual([]);
    expect(w.inbox.at(-1)).toEqual([a.inboxId, 'inviteAnswered']);
    expect((await a.hello()).sentInvites[0]!.status).toBe('accepted');
    // 受けたあと入る前に画面を閉じても、もう一度受ければ部屋が返る
    expect(sok(await b.s('inviteRespond', { inviteId: inv.inviteId, accept: true }), 'inviteRespond').room).toEqual({ code: room.code, mode: 'draft' });
    const joined = rok(await w.call({ op: 'join', code: acc.room!.code, name: 'B', features: ['draft'], secret: b.secret }));
    expect(joined.status).toBe('drafting');
    // 部屋が始まったら、もう受けられない
    expect(await b.s('inviteRespond', { inviteId: inv.inviteId, accept: true })).toMatchObject({ ok: false, reason: 'expired' });
  });

  it('断る・期限切れ・部屋が始まった招待は、送った側には declined／expired に見える', async () => {
    const { w, a, b, room } = await setup();
    const inv = sok(await a.s('invite', { friendCode: b.friendCode, roomCode: room.code }), 'invite');
    const dec = sok(await b.s('inviteRespond', { inviteId: inv.inviteId, accept: false }), 'inviteRespond');
    expect(dec.room).toBeUndefined();
    expect((await a.hello()).sentInvites[0]!.status).toBe('declined');
    expect(await b.s('inviteRespond', { inviteId: inv.inviteId, accept: true })).toMatchObject({ ok: false, reason: 'invalid' });

    // 期限切れ（作成者は部屋の様子を取りに来続けている）
    const room2 = rok(await w.call({ op: 'create', name: 'A', deck: POISON.deck, cards: POISON.cards, secret: a.secret }));
    const inv2 = sok(await a.s('invite', { friendCode: b.friendCode, roomCode: room2.code }), 'invite');
    w.tick(INVITE_TTL_MS);
    expect((await b.hello()).invites).toEqual([]);
    expect(await b.s('inviteRespond', { inviteId: inv2.inviteId, accept: true })).toMatchObject({ ok: false, reason: 'expired' });
    expect((await a.hello()).sentInvites.find((s) => s.id === inv2.inviteId)!.status).toBe('expired');
    w.tick(1);
    expect((await a.hello()).sentInvites.find((s) => s.id === inv2.inviteId)).toBeUndefined(); // 作ってから10分を過ぎた招待は一覧から外れる

    // 部屋に別の人が入った
    const room3 = rok(await w.call({ op: 'create', name: 'A', deck: POISON.deck, cards: POISON.cards, secret: a.secret }));
    const inv3 = sok(await a.s('invite', { friendCode: b.friendCode, roomCode: room3.code }), 'invite');
    rok(await w.call({ op: 'join', code: room3.code, name: 'X', deck: BEASTS.deck, cards: BEASTS.cards }));
    expect((await a.hello()).sentInvites.find((s) => s.id === inv3.inviteId)!.status).toBe('expired');
    expect((await b.hello()).invites).toEqual([]);
    expect(await b.s('inviteRespond', { inviteId: inv3.inviteId, accept: true })).toMatchObject({ ok: false, reason: 'expired' });
  });

  it('フレンドでない・自分の部屋でない・相手待ちでない・他人あての招待はだめ。招待の数の上限', async () => {
    const { w, a, b, c, room } = await setup();
    expect(await a.s('invite', { friendCode: c.friendCode, roomCode: room.code })).toMatchObject({ ok: false, reason: 'notFriend' });
    await befriend(b, c);
    expect(await b.s('invite', { friendCode: c.friendCode, roomCode: room.code })).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await a.s('invite', { friendCode: b.friendCode, roomCode: 'ZZZ222' })).toMatchObject({ ok: false, reason: 'notFound' });
    const inv = sok(await a.s('invite', { friendCode: b.friendCode, roomCode: room.code }), 'invite');
    expect(await c.s('inviteRespond', { inviteId: inv.inviteId, accept: true })).toMatchObject({ ok: false, reason: 'notFound' });
    expect(await c.s('inviteRespond', { inviteId: 'e'.repeat(32), accept: true })).toMatchObject({ ok: false, reason: 'notFound' });
    // フレンドをやめた人の招待は届かない・受けられない
    sok(await a.s('friendRemove', { friendCode: b.friendCode }), 'friendRemove');
    expect((await b.hello()).invites).toEqual([]);
    expect(await b.s('inviteRespond', { inviteId: inv.inviteId, accept: true })).toMatchObject({ ok: false, reason: 'notFriend' });

    // 上限：別々の部屋に20件（さっきの招待も、部屋が相手待ちのままなのでまだ数える）
    await befriend(a, b);
    for (let i = 0; i < MAX_PENDING_INVITES - 1; i++) {
      const r = rok(await w.call({ op: 'create', mode: 'draft', name: 'A', secret: a.secret }));
      sok(await a.s('invite', { friendCode: b.friendCode, roomCode: r.code }), 'invite');
    }
    const r = rok(await w.call({ op: 'create', mode: 'draft', name: 'A', secret: a.secret }));
    expect(await a.s('invite', { friendCode: b.friendCode, roomCode: r.code })).toMatchObject({ ok: false, reason: 'limit' });
  });

  it('1日より古い招待は片付ける', async () => {
    const { w, a, b, room } = await setup();
    sok(await a.s('invite', { friendCode: b.friendCode, roomCode: room.code }), 'invite');
    w.tick(INVITE_KEEP_MS + 1);
    const room2 = rok(await w.call({ op: 'create', mode: 'draft', name: 'A', secret: a.secret }));
    sok(await a.s('invite', { friendCode: b.friendCode, roomCode: room2.code }), 'invite');
    expect(w.store.inviteMap.size).toBe(1);
  });
});

describe('デッキを見せ合う（shareDeck・unshareDeck・friendDecks）', () => {
  it('ルールどおりのデッキだけを公開でき、フレンドが中身ごと見られる。フレンドでなければ見られない', async () => {
    const w = world();
    const [a, b, c] = [await w.player('A'), await w.player('B'), await w.player('C')];
    await befriend(a, b);
    w.tick(500);
    const shared = sok(await a.s('shareDeck', { deck: POISON.deck, cards: POISON.cards }), 'shareDeck');
    const count = POISON.deck.entries.reduce((n, e) => n + e.count, 0);
    expect(shared.sharedDecks).toEqual([{ deckId: POISON.deck.id, name: POISON.deck.name, count, updatedAt: w.at() }]);
    expect((await b.hello()).friends[0]!.decks).toBe(1);
    const view = sok(await b.s('friendDecks', { friendCode: a.friendCode }), 'friendDecks');
    expect(view.friend).toEqual({ friendCode: a.friendCode, name: 'A' });
    expect(view.decks).toHaveLength(1);
    expect(view.decks[0]!.deck.entries).toEqual(POISON.deck.entries);
    // デッキで使うカードだけが入る
    expect(view.decks[0]!.cards.every((c) => POISON.deck.entries.some((e) => e.cardId === c.id))).toBe(true);
    expect(sok(await b.s('friendDecks', { friendCode: a.friendCode, deckId: 'nope' }), 'friendDecks').decks).toEqual([]);
    // 自分のも見られる
    expect(sok(await a.s('friendDecks', { friendCode: a.friendCode }), 'friendDecks').decks).toHaveLength(1);
    expect(await c.s('friendDecks', { friendCode: a.friendCode })).toMatchObject({ ok: false, reason: 'notFriend' });

    // 同じ ID は置き換え
    sok(await a.s('shareDeck', { deck: { ...POISON.deck, name: '毒・改' }, cards: POISON.cards }), 'shareDeck');
    expect((await a.hello()).sharedDecks.map((d) => d.name)).toEqual(['毒・改']);
    // ルール違反・壊れたデッキは断る
    const broken = { ...POISON.deck, id: 'broken', entries: [{ cardId: POISON.deck.entries[0]!.cardId, count: 99 }] };
    expect(await a.s('shareDeck', { deck: broken, cards: POISON.cards })).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await a.s('shareDeck', { deck: 'x', cards: [] })).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await a.s('shareDeck', { deck: { ...POISON.deck, id: 'x'.repeat(101) }, cards: POISON.cards })).toMatchObject({ ok: false, reason: 'invalid' });
    // 公開をやめる（何度でも）
    expect(sok(await a.s('unshareDeck', { deckId: POISON.deck.id }), 'unshareDeck').sharedDecks).toEqual([]);
    sok(await a.s('unshareDeck', { deckId: POISON.deck.id }), 'unshareDeck');
    expect(sok(await b.s('friendDecks', { friendCode: a.friendCode }), 'friendDecks').decks).toEqual([]);
  });

  it(`公開できるのは${MAX_SHARED_DECKS}個まで（置き換えは数えない）`, async () => {
    const w = world();
    const a = await w.player('A');
    for (let i = 0; i < MAX_SHARED_DECKS; i++) sok(await a.s('shareDeck', { deck: { ...BEASTS.deck, id: `d${i}` }, cards: BEASTS.cards }), 'shareDeck');
    expect(await a.s('shareDeck', { deck: { ...BEASTS.deck, id: 'one-more' }, cards: BEASTS.cards })).toMatchObject({ ok: false, reason: 'limit' });
    sok(await a.s('shareDeck', { deck: { ...BEASTS.deck, id: 'd0', name: '置き換え' }, cards: BEASTS.cards }), 'shareDeck');
  });
});

describe('他人の秘密を返さない', () => {
  it('一通りの操作の返事に、他人の内部 ID・鍵・鍵のハッシュ・inboxId・招待リンクの鍵・部屋のトークンが入らない', async () => {
    const w = world();
    const [a, b, c] = [await w.player('A'), await w.player('B'), await w.player('C')];
    await befriend(a, b);
    sok(await c.s('friendByLink', { friendCode: a.friendCode, token: a.linkToken }), 'friendByLink');
    sok(await b.s('friendRequest', { friendCode: c.friendCode }), 'friendRequest');
    sok(await a.s('shareDeck', { deck: POISON.deck, cards: POISON.cards }), 'shareDeck');
    sok(await b.s('friendDecks', { friendCode: a.friendCode }), 'friendDecks');
    const g = await startDeckGame(w, a, b, { listed: true });
    sok(await w.call({ op: 'list' }), 'list');
    const room = rok(await w.call({ op: 'create', mode: 'draft', name: 'A', secret: a.secret, listed: true }));
    sok(await w.call({ op: 'list' }), 'list');
    const inv = sok(await a.s('invite', { friendCode: c.friendCode, roomCode: room.code }), 'invite');
    sok(await c.s('inviteRespond', { inviteId: inv.inviteId, accept: false }), 'inviteRespond');
    await concede(w, g.code, g.tokens[0], 0);
    for (const who of [a, b, c]) await who.hello();
    sok(await b.s('friendRequestRoom', { code: g.code }), 'friendRequestRoom');

    const people = [a, b, c];
    const roomTokens = [...w.store.rooms.values()].flatMap((r) => r.seats.map((s) => s.tokenHash));
    for (const { to, body } of w.seen) {
      const json = JSON.stringify(body);
      for (const p of people) {
        expect(json).not.toContain(p.id);
        expect(json).not.toContain(p.secretHash);
        if (to !== p.secret) {
          expect(json).not.toContain(p.secret);
          expect(json).not.toContain(p.inboxId);
          expect(json).not.toContain(p.linkToken);
        }
      }
      for (const h of roomTokens) expect(json).not.toContain(h);
    }
  });
});
