import { BALANCE } from '../../balance.ts';
import { defineKeyword } from '../../define.ts';

const B = BALANCE.keywords.taunt;

export default defineKeyword({
  id: 'taunt',
  name: '挑発',
  order: 2,
  summary: 'このモンスターがいる限り、相手はモンスターの攻撃でもカードの効果でも、このモンスターしか選べない（ランダム・全体には効かない）',
  points: () => B.flat,
  formula: () => `${B.flat}`,
  displayName: () => '挑発',
  describe: () => '相手はモンスターの攻撃でもカードの効果でも、このモンスターしか選べない',
  battle: { taunt: true },
});
