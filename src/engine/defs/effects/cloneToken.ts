import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';
import { ARMY_CARD_ID } from '../../battle/types.ts';

const B = BALANCE.effects.cloneToken;

// 複写召喚：MTG #635（クローン）。相手モンスター1体のコピー（トークン）を自分の場に出す。印刷された強さ・効果・キーワードを写す
export default defineEffect({
  id: 'cloneToken',
  name: '複写召喚',
  group: 'special',
  order: 71.6,
  summary: '相手モンスター1体のコピー（トークン）を自分の場に出す。印刷された強さ・効果・キーワードを写し、召喚時の効果も出る（受けたダメージ・強化・装備は写さない。軍団は写せない。エピック以上）',
  targetRule: 'enemyMonsterOne',
  minRarity: 'epic',
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: (_e, c) => `${c.target}のコピー（トークン）を自分の場に出す`,
  battle: {
    resolve(rt) {
      // 連鎖の防止：トークン（コピー）からは出さない
      if (rt.src.token) {
        rt.log('トークンは複写できない');
        return;
      }
      for (const t of rt.targets) {
        const m = rt.monster(t);
        if (!m) continue;
        if (m.card.cardId === ARMY_CARD_ID) {
          rt.log('軍団は写せない');
          continue;
        }
        const stats = m.card.token ?? rt.cardDef(m.card.cardId)?.stats;
        if (!stats) continue;
        // 小鬼（ふつうのトークン）を写したら、ふつうのトークン
        const copy = m.card.token ? m.card.token.copy === true : true;
        rt.createToken(rt.controller, m.card.cardId, { attack: stats.attack, hp: stats.hp, defense: stats.defense ?? 0, ...(copy ? { copy: true } : {}) });
      }
    },
  },
});
