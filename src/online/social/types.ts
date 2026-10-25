/**
 * フレンド機能（決定事項 #121）の保存する形・上限・保存場所の約束（SocialStore）。
 * ログインもパスワードも無い：端末で自動に作る「プレイヤー」（秘密の鍵 secret は端末の保存場所にだけあり、
 * サーバーはそのハッシュだけを持つ）。公開してよい識別子はフレンドコードだけ。内部の ID・inboxId・招待リンクの鍵は他人に返さない。
 */
import type { CardDef, Deck } from '../../engine/types.ts';
import type { MatchRules } from '../../engine/fields.ts';
import type { RoomMode, RoomStatus } from '../protocol.ts';
import type { RoomMeta, Seat } from '../room.ts';

/** フレンドの数の上限 */
export const MAX_FRIENDS = 100;
/** 送った申請・受け取った申請の、それぞれの上限 */
export const MAX_PENDING_REQUESTS = 50;
/** 1人が公開できるデッキの数 */
export const MAX_SHARED_DECKS = 20;
/** 1人が同時に出せる（まだ答えのない）招待の数 */
export const MAX_PENDING_INVITES = 20;
/** 招待の有効期限（部屋が待機中でなくなったら、その前でも無効） */
export const INVITE_TTL_MS = 10 * 60 * 1000;
/** これより古い招待は消す */
export const INVITE_KEEP_MS = 24 * 60 * 60 * 1000;
/** 最後の通信からこの時間までは「オンライン」 */
export const ONLINE_WITHIN_MS = 60_000;
/** 部屋の送信で「見かけた」を記録する間隔（毎回 DB に書かないように。状態が変わったときは間隔によらず書く） */
export const PRESENCE_STEP_MS = 20_000;
/** 公開の部屋の一覧：作成者がこの時間内に通信している部屋だけ */
export const LISTED_FRESH_MS = 30_000;
/** 公開の部屋の一覧の件数の上限 */
export const MAX_LISTED_ROOMS = 30;
/** フレンドコードの長さ（部屋コードと同じ紛らわしくない文字） */
export const FRIEND_CODE_LENGTH = 8;
/** 公開デッキの名前の長さの上限（一覧に出す名前） */
export const SHARED_DECK_NAME_MAX = 40;

/** サーバーに保存するプレイヤー */
export interface PlayerRecord {
  /** 内部の ID（16進32文字。他人には返さない） */
  id: string;
  /** 秘密の鍵のハッシュ（鍵そのものは保存しない） */
  secretHash: string;
  /** 公開してよい識別子（8文字） */
  friendCode: string;
  /** 自分あての通知のチャンネル名に使う乱数（16進32文字。本人にだけ返す） */
  inboxId: string;
  /** 招待リンクの鍵（16進32文字。本人にだけ返す。作り直すと前のリンクは使えない） */
  linkToken: string;
  name: string;
  createdAt: number;
  /** 最後に通信した時刻（hello・部屋の送信） */
  lastSeen: number;
  /** 最後に部屋の送信をした部屋と、そのときの部屋の状態・時刻（「対戦中」の判定） */
  roomCode: string | null;
  roomStatus: RoomStatus | null;
  roomSeen: number | null;
}

export interface FriendshipRecord {
  /** 2人の ID（a < b） */
  a: string;
  b: string;
  since: number;
}

export interface FriendRequestRecord {
  from: string;
  to: string;
  at: number;
}

export type InviteStatus = 'pending' | 'accepted' | 'declined';

export interface InviteRecord {
  /** 16進32文字 */
  id: string;
  from: string;
  to: string;
  roomCode: string;
  mode: RoomMode;
  createdAt: number;
  expiresAt: number;
  status: InviteStatus;
}

/** 決着した1戦の記録（両方の席がプレイヤーに結び付いているときだけ） */
export interface MatchRecord {
  /** 部屋コード・その部屋の何戦目か・決着の時刻から作る（同じ記録を2回入れても1つ） */
  id: string;
  roomCode: string;
  game: number;
  /** 席0・席1のプレイヤーの ID */
  players: [string, string];
  /** 勝った席（引き分けは null） */
  winner: 0 | 1 | null;
  mode: RoomMode;
  at: number;
}

export interface SharedDeckRecord {
  ownerId: string;
  deckId: string;
  name: string;
  /** デッキの枚数 */
  count: number;
  deck: Deck;
  cards: CardDef[];
  updatedAt: number;
}

export type SharedDeckSummaryRecord = Omit<SharedDeckRecord, 'deck' | 'cards'>;

