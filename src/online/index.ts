/** オンライン対戦の公開窓口。Edge Function 用の1ファイル（npm run build:server）もここから作る */
export { CODE_LENGTH, NAME_MAX_LENGTH, DEFAULT_NAME, normalizeCode, normalizeName } from './codes.ts';
export { MAX_BODY_CHARS, parseAction, parseRequest } from './protocol.ts';
export type { ErrorReason, OnlineRequest, OnlineResponse, RoomStatus, RoomView } from './protocol.ts';
export { CONNECTED_WITHIN_MS, ROOM_TTL_MS } from './room.ts';
export type { RoomRecord, Seat } from './room.ts';
export { handleBody } from './http.ts';
export type { HttpDeps, HttpResult, RoomStore } from './http.ts';
