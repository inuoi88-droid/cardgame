/**
 * 報告の保存場所のメモリ版（手元のサーバー・テスト。決定事項 #129）。SQL 版は supabase/functions/cardgame/sqlStore.ts の makeFeedbackStore。
 * 状況（status・note）は運営が DB に書くもの。ここでは setStatus で書ける（テスト用）。
 */
import type { FeedbackRecord, FeedbackStatus, FeedbackStore, FeedbackSummary } from './types.ts';

const EXCERPT = 60;

export interface StoredFeedback extends FeedbackRecord {
  id: number;
  status: FeedbackStatus;
  note: string | null;
  updatedAt: number;
}

export class MemoryFeedbackStore implements FeedbackStore {
  list: StoredFeedback[] = [];

  async insertFeedback(r: FeedbackRecord): Promise<number> {
    const id = this.list.length + 1;
    this.list.push({ ...r, id, status: 'new', note: null, updatedAt: r.createdAt });
    return id;
  }

  async countFeedback(by: { reporter?: string; client?: string }, since: number): Promise<number> {
    return this.list.filter((f) => f.createdAt >= since && (by.reporter === undefined || f.reporter === by.reporter) && (by.client === undefined || f.client === by.client)).length;
  }

  async feedbackByReporter(reporter: string, limit: number): Promise<FeedbackSummary[]> {
    return this.list
      .filter((f) => f.reporter === reporter)
      .sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)
      .slice(0, limit)
      .map((f) => ({
        id: f.id,
        kind: f.kind,
        topic: f.topic,
        excerpt: [...f.body].slice(0, EXCERPT).join(''),
        status: f.status,
        note: f.note,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
      }));
  }

  /** 運営の書き込みのかわり（テスト・手元のサーバー） */
  setStatus(id: number, status: FeedbackStatus, note: string | null, at: number): void {
    const f = this.list.find((x) => x.id === id);
    if (f) Object.assign(f, { status, note, updatedAt: at });
  }
}
