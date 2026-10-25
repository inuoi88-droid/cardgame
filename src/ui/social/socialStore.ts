/**
 * フレンド機能の画面側の状態（決定事項 #123）。端末のプレイヤー情報（localStorage）と、サーバーから取った様子（snapshot）を持つ。
 * - プレイヤーは、オンラインの画面を初めて開いたときに `ensurePlayer()` が作る（ログイン・パスワードなし。名前は前に使ったオンラインの名前）
 * - `refreshSocial()`＝hello（生存の合図と取り直し）。SocialRuntime が約25秒おき（画面が見えている間だけ）と通知のたびに呼ぶ
 * - `socialAct(req)`：鍵を付けて送り、返事に snapshot があれば取り入れる
 * 鍵が無効（reason auth）のときは勝手に作り直さず、status 'auth' にして画面に選んでもらう（引き継ぎコードを入れる／新しく始める）
 */
import { useEffect, useSyncExternalStore } from 'react';
import type { SocialError, SocialOk, SocialRequest, SocialSnapshot } from '../../online/social/protocol.ts';
import { callSocial, loadOnlineName, saveOnlineName } from '../online/client.ts';
import { LOCAL_SERVER_URL } from '../online/config.ts';
import { identityKey, normalizeSecret, parseIdentity, type PlayerIdentity } from './socialLogic.ts';

/**
 * none：まだプレイヤーが無い／loading：作っている・最初の取得中／ready：使える／auth：端末の鍵が無効／
 * unsupported：サーバーがフレンド機能を持たない／offline：通信できない（前の様子は残す）
 */
export type SocialStatus = 'none' | 'loading' | 'ready' | 'auth' | 'unsupported' | 'offline';

export interface SocialState {
  identity: PlayerIdentity | null;
  snap: SocialSnapshot | null;
  status: SocialStatus;
  /** 最後のエラーの言葉（通信できないなど） */
  error: string | null;
}

const KEY = identityKey(LOCAL_SERVER_URL);

