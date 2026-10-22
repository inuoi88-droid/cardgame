import { BALANCE } from '../../balance.ts';
import { countParam, defineEffect, n, optionOf, valueParam } from '../../define.ts';
import { CONJURE_PREFIX } from '../../battle/types.ts';
import type { CardDef, EffectInstance } from '../../types.ts';

const B = BALANCE.effects.conjure;
const E = BALANCE.effects;
/** 作れるカード：名前・アイコン・元の効果（基礎ポイントはその効果の perValue） */
const KINDS = {
  fireball: { label: '火の玉', icon: 'gi:fireball', perValue: E.damage.perValue, text: (v: number) => `相手1体に${v}ダメージ` },
  potion: { label: '薬', icon: 'gi:round-potion', perValue: E.heal.perValue, text: (v: number) => `HPを${v}回復` },
  ward: { label: '盾', icon: 'gi:magic-shield', perValue: E.shield.perValue, text: (v: number) => `シールド${v}` },
} as const;
type Kind = keyof typeof KINDS;
const option = { label: '作るカード', choices: (Object.keys(KINDS) as Kind[]).map((id) => ({ id, label: KINDS[id].label })), default: 'fireball' };
const kindOf = (e: { option?: string }): Kind => {
  const id = optionOf({ option }, e) as Kind;
  return id in KINDS ? id : 'fireball';
};
const count = (e: { hits?: number }) => e.hits ?? 1;

/** 作るカードの定義（コスト0・コモン・効果1つ。g.cards のキーは種類と数値で決まる） */
export function conjuredCard(kind: Kind, value: number): CardDef {
  const k = KINDS[kind];
  const effect: EffectInstance =
    kind === 'fireball'
      ? { id: 'damage', value, timing: 'play', target: 'chosen', condition: null }
      : { id: kind === 'potion' ? 'heal' : 'shield', value, timing: 'play', target: 'self', condition: null };
  return {
    v: 1,
    id: `${CONJURE_PREFIX}${kind}:${value}`,
    name: k.label,
    icon: k.icon,
    rarity: 'common',
    cost: 0,
    stats: null,
    keywords: [],
    effects: [effect],
    drawbacks: [],
  };
}

// 創出：MTG #551。手札に使い切りのカード（コスト0）を M 枚作る：火の玉（相手1体にNダメージ）／薬（N回復）／盾（シールドN）
export default defineEffect({
  id: 'conjure',
  name: '創出',
  group: 'resource',
  order: 59.5,
  summary: '手札に使い切りのカード（コスト0。使うかターン終了で除外）をM枚作る：火の玉（相手1体にNダメージ）／薬（HPをN回復）／盾（シールドN）',
  value: valueParam('量', { default: 1, max: B.maxValue }),
  hits: countParam('枚数', { min: 1, max: B.maxCards, default: 1 }),
  option,
  targetRule: 'self',
  basePoints: (e) => (KINDS[kindOf(e)].perValue * n(e) * B.rate + B.flat) * count(e),
  baseFormula: (e) => `(${KINDS[kindOf(e)].perValue}×${n(e)}×${B.rate}+${B.flat})×${count(e)}`,
  describe: (e) => `手札に「${KINDS[kindOf(e)].label}：${KINDS[kindOf(e)].text(n(e))}」（コスト0・使い切り）を${count(e)}枚加える`,
  shortValue: (e) => `${KINDS[kindOf(e)].label}${n(e)}×${count(e)}`,
  battle: {
    resolve(rt, e) {
      rt.conjure(rt.controller, conjuredCard(kindOf(e), n(e)), count(e));
    },
  },
});
