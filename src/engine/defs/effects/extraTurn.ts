import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.extraTurn;

// 追加ターン：MTG #90。このターンのあと、もう一度自分のターンを行う（レジェンドのみ・1試合1回・使用時だけ）
export default defineEffect({
  id: 'extraTurn',
  name: '追加ターン',
  group: 'special',
  order: 91,
  summary:
    'このターンのあと、もう一度自分のターンを行う（レジェンドのみ。1試合1回、2回目は不発。使用時・捨て札から使ったときだけ。犠牲・反復・続唱・待機で無料で使ったときは不発）',
  targetRule: 'self',
  minRarity: 'legend',
  timings: ['play', 'fromDiscard'],
  bases: ['spell'],
  noDelay: true,
  noCopy: true,
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: () => 'このターンのあと、追加のターンを得る',
  battle: {
    resolve(rt) {
      rt.extraTurn();
    },
  },
});
