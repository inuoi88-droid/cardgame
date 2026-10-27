/**
 * みんなの広場・運営・公式カードの上書き（決定事項 #141）の送受信の形と、届いたデータの検証。
 * 部屋・フレンド機能・報告と同じ1つの受付に送り、op で見分ける。secret はフレンド機能のプレイヤーの鍵（16進64文字）。
 * 見るだけ（plazaList・plazaGet・officialList）は鍵が要らない。公開・取り下げ・公式カードの編集は運営だけ。
 */
import type { CardDef, Deck } from '../../engine/types.ts';
import { isSecret } from '../social/protocol.ts';
import type { PlazaCursor, PublicKind } from './types.ts';

export type PlazaRequest =
  /** 運営になる（パスワード） */
  | { op: 'staffLogin'; secret: string; password: string }
  /** 運営をやめる（自分だけ） */
  | { op: 'staffLogout'; secret: string }
  /** 自分が運営か・自分が公開しているもの */
  | { op: 'plazaMe'; secret: string }
  /** 広場の一覧（新しい順。誰でも） */
  | { op: 'plazaList'; kind?: PublicKind; before?: PlazaCursor }
  /** 広場の1つ（中身あり。誰でも） */
  | { op: 'plazaGet'; id: string }
  /** 公開する（運営だけ。同じカード・デッキは置き換わる） */
  | { op: 'plazaPublish'; secret: string; kind: 'card'; card: unknown }
  | { op: 'plazaPublish'; secret: string; kind: 'deck'; deck: unknown; cards: unknown }
  /** 取り下げる（自分のもの。運営は誰のものでも） */
  | { op: 'plazaRemove'; secret: string; id: string }
  /** 公式カードの上書き（誰でも。since が今の版と同じなら中身を省く） */
  | { op: 'officialList'; since?: number }
  /** 公式カードを書き換える（運営だけ。保存した時点で全員に効く） */
  | { op: 'officialSave'; secret: string; card: unknown }
  /** 公式カードを元に戻す（運営だけ） */
  | { op: 'officialReset'; secret: string; cardId: string }
  /** 公式カードの書き換えの履歴（運営だけ） */
  | { op: 'officialHistory'; secret: string; cardId: string };

export type PlazaOp = PlazaRequest['op'];
export const PLAZA_OPS: readonly PlazaOp[] = [
  'staffLogin',
  'staffLogout',
  'plazaMe',
  'plazaList',
  'plazaGet',
  'plazaPublish',
  'plazaRemove',
  'officialList',
  'officialSave',
  'officialReset',
  'officialHistory',
];

export function isPlazaOp(op: unknown): op is PlazaOp {
  return (PLAZA_OPS as readonly unknown[]).includes(op);
}

export type PlazaErrorReason = 'auth' | 'denied' | 'staff' | 'notFound' | 'limit' | 'invalid' | 'unsupported';
export type PlazaError = { ok: false; error: string; reason?: PlazaErrorReason };

/** 公開した人（フレンドコードと名前だけ。内部の ID は返さない） */
export interface PlazaOwner {
  name: string;
  friendCode: string;
}

/** 一覧の1行 */
export interface PublicItemView {
  id: string;
  kind: PublicKind;
  name: string;
  count: number;
  owner: PlazaOwner;
  createdAt: number;
  updatedAt: number;
  /** カードならそのカード、デッキなら表紙 */
  cover: CardDef | null;
}

/** 中身あり */
export interface PublicItemFull extends PublicItemView {
  card?: CardDef;
  deck?: Deck;
  cards?: CardDef[];
}

export interface OfficialHistoryView {
  version: number;
  card: CardDef | null;
  /** 書き換えた運営の名前 */
  by: string;
  at: number;
}

