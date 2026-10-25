/**
 * 部屋を作る・部屋に入る・部屋を出る共通の手順（ロビー・募集中の部屋・フレンドの招待で共用。決定事項 #123・#124）。
 * プレイヤーの鍵があれば付けて送り（席がプレイヤーに結び付く＝成績・在室・対戦した相手への申請）、
 * 鍵が断られたら（reason 'player'。サーバーのエラーも）鍵なしで送り直す（対戦はできるようにする）。入れたら参加中の部屋として保存し、
 * 前に参加していた部屋はサーバーに「出る」（close）と伝える（公開の部屋が一覧に残らないように・相手を待たせないように）。
 */
import type { ConfirmOptions } from '../components/ConfirmDialog.tsx';
import type { OnlineRequest } from '../../online/protocol.ts';
import { callServer, clearOnlineSession, loadOnlineSession, saveOnlineName, saveOnlineSession, type OnlineSession } from '../online/client.ts';
import { navigate } from '../router.ts';
import { ensurePlayer, getSocial, markPlayerInvalid, roomSecret } from './socialStore.ts';

type EnterRequest = Extract<OnlineRequest, { op: 'create' } | { op: 'join' }>;

export type EnterResult = { ok: true; code: string } | { ok: false; error: string; reason?: string };

/** プレイヤーを作っている途中なら、少しだけ待つ（席をプレイヤーに結び付けるため。待ちきれなければ鍵なしで入る） */
const PLAYER_WAIT_MS = 3000;

async function waitForPlayer(): Promise<void> {
  const { identity, status } = getSocial();
  if (identity || status === 'unsupported' || status === 'auth') return;
  await Promise.race([ensurePlayer(), new Promise((r) => setTimeout(r, PLAYER_WAIT_MS))]);
}

/** 鍵を付けたせいで断られた（鍵が無効・サーバーのエラー）なら、鍵なしで送り直す */
const retryWithoutSecret = (reason: string | undefined) => reason === 'player' || reason === undefined;

export async function enterRoom(req: EnterRequest): Promise<EnterResult> {
  saveOnlineName(req.name);
  await waitForPlayer();
  const prev = loadOnlineSession();
  const secret = roomSecret();
  let res = await callServer({ ...req, ...secret });
  if (!res.ok && secret.secret && retryWithoutSecret(res.reason)) {
    if (res.reason === 'player') markPlayerInvalid(res.error);
    res = await callServer(req);
  }
  if (!res.ok) return { ok: false, error: res.error, reason: res.reason };
  if (!res.token) return { ok: false, error: 'サーバーから合言葉が届きませんでした' };
  saveOnlineSession({ v: 1, code: res.code, token: res.token });
  if (prev && prev.code !== res.code) void closeRoom(prev);
  return { ok: true, code: res.code };
}

export function goToRoom(): void {
  navigate('/online/play');
}

/** サーバーに部屋を出ると伝える（届かなくてもよい。古いサーバーは知らない操作として断る） */
function closeRoom(s: OnlineSession): Promise<unknown> {
  return callServer({ op: 'close', code: s.code, token: s.token }).catch(() => null);
}

/** 参加中の部屋を出る（相手待ちなら閉じる・対戦中なら降参・決着後なら再戦しない）。端末の記録も消す */
export async function leaveRoom(): Promise<void> {
  const s = loadOnlineSession();
  clearOnlineSession();
  if (s) await closeRoom(s);
}

/**
 * いま参加中の部屋があれば、新しい部屋に移ってよいか確かめる（無ければ true。部屋を出るのは新しい部屋に入れたあと＝enterRoom）。
 * 部屋の様子を見て、相手待ち・決着後なら確かめずに移る。ドラフト中・対戦中なら「降参（負け）になる」と確かめる
 */
export async function confirmLeaveRoom(confirm: (o: ConfirmOptions) => Promise<boolean>): Promise<boolean> {
  const existing = loadOnlineSession();
  if (!existing) return true;
  const res = await callServer({ op: 'state', code: existing.code, token: existing.token });
  if (!res.ok) {
    if (res.reason !== 'network') {
      // 部屋がもう無い・合言葉が違う：記録だけ消して移る
      clearOnlineSession();
      return true;
    }
    return confirm({
      title: '新しい部屋に移りますか？',
      message: `参加中の部屋（コード ${existing.code}）の状態を確かめられませんでした。対戦中なら、その対戦は降参（負け）になります。`,
      okLabel: '移る',
    });
  }
  if (res.status === 'waiting' || res.status === 'ended') return true;
  return confirm({
    title: '降参して移りますか？',
    message:
      res.status === 'drafting'
        ? `参加中の部屋（コード ${existing.code}）はドラフトの途中です。移ると残りは「おまかせ」で取り、対戦は降参（負け）になります。`
        : `参加中の部屋（コード ${existing.code}）で対戦中です。移るとこの対戦は降参（負け）になり、相手にすぐ知らせます。`,
    okLabel: '降参して移る',
    danger: true,
  });
}

const DECK_KEY = 'cardgame.v1.onlineDeck';

/** オンラインで最後に選んだデッキ（候補のキー）。見る人ごとの便利さだけ（無くても最初の使えるデッキになる） */
export function loadOnlineDeckKey(): string {
  try {
    return localStorage.getItem(DECK_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveOnlineDeckKey(key: string): void {
  try {
    localStorage.setItem(DECK_KEY, key);
  } catch {
    // 何もしない
  }
}
