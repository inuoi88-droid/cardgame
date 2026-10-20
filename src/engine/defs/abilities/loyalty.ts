import { BALANCE } from '../../balance.ts';
import { countParam, defineAbility, n } from '../../define.ts';
import { loyaltySpec } from '../../options.ts';

const B = BALANCE.abilities.loyalty;
const CUTS = Array.from({ length: B.maxCut - B.minCut + 1 }, (_, i) => ({ id: String(B.minCut + i), label: `−${B.minCut + i}` }));

// 忠誠：MTG #8（プレインズウォーカー）。パワーのカード：忠誠 L で場に出る。自分のターンに1回「忠誠+1」か「忠誠−K」の効果を使う
export default defineAbility({
  id: 'loyalty',
  name: '忠誠',
  order: 63,
  group: '達成・Lv・忠誠',
  summary: `パワーのカード：忠誠Lで場に出る。自分のターンに1回、「忠誠+1」（忠誠+1・最大${BALANCE.battle.loyaltyMax}）か「忠誠−K」（忠誠がK以上のとき）の効果を使う。忠誠が0になると消える。相手のモンスターの攻撃で自分のHPが減ると忠誠−1（プレインズウォーカーのアレンジ）。能力は0pt（タイミングの倍率で払う）`,
  value: countParam('忠誠', { min: B.minLoyalty, max: B.maxLoyalty, default: 3 }),
  option: { label: '大技の忠誠', choices: CUTS, default: '3' },
  cardTypes: ['power', 'powerAttack'],
  conflicts: ['levelUp', 'quest', 'charge', 'trap', 'emblem', 'altWin'],
  noSaga: true,
  requiresAnyTiming: ['loyaltyPlus', 'loyaltyMinus'],
  points: () => B.flat,
  formula: () => '0（「忠誠+1」「忠誠−K」の効果の倍率に含む）',
  displayName: (a) => `忠誠${n(a)}`,
  describe: (a) => `忠誠${n(a)}で出る（+1：忠誠を1増やして使う／−${loyaltySpec([a]).cut}：忠誠を減らして使う。どちらか1ターン1回）`,
  battle: { loyalty: { start: (a) => n(a), cut: (a) => loyaltySpec([a]).cut } },
});
