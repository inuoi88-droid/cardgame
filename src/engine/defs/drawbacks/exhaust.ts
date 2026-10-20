import { BALANCE } from '../../balance.ts';
import { defineDrawback } from '../../define.ts';

const B = BALANCE.drawbacks.exhaust;

// 廃棄：MTG #73。使ったあと、捨て札ではなく除外される（1試合に1回だけ使える）
export default defineDrawback({
  id: 'exhaust',
  name: '廃棄',
  order: 14,
  summary: '使ったあと、捨て札ではなく除外される（アタックとスキルのカードだけ。倍率込みの固定値）',
  fixed: true,
  cardTypes: ['attack', 'skill'],
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}（固定）`,
  describe: () => '使ったあと、捨て札ではなく除外される',
  battle: { exhaust: true },
});
