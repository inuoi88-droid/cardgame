/** オンライン対戦の公開窓口。Edge Function 用の1ファイル（npm run build:server）もここから作る */
export { CODE_LENGTH, NAME_MAX_LENGTH, DEFAULT_NAME, normalizeCode, normalizeName } from './codes.ts';
export { MAX_BODY_CHARS, parseAction, parseRequest } from './protocol.ts';
export { ROOM_MODES, DRAFT_FEATURE } from './protocol.ts';
export type { ErrorReason, OnlineRequest, OnlineResponse, RoomDraftView, RoomMode, RoomStatus, RoomView } from './protocol.ts';
export { CONNECTED_WITHIN_MS, ROOM_TTL_MS } from './room.ts';
export type { RoomDeck, RoomMeta, RoomRecord, Seat } from './room.ts';
export { ONLINE_DRAFT_CARDS } from './draftCards.ts';
export { handleBody } from './http.ts';
export type { HttpDeps, HttpResult, RoomStore } from './http.ts';
// フレンド機能・公開の部屋（決定事項 #121）
export { MemoryStore } from './social/memoryStore.ts';
export { SOCIAL_OPS, isSocialOp, normalizeFriendCode } from './social/protocol.ts';
export type {
  FriendView,
  InviteView,
  ListedRoomView,
  MeView,
  Presence,
  RequestResult,
  RequestView,
  SentInviteView,
  SharedDeckSummary,
  SharedDeckView,
  SocialErrorReason,
  SocialOk,
  SocialOp,
  SocialReplies,
  SocialRequest,
  SocialResponse,
  SocialSnapshot,
} from './social/protocol.ts';
export type { InboxEvent } from './social/handlers.ts';
export * from './social/types.ts';
