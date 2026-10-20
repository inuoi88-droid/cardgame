import { BALANCE } from '../../balance.ts';
import { defineKeyword } from '../../define.ts';

const B = BALANCE.keywords.hexproof;

// 呪禁：MTG #206・#128。相手のカードの「選んだ1体」にならない（攻撃・ランダム・全体は当たる）
export default defineKeyword({
  id: 'hexproof',
  name: '呪禁',
  order: 11,
  summary: '相手がカードを使うときに選ぶ対象（選んだ1体）にならない。モンスターの攻撃・ランダム・全体の効果は受ける',
  points: () => B.flat,
  formula: () => `${B.flat}`,
  displayName: () => '呪禁',
  describe: () => '相手がカードを使うときに選ぶ対象（選んだ1体）にならない',
  battle: { hexproof: true },
});
