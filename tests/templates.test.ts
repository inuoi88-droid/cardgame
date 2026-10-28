// エディターの「テンプレートから作る」の雛形は、すべてそのまま作成できること（倍率1）
import { describe, expect, it } from 'vitest';
import { analyzeCard } from '../src/engine/index.ts';
import { TEMPLATES } from '../src/ui/editor/templates.ts';

describe('テンプレート', () => {
  it('16種類ある（○ バッチC2 で製造・暴動、△ バッチD で補強・湧血・種類サイクリング・変成・融合、統合 #101 で想起・予顕・変装）', () => {
    expect(TEMPLATES.length).toBe(16);
  });
  for (const t of TEMPLATES) {
    it(`${t.title}（${t.id}）は作成できる`, () => {
      const a = analyzeCard(t.build(`tpl-${t.id}`));
      expect(a.violations).toEqual([]);
      expect(a.valid).toBe(true);
    });
  }
  it('呪いのアタックは呪いカード、疾走モンスターはモンスター', () => {
    expect(analyzeCard(TEMPLATES.find((t) => t.id === 'curse')!.build('x')).isCurse).toBe(true);
    expect(analyzeCard(TEMPLATES.find((t) => t.id === 'aggro')!.build('y')).cardType).toBe('monster');
  });
});
