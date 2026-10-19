// エディターの「テンプレートから作る」の雛形は、すべてそのまま作成できること（倍率1）
import { describe, expect, it } from 'vitest';
import { analyzeCard } from '../src/engine/index.ts';
import { TEMPLATES } from '../src/ui/editor/templates.ts';

describe('テンプレート', () => {
  it('6種類ある', () => {
    expect(TEMPLATES.length).toBe(6);
  });
  for (const t of TEMPLATES) {
    it(`${t.title}（${t.id}）は作成できる`, () => {
      const a = analyzeCard(t.build(`tpl-${t.id}`));
      expect(a.violations).toEqual([]);
      expect(a.valid).toBe(true);
    });
  }
  it('呪いのアタックは呪いカード、速攻モンスターはモンスター', () => {
    expect(analyzeCard(TEMPLATES.find((t) => t.id === 'curse')!.build('x')).isCurse).toBe(true);
    expect(analyzeCard(TEMPLATES.find((t) => t.id === 'aggro')!.build('y')).cardType).toBe('monster');
  });
});
