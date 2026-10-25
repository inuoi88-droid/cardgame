/**
 * 報告の受付（決定事項 #129）：送る（回数の上限つき）・自分の報告の状況を読む。純粋な処理（DB・時刻・ハッシュは外から渡す）。
 */
import type { FeedbackRequest, FeedbackResponse } from './protocol.ts';
import { FEEDBACK_PER_CLIENT_DAY, FEEDBACK_PER_DAY, FEEDBACK_PER_KEY_DAY, FEEDBACK_STATUS_LIMIT, type FeedbackStore } from './types.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface FeedbackDeps {
  store: FeedbackStore;
  now: number;
  hash(text: string): Promise<string>;
  /** 送り元（IP のハッシュ）。無ければ送り元ごとの上限は見ない */
  clientKey?: string;
}

/** 報告の鍵はそのままではなく、印を付けてからハッシュにする（部屋のトークンやプレイヤーの鍵のハッシュと混ざらないように） */
export const reporterOf = (key: string, hash: (t: string) => Promise<string>) => hash(`cardgame-feedback:${key}`);

export async function handleFeedback(req: FeedbackRequest, deps: FeedbackDeps): Promise<FeedbackResponse> {
  const reporter = await reporterOf(req.key, deps.hash);
  if (req.op === 'feedbackStatus') return { ok: true, reports: await deps.store.feedbackByReporter(reporter, FEEDBACK_STATUS_LIMIT) };

  const since = deps.now - DAY_MS;
  const limited = { ok: false as const, error: '今日はこれ以上送れません。明日またお願いします', reason: 'limit' as const };
  if ((await deps.store.countFeedback({ reporter }, since)) >= FEEDBACK_PER_KEY_DAY) return limited;
  if (deps.clientKey && (await deps.store.countFeedback({ client: deps.clientKey }, since)) >= FEEDBACK_PER_CLIENT_DAY) return limited;
  if ((await deps.store.countFeedback({}, since)) >= FEEDBACK_PER_DAY) {
    return { ok: false, error: '今日は報告が多く、受け付けを止めています。明日またお願いします', reason: 'limit' };
  }
  const id = await deps.store.insertFeedback({
    reporter,
    client: deps.clientKey ?? null,
    kind: req.kind,
    topic: req.topic,
    source: req.source,
    body: req.body,
    cards: req.cards ?? [],
    context: req.context ?? null,
    app: req.app ?? {},
    createdAt: deps.now,
  });
  return { ok: true, id };
}
