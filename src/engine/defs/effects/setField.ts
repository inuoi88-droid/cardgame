import { BALANCE } from '../../balance.ts';
import { defineEffect, optionOf } from '../../define.ts';
import { FIELDS, FIELD_IDS, isFieldId, type FieldId } from '../../fields.ts';

const B = BALANCE.effects.setField;
const option = {
  label: 'フィールド',
  // description はエディターの選択パネル（OptionPicker）が1行の説明に使う
  choices: FIELD_IDS.map((id) => ({ id, label: `${FIELDS[id].icon}${FIELDS[id].name}`, description: FIELDS[id].description })),
  default: FIELD_IDS[0],
};
const fieldOf = (e: { option?: string }): FieldId => {
  const id = optionOf({ option }, e);
  return isFieldId(id) ? id : FIELD_IDS[0];
};

// フィールド：MTG #19（ワールド）。両者に効く場の効果を選んだものに置き換える（場に1つだけ・後から置いた方が上書き）
export default defineEffect({
  id: 'setField',
  name: 'フィールド',
  group: 'buff',
  order: 92,
  summary: `フィールド（両者に効く場の効果：${FIELD_IDS.map((id) => FIELDS[id].name).join('・')}）を選んだものにする。場に1つだけで、後から置いた方が上書きする（次元が「移り変わる」対戦では次の切り替えまで）`,
  option,
  targetRule: 'self',
  timings: ['play', 'summon', 'fromDiscard'],
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: (e) => `フィールドを「${FIELDS[fieldOf(e)].name}」（${FIELDS[fieldOf(e)].description}）にする`,
  shortValue: (e) => `（${FIELDS[fieldOf(e)].name}）`,
  battle: {
    resolve(rt, e) {
      rt.setField(fieldOf(e));
    },
  },
});
