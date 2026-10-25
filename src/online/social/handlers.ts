/**
 * フレンド機能・公開の部屋の操作（決定事項 #121）。保存場所・時刻・乱数・ハッシュ・通知は外から渡す（engine と同じく純粋。時刻・乱数・ブラウザの機能に直接は触れない）。
 * 返事に他人の内部 ID・鍵・inboxId・招待リンクの鍵は入れない（他人を指すのはフレンドコードと名前だけ）
 */
import { normalizeRules } from '../../engine/fields.ts';
import { checkDeck } from '../room.ts';
import {
  generateFriendCode,
  type FriendView,
  type InviteView,
  type ParsedSocial,
  type Presence,
  type RequestResult,
  type SentInviteView,
  type SharedDeckSummary,
  type SharedDeckView,
  type SocialErrorReason,
  type SocialOk,
  type SocialOp,
  type SocialReplies,
  type SocialResponse,
  type SocialSnapshot,
} from './protocol.ts';
import { isListable, listedRoomView } from './rooms.ts';
import {
  DECLINE_MEMORY_MS,
  EVENT_KEEP_MS,
  INVITE_KEEP_MS,
  INVITE_TTL_MS,
  LINK_INFO_PER_HOUR,
  LISTED_FRESH_MS,
  MAX_FRIENDS,
  MAX_LISTED_ROOMS,
  MAX_PENDING_INVITES,
  MAX_PENDING_REQUESTS,
  MAX_SHARED_DECKS,
  ONLINE_WITHIN_MS,
  RATE_WINDOW,
  REGISTER_PER_CLIENT_HOUR,
  REGISTER_PER_HOUR,
  REINVITE_NOTIFY_MS,
  REQUESTS_PER_DAY,
  SHARED_DECK_MAX_CHARS,
  SHARED_DECK_NAME_MAX,
  SHARED_TOTAL_MAX_CHARS,
  STALE_PLAYER_MS,
  type InviteRecord,
  type PlayerRecord,
  type RoomSummary,
  type SharedDeckSummaryRecord,
  type SocialStore,
} from './types.ts';

/** 自分あての通知の種類（中身は送らない。画面は受け取ったら hello で取り直す） */
export type InboxEvent = 'friendRequest' | 'friendAdded' | 'invite' | 'inviteAnswered';

export interface SocialDeps {
  store: SocialStore;
  now: number;
  /** 0 以上 n 未満の暗号学的乱数 */
  randomInt(n: number): number;
  /** 新しい乱数の鍵（16進64文字） */
  newToken(): string;
  hash(token: string): Promise<string>;
  /**
   * 送り元を表す鍵（Edge Function は x-forwarded-for の IP のハッシュ。無ければ全体の上限だけを見る）。
   * register の回数の上限に使う（決定事項 #124）
   */
  clientKey?: string;
  /** cardgame:inbox:<inboxId> に知らせる（無ければ知らせない。失敗しても操作は成り立つ） */
  notifyInbox?(inboxId: string, event: InboxEvent): Promise<void>;
  log?(message: string): void;
}

const REGISTER_TRIES = 5;

class SocialFail extends Error {
  readonly reason: SocialErrorReason;
  constructor(message: string, reason: SocialErrorReason) {
    super(message);
    this.reason = reason;
  }
}

function fail(message: string, reason: SocialErrorReason): never {
  throw new SocialFail(message, reason);
}

const reply = <K extends SocialOp>(op: K, body: SocialReplies[K]): SocialOk<K> => ({ ok: true, op, ...body }) as SocialOk<K>;

export async function handleSocial(req: ParsedSocial, deps: SocialDeps): Promise<SocialResponse> {
  try {
    return await dispatch(req, deps);
  } catch (e) {
    if (e instanceof SocialFail) return { ok: false, error: e.message, reason: e.reason };
    throw e;
  }
}

