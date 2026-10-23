// UI2 の D（デッキ一覧・デッキ構築・ロビー・ルール・カード置き場の操作。決定事項 #111）の約束を確かめる：
// - D の CSS（pages/pages.css・components/costCurve.css）にカードの部品（.tcg .hc .mt .card-row .lrow .crow）の規則と !important を置かない
// - D の画面は UI の記号に絵文字・記号の文字を使わず UiIcon（ルールの目次の印・デッキの操作・⋯・要修正の札）
// - レアリティの印は .dot ではなくカードの RarityGem
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UI_ICON_PATHS } from '../src/ui/icons/generated/uiIcons.ts';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
/** コメントを除いたソース（説明の中の「⋯」などは数えない） */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const CARD_SELECTOR = /\.(tcg|hc|mt|card-row|lrow|crow)(?![\w-])|\.(tcg|hc|mt|card-row|lrow|crow)__/;
const selectors = (css: string) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{/g)].map((m) => m[1]!.trim()).filter((s) => !s.startsWith('@'));

describe('UI2 の D の CSS', () => {
  it.each(['src/ui/pages/pages.css', 'src/ui/components/costCurve.css'])('%s にカードの部品の規則と !important が無い', (file) => {
    const css = read(file);
    expect(selectors(css).filter((s) => CARD_SELECTOR.test(s))).toEqual([]);
    expect(css.includes('!important')).toBe(false);
  });

  it('pages.css は styles.css の後に読む（同じ強さの規則を上書きするため）', () => {
    const main = read('src/ui/main.tsx');
    expect(main.indexOf("import './pages/pages.css'")).toBeGreaterThan(main.indexOf("import './styles.css'"));
  });

  it('レアリティの印の .dot は消えた（RarityGem を使う）', () => {
    expect(read('src/ui/styles.css')).not.toMatch(/\.dot--(common|rare|epic|legend)/);
    for (const f of ['src/ui/pages/DeckBuilderPage.tsx', 'src/ui/pages/RulesPage.tsx']) expect(read(f)).not.toMatch(/'dot'|dot--/);
  });
});

describe('UI2 の D の画面の記号', () => {
  it('ルールの目次・節の印は UiIcon（絵文字ではない）', () => {
    const src = read('src/ui/pages/RulesPage.tsx');
    const block = src.slice(src.indexOf('const SECTIONS'), src.indexOf('export function RulesPage'));
    expect(block).not.toMatch(/\p{Extended_Pictographic}/u);
    for (const m of block.matchAll(/icon: '([^']+)'/g)) {
      const name = m[1]!;
      if (!name.startsWith('gi:')) expect(Object.prototype.hasOwnProperty.call(UI_ICON_PATHS, name), name).toBe(true);
    }
  });

  it('デッキ一覧・カード置き場・ロビーに UI の記号の絵文字（⋯ ⚠ ✓ ▸）が残っていない', () => {
    for (const f of ['src/ui/pages/DeckListPage.tsx', 'src/ui/components/DeckBox.tsx', 'src/ui/components/TileMenu.tsx', 'src/ui/pages/OnlineLobbyPage.tsx']) {
      expect(code(f), f).not.toMatch(/[⋯⚠✓▸▾]|\p{Extended_Pictographic}/u);
    }
    const list = code('src/ui/pages/CardListPage.tsx');
    expect(list).not.toMatch(/[⋯⚠]/);
    expect(code('src/ui/collection/CardCollection.tsx')).not.toMatch(/▸/);
  });
});
