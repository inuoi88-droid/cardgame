/**
 * 報告・要望（決定事項 #129）の送り口：端末の報告の鍵（localStorage の cardgame.v1.feedback）と、サーバーへの送信。
 * 鍵は最初に送るときに作る（16進32文字。サーバーはハッシュだけを持ち、同じ鍵で自分の報告の状況を読める）。
 * 保存できない（プライベートウィンドウなど）ときは、この画面を開いている間だけの鍵で送る（状況はあとで読めない）。
 */
import type { FeedbackRequest, FeedbackResponse } from '../../online/feedback/protocol.ts';
import type { FeedbackSummary } from '../../online/feedback/types.ts';
import { callServer } from '../online/client.ts';

export const FEEDBACK_KEY = 'cardgame.v1.feedback';

let memoryKey: string | null = null;

function newKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 端末の報告の鍵（無ければ作って保存する） */
export function feedbackKey(): string {
  try {
    const raw = JSON.parse(localStorage.getItem(FEEDBACK_KEY) ?? 'null') as { key?: unknown } | null;
    if (raw && typeof raw.key === 'string' && /^[0-9a-f]{32,64}$/.test(raw.key)) return raw.key;
    const key = newKey();
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify({ key }));
    return key;
  } catch {
    return (memoryKey ??= newKey());
  }
}

/** もう送ったことがあるか（「送った報告」を開く前に、鍵を作らずに確かめる） */
export function hasFeedbackKey(): boolean {
  try {
    return localStorage.getItem(FEEDBACK_KEY) !== null || memoryKey !== null;
  } catch {
    return memoryKey !== null;
  }
}

type NetError = { ok: false; error: string; reason: 'network' };

export async function sendFeedback(req: Omit<Extract<FeedbackRequest, { op: 'feedback' }>, 'op' | 'key'>): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const res = (await callServer({ op: 'feedback', key: feedbackKey(), ...req } as never)) as unknown as FeedbackResponse | NetError;
  if (res.ok && 'id' in res) return { ok: true, id: res.id };
  return { ok: false, error: res.ok ? 'サーバーから正しい返事がありません' : res.error };
}

export async function loadFeedbackStatus(): Promise<{ ok: true; reports: FeedbackSummary[] } | { ok: false; error: string }> {
  if (!hasFeedbackKey()) return { ok: true, reports: [] };
  const res = (await callServer({ op: 'feedbackStatus', key: feedbackKey() } as never)) as unknown as FeedbackResponse | NetError;
  if (res.ok && 'reports' in res) return { ok: true, reports: res.reports };
  return { ok: false, error: res.ok ? 'サーバーから正しい返事がありません' : res.error };
}
