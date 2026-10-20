import { BALANCE } from '../../balance.ts';
import { defineEffect, optionOf } from '../../define.ts';

const B = BALANCE.effects.quash;
const option = {
  label: '種類',
  choices: [
    { id: 'any', label: 'カード（すべて）' },
    { id: 'attack', label: 'アタック' },
    { id: 'skill', label: 'スキル' },
    { id: 'monster', label: 'モンスター' },
    { id: 'power', label: 'パワー' },
  ],
  default: 'any',
};
const kindOf = (e: { option?: string }) => optionOf({ option }, e) ?? 'any';
const kindLabel = (e: { option?: string }) => {
  const id = kindOf(e);
  return id === 'any' ? '' : `${option.choices.find((c) => c.id === id)?.label ?? ''}の`;
};

// 封殺：MTG #410・#601（打ち消す・打ち消し）。相手が次に使うカード1枚（指定の種類）を無効にする予約。割り込みは無い
export default defineEffect({
  id: 'quash',
  name: '封殺',
  group: 'disrupt',
  order: 66.5,
  summary: '相手が次に使うカード1枚（指定の種類）を無効にする（コストは払わせ、何も起きない）。相手の次のターンの終わりまで。相手に見える。浄化で消える（レア以上）',
  option,
  targetRule: 'enemyPlayer',
  minRarity: 'rare',
  basePoints: (e) => (kindOf(e) === 'any' ? B.any : B.typed),
  baseFormula: (e) => `${kindOf(e) === 'any' ? B.any : B.typed}`,
  describe: (e) => `相手が次に使う${kindLabel(e)}カード1枚を無効にする（相手の次のターンの終わりまで）`,
  shortValue: (e) => (kindOf(e) === 'any' ? '' : `（${option.choices.find((c) => c.id === kindOf(e))?.label}）`),
  battle: {
    resolve(rt, e) {
      rt.addQuash(rt.opponent, kindOf(e));
    },
  },
});
