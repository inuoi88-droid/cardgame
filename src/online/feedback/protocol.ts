/**
 * 報告の送受信の形と、届いたデータの検証（決定事項 #129）。部屋・フレンド機能と同じ1つの受付に送り、op で見分ける。
 * key は端末で作る報告の鍵（16進32〜64文字。サーバーはハッシュだけを持つ）。
 */
import {
  FEEDBACK_BODY_MAX,
  FEEDBACK_CARD_MAX_CHARS,
  FEEDBACK_CARDS_MAX,
  FEEDBACK_CARDS_MAX_CHARS,
  FEEDBACK_CONTEXT_MAX_CHARS,
  FEEDBACK_KINDS,
  FEEDBACK_SOURCES,
  FEEDBACK_TOPICS,
  type FeedbackApp,
  type FeedbackKind,
  type FeedbackSource,
  type FeedbackSummary,
} from './types.ts';

export type FeedbackRequest =
  /** 報告を送る（本文か添えたカードのどちらかは要る） */
  | {
      op: 'feedback';
      key: string;
      kind: FeedbackKind;
      topic: string;
      source: FeedbackSource;
      body: string;
      cards?: unknown[];
      context?: Record<string, unknown>;
      app?: FeedbackApp;
    }
  /** 自分の報告の状況 */
  | { op: 'feedbackStatus'; key: string };

export type FeedbackOp = FeedbackRequest['op'];
export const FEEDBACK_OPS: readonly FeedbackOp[] = ['feedback', 'feedbackStatus'];

export function isFeedbackOp(op: unknown): op is FeedbackOp {
  return (FEEDBACK_OPS as readonly unknown[]).includes(op);
}

export type FeedbackErrorReason = 'invalid' | 'limit' | 'unsupported';

export type FeedbackResponse =
  | { ok: true; id: number }
  | { ok: true; reports: FeedbackSummary[] }
  | { ok: false; error: string; reason?: FeedbackErrorReason };

const KEY_RE = /^[0-9a-f]{32,64}$/;

/** 見えない文字（改行とタブ以外の制御文字・書式文字）を消し、改行をそろえる。空行は2つまで */
export function cleanBody(input: unknown, max = FEEDBACK_BODY_MAX): string {
  if (typeof input !== 'string') return '';
  const s = input
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[\p{Cf}\u2028\u2029]|(?![\n])\p{Cc}/gu, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return [...s].slice(0, max).join('').trim();
}

const shortText = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const s = cleanBody(v, max).replace(/\n/g, ' ');
  return s.length > 0 ? s : undefined;
};

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** JSON にしたときの文字数（循環などで JSON にできなければ Infinity） */
function jsonSize(v: unknown): number {
  try {
    return JSON.stringify(v).length;
  } catch {
    return Infinity;
  }
}

type Parsed = { ok: true; value: FeedbackRequest } | { ok: false; error: string };

export function parseFeedbackRequest(raw: unknown): Parsed {
  if (!isPlainObject(raw)) return { ok: false, error: '送信の形式が正しくありません' };
  const key = raw.key;
  if (typeof key !== 'string' || !KEY_RE.test(key)) return { ok: false, error: '報告の鍵の形が正しくありません' };
  if (raw.op === 'feedbackStatus') return { ok: true, value: { op: 'feedbackStatus', key } };
  if (raw.op !== 'feedback') return { ok: false, error: '知らない操作です' };

  const kind = raw.kind;
  if (!(FEEDBACK_KINDS as readonly unknown[]).includes(kind)) return { ok: false, error: '報告の種類が正しくありません' };
  const k = kind as FeedbackKind;
  const topic = raw.topic;
  if (typeof topic !== 'string' || !FEEDBACK_TOPICS[k].includes(topic)) return { ok: false, error: '報告の中身の種類が正しくありません' };
  const source = raw.source;
  if (!(FEEDBACK_SOURCES as readonly unknown[]).includes(source)) return { ok: false, error: '送った画面が正しくありません' };
  if (raw.body !== undefined && typeof raw.body !== 'string') return { ok: false, error: '本文の形が正しくありません' };
  if (typeof raw.body === 'string' && [...raw.body].length > FEEDBACK_BODY_MAX * 2) return { ok: false, error: `本文は${FEEDBACK_BODY_MAX}文字までです` };
  const body = cleanBody(raw.body);

  let cards: unknown[] | undefined;
  if (raw.cards !== undefined) {
    if (!Array.isArray(raw.cards)) return { ok: false, error: '添えたカードの形が正しくありません' };
    if (raw.cards.length > FEEDBACK_CARDS_MAX) return { ok: false, error: `添えられるカードは${FEEDBACK_CARDS_MAX}枚までです` };
    for (const c of raw.cards) {
      if (!isPlainObject(c) || typeof c.id !== 'string' || typeof c.name !== 'string') return { ok: false, error: '添えたカードの形が正しくありません' };
      if (jsonSize(c) > FEEDBACK_CARD_MAX_CHARS) return { ok: false, error: '添えたカードが大きすぎます' };
    }
    if (jsonSize(raw.cards) > FEEDBACK_CARDS_MAX_CHARS) return { ok: false, error: '添えたカードが大きすぎます' };
    cards = raw.cards;
  }
  if (body.length === 0 && (cards?.length ?? 0) === 0) return { ok: false, error: '本文を書くか、カードを選んでください' };

  let context: Record<string, unknown> | undefined;
  if (raw.context !== undefined) {
    if (!isPlainObject(raw.context)) return { ok: false, error: '添えた記録の形が正しくありません' };
    if (jsonSize(raw.context) > FEEDBACK_CONTEXT_MAX_CHARS) return { ok: false, error: '添えた記録が大きすぎます' };
    context = raw.context;
  }

  let app: FeedbackApp | undefined;
  if (isPlainObject(raw.app)) {
    const build = shortText(raw.app.build, 40);
    const page = shortText(raw.app.page, 120);
    const ua = shortText(raw.app.ua, 300);
    app = { ...(build ? { build } : {}), ...(page ? { page } : {}), ...(ua ? { ua } : {}) };
  }

  return {
    ok: true,
    value: {
      op: 'feedback',
      key,
      kind: k,
      topic,
      source: source as FeedbackSource,
      body,
      ...(cards ? { cards } : {}),
      ...(context ? { context } : {}),
      ...(app ? { app } : {}),
    },
  };
}
