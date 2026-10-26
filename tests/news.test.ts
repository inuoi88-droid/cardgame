// 更新情報（パッチノート。決定事項 #131）：中身の形の決まり・まだ見ていない更新・初めての人と前からの人・日付の書き方
import { describe, expect, it } from 'vitest';
import { initialSeen, itemsByKind, latestNo, NOTE_KIND_GI, NOTE_KIND_LABEL, NOTE_KINDS, noteDate, unseenNotes, type PatchNote } from '../src/ui/news/newsLogic.ts';
import { PATCH_NOTES } from '../src/ui/news/notes.ts';
import uiIcons from '../src/ui/icons/uiIcons.json';

describe('更新情報の中身', () => {
  it('番号は1から欠けずに並び、新しい順。日付は正しい形で、新しいほど後ろの日付', () => {
    const nos = PATCH_NOTES.map((n) => n.no);
    expect(nos).toEqual([...nos].sort((a, b) => b - a));
    expect(new Set(nos).size).toBe(nos.length);
    expect(Math.min(...nos)).toBe(1);
    expect(Math.max(...nos)).toBe(nos.length);
    for (let i = 0; i < PATCH_NOTES.length; i++) {
      const n = PATCH_NOTES[i]!;
      expect(n.date, `#${n.no}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(n.date)), `#${n.no}`).toBe(false);
      if (i > 0) expect(n.date <= PATCH_NOTES[i - 1]!.date, `#${n.no}`).toBe(true);
    }
  });

  it('どの更新にも題と中身があり、中身の種類・報告の番号・前と後の形が正しい', () => {
    for (const n of PATCH_NOTES) {
      expect(n.title.trim().length, `#${n.no}`).toBeGreaterThan(0);
      expect(n.items.length, `#${n.no}`).toBeGreaterThan(0);
      for (const it of n.items) {
        expect(NOTE_KINDS, `#${n.no}`).toContain(it.kind);
        expect(it.text.trim().length, `#${n.no}`).toBeGreaterThan(0);
        // プレイヤー向けの文に内部の言葉（ファイル名・決定事項の番号）を書かない
        expect(it.text, `#${n.no}`).not.toMatch(/\.tsx?\b|決定事項|#\d{2,3}\b/);
        if (it.reports) for (const r of it.reports) expect(Number.isInteger(r) && r > 0, `#${n.no}`).toBe(true);
        expect(it.before === undefined, `#${n.no} の before と after は対で`).toBe(it.after === undefined);
      }
    }
  });

  it('種類の言葉と印がそろっていて、印は画面の記号の表にある', () => {
    for (const k of NOTE_KINDS) {
      expect(NOTE_KIND_LABEL[k]).toBeTruthy();
      expect(Object.keys(uiIcons)).toContain(NOTE_KIND_GI[k]);
    }
    expect(Object.keys(uiIcons)).toContain('newspaper');
  });
});

const notes: PatchNote[] = [
  { no: 3, date: '2026-10-26', title: 'c', items: [{ kind: 'fix', text: 'x' }, { kind: 'new', text: 'y' }] },
  { no: 2, date: '2026-10-25', title: 'b', items: [{ kind: 'new', text: 'z' }] },
  { no: 1, date: '2025-12-31', title: 'a', items: [{ kind: 'change', text: 'w' }] },
];

describe('まだ見ていない更新', () => {
  it('見た番号より新しいものだけを新しい順に', () => {
    expect(unseenNotes(notes, 0).map((n) => n.no)).toEqual([3, 2, 1]);
    expect(unseenNotes(notes, 2).map((n) => n.no)).toEqual([3]);
    expect(unseenNotes(notes, 3)).toEqual([]);
    expect(latestNo(notes)).toBe(3);
  });

  it('初めての人には出さず、前から遊んでいる人には最新の1件を出す。記録があればそのまま', () => {
    expect(initialSeen(null, false, notes)).toBe(3);
    expect(unseenNotes(notes, initialSeen(null, true, notes)).map((n) => n.no)).toEqual([3]);
    expect(initialSeen(1, true, notes)).toBe(1);
  });

  it('1つの更新の中は 新機能 → バランス調整 → 不具合の修正 → 変更 の順。日付は月日（年が違えば年も）', () => {
    expect(itemsByKind(notes[0]!).map((g) => g.kind)).toEqual(['new', 'fix']);
    expect(noteDate('2026-10-26', 2026)).toBe('10月26日');
    expect(noteDate('2025-12-31', 2026)).toBe('2025年12月31日');
    expect(noteDate('2026-01-05')).toBe('1月5日');
  });
});