/** 1人のプレイヤーから見た、ある相手との成績 */
export interface RecordCount {
  opponentId: string;
  win: number;
  loss: number;
  draw: number;
}

/**
 * 部屋の要約（読むだけ。ドラフトの山・両者のデッキ・対戦の状態は含めない）。
 * rules は入室前の自分のデッキの部屋の hostDeck.rules（ほかは meta.rules）
 */
export interface RoomSummary {
  code: string;
  status: RoomStatus;
  seats: Seat[];
  meta: Pick<RoomMeta, 'mode' | 'rules' | 'listed'> | null;
  rules?: MatchRules | null;
  updatedAt: number;
}

/** 部屋の送信のついでに記録する「見かけた」。seen は本人が通信した時刻（相手の決着で状態だけ変えるときは無い） */
export interface PresenceUpdate {
  playerId: string;
  seen?: number;
  room?: { code: string; status: RoomStatus; at: number };
}

/**
 * フレンド機能の保存場所（Edge Function は SQL、手元のサーバーとテストはメモリ）。
 * どのメソッドも1つの文で済む程度の読み書きにする（上限の確かめと書き込みの間の競合は、少人数なので許す）
 */
export interface SocialStore {
  /** 新しいプレイヤー。ID・ハッシュ・フレンドコード・inboxId のどれかが重なれば false */
  insertPlayer(p: PlayerRecord): Promise<boolean>;
  playerBySecretHash(secretHash: string): Promise<PlayerRecord | null>;
  playerByFriendCode(friendCode: string): Promise<PlayerRecord | null>;
  playersByIds(ids: readonly string[]): Promise<PlayerRecord[]>;
  /** 名前・鍵のハッシュ・リンクの鍵・最後の通信を変える */
  updatePlayer(id: string, patch: Partial<Pick<PlayerRecord, 'name' | 'secretHash' | 'linkToken' | 'lastSeen'>>): Promise<void>;
  /** 部屋の送信の「見かけた」をまとめて書く（seen は今より新しいときだけ進める） */
  updatePresence(updates: readonly PresenceUpdate[]): Promise<void>;

  /** その人のフレンド関係（a か b がその人） */
  friendships(id: string): Promise<FriendshipRecord[]>;
  /** フレンドにする（もうなら何もしない）。2人の間の申請はどちら向きも消す */
  addFriendship(a: string, b: string, at: number): Promise<void>;
  /** フレンドをやめる。2人の間の申請もどちら向きも消す */
  removeFriendship(a: string, b: string): Promise<void>;

  /** その人が送った申請と受け取った申請 */
  requests(id: string): Promise<{ incoming: FriendRequestRecord[]; outgoing: FriendRequestRecord[] }>;
  /** 申請を入れる（もうあれば何もしない） */
  addRequest(r: FriendRequestRecord): Promise<void>;
  removeRequest(from: string, to: string): Promise<void>;

  insertInvite(inv: InviteRecord): Promise<void>;
  invite(id: string): Promise<InviteRecord | null>;
  updateInvite(id: string, patch: Partial<Pick<InviteRecord, 'status' | 'expiresAt' | 'createdAt'>>): Promise<void>;
  /** その人が送った・受け取った招待のうち、since 以降に作られたもの */
  invites(id: string, since: number): Promise<{ received: InviteRecord[]; sent: InviteRecord[] }>;
  removeInvitesOlderThan(time: number): Promise<void>;

  /** 決着の記録を入れる（同じ id はもうあれば何もしない） */
  insertMatch(m: MatchRecord): Promise<void>;
  /** me と others それぞれとの成績（記録の無い相手は入れなくてよい） */
  records(me: string, others: readonly string[]): Promise<RecordCount[]>;

  /** 公開デッキを入れる・置き換える（持ち主と deckId で1つ） */
  putSharedDeck(d: SharedDeckRecord): Promise<void>;
  removeSharedDeck(ownerId: string, deckId: string): Promise<void>;
  /** 持ち主たちの公開デッキの要約（中身なし） */
  sharedDeckSummaries(ownerIds: readonly string[]): Promise<SharedDeckSummaryRecord[]>;
  /** 1人の公開デッキ（中身あり。deckId があればそれだけ） */
  sharedDecks(ownerId: string, deckId?: string): Promise<SharedDeckRecord[]>;

  /** 公開の部屋：待機中・作成者の最後の通信が minSeen 以降、新しい順に limit 件 */
  listedRooms(minSeen: number, limit: number): Promise<RoomSummary[]>;
  roomSummaries(codes: readonly string[]): Promise<RoomSummary[]>;
}
