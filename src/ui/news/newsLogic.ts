/**
 * 更新情報（パッチノート。決定事項 #131）の決まりごと（純粋：React・DOM・localStorage を使わない。tests/news.test.ts）。
 * - 種類の言葉と印、日付の書き方
 * - まだ見ていない更新（端末に覚えた「見た番号」より新しいもの）
 * - 初めて来た人には帯を出さない（今までの更新はもう知らなくてよい）。前から遊んでいる人には、まだ見ていない最新の更新を出す
 */

/** 種類：新機能・バランス調整・不具合の修正・変更 */
export type NoteKind = 'new' | 'balance' | 'fix' | 'change';
export const NOTE_KINDS: readonly NoteKind[] = ['new', 'balance', 'fix', 'change'];

export interface NoteItem {
  kind: NoteKind;
  text: string;
  /** バランス調整：前と後（例 before「2 ポイント」after「3 ポイント」） */
  before?: string;
  after?: string;
  /** 報告・要望から直したもの：受付番号 */
  reports?: number[];
}

export interface PatchNote {
  /** 通し番号（新しいほど大きい。見たかどうかの印に使う） */
  no: number;
  /** 公開した日（日本時間 YYYY-MM-DD） */
  date: string;
  title: string;
  items: NoteItem[];
}

export const NOTE_KIND_LABEL: Record<NoteKind, string> = {
  new: '新機能',
  balance: 'バランス調整',
  fix: '不具合の修正',
  change: '変更',
};

/** 種類の印（src/ui/icons/uiIcons.json の名前） */
export const NOTE_KIND_GI: Record<NoteKind, string> = {
  new: 'beveled-star',
  balance: 'scales',
  fix: 'spanner',
  change: 'hammer-nails',
};

/** 表示の順（1つの更新の中で、新機能 → バランス調整 → 不具合の修正 → 変更） */
export function itemsByKind(note: PatchNote): { kind: NoteKind; items: NoteItem[] }[] {
  return NOTE_KINDS.map((kind) => ({ kind, items: note.items.filter((i) => i.kind === kind) })).filter((g) => g.items.length > 0);
}

/** 2026-10-26 → 10月26日（年が今と違えば 2025年10月26日） */
export function noteDate(date: string, thisYear?: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const [, y, mo, d] = m;
  const md = `${Number(mo)}月${Number(d)}日`;
  return thisYear !== undefined && Number(y) !== thisYear ? `${Number(y)}年${md}` : md;
}

export function latestNo(notes: readonly PatchNote[]): number {
  return notes.reduce((m, n) => Math.max(m, n.no), 0);
}

/** まだ見ていない更新（新しい順） */
export function unseenNotes(notes: readonly PatchNote[], seen: number): PatchNote[] {
  return notes.filter((n) => n.no > seen).sort((a, b) => b.no - a.no);
}

/**
 * 端末に覚えた「見た番号」。記録が無いとき：前から遊んでいる人（カードやデッキの保存がある）は 0（最新を知らせる）、
 * 初めての人は最新（今までの更新は出さない）
 */
export function initialSeen(stored: number | null, returning: boolean, notes: readonly PatchNote[]): number {
  if (stored !== null) return stored;
  return returning ? latestNo(notes) - 1 : latestNo(notes);
}
