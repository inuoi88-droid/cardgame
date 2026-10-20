import { BALANCE } from '../../balance.ts';
import { countParam, defineAbility, n } from '../../define.ts';
import { fromDiscardPoints } from './flashback.ts';

const B = BALANCE.abilities.harmonize;
const rate = (a: { value?: number }) => B.rate[Math.min(Math.max(n(a), 0), B.rate.length - 1)]!;

// 調和：MTG #388。捨て札から、今の実コスト+N で使える。まだ攻撃できる自分のモンスター1体を休ませると、攻撃力に応じて安くなる。使ったら除外
export default defineAbility({
  id: 'harmonize',
  name: '調和',
  order: 36,
  group: '捨て札から',
  summary: `捨て札から、コスト+Nで使える。まだ攻撃できる自分のモンスター1体を休ませると、その攻撃力${B.attackPerEnergy}ごとにコスト−1（最大−${B.maxCut}）。使ったあとは除外。ポイントは効果・本体の合計×${B.rate.join('／')}（N＝0〜2）`,
  value: countParam('追加コスト', { min: 0, max: B.rate.length - 1, default: 0 }),
  points: (a, ctx) => fromDiscardPoints(ctx, rate(a), B.fromDiscardFlat).value,
  formula: (a, ctx) => fromDiscardPoints(ctx, rate(a), B.fromDiscardFlat).formula,
  displayName: (a) => (n(a) > 0 ? `調和+${n(a)}` : '調和'),
  describe: (a) => `捨て札から使える${n(a) > 0 ? `（コスト+${n(a)}）` : ''}。モンスターを休ませると安くなる。使ったら除外`,
  battle: { fromDiscard: { exileAfter: true, extraCost: (a) => n(a), tapOne: { perEnergy: B.attackPerEnergy, maxCut: B.maxCut } } },
});
