import { BALANCE } from '../../balance.ts';
import { countParam, defineAbility, n } from '../../define.ts';

const B = BALANCE.abilities.foretell;

// 予顕：MTG #351。自分のターンにエナジー2でこのカードを裏向きで待機させ、後のターンにコスト−K で使う
export default defineAbility({
  id: 'foretell',
  name: '予顕',
  order: 50,
  group: '待機ゾーン',
  summary: `自分のターンにエナジー${B.setCost}を払って、このカードを裏向きで待機ゾーンに置ける（相手には見えない）。後の自分のターンに待機ゾーンからコスト−K（0まで）で使える。ポイントは${B.base}＋(K−1)×${B.perCut}`,
  value: countParam('軽減', { min: 1, max: B.maxCut, default: 1 }),
  points: (a) => B.base + (n(a) - 1) * B.perCut,
  formula: (a) => `${B.base}＋(${n(a)}−1)×${B.perCut}`,
  displayName: (a) => `予顕−${n(a)}`,
  describe: (a) => `エナジー${B.setCost}で伏せ、後のターンにコスト−${n(a)}で使う`,
  battle: { setAside: { kind: 'foretell', setCost: () => B.setCost, cut: (a) => n(a) } },
});
