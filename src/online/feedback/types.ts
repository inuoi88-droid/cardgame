/**
 * プレイヤーからの報告（決定事項 #129）：保存する形・上限・保存場所の約束（FeedbackStore）。
 * 報告はログインなしで送れる。端末で作る報告の鍵（key。16進32〜64文字）のハッシュだけを保存し、同じ鍵で自分の報告の状況を読める。
 * 状況（status・note）は運営（定期タスクの確認：docs/FEEDBACK_TRIAGE.md）が DB に書く。ブラウザからは書けない。
 */

/** 報告の種類 */
export type FeedbackKind = 'balance' | 'bug' | 'other';

export const FEEDBACK_KINDS: readonly FeedbackKind[] = ['balance', 'bug', 'other'];

/** 種類ごとの中身（バランス：強すぎ・弱すぎ・OTK・ループ／バグ：ルール・表示・止まる／その他：使いやすさ・ほしい機能・不満） */
export const FEEDBACK_TOPICS: Record<FeedbackKind, readonly string[]> = {
  balance: ['strong', 'weak', 'otk', 'loop', 'other'],
  bug: ['rules', 'display', 'stuck', 'other'],
  other: ['ui', 'feature', 'complaint', 'other'],
};

/** どの画面から送ったか */
export type FeedbackSource = 'result' | 'battle' | 'deck' | 'editor';
export const FEEDBACK_SOURCES: readonly FeedbackSource[] = ['result', 'battle', 'deck', 'editor'];

/** 状況：受付・確認中・対応予定・対応済み・見送り・ほかの報告にまとめた */
export type FeedbackStatus = 'new' | 'checking' | 'accepted' | 'fixed' | 'rejected' | 'duplicate';
export const FEEDBACK_STATUSES: readonly FeedbackStatus[] = ['new', 'checking', 'accepted', 'fixed', 'rejected', 'duplicate'];

/** 本文の長さの上限（文字） */
export const FEEDBACK_BODY_MAX = 2000;
/** 添えるカードの数の上限と、1枚・合計の大きさの上限（JSON の文字数） */
export const FEEDBACK_CARDS_MAX = 60;
export const FEEDBACK_CARD_MAX_CHARS = 6_000;
export const FEEDBACK_CARDS_MAX_CHARS = 120_000;
/** 添える状況（対戦の記録・画面の情報）の大きさの上限（JSON の文字数） */
export const FEEDBACK_CONTEXT_MAX_CHARS = 150_000;
/** 1台の端末（報告の鍵）・1つの送り元（IP のハッシュ）が1日に送れる数と、全体で1日に受け付ける数（共用の DB を埋められないように） */
export const FEEDBACK_PER_KEY_DAY = 20;
export const FEEDBACK_PER_CLIENT_DAY = 40;
export const FEEDBACK_PER_DAY = 1000;
/** 自分の報告の状況で返す件数 */
export const FEEDBACK_STATUS_LIMIT = 30;

/** 端末・画面の情報（どれも任意） */
export interface FeedbackApp {
  /** 画面の版（ビルドの印） */
  build?: string;
  /** 画面の場所（#/decks/... など） */
  page?: string;
  /** ブラウザ（User-Agent） */
  ua?: string;
}

/** 保存する報告 */
export interface FeedbackRecord {
  /** 報告の鍵のハッシュ */
  reporter: string;
  /** 送り元（IP のハッシュ）。無ければ null */
  client: string | null;
  kind: FeedbackKind;
  topic: string;
  source: FeedbackSource;
  body: string;
  /** 添えたカード（CardDef の写し。中身は確かめない：運営が読むだけ） */
  cards: unknown[];
  /** 対戦の記録など（JSON。中身は確かめない） */
  context: Record<string, unknown> | null;
  app: FeedbackApp;
  createdAt: number;
}

/** 自分の報告の状況（本人にだけ返す） */
export interface FeedbackSummary {
  id: number;
  kind: FeedbackKind;
  topic: string;
  /** 本文の頭 */
  excerpt: string;
  status: FeedbackStatus;
  /** 運営からのひとこと（無ければ null） */
  note: string | null;
  createdAt: number;
  updatedAt: number;
}

/** 報告の保存場所（Edge Function は SQL、手元のサーバーとテストはメモリ） */
export interface FeedbackStore {
  /** 入れて、振った番号を返す */
  insertFeedback(r: FeedbackRecord): Promise<number>;
  /** since 以降の報告の数（reporter・client を指定すればその分だけ。どちらも無ければ全体） */
  countFeedback(by: { reporter?: string; client?: string }, since: number): Promise<number>;
  /** その鍵の報告（新しい順に limit 件） */
  feedbackByReporter(reporter: string, limit: number): Promise<FeedbackSummary[]>;
}