function readIdentity(): PlayerIdentity | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parseIdentity(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeIdentity(id: PlayerIdentity | null): void {
  try {
    if (id) localStorage.setItem(KEY, JSON.stringify(id));
    else localStorage.removeItem(KEY);
  } catch {
    // 保存できなくても、開いている間は使える
  }
}

let state: SocialState = (() => {
  const identity = readIdentity();
  return { identity, snap: null, status: identity ? 'loading' : 'none', error: null };
})();
const listeners = new Set<() => void>();

function set(next: Partial<SocialState>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

export function getSocial(): SocialState {
  return state;
}

export function useSocial(): SocialState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

type AnyResponse = SocialOk<SocialRequest['op']> | SocialError | { ok: false; error: string; reason: 'network' };

/** 返事を状態に取り入れる（snapshot があれば。鍵の無効・未対応・通信の失敗は status に） */
function absorb(res: AnyResponse): void {
  if (res.ok) {
    if ('me' in res && 'friends' in res) {
      const snap = res as unknown as SocialSnapshot;
      const id = state.identity;
      const identity = id && (id.name !== snap.me.name || id.inboxId !== snap.me.inboxId) ? { ...id, name: snap.me.name, inboxId: snap.me.inboxId } : id;
      if (identity !== id) writeIdentity(identity);
      set({ snap: stripExtra(snap), identity, status: 'ready', error: null });
    }
    return;
  }
  if (res.reason === 'auth') set({ status: 'auth', error: res.error });
  else if (res.reason === 'unsupported') set({ status: 'unsupported', error: res.error });
  else if (res.reason === 'network') set({ status: 'offline', error: res.error });
}

/** 返事から snapshot の部分だけを取り出す（result・friend などを持ち込まない） */
function stripExtra(s: SocialSnapshot): SocialSnapshot {
  return { me: s.me, friends: s.friends, incoming: s.incoming, outgoing: s.outgoing, invites: s.invites, sentInvites: s.sentInvites, sharedDecks: s.sharedDecks, serverNow: s.serverNow };
}

let creating: Promise<PlayerIdentity | null> | null = null;

/** プレイヤーを用意する（無ければ作る）。作れなければ null（未対応のサーバー・通信できない） */
export function ensurePlayer(): Promise<PlayerIdentity | null> {
  if (state.identity) return Promise.resolve(state.identity);
  creating ??= (async () => {
    set({ status: 'loading' });
    const res = await callSocial({ op: 'register', name: loadOnlineName() });
    creating = null;
    if (!res.ok) {
      absorb(res);
      return null;
    }
    const identity: PlayerIdentity = { v: 1, secret: res.secret, friendCode: res.friendCode, inboxId: res.inboxId, name: res.name };
    writeIdentity(identity);
    set({ identity });
    await refreshSocial();
    return identity;
  })();
  return creating;
}

let helloInFlight: Promise<void> | null = null;

/** hello を送って様子を取り直す（重ねて呼んでも1本） */
export function refreshSocial(): Promise<void> {
  const id = state.identity;
  if (!id || state.status === 'auth') return Promise.resolve();
  helloInFlight ??= callSocial({ op: 'hello', secret: id.secret }).then((res) => {
    helloInFlight = null;
    // 送っている間に別のプレイヤーに替わっていれば捨てる
    if (state.identity?.secret === id.secret) absorb(res);
  });
  return helloInFlight;
}

type WithoutSecret<R> = R extends { secret: string } ? Omit<R, 'secret'> : never;
export type SocialAction = WithoutSecret<SocialRequest>;

/** 鍵を付けて送る（プレイヤーが無ければ作ってから）。返事の snapshot は取り入れる */
export async function socialAct<A extends SocialAction>(req: A): Promise<SocialOk<A['op']> | SocialError | { ok: false; error: string; reason: 'network' }> {
  const id = state.identity ?? (await ensurePlayer());
  if (!id) return { ok: false, error: state.error ?? 'フレンド機能が使えません', reason: 'network' };
  const res = (await callSocial({ ...req, secret: id.secret } as unknown as SocialRequest)) as SocialOk<A['op']> | SocialError | { ok: false; error: string; reason: 'network' };
  if (state.identity?.secret === id.secret) absorb(res as AnyResponse);
  return res;
}

/** 名前を変える（部屋の席の名前にも使う「前に使ったオンラインの名前」もそろえる） */
export async function setPlayerName(name: string): Promise<boolean> {
  saveOnlineName(name);
  if (!state.identity) return true;
  const res = await socialAct({ op: 'hello', name });
  return res.ok;
}

/** 別の端末から引き継ぐ：入れた引き継ぎコードで hello が通れば、この端末のプレイヤーをそれに替える */
export async function importSecret(input: string): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const secret = normalizeSecret(input);
  if (!secret) return { ok: false, error: '引き継ぎコードは 0〜9 と a〜f の64文字です' };
  const res = await callSocial({ op: 'hello', secret });
  if (!res.ok) return { ok: false, error: res.reason === 'auth' ? 'この引き継ぎコードのプレイヤーが見つかりません（作り直されたコードかもしれません）' : res.error };
  const identity: PlayerIdentity = { v: 1, secret, friendCode: res.me.friendCode, inboxId: res.me.inboxId, name: res.me.name };
  writeIdentity(identity);
  saveOnlineName(res.me.name);
  set({ identity, snap: stripExtra(res), status: 'ready', error: null });
  return { ok: true, name: res.me.name };
}

/** 新しく始める（この端末のプレイヤー情報を捨てて作り直す。前のフレンドは引き継がない） */
export async function startOver(): Promise<PlayerIdentity | null> {
  writeIdentity(null);
  set({ identity: null, snap: null, status: 'none', error: null });
  return ensurePlayer();
}

/** 引き継ぎコードを作り直す（前のコードは使えなくなる） */
export async function rotateSecret(): Promise<boolean> {
  const res = await socialAct({ op: 'rotateSecret' });
  if (!res.ok || !state.identity) return false;
  const identity = { ...state.identity, secret: res.secret };
  writeIdentity(identity);
  set({ identity });
  return true;
}

/** 部屋の create・join に付ける鍵（プレイヤーが使えるときだけ） */
export function roomSecret(): { secret?: string } {
  return state.identity && state.status !== 'auth' ? { secret: state.identity.secret } : {};
}

/** 部屋の送信で鍵が断られた（reason 'player'）とき：端末の鍵が無効 */
export function markPlayerInvalid(error: string): void {
  set({ status: 'auth', error });
}

let boost = 0;

/** 開いている間、hello を早めに送る（招待の返事待ち・フレンドのタブ。ふだんは約25秒おき） */
export function useSocialBoost(on = true): void {
  useEffect(() => {
    if (!on) return;
    boost++;
    return () => {
      boost--;
    };
  }, [on]);
}

export function socialBoosted(): boolean {
  return boost > 0;
}
