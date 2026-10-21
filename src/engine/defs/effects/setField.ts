import { BALANCE } from '../../balance.ts';
import { defineEffect, optionOf } from '../../define.ts';
import { ACTIVE_FIELD_IDS, DISABLED_FIELD_IDS, FIELDS, fieldEnabled, isFieldId, type FieldId } from '../../fields.ts';

const B = BALANCE.effects.setField;
// description はエディターの選択パネル（OptionPicker）が1行の説明に使う
const choice = (id: FieldId) => ({ id, label: `${FIELDS[id].icon}${FIELDS[id].name}`, description: FIELDS[id].description });
const option = {
  label: 'フィールド',
  // 見送り中のフィールド（闘技場。決定事項 #102）は選べない。保存済みのカードに残っていたら違反 OPTION_RETIRED
  choices: ACTIVE_FIELD_IDS.map(choice),
  default: ACTIVE_FIELD_IDS[0]!,
  retired: DISABLED_FIELD_IDS.map((id) => ({ ...choice(id), reason: '見送り中のフィールド' })),
};
const fieldOf = (e: { option?: string }): FieldId => {
  const id = optionOf({ option }, e);
  return isFieldId(id) ? id : option.default;
};

// フィールド：MTG #19（ワールド）。両者に効く場の効果を選んだものに置き換える（場に1つだけ・後から置いた方が上書き）
export default defineEffect({
  id: 'setField',
  name: 'フィールド',
  group: 'buff',
  order: 92,
  summary: `フィールド（両者に効く場の効果：${ACTIVE_FIELD_IDS.map((id) => FIELDS[id].name).join('・')}）を選んだものにする。場に1つだけで、後から置いた方が上書きする（次元が「移り変わる」対戦では次の切り替えまで）`,
  option,
  targetRule: 'self',
  timings: ['play', 'summon', 'fromDiscard'],
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: (e) => `フィールドを「${FIELDS[fieldOf(e)].name}」（${FIELDS[fieldOf(e)].description}）にする`,
  shortValue: (e) => `（${FIELDS[fieldOf(e)].name}）`,
  battle: {
    resolve(rt, e) {
      const id = fieldOf(e);
      // 見送り中のフィールドは置かない（検証で違反なのでデッキには入らないが、見送り前に始まった対戦の途中保存のため）
      if (!fieldEnabled(id)) {
        rt.log(`「${FIELDS[id].name}」は今は使えないフィールドなので、何も起きない`);
        return;
      }
      rt.setField(id);
    },
  },
});
