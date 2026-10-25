/** 部屋コード（紛らわしい 0/O・1/I/L を除いた6文字）とプレイヤー名 */

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
export const NAME_MAX_LENGTH = 12;
export const DEFAULT_NAME = 'プレイヤー';

export function generateCode(randomInt: (n: number) => number): string {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

/** 入力されたコードを正規化（大文字に、空白やハイフンを除く）。形が違えば null */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const s = input.toUpperCase().replace(/[\s-]/g, '');
  if (s.length !== CODE_LENGTH) return null;
  return [...s].every((ch) => CODE_ALPHABET.includes(ch)) ? s : null;
}

/**
 * 見えない文字（制御文字・書式文字＝ゼロ幅・文字の向きを変える記号など）。名前のなりすまし表示に使えるので消す。
 * 改行・タブなどの空白類は1つの空白にする
 */
const INVISIBLE = /[\p{Cc}\p{Cf}\u2028\u2029]/gu;

/** 人が入力した短い文字列（名前・デッキ名）をそろえる：見えない文字を消し、空白の連続を1つに、前後の空白を除き、max 文字で切る */
export function cleanText(input: unknown, max: number): string {
  if (typeof input !== 'string') return '';
  const s = input.replace(/[\t\n\r\v\f]+/g, ' ').replace(INVISIBLE, '').replace(/\s+/gu, ' ').trim();
  return [...s].slice(0, max).join('').trim();
}

export function normalizeName(input: unknown): string {
  const s = cleanText(input, NAME_MAX_LENGTH);
  return s.length === 0 ? DEFAULT_NAME : s;
}