async function dispatch(req: ParsedSocial, deps: SocialDeps): Promise<SocialResponse> {
  const { store, now } = deps;
  if (req.op === 'register') return register(req.name, deps);
  if (req.op === 'list') {
    const rooms = (await store.listedRooms(now - LISTED_FRESH_MS, MAX_LISTED_ROOMS))
      .filter((r) => isListable(r, now - LISTED_FRESH_MS))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_LISTED_ROOMS)
      .map(listedRoomView);
    return reply('list', { rooms, serverNow: now });
  }

  const me = await authenticate(req.secret, deps);
  switch (req.op) {
    case 'hello': {
      const patch = { lastSeen: now, ...(req.name !== undefined ? { name: req.name } : {}) };
      await store.updatePlayer(me.id, patch);
      return reply('hello', await snapshot({ ...me, ...patch }, deps));
    }
    case 'rotateSecret': {
      // 漏れた引き継ぎコードを持つ人を締め出す：鍵と一緒に、招待リンクの鍵と通知のチャンネルも作り直す（決定事項 #124）。
      // next は画面が先に作って端末に控えた新しい鍵（返事が届かなくても、画面は控えた鍵で入り直せる）
      const secret = req.next ?? deps.newToken();
      const patch = { secretHash: await deps.hash(secret), linkToken: hex32(deps), inboxId: hex32(deps) };
      if (patch.secretHash === me.secretHash) fail('今と同じ鍵です', 'invalid');
      if (await store.playerBySecretHash(patch.secretHash)) fail('その鍵は使えません', 'invalid');
      await store.updatePlayer(me.id, patch);
      return reply('rotateSecret', { secret, inboxId: patch.inboxId });
    }
    case 'friendRequest': {
      const target = await byCode(req.friendCode, deps);
      const result = await requestTo(me, target, deps);
      return reply('friendRequest', { ...(await snapshot(me, deps)), result });
    }
    case 'friendRequestRoom': {
      const target = await opponentIn(req.code, me, deps);
      const result = await requestTo(me, target, deps);
      return reply('friendRequestRoom', { ...(await snapshot(me, deps)), result });
    }
    case 'friendRespond': {
      const target = await byCode(req.friendCode, deps);
      if (await areFriends(me.id, target.id, deps)) return reply('friendRespond', await snapshot(me, deps));
      const { incoming } = await store.requests(me.id);
      const has = incoming.some((r) => r.from === target.id);
      if (req.accept) {
        if (!has) fail('申請が見つかりません（取り消されたかもしれません）', 'notFound');
        await makeFriends(me, target, deps);
        await notify(target, 'friendAdded', deps);
      } else if (has) {
        await store.removeRequest(target.id, me.id);
        // 断ったことを覚えておく（しばらくは同じ人からの申請を黙って受け流す。知らせも出さない）
        await store.addEvent('declined', declineKey(target.id, me.id), now);
      }
      return reply('friendRespond', await snapshot(me, deps));
    }
    case 'friendRemove': {
      const target = await byCode(req.friendCode, deps);
      await store.removeFriendship(me.id, target.id);
      return reply('friendRemove', await snapshot(me, deps));
    }
    case 'inviteLink': {
      let token = me.linkToken;
      if (req.rotate) {
        token = hex32(deps);
        await store.updatePlayer(me.id, { linkToken: token });
      }
      return reply('inviteLink', { friendCode: me.friendCode, token });
    }
    case 'linkInfo': {
      // 招待リンクの持ち主の本当の名前（リンクの URL に書かれた名前は誰でも書き換えられるので、確かめる画面はこれを出す）
      if ((await store.countEvents('linkInfo', me.id, now - RATE_WINDOW.hour)) >= LINK_INFO_PER_HOUR) fail('少し時間をおいてからお試しください', 'limit');
      await store.addEvent('linkInfo', me.id, now);
      const owner = await store.playerByFriendCode(req.friendCode);
      if (!owner || owner.linkToken !== req.token) fail('招待リンクが見つかりません（作り直されたか、写し間違いかもしれません）', 'notFound');
      const o = owner!;
      return reply('linkInfo', { friend: { friendCode: o.friendCode, name: o.name }, self: o.id === me.id, already: o.id !== me.id && (await areFriends(me.id, o.id, deps)) });
    }
    case 'friendByLink': {
      const owner = await store.playerByFriendCode(req.friendCode);
      if (!owner || owner.linkToken !== req.token) fail('招待リンクが見つかりません（作り直されたか、写し間違いかもしれません）', 'notFound');
      const target = owner!;
      if (target.id === me.id) fail('自分の招待リンクです', 'invalid');
      if (!(await areFriends(me.id, target.id, deps))) {
        await makeFriends(me, target, deps);
        await notify(target, 'friendAdded', deps);
      }
      return reply('friendByLink', { ...(await snapshot(me, deps)), friend: { friendCode: target.friendCode, name: target.name } });
    }
    case 'invite': {
      const target = await byCode(req.friendCode, deps);
      if (!(await areFriends(me.id, target.id, deps))) fail('フレンドにだけ招待できます', 'notFriend');
      const [room] = await store.roomSummaries([req.roomCode]);
      if (!room) fail('部屋が見つかりません', 'notFound');
      if (!hostWaiting(room!, me.id)) fail('自分が作った、相手待ちの部屋にだけ招待できます', 'invalid');
      await store.removeInvitesOlderThan(now - INVITE_KEEP_MS);
      const { sent } = await store.invites(me.id, now - INVITE_TTL_MS);
      const same = sent.find((i) => i.to === target.id && i.roomCode === room!.code && i.status === 'pending' && now < i.expiresAt);
      let id: string;
      let renotify = true;
      if (same) {
        // 同じ部屋に同じ相手をもう一度：期限を延ばして知らせ直す（2つ作らない）。一覧は作った時刻で選ぶので、作った時刻も今にする。
        // 知らせ直すのは REINVITE_NOTIFY_MS に1回まで（相手のバナーを連打で出し続けないように）
        id = same.id;
        renotify = now - same.createdAt >= REINVITE_NOTIFY_MS;
        await store.updateInvite(id, { expiresAt: now + INVITE_TTL_MS, createdAt: now });
      } else {
        const rooms = await store.roomSummaries(unique(sent.map((i) => i.roomCode)));
        const live = sent.filter((i) => inviteLive(i, rooms, now)).length;
        if (live >= MAX_PENDING_INVITES) fail(`答えを待っている招待が多すぎます（${MAX_PENDING_INVITES}件まで）`, 'limit');
        id = hex32(deps);
        const inv: InviteRecord = {
          id,
          from: me.id,
          to: target.id,
          roomCode: room!.code,
          mode: modeOf(room!),
          createdAt: now,
          expiresAt: now + INVITE_TTL_MS,
          status: 'pending',
        };
        await store.insertInvite(inv);
      }
      if (renotify) await notify(target, 'invite', deps);
      return reply('invite', { ...(await snapshot(me, deps)), inviteId: id });
    }
    case 'inviteRespond': {
      const inv = await store.invite(req.inviteId);
      if (!inv || inv.to !== me.id) fail('招待が見つかりません', 'notFound');
      const invite = inv!;
      const answer = req.accept ? 'accepted' : 'declined';
      const [room] = await store.roomSummaries([invite.roomCode]);
      const rooms = room ? [room] : [];
      if (invite.status !== 'pending' && invite.status !== answer) fail('この招待にはもう答えています', 'invalid');
      if (req.accept) {
        // 受けたのにまだ入っていない（画面が閉じられた）ときは、もう一度受けても部屋を返す
        if (!inviteLive({ ...invite, status: 'pending' }, rooms, now)) fail('招待の期限が切れたか、部屋がもう始まっています', 'expired');
        if (!(await areFriends(me.id, invite.from, deps))) fail('フレンドではなくなった人の招待です', 'notFriend');
      }
      if (invite.status === 'pending') {
        await store.updateInvite(invite.id, { status: answer });
        const [sender] = await store.playersByIds([invite.from]);
        if (sender) await notify(sender, 'inviteAnswered', deps);
      }
      return reply('inviteRespond', { ...(await snapshot(me, deps)), ...(req.accept ? { room: { code: invite.roomCode, mode: invite.mode } } : {}) });
    }
    case 'shareDeck': {
      const checked = checkDeck(req.deck, req.cards);
      if (!checked.ok) return fail(checked.error, 'invalid');
      const { deck, cards } = checked.value;
      // 大きさの上限（ログインが無いので、共用の DB を公開デッキで埋められないように。決定事項 #124）
      const size = JSON.stringify({ deck, cards }).length;
      if (size > SHARED_DECK_MAX_CHARS) fail('デッキのデータが大きすぎて公開できません', 'limit');
      const mine = await store.sharedDeckSummaries([me.id]);
      const others = mine.filter((d) => d.deckId !== deck.id);
      if (others.length >= MAX_SHARED_DECKS) fail(`公開できるデッキは${MAX_SHARED_DECKS}個までです`, 'limit');
      if (others.reduce((n, d) => n + d.size, 0) + size > SHARED_TOTAL_MAX_CHARS) fail('公開しているデッキが多すぎます。使わないデッキの公開をやめてください', 'limit');
      const name = [...deck.name].slice(0, SHARED_DECK_NAME_MAX).join('') || 'デッキ';
      await store.putSharedDeck({
        ownerId: me.id,
        deckId: deck.id,
        name,
        count: deck.entries.reduce((n, e) => n + e.count, 0),
        deck,
        cards,
        size,
        updatedAt: now,
      });
      return reply('shareDeck', await snapshot(me, deps));
    }
    case 'unshareDeck':
      await store.removeSharedDeck(me.id, req.deckId);
      return reply('unshareDeck', await snapshot(me, deps));
    case 'friendDecks': {
      const target = await byCode(req.friendCode, deps);
      if (target.id !== me.id && !(await areFriends(me.id, target.id, deps))) fail('フレンドの公開デッキだけを見られます', 'notFriend');
      const decks: SharedDeckView[] = (await store.sharedDecks(target.id, req.deckId))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((d) => ({ ...deckSummary(d), deck: d.deck, cards: d.cards }));
      return reply('friendDecks', { friend: { friendCode: target.friendCode, name: target.name }, decks });
    }
  }
}