export interface PlazaReplies {
  staffLogin: { staff: true };
  staffLogout: { staff: false };
  plazaMe: { staff: boolean; friendCode: string; mine: PublicItemView[] };
  plazaList: { items: PublicItemView[]; next: PlazaCursor | null };
  plazaGet: { item: PublicItemFull };
  plazaPublish: { item: PublicItemView };
  plazaRemove: { removed: string };
  officialList: { version: number; cards?: CardDef[] };
  officialSave: { version: number; card: CardDef };
  officialReset: { version: number };
  officialHistory: { history: OfficialHistoryView[] };
}

export type PlazaOk<K extends PlazaOp> = { ok: true; op: K } & PlazaReplies[K];
export type PlazaResponse = { [K in PlazaOp]: PlazaOk<K> }[PlazaOp] | PlazaError;

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
const bad = (error: string): Parsed<never> => ({ ok: false, error });

const ITEM_ID_RE = /^[0-9a-f]{16}$/;
/** 公式カードの ID（official-<slug>） */
const OFFICIAL_ID_RE = /^official-[a-z0-9-]{1,60}$/;
/** パスワードの長さの上限（長い文字列でハッシュを重くさせない） */
export const PASSWORD_MAX = 64;

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

function cursorOf(x: unknown): PlazaCursor | undefined | null {
  if (x === undefined) return undefined;
  if (!isObj(x) || typeof x.at !== 'number' || !Number.isFinite(x.at) || typeof x.id !== 'string' || !ITEM_ID_RE.test(x.id)) return null;
  return { at: x.at, id: x.id };
}

export function parsePlazaRequest(x: unknown): Parsed<PlazaRequest> {
  if (!isObj(x) || !isPlazaOp(x.op)) return bad('送信の形式が正しくありません');
  const op = x.op;
  if (op === 'plazaList') {
    if (x.kind !== undefined && x.kind !== 'card' && x.kind !== 'deck') return bad('種類が正しくありません');
    const before = cursorOf(x.before);
    if (before === null) return bad('続きの位置が正しくありません');
    return { ok: true, value: { op, ...(x.kind ? { kind: x.kind } : {}), ...(before ? { before } : {}) } };
  }
  if (op === 'plazaGet') {
    if (typeof x.id !== 'string' || !ITEM_ID_RE.test(x.id)) return bad('公開の ID が正しくありません');
    return { ok: true, value: { op, id: x.id } };
  }
  if (op === 'officialList') {
    if (x.since !== undefined && (typeof x.since !== 'number' || !Number.isInteger(x.since) || x.since < 0)) return bad('版が正しくありません');
    return { ok: true, value: { op, ...(typeof x.since === 'number' ? { since: x.since } : {}) } };
  }
  if (!isSecret(x.secret)) return bad('プレイヤーの鍵が正しくありません');
  const secret = x.secret;
  switch (op) {
    case 'staffLogin':
      if (typeof x.password !== 'string' || x.password.length === 0 || x.password.length > PASSWORD_MAX) return bad('パスワードを入れてください');
      return { ok: true, value: { op, secret, password: x.password } };
    case 'staffLogout':
    case 'plazaMe':
      return { ok: true, value: { op, secret } };
    case 'plazaPublish':
      if (x.kind === 'card') return { ok: true, value: { op, secret, kind: 'card', card: x.card } };
      if (x.kind === 'deck') return { ok: true, value: { op, secret, kind: 'deck', deck: x.deck, cards: x.cards } };
      return bad('種類が正しくありません');
    case 'plazaRemove':
      if (typeof x.id !== 'string' || !ITEM_ID_RE.test(x.id)) return bad('公開の ID が正しくありません');
      return { ok: true, value: { op, secret, id: x.id } };
    case 'officialSave':
      return { ok: true, value: { op, secret, card: x.card } };
    case 'officialReset':
    case 'officialHistory':
      if (typeof x.cardId !== 'string' || !OFFICIAL_ID_RE.test(x.cardId)) return bad('公式カードの ID が正しくありません');
      return { ok: true, value: { op, secret, cardId: x.cardId } };
  }
  return bad('送信の形式が正しくありません');
}
