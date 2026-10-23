// UI2 の土台（決定事項 #111）の約束を確かめる：
// - 画面の枠の記号（src/ui/icons/uiIcons.json）がすべて同梱されている
// - UI のテーマの CSS にカードの部品（.tcg .hc .mt .card-row .lrow .crow）の規則を置かない（カードの見た目と読みやすさを守る）
// - styles.css に !important を足さない（「動きを減らす」の一括の打ち消しと、古い2か所だけ）
// - カードの部品は元のトークンに固定されている（cardTokens.css）
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UI_ICON_PATHS } from '../src/ui/icons/generated/uiIcons.ts';
import { isPathData } from '../src/ui/icons/ref.ts';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const CARD_SELECTOR = /\.(tcg|hc|mt|card-row|lrow|crow)(?![\w-])|\.(tcg|hc|mt|card-row|lrow|crow)__/;

/** CSS の規則のセレクタ（コメントと @card-parts の区間を除く） */
function selectors(css: string): string[] {
  const body = css.replace(/\/\*\s*@card-parts:start[\s\S]*?@card-parts:end\s*\*\//g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const out: string[] = [];
  for (const m of body.matchAll(/([^{}]+)\{/g)) {
    const sel = m[1]!.trim();
    if (sel.startsWith('@')) continue;
    out.push(sel);
  }
  return out;
}

describe('画面の枠の記号（UiIcon）', () => {
  it('uiIcons.json の名前がすべて同梱されている', () => {
    const names = Object.keys(JSON.parse(read('src/ui/icons/uiIcons.json'))).filter((n) => n !== '_');
    expect(names.length).toBeGreaterThan(30);
    for (const n of names) {
      const d = (UI_ICON_PATHS as Record<string, string>)[n];
      expect(isPathData(d), n).toBe(true);
    }
    expect(Object.keys(UI_ICON_PATHS).sort()).toEqual([...names].sort());
  });

  it('ナビ・共通部品は絵文字ではなく UiIcon を使う', () => {
    const app = read('src/ui/App.tsx');
    for (const emoji of ['🃏', '📚', '🤖', '🌐', '📖']) expect(app.includes(emoji), emoji).toBe(false);
    expect(app).toMatch(/<UiIcon name=\{n\.icon\}/);
    expect(read('src/ui/collection/Controls.tsx').includes('🔍')).toBe(false);
  });
});

describe('UI のテーマの CSS', () => {
  const UI_CSS = ['src/ui/styles.css', 'src/ui/theme/theme.css', 'src/ui/editor.css', 'src/ui/editor/picker.css', 'src/ui/editor/extras.css', 'src/ui/components/iconPicker.css'];

  it.each(UI_CSS)('%s にカードの部品の規則が無い（styles.css は @card-parts の区間だけ）', (file) => {
    const bad = selectors(read(file)).filter((s) => CARD_SELECTOR.test(s));
    expect(bad).toEqual([]);
  });

  it('styles.css の !important は「動きを減らす」の打ち消しと古い2か所だけ', () => {
    const css = read('src/ui/styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
    expect((css.match(/!important/g) ?? []).length).toBeLessThanOrEqual(6);
  });

  it('カードの部品は元のトークンに固定されている', () => {
    const css = read('src/ui/components/cardTokens.css');
    for (const sel of ['.tcg', '.hc', '.mt', '.card-row', '.lrow', '.crow']) expect(css.includes(sel), sel).toBe(true);
    for (const token of ['--text', '--muted', '--panel-2', '--panel-3', '--line', '--line-strong', '--accent', '--radius-sm', '--radius']) {
      expect(css).toMatch(new RegExp(`${token}:`));
    }
  });

  it('見出しの明朝は同梱した書体を使い、外から読み込まない', () => {
    const theme = read('src/ui/theme/theme.css');
    expect(theme).toMatch(/font-family: 'UI Mincho'/);
    expect(theme).toMatch(/url\('\.\/fonts\/ui-mincho\.woff2'\)/);
    expect(theme.includes('fonts.googleapis.com')).toBe(false);
    expect(read('index.html').includes('fonts.googleapis.com')).toBe(false);
  });
});
