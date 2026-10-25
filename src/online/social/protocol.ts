/**
 * フレンド機能・公開の部屋の送受信の形と、届いたデータの検証（決定事項 #121。説明は docs/ONLINE_SOCIAL.md）。
 * 部屋の送受信（../protocol.ts）と同じ1つの受付に送る。op で見分ける。
 * secret はプレイヤーの秘密の鍵（register で1回だけ返す16進64文字。引き継ぎコードとしてそのまま別の端末に移せる）
 */
import type { CardDef, Deck } from '../../engine/types.ts';
import type { MatchRules } from '../../engine/fields.ts';
import type { LeaderId } from '../../engine/leaders.ts';
import { CODE_ALPHABET, normalizeCode, normalizeName } from '../codes.ts';
import type { RoomMode } from '../protocol.ts';
import { FRIEND_CODE_LENGTH } from './types.ts';

export type SocialRequest =
  /** プレイヤーを作る（ログインなし。返事の secret を端末に保存する） */
  | { op: 'register'; name?: string }
  /** 生存の合図と、自分のまわりの様子の取得（20〜30秒おき・画面を開いたとき・通知が来たとき）。name を送れば名前を変える */
  | { op: 'hello'; secret: string; name?: string }
  /** 秘密の鍵を作り直す（引き継ぎコードが漏れたとき。前の鍵は使えなくなる） */
  | { op: 'rotateSecret'; secret: string }
  /** 公開の部屋の一覧（「募集中の部屋」。鍵は要らない） */
  | { op: 'list' }
  /** フレンドコードで申請する（相手からの申請が届いていれば、すぐフレンドになる） */
  | { op: 'friendRequest'; secret: string; friendCode: string }
  /** 対戦した（している）部屋の相手に申請する（code は部屋コード） */
  | { op: 'friendRequestRoom'; secret: string; code: string }
  /** 届いた申請に答える */
  | { op: 'friendRespond'; secret: string; friendCode: string; accept: boolean }
  /** フレンドをやめる・送った申請を取り消す */
  | { op: 'friendRemove'; secret: string; friendCode: string }
  /** 招待リンクの鍵（rotate: true で作り直し、前のリンクを無効にする） */
  | { op: 'inviteLink'; secret: string; rotate?: boolean }
  /** 招待リンクを開いて確かめたら、すぐフレンドになる（リンクの持ち主は共有した時点で同意している） */
  | { op: 'friendByLink'; secret: string; friendCode: string; token: string }
  /** フレンドを自分の部屋（席0・相手待ち）に招待する */
  | { op: 'invite'; secret: string; friendCode: string; roomCode: string }
  /** 届いた招待に答える。accept なら部屋コードと形式が返るので、画面はそのまま join する */
  | { op: 'inviteRespond'; secret: string; inviteId: string; accept: boolean }
  /** デッキを「フレンドに公開」にする（同じ deck.id は置き換える） */
  | { op: 'shareDeck'; secret: string; deck: Deck; cards: CardDef[] }
  | { op: 'unshareDeck'; secret: string; deckId: string }
  /** フレンド（か自分）の公開デッキ。deckId があればそれだけ */
  | { op: 'friendDecks'; secret: string; friendCode: string; deckId?: string };

export type SocialOp = SocialRequest['op'];

export const SOCIAL_OPS: readonly SocialOp[] = [
  'register',
  'hello',
  'rotateSecret',
  'list',
  'friendRequest',
  'friendRequestRoom',
  'friendRespond',
  'friendRemove',
  'inviteLink',
  'friendByLink',
  'invite',
  'inviteRespond',
  'shareDeck',
  'unshareDeck',
  'friendDecks',
];

export function isSocialOp(op: unknown): op is SocialOp {
  return (SOCIAL_OPS as readonly unknown[]).includes(op);
}

export type Presence = 'online' | 'battle' | 'offline';

export interface MeView {
  name: string;
  friendCode: string;
  /** 自分あての通知のチャンネル cardgame:inbox:<inboxId> */
  inboxId: string;
}

export interface FriendView {
  friendCode: string;
  name: string;
  /** online：最近通信あり／battle：ドラフト中か対戦中／offline */
  presence: Presence;
  /** 最後に見かけた時刻（エポックミリ秒） */
  lastSeen: number | null;
  /** フレンドになった時刻 */
  since: number;
  /** 自分から見たこの人との成績（フレンドになる前の対戦も数える） */
  record: { win: number; loss: number; draw: number };
  /** この人が公開しているデッキの数 */
  decks: number;
}

export interface RequestView {
  friendCode: string;
  name: string;
  at: number;
}

