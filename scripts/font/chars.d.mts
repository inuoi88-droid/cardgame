// chars.mjs の型（tests/displayFont.test.ts から使う）
export function charsOfSource(text: string, fileName?: string): Set<string>;
export function baseChars(): Set<string>;
export function collectDisplayChars(root: string): string[];
export function sourceFiles(root: string): string[];
