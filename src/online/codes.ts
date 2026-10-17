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

export function normalizeName(input: unknown): string {
  const s = typeof input === 'string' ? input.trim() : '';
  return s.length === 0 ? DEFAULT_NAME : [...s].slice(0, NAME_MAX_LENGTH).join('');
}
