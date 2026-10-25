/**
 * フレンド機能の画面の純粋な補助（決定事項 #123。React・DOM・localStorage を使わない。tests/social-ui.test.ts）。
 * - 端末のプレイヤー情報（鍵・フレンドコード・通知のチャンネル）の読み分け
 * - 招待リンクの形（#/friend/<フレンドコード>/<鍵>/<名前>）
 * - 表示の言葉（在室・成績・経過時間・待ち時間）と、申請できる相手の選び方
 */
import type { CardDef, Deck } from '../../engine/index.ts';
import { DEFAULT_NAME } from '../../online/codes.ts';
import type { FriendView, Presence, SocialSnapshot } from '../../online/social/protocol.ts';

/** 端末に保存するプレイヤー情報（secret は引き継ぎコードそのもの） */
export interface PlayerIdentity {
  v: 1;
  secret: string;
  friendCode: string;
  inboxId: string;
  name: string;
  /**
   * 作り直し中の新しい鍵（決定事項 #124）。送る前に控え、返事が届かずに前の鍵が断られたら、これで入り直す
   */
  pending?: string;
}

const BASE_KEY = 'cardgame.v1.player';

/** 保存のキー。手元のサーバー（?server=）のプレイヤーは本番と別に持つ（本番の鍵を手元のサーバーで上書きしない） */
export function identityKey(localServer: string | null): string {
  return localServer ? `${BASE_KEY}@${localServer}` : BASE_KEY;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

export function parseIdentity(x: unknown): PlayerIdentity | null {
  if (!isObj(x) || x.v !== 1) return null;
  const secret = normalizeSecret(x.secret);
  if (!secret || typeof x.friendCode !== 'string' || typeof x.inboxId !== 'string') return null;
  const pending = normalizeSecret(x.pending);
  return { v: 1, secret, friendCode: x.friendCode, inboxId: x.inboxId, name: typeof x.name === 'string' ? x.name : '', ...(pending ? { pending } : {}) };
}

/** 名前をまだ決めていない（空か、自動の「プレイヤー」のまま）。最初に一度だけ名前を聞く */
export function needsName(name: string | null | undefined): boolean {
  const s = (name ?? '').trim();
  return s === '' || s === DEFAULT_NAME;
}

/**
 * 同じ名前の人が並ぶときに見分ける表示名（決定事項 #124）：名前が重なる人だけ、フレンドコードの先頭4文字を添える（例「プレイヤー（2NWH）」）。
 * 戻り値はフレンドコード → 表示名
 */
export function distinctNames(people: readonly { friendCode: string; name: string }[]): Map<string, string> {
  const count = new Map<string, number>();
  const seen = new Set<string>();
  for (const p of people) {
    if (seen.has(p.friendCode)) continue;
    seen.add(p.friendCode);
    count.set(p.name, (count.get(p.name) ?? 0) + 1);
  }
  return new Map(people.map((p) => [p.friendCode, (count.get(p.name) ?? 0) > 1 ? `${p.name}（${p.friendCode.slice(0, 4)}）` : p.name]));
}

/**
 * コピーしたカードのグループ「<名前>から」に使う名前（決定事項 #124）。自動の「プレイヤー」のままの人は、フレンドコードの先頭4文字を添えて
 * 別の人のカードが1つのグループに混ざらないようにする
 */
export function sourceLabel(name: string, friendCode?: string | null): string {
  return friendCode && needsName(name) ? `${(name || DEFAULT_NAME).trim()}（${friendCode.slice(0, 4)}）` : name;
}

/** アプリの中のブラウザ（LINE・Facebook・Instagram）か。そこで開くと端末の保存場所が別になり、別のプレイヤーになってしまう */
export function isInAppBrowser(userAgent: string): boolean {
  return /\bLine\/|FBAN|FBAV|Instagram/i.test(userAgent);
}

/** 引き継ぎコード（16進64文字）を入力からならす（空白・改行・ハイフンを除き小文字に）。形が違えば null */
export function normalizeSecret(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const s = input.replace(/[\s-]/g, '').toLowerCase();
  return /^[0-9a-f]{64}$/.test(s) ? s : null;
}

/** 引き継ぎコードを読みやすく区切る（8文字ずつ） */
export function formatSecret(secret: string): string {
  return secret.match(/.{1,8}/g)?.join(' ') ?? secret;
}

/** フレンドコードの表示（ABCD-EFGH） */
export function formatFriendCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

// ---------------------------------------------------------------- 招待リンク

export interface FriendLink {
  friendCode: string;
  token: string;
  /** リンクに添えた名前（だれでも書き換えられるので、読み込み中の仮の表示だけ。本当の名前は linkInfo で確かめる：決定事項 #124） */
  name: string;
}

/** 招待リンクのハッシュの部分（#/friend/<code>/<token>/<name>） */
export function friendLinkHash(link: FriendLink): string {
  const name = link.name.trim();
  return `#/friend/${link.friendCode}/${link.token}${name ? `/${encodeURIComponent(name)}` : ''}`;
}

/**
 * 招待リンクの URL。base はアプリの場所（https://…/ や http://localhost:5173/?server=…）。
 * openExternalBrowser=1 を付ける（LINE で開くと、LINE の中のブラウザではなくいつものブラウザで開く。決定事項 #124）
 */
export function friendLinkUrl(base: string, link: FriendLink): string {
  const page = base.replace(/#.*$/, '');
  const withFlag = /[?&]openExternalBrowser=1(?:&|$)/.test(page) ? page : `${page}${page.includes('?') ? '&' : '?'}openExternalBrowser=1`;
  return `${withFlag}${friendLinkHash(link)}`;
}

/** ルートの部品（friend の後ろ）から招待リンクを読む。形が違えば null */
export function parseFriendLinkParts(parts: readonly string[]): FriendLink | null {
  const [code, token, name] = parts;
  if (!code || !token) return null;
  const friendCode = code.toUpperCase().replace(/[\s-]/g, '');
  if (!/^[A-Z0-9]{8}$/.test(friendCode) || !/^[0-9a-f]{32}$/.test(token)) return null;
  return { friendCode, token, name: (name ?? '').slice(0, 24) };
}

// ---------------------------------------------------------------- 表示の言葉

export const PRESENCE_LABEL: Record<Presence, string> = { online: 'オンライン', battle: '対戦中', offline: 'オフライン' };

export function recordText(r: FriendView['record']): string {
  if (r.win + r.loss + r.draw === 0) return 'まだ対戦していません';
  return `${r.win}勝 ${r.loss}敗${r.draw > 0 ? ` ${r.draw}分` : ''}`;
}

/** 経過時間（〜前）。ms はミリ秒 */
export function agoText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return 'たった今';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  return `${Math.floor(h / 24)}日前`;
}

/** 部屋の待ち時間（募集中の部屋） */
export function waitingText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}秒待ち`;
  return `${Math.floor(s / 60)}分待ち`;
}

/** 招待の残り時間 */
export function leftText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return `あと${s}秒`;
  return `あと${Math.ceil(s / 60)}分`;
}

/** オンラインのタブの印の数（届いた申請＋届いた招待） */
export function badgeCount(snap: SocialSnapshot | null): number {
  return snap ? snap.incoming.length + snap.invites.length : 0;
}

export type FriendState = 'self' | 'friend' | 'outgoing' | 'incoming' | 'none';

/** あるフレンドコードの人と自分の間柄 */
export function friendStateOf(snap: SocialSnapshot | null, code: string | undefined | null): FriendState {
  if (!snap || !code) return 'none';
  if (code === snap.me.friendCode) return 'self';
  if (snap.friends.some((f) => f.friendCode === code)) return 'friend';
  if (snap.outgoing.some((r) => r.friendCode === code)) return 'outgoing';
  if (snap.incoming.some((r) => r.friendCode === code)) return 'incoming';
  return 'none';
}

/** 最近の対戦相手のうち、申請できる人（フレンドでも申請中でも自分でもない。同じ人は新しい1件。max 人まで） */
export function requestableOpponents<T extends { friendCode?: string; opponentName: string; at: number }>(history: readonly T[], snap: SocialSnapshot | null, max = 5): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const e of [...history].sort((a, b) => b.at - a.at)) {
    if (!e.friendCode || seen.has(e.friendCode)) continue;
    seen.add(e.friendCode);
    const st = friendStateOf(snap, e.friendCode);
    if (st === 'none' || st === 'incoming') out.push(e);
    if (out.length >= max) break;
  }
  return out;
}

/** 公開中のデッキの中身が変わったかを見る印（デッキと、使っているカードの定義） */
export function shareSignature(deck: Deck, cards: readonly CardDef[]): string {
  const used = new Set(deck.entries.map((e) => e.cardId));
  const defs = cards.filter((c) => used.has(c.id)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return JSON.stringify([deck.name, deck.entries, defs]);
}

/** 公開中のデッキの ID の集まり */
export function sharedDeckIds(snap: SocialSnapshot | null): Set<string> {
  return new Set(snap?.sharedDecks.map((d) => d.deckId) ?? []);
}