async function register(name: string, deps: SocialDeps): Promise<SocialResponse> {
  const { store, now } = deps;
  // 回数の上限（ログインが無いので、誰でも何人でも作れると共用の DB を埋められる。決定事項 #124）
  const since = now - RATE_WINDOW.hour;
  if ((await store.countEvents('register', '*', since)) >= REGISTER_PER_HOUR) fail('いまは新しいプレイヤーを作れません。しばらくしてからお試しください', 'limit');
  if (deps.clientKey && (await store.countEvents('register', deps.clientKey, since)) >= REGISTER_PER_CLIENT_HOUR) {
    fail('この回線から作れるプレイヤーの数を超えました。しばらくしてからお試しください', 'limit');
  }
  // ついでに古いものを片付ける（フレンドのいない、長く来ていないプレイヤーと、古い回数の記録）
  await cleanUp(deps);
  await store.addEvent('register', '*', now);
  if (deps.clientKey) await store.addEvent('register', deps.clientKey, now);
  for (let i = 0; i < REGISTER_TRIES; i++) {
    const secret = deps.newToken();
    const p: PlayerRecord = {
      id: hex32(deps),
      secretHash: await deps.hash(secret),
      friendCode: generateFriendCode(deps.randomInt),
      inboxId: hex32(deps),
      linkToken: hex32(deps),
      name,
      createdAt: deps.now,
      lastSeen: deps.now,
      roomCode: null,
      roomStatus: null,
      roomSeen: null,
    };
    if (await deps.store.insertPlayer(p)) return reply('register', { secret, friendCode: p.friendCode, inboxId: p.inboxId, name: p.name });
  }
  return { ok: false, error: 'プレイヤーを作れませんでした。もう一度お試しください', reason: 'invalid' };
}

