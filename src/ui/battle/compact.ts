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

/** 挑発（キーワード・付与・このターンだけの付与）の札の id。攻撃先・「選んだ1体」を縛るので、タイルでは先頭に名前つきで出す */
const TAUNT_IDS = new Set(['kw:taunt', 'gr:taunt', 'tg:taunt']);
export const isTauntChip = (id: string): boolean => TAUNT_IDS.has(id);

/** スマホのタイルの札の並び：挑発 → 守備力（ステータスの行から移す）→ ほか（元の順） */
export function tileChipOrder<T extends { id: string }>(chips: readonly T[], defense?: T): T[] {
  const taunt = chips.filter((c) => isTauntChip(c.id));
  const rest = chips.filter((c) => !isTauntChip(c.id));
  return [...taunt, ...(defense ? [defense] : []), ...rest];
}

/** タイルの札の文字：挑発だけは「挑発」の名前を残す（アイコンの 🛡 は守備力と同じなので） */
export function briefChipLabel(c: { id: string; label: string }): string {
  // 付与（➕）・このターンだけ（⏱）の印は落として、どれも「🛡挑発」（狭いタイルに入るように。詳細には印つきで出る）
  return isTauntChip(c.id) ? '🛡挑発' : briefLabel(c.label);
}

/**
 * タイル・帯の札の中身（UI2：形のある札は形＋数字だけ）。挑発だけは「挑発」の名前を残す（守備力の盾と見分ける）。
 * 形の無い札は今までどおり briefChipLabel
 */
export function briefFace(c: { id: string; label: string; gi?: string; text?: string }): { gi?: string; text: string } {
  if (isTauntChip(c.id)) return { gi: 'checked-shield', text: '挑発' };
  if (c.gi) return { gi: c.gi, text: (c.text ?? '').replace(WORDS, '') };
  return { text: briefChipLabel(c) };
}

/** 手札の注意の札（パワー入替・条件未達…）をスマホではアイコンにする */
export const HAND_BADGE_ICON: Record<string, string> = {
  氷結: '🧊',
  封殺: '🔇',
  パワー入替: '🔄',
  条件未達: '⚠',
  対象なし: '∅',
};
