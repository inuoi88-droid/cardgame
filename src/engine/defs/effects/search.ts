import { BALANCE } from '../../balance.ts';
import { defineEffect, optionOf } from '../../define.ts';
import { classifyCard } from '../../classify.ts';
import { CARD_TYPE_LABEL } from '../../labels.ts';
import { CARD_TYPES, type CardDef } from '../../types.ts';

/** 探す種類に合うか（「同じ種族」は出どころのカードの種族と同じ） */
function matches(def: CardDef, want: string | undefined, tribe: CardDef['tribe']): boolean {
  if (want === 'tribe') return tribe !== undefined && def.tribe === tribe;
  return classifyCard(def) === want;
}

const B = BALANCE.effects.search;
// 「同じ種族」（MTG 要素 ○ バッチC2）：このカードと同じ種族のカード（種族のあるカードだけ）
const choices = [...CARD_TYPES.map((t) => ({ id: t as string, label: CARD_TYPE_LABEL[t] })), { id: 'tribe', label: '同じ種族' }];
const option = { label: '探す種類', choices, default: 'monster' };
const typeLabel = (e: { option?: string }) => choices.find((c) => c.id === optionOf({ option }, e))?.label ?? '？';

export default defineEffect({
  id: 'search',
  name: 'サーチ',
  group: 'resource',
  order: 54,
  summary: '山札から、指定した種類のカードを1枚選んで手札に加える',
  option,
  targetRule: 'self',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: (e) => `山札から${typeLabel(e)}のカードを1枚選んで手札に加える`,
  shortValue: (e) => typeLabel(e),
  battle: {
    choose(rt, e) {
      const want = optionOf({ option }, e);
      return {
        prompt: `山札から手札に加える${typeLabel(e)}のカードを選んでください`,
        options: rt
          .player(rt.controller)
          .deck.filter((c) => {
            const def = rt.cardDef(c.cardId);
            return def !== undefined && matches(def, want, rt.cardDef(rt.src.cardId)?.tribe);
          })
          .map((c) => ({ id: c.uid, label: rt.cardName(c.cardId), cardId: c.cardId })),
        min: 1,
        max: 1,
      };
    },
    resolve(rt, _e, picks) {
      if (picks?.[0]) rt.takeFromDeck(rt.controller, picks[0]);
    },
  },
});
