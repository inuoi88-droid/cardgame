import { BALANCE } from '../../balance.ts';
import { countParam, defineEffect, n } from '../../define.ts';

const B = BALANCE.effects.borrow;

// 借用：MTG #127・#636（オーナーとコントローラー・コントロール奪取）。相手モンスター1体を N ターンの間自分の場に移す
export default defineEffect({
  id: 'borrow',
  name: '借用',
  group: 'special',
  order: 73.5,
  summary: '相手モンスター1体をNターンの間自分の場に移す（すぐ攻撃できる）。自分のターン終了時に数え、期限で元の持ち主に戻る（レア以上）',
  value: countParam('ターン', { min: 1, max: B.byTurns.length, default: 1 }),
  targetRule: 'enemyMonsterOne',
  minRarity: 'rare',
  basePoints: (e) => B.byTurns[Math.min(B.byTurns.length, Math.max(1, n(e))) - 1]!,
  baseFormula: (e) => `${B.byTurns[Math.min(B.byTurns.length, Math.max(1, n(e))) - 1]}（${n(e)}ターン）`,
  describe: (e, c) => `${c.target}を${n(e)}ターンの間奪う（すぐ攻撃できる。期限が来たら持ち主に戻す）`,
  shortValue: (e) => `${n(e)}ターン`,
  battle: {
    resolve(rt, e) {
      for (const t of rt.targets) rt.borrow(t, n(e));
    },
  },
});
