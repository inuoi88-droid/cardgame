import { BALANCE } from '../../balance.ts';
import { defineAbility } from '../../define.ts';

const B = BALANCE.abilities.shuffleBack;

// 循環：MTG #61（前兆）。使ったあと、捨て札ではなく山札のランダムな位置に混ぜる
export default defineAbility({
  id: 'shuffleBack',
  name: '循環',
  order: 1,
  group: '使い終わり',
  summary: '使ったあと、捨て札ではなく山札のランダムな位置に混ぜる（同じカードは1ターン1回。アタック・スキルのカードだけ。再利用・反復・廃棄とは同時に付けられない）',
  cardTypes: ['attack', 'skill'],
  conflicts: ['buyback', 'rebound', 'exhaust'],
  points: () => B.flat,
  formula: () => `${B.flat}（固定）`,
  displayName: () => '循環',
  describe: () => '使ったあと、捨て札ではなく山札に混ぜる（1ターン1回）',
  battle: { afterUse: 'shuffle' },
});
