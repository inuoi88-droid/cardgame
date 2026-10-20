import { BALANCE } from '../../balance.ts';
import { defineEffect, optionOf } from '../../define.ts';
import { classifyCard } from '../../classify.ts';
import { CARD_TYPE_LABEL } from '../../labels.ts';
import { CARD_TYPES, type CardDef } from '../../types.ts';

/** 探す種類に合うか（「同じ種族」は出どころのカードの種族と同じ。「同じコスト」は出どころのカードの印刷コストと同じ：MTG 要素 △ バッチB） */
function matches(def: CardDef, want: string | undefined, src: CardDef | undefined): boolean {
  if (want === 'tribe') return src?.tribe !== undefined && def.tribe === src.tribe;
  if (want === 'sameCost') return src !== undefined && def.cost === src.cost;
  return classifyCard(def) === want;
}

const B = BALANCE.effects.seek;
// 「同じ種族」（MTG 要素 ○ バッチC2）：このカードと同じ種族のカード（種族のあるカードだけ）
// 「このカードと同じコスト」（MTG 要素 △ バッチB：変成＝魂力＋この指定）
const choices = [
  ...CARD_TYPES.map((t) => ({ id: t as string, label: CARD_TYPE_LABEL[t] })),
  { id: 'tribe', label: '同じ種族' },
  { id: 'sameCost', label: 'このカードと同じコスト' },
];
const option = { label: '探す種類', choices, default: 'monster' };
const typeLabel = (e: { option?: string }) => choices.find((c) => c.id === optionOf({ option }, e))?.label ?? '？';

// 抽出：MTG #550。山札から指定した種類のカードを1枚ランダムに手札へ（山札は見ない・順番は変えない）
export default defineEffect({
  id: 'seek',
  name: '抽出',
  group: 'resource',
  order: 54.5,
  summary: '山札から、指定した種類のカードを1枚ランダムに手札に加える（山札は見ない・順番は変えない。引いた扱いではない）',
  option,
  targetRule: 'self',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: (e) => `山札から${typeLabel(e)}のカードを1枚ランダムに手札に加える`,
  shortValue: (e) => typeLabel(e),
  battle: {
    resolve(rt, e) {
      const want = optionOf({ option }, e);
      const pool = rt.player(rt.controller).deck.filter((c) => {
        const def = rt.cardDef(c.cardId);
        return def !== undefined && matches(def, want, rt.cardDef(rt.src.cardId));
      });
      if (pool.length === 0) {
        rt.log(`山札に${typeLabel(e)}のカードがない`);
        return;
      }
      rt.seekFromDeck(rt.controller, pool[rt.randInt(pool.length)]!.uid);
    },
  },
});
