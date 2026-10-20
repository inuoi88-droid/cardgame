import { BALANCE } from '../../balance.ts';
import { defineKeyword } from '../../define.ts';

const B = BALANCE.keywords.enlist;

// 後援：MTG #362。攻撃するとき、まだ攻撃できる自分の他のモンスター1体を休ませて、その攻撃力ぶんこの攻撃を強くしてよい
export default defineKeyword({
  id: 'enlist',
  name: '後援',
  order: 23,
  summary: '攻撃するとき、まだ攻撃できる自分の他のモンスター1体を休ませて（このターン攻撃できなくなる）、その攻撃力ぶんこの1回の攻撃を強くしてよい（反撃の計算には足さない）',
  points: () => B.flat,
  formula: () => `${B.flat}`,
  displayName: () => '後援',
  describe: () => '攻撃するとき、まだ攻撃できる自分の他のモンスター1体を休ませて、その攻撃力ぶんこの攻撃を強くしてよい',
  battle: { enlist: true },
});
