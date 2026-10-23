// 見出し用の明朝（UI Mincho。決定事項 #111）に UI の固定の文字がすべて入っているか。
// 落ちたら `npm run gen:font`（ネットと Python の fontTools が要る）で src/ui/theme/fonts/ を作り直してコミットする。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { charsOfSource, collectDisplayChars } from '../scripts/font/chars.mjs';

const ROOT = join(__dirname, '..');
const meta = JSON.parse(readFileSync(join(ROOT, 'src/ui/theme/fonts/ui-mincho.json'), 'utf8')) as { covered: string; absent: string };

describe('見出し用の明朝（UI Mincho）', () => {
  it('src/ui の固定の文字がすべて入っている（無い字は書体にもともと無いものだけ）', () => {
    const covered = new Set([...meta.covered]);
    const absent = new Set([...meta.absent]);
    const missing = collectDisplayChars(ROOT).filter((ch) => ch !== ' ' && !covered.has(ch) && !absent.has(ch));
    expect(missing.join(''), '字が足りません。npm run gen:font を回してください').toBe('');
  });

  it('ひらがな・カタカナ・ASCII は全部入っている', () => {
    const covered = new Set([...meta.covered]);
    for (const ch of 'あいうえおんゃゎアイウエオンヴーABCxyz0123456789!?') expect(covered.has(ch), ch).toBe(true);
  });

  it('コメントの字は拾わず、文字列と JSX の字は拾う', () => {
    const set = charsOfSource('// 鬱\n/* 鶫 */\nconst a = "黴";\nconst b = <h1>魘{x}</h1>;\nconst c = `蒼${y}`;', 'x.tsx');
    expect(set.has('黴')).toBe(true);
    expect(set.has('魘')).toBe(true);
    expect(set.has('蒼')).toBe(true);
    expect(set.has('鬱')).toBe(false);
    expect(set.has('鶫')).toBe(false);
  });

  it('woff2 が置いてある（同梱。外から読み込まない）', () => {
    const buf = readFileSync(join(ROOT, 'src/ui/theme/fonts/ui-mincho.woff2'));
    expect(buf.subarray(0, 4).toString('latin1')).toBe('wOF2');
    expect(buf.length).toBeLessThan(400 * 1024);
  });
});
