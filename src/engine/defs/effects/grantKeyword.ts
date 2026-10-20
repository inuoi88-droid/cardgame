import { BALANCE } from '../../balance.ts';
import { defineEffect, optionOf } from '../../define.ts';
import { getKeyword } from '../../registry.ts';

const B = BALANCE.effects.grantKeyword;
type GrantId = keyof typeof B;
/** 与えられるキーワード（二回攻撃・隠密・数値つきは出さない） */
const IDS = Object.keys(B) as GrantId[];
const NAMES: Record<GrantId, string> = {
  haste: '速攻',
  taunt: '挑発',
  flying: '飛行',
  trample: '貫通',
  undying: '不屈',
  deathtouch: '接死',
  lifelink: '絆魂',
  divineShield: '聖盾',
  hexproof: '呪禁',
  firstStrike: '先制攻撃',
};
const option = { label: 'キーワード', choices: IDS.map((id) => ({ id, label: NAMES[id] })), default: 'taunt' };
const pick = (e: { option?: string }): GrantId => {
  const id = optionOf({ option }, e) as GrantId;
  return IDS.includes(id) ? id : 'taunt';
};
const nameOf = (e: { option?: string }) => getKeyword(pick(e))?.name ?? NAMES[pick(e)];

// キーワード付与：MTG #142・#174・#200。自分のモンスターにキーワードを与える（場を離れると消える）
export default defineEffect({
  id: 'grantKeyword',
  name: 'キーワード付与',
  group: 'buff',
  order: 47,
  summary: '自分のモンスターにキーワードを与える（場にいる間ずっと。封印中は働かない）。ポイントはキーワードごと',
  option,
  targetRule: 'allyMonsterOne',
  basePoints: (e) => B[pick(e)],
  baseFormula: (e) => `${B[pick(e)]}（${nameOf(e)}）`,
  describe: (e, c) => `${c.target}に${nameOf(e)}を与える`,
  shortValue: (e) => `（${nameOf(e)}）`,
  battle: {
    resolve(rt, e) {
      for (const t of rt.targets) rt.grantKeyword(t, pick(e));
    },
  },
});
