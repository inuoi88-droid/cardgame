/**
 * 部屋を作る・部屋に入る共通の手順（ロビー・募集中の部屋・フレンドの招待で共用。決定事項 #123）。
 * プレイヤーの鍵があれば付けて送り（席がプレイヤーに結び付く＝成績・在室・対戦した相手への申請）、
 * 鍵が断られたら（reason 'player'）鍵なしで送り直す（対戦はできるようにする）。入れたら参加中の部屋として保存する。
 */
import type { ConfirmOptions } from '../components/ConfirmDialog.tsx';
import type { OnlineRequest } from '../../online/protocol.ts';
import { callServer, loadOnlineSession, saveOnlineName, saveOnlineSession } from '../online/client.ts';
import { navigate } from '../router.ts';
import { markPlayerInvalid, roomSecret } from './socialStore.ts';

type EnterRequest = Extract<OnlineRequest, { op: 'create' } | { op: 'join' }>;

export type EnterResult = { ok: true; code: string } | { ok: false; error: string; reason?: string };

export async function enterRoom(req: EnterRequest): Promise<EnterResult> {
  saveOnlineName(req.name);
  const secret = roomSecret();
  let res = await callServer({ ...req, ...secret });
  if (!res.ok && res.reason === 'player' && secret.secret) {
    markPlayerInvalid(res.error);
    res = await callServer(req);
  }
  if (!res.ok) return { ok: false, error: res.error, reason: res.reason };
  if (!res.token) return { ok: false, error: 'サーバーから合言葉が届きませんでした' };
  saveOnlineSession({ v: 1, code: res.code, token: res.token });
  return { ok: true, code: res.code };
}

export function goToRoom(): void {
  navigate('/online/play');
}

/** いま参加中の部屋があれば、抜けてよいか確かめる（無ければ true） */
export async function confirmLeaveRoom(confirm: (o: ConfirmOptions) => Promise<boolean>): Promise<boolean> {
  const existing = loadOnlineSession();
  if (!existing) return true;
  return confirm({
    title: '新しい部屋に移りますか？',
    message: `いま参加している部屋（コード ${existing.code}）を抜けます。対戦中なら、その対戦には戻れなくなります。`,
    okLabel: '移る',
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
