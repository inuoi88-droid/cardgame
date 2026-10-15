import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';
import { CARD_TYPE_LABEL } from '../../labels.ts';
import { CARD_TYPES } from '../../types.ts';

const B = BALANCE.effects.search;
const choices = CARD_TYPES.map((t) => ({ id: t, label: CARD_TYPE_LABEL[t] }));
const typeLabel = (option?: string) => choices.find((c) => c.id === option)?.label ?? '？';

export default defineEffect({
  id: 'search',
  name: 'サーチ',
  group: 'resource',
  order: 54,
  summary: '山札から、指定した種類のカードを1枚選んで手札に加える',
  option: { label: '探す種類', choices, default: 'monster' },
  targetRule: 'self',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: (e) => `山札から${typeLabel(e.option)}のカードを1枚選んで手札に加える`,
  shortValue: (e) => typeLabel(e.option),
});
