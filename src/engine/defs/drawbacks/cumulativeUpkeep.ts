import { BALANCE } from '../../balance.ts';
import { defineDrawback, n, valueParam } from '../../define.ts';

const B = BALANCE.drawbacks.cumulativeUpkeep;
/** N の下限（倍率1では1） */
const min = Math.max(1, Math.ceil(B.minValue));

// 累加維持費：MTG #222（累加アップキープ）。自分のターン開始時に、場にあるターン数×N のダメージを自分に受ける（毎ターン増える）
export default defineDrawback({
  id: 'cumulativeUpkeep',
  name: '累加維持費',
  order: 20,
  summary: `場にある間、自分のターン開始時に「場にあるターン数×N」のダメージを自分に受ける（毎ターン1ずつ増え、${B.maxAge}で止まる。モンスターとパワーのカードだけ。倍率込みの固定値）`,
  value: valueParam('N', { min, max: B.maxValue, default: 1 }),
  fixed: true,
  cardTypes: ['monster', 'power', 'powerAttack'],
  basePoints: (d) => B.perValue * n(d),
  baseFormula: (d) => `${n(d)}×${B.perValue}（固定）`,
  describe: (d) => `累加維持費${n(d)}（自分のターン開始時、場にあるターン数×${n(d)}のダメージを受ける）`,
  battle: {
    onBoardTurnStart(rt, d, m) {
      const age = Math.min((m.counters.age ?? 0) + 1, B.maxAge);
      m.counters.age = age;
      rt.log(`「${rt.cardName(m.card.cardId)}」の累加維持費（${age}ターン目）`);
      rt.selfDamage(age * n(d));
    },
    onPowerTurnStart(rt, d, pw) {
      const age = Math.min((pw.age ?? 0) + 1, B.maxAge);
      pw.age = age;
      rt.log(`パワー『${pw.name}』の累加維持費（${age}ターン目）`);
      rt.selfDamage(age * n(d));
    },
  },
});
