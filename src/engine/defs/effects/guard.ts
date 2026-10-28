import { BALANCE } from '../../balance.ts';
import { defineEffect, optionOf } from '../../define.ts';

const B = BALANCE.effects.guard;
const option = {
  label: '守り方',
  choices: [{ id: 'protection', label: '加護（ダメージを受けず、相手のカードに選ばれない）' }],
  default: 'protection',
  // 不壊は挑発との組み合わせが強すぎたので削除（決定事項 #146。保存済みのカードは違反になる。処理は残す）
  retired: [{ id: 'indestructible', label: '不壊', reason: '挑発との組み合わせが強すぎたため削除しました' }],
};
const kind = (e: { option?: string }): 'indestructible' | 'protection' => (optionOf({ option }, e) === 'protection' ? 'protection' : 'indestructible');
const NAME = { indestructible: '不壊', protection: '加護' } as const;

// 守護：MTG #208・#212（破壊不能・プロテクション）。次の自分のターン開始まで、不壊か加護
export default defineEffect({
  id: 'guard',
  name: '守護',
  group: 'defense',
  order: 74.7,
  summary:
    '自分のモンスターを次の持ち主のターン開始まで守る（加護）：すべてのダメージが0になり、相手のカードの「選んだ1体」にならない',
  option,
  targetRule: 'allyMonsterOne',
  basePoints: (e) => B[kind(e)],
  baseFormula: (e) => `${B[kind(e)]}（${NAME[kind(e)]}）`,
  describe: (e, c) => `次の持ち主のターン開始まで、${c.target}に${NAME[kind(e)]}を与える`,
  shortValue: (e) => `（${NAME[kind(e)]}）`,
  battle: {
    resolve(rt, e) {
      for (const t of rt.targets) rt.markMonster(t, kind(e));
    },
  },
});
