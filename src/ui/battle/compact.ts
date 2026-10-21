/**
 * スマホの詰めた表示（対戦画面）の小道具。純粋関数（tests/battle/compact.test.ts）。
 * - overflowItems：札を max 個まで出し、残りの数を「+N」にする
 * - briefLabel：札の文字から日本語の名前を落として、アイコンと数字だけにする（「⚡速攻」→「⚡」、「⏳寿命2」→「⏳2」）
 */

export function overflowItems<T>(items: readonly T[], max: number): { shown: T[]; more: number } {
  const n = Math.max(0, Math.floor(max));
  const shown = items.slice(0, n);
  return { shown, more: items.length - shown.length };
}

/** 漢字・ひらがな・カタカナ・長音・中黒・かっこ・空白 */
const WORDS = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々・（）()\s]/gu;

export function briefLabel(label: string): string {
  const s = label.replace(WORDS, '');
  if (s) return s;
  // 文字だけの札（アイコンなし）は最初の1文字
  return Array.from(label.trim())[0] ?? '';
}

/** 手札の注意の札（パワー入替・条件未達…）をスマホではアイコンにする */
export const HAND_BADGE_ICON: Record<string, string> = {
  氷結: '🧊',
  封殺: '🔇',
  パワー入替: '🔄',
  条件未達: '⚠',
  対象なし: '∅',
};