export interface InviteView {
  id: string;
  from: { friendCode: string; name: string };
  roomCode: string;
  mode: RoomMode;
  rules?: MatchRules;
  at: number;
  expiresAt: number;
}

export interface SentInviteView {
  id: string;
  to: { friendCode: string; name: string };
  roomCode: string;
  mode: RoomMode;
  /** expired：期限切れか、部屋がもう相手待ちでない */
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  at: number;
  expiresAt: number;
}

export interface SharedDeckSummary {
  deckId: string;
  name: string;
  /** 枚数 */
  count: number;
  updatedAt: number;
}

export interface SharedDeckView extends SharedDeckSummary {
  deck: Deck;
  cards: CardDef[];
}

/** hello と、フレンドまわりを変える操作の返事 */
export interface SocialSnapshot {
  me: MeView;
  /** 対戦中 → オンライン → オフライン、同じなら名前の順 */
  friends: FriendView[];
  /** 届いた申請・送った申請（新しい順） */
  incoming: RequestView[];
  outgoing: RequestView[];
  /** 届いている招待（まだ有効なものだけ。新しい順） */
  invites: InviteView[];
  /** 送った招待（作ってから INVITE_TTL_MS の間。新しい順） */
  sentInvites: SentInviteView[];
  /** 自分が公開しているデッキ */
  sharedDecks: SharedDeckSummary[];
  serverNow: number;
}

/** 公開の部屋（「募集中の部屋」）の1件 */
export interface ListedRoomView {
  code: string;
  hostName: string;
  mode: RoomMode;
  rules?: MatchRules;
  leader: LeaderId;
  /** 部屋ができた時刻（相手待ちの間は変わらない） */
  since: number;
  /** 作成者が最後に通信した時刻 */
  hostSeen: number;
}

/** friendRequest・friendRequestRoom の結果：requested＝申請した／friends＝相手の申請があったのでフレンドになった／already＝もうフレンド */
export type RequestResult = 'requested' | 'friends' | 'already';

/** op ごとの返事の中身（どれも ok: true と op が付く） */
export interface SocialReplies {
  register: { secret: string; friendCode: string; inboxId: string; name: string };
  hello: SocialSnapshot;
  rotateSecret: { secret: string };
  list: { rooms: ListedRoomView[]; serverNow: number };
  friendRequest: SocialSnapshot & { result: RequestResult };
  friendRequestRoom: SocialSnapshot & { result: RequestResult };
  friendRespond: SocialSnapshot;
  friendRemove: SocialSnapshot;
  inviteLink: { friendCode: string; token: string };
  friendByLink: SocialSnapshot & { friend: { friendCode: string; name: string } };
  invite: SocialSnapshot & { inviteId: string };
  inviteRespond: SocialSnapshot & { room?: { code: string; mode: RoomMode } };
  shareDeck: SocialSnapshot;
  unshareDeck: SocialSnapshot;
  friendDecks: { friend: { friendCode: string; name: string }; decks: SharedDeckView[] };
}

/**
 * auth：鍵が違う（端末のプレイヤー情報が無効。勝手に作り直さず、引き継ぎコードの入力を勧める）／notFound：フレンドコード・招待・部屋が無い／
 * notFriend：フレンドではない／limit：上限／expired：招待の期限切れ／invalid：形が違う・できない操作／unsupported：このサーバーはフレンド機能を持たない
 */
export type SocialErrorReason = 'auth' | 'notFound' | 'notFriend' | 'limit' | 'expired' | 'invalid' | 'unsupported';

export type SocialOk<K extends SocialOp> = { ok: true; op: K } & SocialReplies[K];
export type SocialError = { ok: false; error: string; reason?: SocialErrorReason };
export type SocialResponse = { [K in SocialOp]: SocialOk<K> }[SocialOp] | SocialError;

/** サーバーが受け取った形（デッキとカードは room.ts の checkDeck で調べる） */
export type ParsedSocial =
  | { op: 'register'; name: string }
  | { op: 'hello'; secret: string; name?: string }
  | { op: 'rotateSecret'; secret: string }
  | { op: 'list' }
  | { op: 'friendRequest'; secret: string; friendCode: string }
  | { op: 'friendRequestRoom'; secret: string; code: string }
  | { op: 'friendRespond'; secret: string; friendCode: string; accept: boolean }
  | { op: 'friendRemove'; secret: string; friendCode: string }
  | { op: 'inviteLink'; secret: string; rotate: boolean }
  | { op: 'friendByLink'; secret: string; friendCode: string; token: string }
  | { op: 'invite'; secret: string; friendCode: string; roomCode: string }
  | { op: 'inviteRespond'; secret: string; inviteId: string; accept: boolean }
  | { op: 'shareDeck'; secret: string; deck: unknown; cards: unknown }
  | { op: 'unshareDeck'; secret: string; deckId: string }
  | { op: 'friendDecks'; secret: string; friendCode: string; deckId?: string };

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
export const isSecret = (x: unknown): x is string => typeof x === 'string' && /^[0-9a-f]{64}$/.test(x);
const isHex32 = (x: unknown): x is string => typeof x === 'string' && /^[0-9a-f]{32}$/.test(x);
const isDeckId = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 100;

