import { BALANCE } from '../../balance.ts';
import { defineEffect, optionOf } from '../../define.ts';
import { classifyCard } from '../../classify.ts';
import { CARD_TYPE_LABEL } from '../../labels.ts';
import { CARD_TYPES } from '../../types.ts';

const B = BALANCE.effects.seek;
const choices = CARD_TYPES.map((t) => ({ id: t, label: CARD_TYPE_LABEL[t] }));
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
        return def !== undefined && classifyCard(def) === want;
      });
      if (pool.length === 0) {
        rt.log(`山札に${typeLabel(e)}のカードがない`);
        return;
      }
      rt.seekFromDeck(rt.controller, pool[rt.randInt(pool.length)]!.uid);
    },
  },
});