async function cleanUp(deps: SocialDeps): Promise<void> {
  try {
    await deps.store.removeEventsOlderThan(deps.now - EVENT_KEEP_MS);
    const n = await deps.store.removeStalePlayers(deps.now - STALE_PLAYER_MS);
    if (n > 0) deps.log?.(`removed ${n} stale players`);
  } catch (e) {
    deps.log?.(`clean up failed: ${String(e)}`);
  }
}

const declineKey = (from: string, to: string) => `${from}>${to}`;

/** 鍵からプレイヤーを引く（部屋の create・join の secret にも使う） */
export async function authenticate(secret: string, deps: Pick<SocialDeps, 'store' | 'hash'>): Promise<PlayerRecord> {
  const p = await deps.store.playerBySecretHash(await deps.hash(secret));
  if (!p) fail('プレイヤー情報が見つかりません。引き継ぎコードを確かめてください', 'auth');
  return p!;
}

async function byCode(friendCode: string, deps: SocialDeps): Promise<PlayerRecord> {
  const p = await deps.store.playerByFriendCode(friendCode);
  if (!p) fail('そのフレンドコードのプレイヤーはいません', 'notFound');
  return p!;
}

/** 自分が座っていた（いる）部屋の相手。相手待ちの部屋・相手がフレンド機能を使っていない部屋はだめ */
async function opponentIn(code: string, me: PlayerRecord, deps: SocialDeps): Promise<PlayerRecord> {
  const [room] = await deps.store.roomSummaries([code]);
  const seat = room ? room.seats.findIndex((s) => s.playerId === me.id) : -1;
  if (!room || seat < 0) fail('この部屋で対戦した記録が見つかりません', 'notFound');
  const opp = room!.seats[seat === 0 ? 1 : 0];
  if (!opp) fail('まだ相手がいません', 'invalid');
  if (!opp!.playerId) fail('相手はフレンド機能を使っていません', 'invalid');
  const [p] = await deps.store.playersByIds([opp!.playerId!]);
  if (!p) fail('相手のプレイヤー情報が見つかりません', 'notFound');
  return p!;
}