/** フレンドコードを正規化（大文字に、空白やハイフンを除く）。形が違えば null */
export function normalizeFriendCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const s = input.toUpperCase().replace(/[\s-]/g, '');
  if (s.length !== FRIEND_CODE_LENGTH) return null;
  return [...s].every((ch) => CODE_ALPHABET.includes(ch)) ? s : null;
}

export function generateFriendCode(randomInt: (n: number) => number): string {
  let s = '';
  for (let i = 0; i < FRIEND_CODE_LENGTH; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

export function parseSocialRequest(x: unknown): Parsed<ParsedSocial> {
  const bad = (error: string): Parsed<ParsedSocial> => ({ ok: false, error });
  if (!isObj(x) || !isSocialOp(x.op)) return bad('知らない操作です');
  if (x.op === 'register') return { ok: true, value: { op: 'register', name: normalizeName(x.name) } };
  if (x.op === 'list') return { ok: true, value: { op: 'list' } };
  if (!isSecret(x.secret)) return bad('プレイヤーの鍵が正しくありません');
  const secret = x.secret;
  const friendCode = () => normalizeFriendCode(x.friendCode);
  switch (x.op) {
    case 'hello':
      if (x.name !== undefined && typeof x.name !== 'string') return bad('名前が正しくありません');
      return { ok: true, value: { op: 'hello', secret, ...(typeof x.name === 'string' ? { name: normalizeName(x.name) } : {}) } };
    case 'rotateSecret':
      return { ok: true, value: { op: 'rotateSecret', secret } };
    case 'friendRequest':
    case 'friendRemove': {
      const fc = friendCode();
      if (!fc) return bad('フレンドコードが正しくありません');
      return { ok: true, value: { op: x.op, secret, friendCode: fc } };
    }
    case 'friendRequestRoom': {
      const code = normalizeCode(x.code);
      if (!code) return bad('部屋コードが正しくありません');
      return { ok: true, value: { op: 'friendRequestRoom', secret, code } };
    }
    case 'friendRespond': {
      const fc = friendCode();
      if (!fc) return bad('フレンドコードが正しくありません');
      if (typeof x.accept !== 'boolean') return bad('答えが正しくありません');
      return { ok: true, value: { op: 'friendRespond', secret, friendCode: fc, accept: x.accept } };
    }
    case 'inviteLink':
      if (x.rotate !== undefined && typeof x.rotate !== 'boolean') return bad('作り直しの指定が正しくありません');
      return { ok: true, value: { op: 'inviteLink', secret, rotate: x.rotate === true } };
    case 'friendByLink': {
      const fc = friendCode();
      if (!fc) return bad('フレンドコードが正しくありません');
      if (!isHex32(x.token)) return bad('招待リンクが正しくありません');
      return { ok: true, value: { op: 'friendByLink', secret, friendCode: fc, token: x.token } };
    }
    case 'invite': {
      const fc = friendCode();
      if (!fc) return bad('フレンドコードが正しくありません');
      const roomCode = normalizeCode(x.roomCode);
      if (!roomCode) return bad('部屋コードが正しくありません');
      return { ok: true, value: { op: 'invite', secret, friendCode: fc, roomCode } };
    }
    case 'inviteRespond':
      if (!isHex32(x.inviteId)) return bad('招待の指定が正しくありません');
      if (typeof x.accept !== 'boolean') return bad('答えが正しくありません');
      return { ok: true, value: { op: 'inviteRespond', secret, inviteId: x.inviteId, accept: x.accept } };
    case 'shareDeck':
      return { ok: true, value: { op: 'shareDeck', secret, deck: x.deck, cards: x.cards } };
    case 'unshareDeck':
      if (!isDeckId(x.deckId)) return bad('デッキの指定が正しくありません');
      return { ok: true, value: { op: 'unshareDeck', secret, deckId: x.deckId } };
    case 'friendDecks': {
      const fc = friendCode();
      if (!fc) return bad('フレンドコードが正しくありません');
      if (x.deckId !== undefined && !isDeckId(x.deckId)) return bad('デッキの指定が正しくありません');
      return { ok: true, value: { op: 'friendDecks', secret, friendCode: fc, ...(x.deckId !== undefined ? { deckId: x.deckId } : {}) } };
    }
    default:
      return bad('知らない操作です');
  }
}
