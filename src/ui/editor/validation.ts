/**
 * 違反理由（violation.path）と入力欄の対応。
 * 入力欄には fieldId(path) の id を付け、「理由を見る」はその id へスクロールする。
 */
import { getEffect, type CardDef, type Violation } from '../../engine/index.ts';

export const fieldId = (path: string): string => `ed-f-${path.replace(/\./g, '-')}`;

/** path の親をたどって、最初に見つかった要素を返す（'effects.1.value' → 'effects.1' → 'effects'） */
export function findFieldElement(path: string): HTMLElement | null {
  const parts = path.split('.');
  for (let i = parts.length; i > 0; i--) {
    const el = document.getElementById(fieldId(parts.slice(0, i).join('.')));
    if (el) return el;
  }
  return null;
}

/** その入力欄（と、その下の欄）に関する違反 */
export const violationsAt = (vs: readonly Violation[], path: string): Violation[] => vs.filter((v) => v.path === path || v.path?.startsWith(`${path}.`));

/** ちょうどその入力欄の違反だけ */
export const violationsExactly = (vs: readonly Violation[], path: string): Violation[] => vs.filter((v) => v.path === path);

/**
 * 効果の行ごとの違反。engine は「1枚のダメージ合計」「効果の数」を effects 全体の違反（path='effects'）として返すので、
 * ここで該当する行（ダメージ系の行／上限を超えた行）に割り当てる。
 */
export function effectRowViolations(vs: readonly Violation[], card: CardDef, index: number, maxEffects: number): Violation[] {
  const own = violationsAt(vs, `effects.${index}`);
  const e = card.effects[index];
  const shared = vs.filter((v) => v.path === 'effects').filter((v) => {
    if (v.code === 'DAMAGE_TOO_MUCH') return e !== undefined && getEffect(e.id)?.isDamage === true;
    if (v.code === 'EFFECT_TOO_MANY') return index >= maxEffects;
    return false;
  });
  return [...own, ...shared];
}

/** 効果の行に割り当てなかった、効果全体の違反（「効果が1つ以上必要」など） */
export function effectSectionViolations(vs: readonly Violation[]): Violation[] {
  return vs.filter((v) => v.path === 'effects' && v.code !== 'DAMAGE_TOO_MUCH' && v.code !== 'EFFECT_TOO_MANY');
}