async function areFriends(a: string, b: string, deps: SocialDeps): Promise<boolean> {
  return (await deps.store.friendships(a)).some((f) => f.a === b || f.b === b);
}

async function requestTo(me: PlayerRecord, target: PlayerRecord, deps: SocialDeps): Promise<RequestResult> {
  const { store } = deps;
  if (target.id === me.id) fail('自分には申請できません', 'invalid');
  const friends = await store.friendships(me.id);
  if (friends.some((f) => f.a === target.id || f.b === target.id)) return 'already';
  const mine = await store.requests(me.id);
  if (mine.incoming.some((r) => r.from === target.id)) {
    // 相手からの申請が届いていた：申請し合ったのでフレンドになる
    await makeFriends(me, target, deps);
    await notify(target, 'friendAdded', deps);
    return 'friends';
  }
  if (mine.outgoing.some((r) => r.to === target.id)) return 'requested';
  if (friends.length >= MAX_FRIENDS) fail(`フレンドは${MAX_FRIENDS}人までです`, 'limit');
  if (mine.outgoing.length >= MAX_PENDING_REQUESTS) fail(`答えを待っている申請が多すぎます（${MAX_PENDING_REQUESTS}件まで）`, 'limit');
  // 断られたばかりの相手には、申請したことにして何もしない（同じ人から何度も知らせが来ないように。決定事項 #124）
  if ((await store.countEvents('declined', declineKey(me.id, target.id), deps.now - DECLINE_MEMORY_MS)) > 0) return 'requested';
  if ((await store.countEvents('request', me.id, deps.now - RATE_WINDOW.day)) >= REQUESTS_PER_DAY) fail(`フレンド申請は1日${REQUESTS_PER_DAY}件までです`, 'limit');
  if ((await store.friendships(target.id)).length >= MAX_FRIENDS) fail('相手のフレンドが上限に達しています', 'limit');
  // 相手の受け取った申請がいっぱいなら、いちばん古いものを消して入れる（いたずらの申請で本当の申請が届かなくならないように）
  const theirs = await store.requests(target.id);
  const overflow = theirs.incoming.length - MAX_PENDING_REQUESTS + 1;
  if (overflow > 0) {
    for (const r of [...theirs.incoming].sort((a, b) => a.at - b.at).slice(0, overflow)) await store.removeRequest(r.from, r.to);
  }
  await store.addRequest({ from: me.id, to: target.id, at: deps.now });
  await store.addEvent('request', me.id, deps.now);
  await notify(target, 'friendRequest', deps);
  return 'requested';
}

