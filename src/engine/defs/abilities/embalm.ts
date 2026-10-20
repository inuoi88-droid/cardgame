import { BALANCE } from '../../balance.ts';
import { countParam, defineAbility, n, optionOf, type AbilityPointContext } from '../../define.ts';
import { round2 } from '../../math.ts';

const B = BALANCE.abilities.embalm;
const rate = (a: { value?: number }) => B.rate[Math.min(Math.max(n(a) - 1, 0), B.rate.length - 1)]!;
const body = (ctx: AbilityPointContext) => ctx.bodyPoints + ctx.playEffectPoints;
/** 永遠なら足す固定のポイント */
const eternalFlat = (a: { option?: string }) => (isEternal(a) ? B.eternalFlat : B.flat);
const OPTION = {
  label: '種類',
  choices: [
    { id: 'embalm', label: '不朽（そのままのコピー）' },
    { id: 'eternal', label: `永遠（攻撃力${B.eternalStats}・体力${B.eternalStats}のコピー）` },
  ],
  default: 'embalm',
} as const;
export const isEternal = (a: { option?: string }) => optionOf({ option: OPTION }, a) === 'eternal';

// 不朽：MTG #336・#337（不朽・永遠）。自分のターンに、捨て札のこのカードをエナジー K で除外し、コピー（トークン）を出す
export default defineAbility({
  id: 'embalm',
  name: '不朽',
  order: 41,
  group: '手札・捨て札の能力',
  summary: `モンスター：自分のターンに、捨て札のこのカードをエナジーKで除外し、コピー（トークン。召喚時の効果も出る）を出す。永遠を選ぶとコピーは攻撃力${B.eternalStats}・体力${B.eternalStats}。ポイントは本体×${B.rate.join('／')}（K＝1〜3）、永遠は+${B.eternalFlat}`,
  value: countParam('エナジー', { min: 1, max: B.rate.length, default: 1 }),
  option: OPTION,
  cardTypes: ['monster'],
  points: (a, ctx) => body(ctx) * rate(a) + eternalFlat(a),
  formula: (a, ctx) => `本体${round2(body(ctx))}×${rate(a)}${isEternal(a) ? `＋${B.eternalFlat}` : ''}`,
  displayName: (a) => `${isEternal(a) ? '永遠' : '不朽'}${n(a)}`,
  describe: (a) =>
    isEternal(a)
      ? `捨て札からエナジー${n(a)}で除外し、攻撃力${B.eternalStats}・体力${B.eternalStats}のコピーを出す`
      : `捨て札からエナジー${n(a)}で除外し、コピーを出す`,
  battle: { discardAbility: { kind: 'embalm', cost: (a) => n(a) } },
});
