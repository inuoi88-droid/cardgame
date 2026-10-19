// テンプレートは実際の倍率でも作成できること
import { describe, expect, it } from 'vitest';
import { BALANCE, analyzeCard } from '../src/engine/index.ts';
import { TEMPLATES } from '../src/ui/editor/templates.ts';

describe('テンプレート（実際の倍率）', () => {
  for (const t of TEMPLATES) {
    it(`${t.title} は作成できる`, () => {
      const card = t.build(`tpl-${t.id}`);
      expect(card.scale).toBe(BALANCE.amountScale);
      expect(analyzeCard(card).valid).toBe(true);
    });
  }
});