async function makeFriends(me: PlayerRecord, target: PlayerRecord, deps: SocialDeps): Promise<void> {
  if ((await deps.store.friendships(me.id)).length >= MAX_FRIENDS) fail(`フレンドは${MAX_FRIENDS}人までです`, 'limit');
  if ((await deps.store.friendships(target.id)).length >= MAX_FRIENDS) fail('相手のフレンドが上限に達しています', 'limit');
  const [a, b] = me.id < target.id ? [me.id, target.id] : [target.id, me.id];
  await deps.store.addFriendship(a, b, deps.now);
}

async function notify(p: PlayerRecord, event: InboxEvent, deps: SocialDeps): Promise<void> {
  if (!deps.notifyInbox) return;
  try {
    await deps.notifyInbox(p.inboxId, event);
  } catch (e) {
    // 通知が届かなくても、相手の画面は hello を定期的に送るので遅れて気づく
    deps.log?.(`notifyInbox failed: ${String(e)}`);
  }
}

function hex32(deps: Pick<SocialDeps, 'newToken'>): string {
  return deps.newToken().slice(0, 32);
}

const unique = <T>(xs: readonly T[]): T[] => [...new Set(xs)];

function modeOf(r: RoomSummary) {
  return r.meta?.mode === 'draft' ? ('draft' as const) : ('deck' as const);
}

function hostWaiting(r: RoomSummary, playerId: string): boolean {
  return r.status === 'waiting' && !r.meta?.closed && r.seats.length === 1 && r.seats[0]?.playerId === playerId;
}

/** 招待がまだ使えるか（答えていない・期限内・送った人の部屋がまだ相手待ち） */
function inviteLive(i: InviteRecord, rooms: readonly RoomSummary[], now: number): boolean {
  if (i.status !== 'pending' || now >= i.expiresAt) return false;
  const room = rooms.find((r) => r.code === i.roomCode);
  return !!room && hostWaiting(room, i.from);
}

export function presenceOf(p: PlayerRecord, now: number): { presence: Presence; lastSeen: number } {
  const lastSeen = Math.max(p.lastSeen, p.roomSeen ?? 0);
  const inGame = (p.roomStatus === 'drafting' || p.roomStatus === 'playing') && p.roomSeen !== null && now - p.roomSeen <= ONLINE_WITHIN_MS;
  if (inGame) return { presence: 'battle', lastSeen };
  return { presence: now - lastSeen <= ONLINE_WITHIN_MS ? 'online' : 'offline', lastSeen };
}

const PRESENCE_ORDER: Record<Presence, number> = { battle: 0, online: 1, offline: 2 };

function deckSummary(d: SharedDeckSummaryRecord): SharedDeckSummary {
  return { deckId: d.deckId, name: d.name, count: d.count, updatedAt: d.updatedAt };
}

