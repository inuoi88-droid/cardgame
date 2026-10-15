/** カード1枚を解析する入口。種類・呪い・ポイント・テキスト・違反理由をまとめて返す（何も保存しない）。 */
import { cardBase, classifyCard, isCurseCard } from './classify.ts';
import { calculatePoints } from './points.ts';
import { describeCard } from './text.ts';
import type { CardAnalysis, CardDef } from './types.ts';
import { validateCard } from './validate.ts';

export function analyzeCard(card: CardDef): CardAnalysis {
  const points = calculatePoints(card);
  const violations = validateCard(card, points);
  return {
    base: cardBase(card),
    cardType: classifyCard(card),
    isCurse: isCurseCard(card),
    points,
    text: describeCard(card),
    violations,
    valid: violations.length === 0,
  };
}