/** 自分のまわりの様子（hello とフレンドまわりを変える操作の返事） */
async function snapshot(me: PlayerRecord, deps: SocialDeps): Promise<SocialSnapshot> {
  const { store, now } = deps;
  const [friendships, requests, invites] = await Promise.all([store.friendships(me.id), store.requests(me.id), store.invites(me.id, now - INVITE_TTL_MS)]);
  const friendIds = friendships.map((f) => (f.a === me.id ? f.b : f.a));
  const others = unique([
    ...friendIds,
    ...requests.incoming.map((r) => r.from),
    ...requests.outgoing.map((r) => r.to),
    ...invites.received.map((i) => i.from),
    ...invites.sent.map((i) => i.to),
  ]);
  const roomCodes = unique([...invites.received, ...invites.sent].filter((i) => i.status === 'pending').map((i) => i.roomCode));
  const [players, records, decks, rooms] = await Promise.all([
    others.length ? store.playersByIds(others) : Promise.resolve([]),
    friendIds.length ? store.records(me.id, friendIds) : Promise.resolve([]),
    store.sharedDeckSummaries([me.id, ...friendIds]),
    roomCodes.length ? store.roomSummaries(roomCodes) : Promise.resolve([]),
  ]);
  const byId = new Map(players.map((p) => [p.id, p]));
  const who = (id: string) => {
    const p = byId.get(id);
    return p ? { friendCode: p.friendCode, name: p.name } : null;
  };

  const friends: FriendView[] = [];
  for (const f of friendships) {
    const id = f.a === me.id ? f.b : f.a;
    const p = byId.get(id);
    if (!p) continue;
    const rec = records.find((r) => r.opponentId === id);
    friends.push({
      friendCode: p.friendCode,
      name: p.name,
      ...presenceOf(p, now),
      since: f.since,
      record: { win: rec?.win ?? 0, loss: rec?.loss ?? 0, draw: rec?.draw ?? 0 },
      decks: decks.filter((d) => d.ownerId === id).length,
    });
  }
  friends.sort((a, b) => PRESENCE_ORDER[a.presence] - PRESENCE_ORDER[b.presence] || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) || (a.friendCode < b.friendCode ? -1 : 1));

  const requestViews = (list: { id: string; at: number }[]) =>
    list
      .sort((a, b) => b.at - a.at)
      .flatMap(({ id, at }) => {
        const w = who(id);
        return w ? [{ ...w, at }] : [];
      });
  const friendSet = new Set(friendIds);
  const receivedViews: InviteView[] = invites.received
    .filter((i) => friendSet.has(i.from) && inviteLive(i, rooms, now))
    .sort((a, b) => b.createdAt - a.createdAt)
    .flatMap((i) => {
      const from = who(i.from);
      const room = rooms.find((r) => r.code === i.roomCode)!;
      const rules = normalizeRules(room.rules ?? room.meta?.rules);
      return from ? [{ id: i.id, from, roomCode: i.roomCode, mode: i.mode, ...(rules ? { rules } : {}), at: i.createdAt, expiresAt: i.expiresAt }] : [];
    });
  const sentViews: SentInviteView[] = invites.sent
    .sort((a, b) => b.createdAt - a.createdAt)
    .flatMap((i) => {
      const to = who(i.to);
      const status = i.status === 'pending' && !inviteLive(i, rooms, now) ? 'expired' : i.status;
      return to ? [{ id: i.id, to, roomCode: i.roomCode, mode: i.mode, status, at: i.createdAt, expiresAt: i.expiresAt }] : [];
    });

  return {
    me: { name: me.name, friendCode: me.friendCode, inboxId: me.inboxId },
    friends,
    incoming: requestViews(requests.incoming.map((r) => ({ id: r.from, at: r.at }))),
    outgoing: requestViews(requests.outgoing.map((r) => ({ id: r.to, at: r.at }))),
    invites: receivedViews,
    sentInvites: sentViews,
    sharedDecks: decks
      .filter((d) => d.ownerId === me.id)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(deckSummary),
    serverNow: now,
  };
}
