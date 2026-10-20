import { BALANCE } from '../../balance.ts';
import { defineEffect } from '../../define.ts';

const B = BALANCE.effects.suspect;

// 容疑：MTG #193・#464（容疑をかけられた・容疑をかける）。攻撃力+、挑発を失い、反撃しない。攻撃したときは反撃を受けない
export default defineEffect({
  id: 'suspect',
  name: '容疑',
  group: 'disrupt',
  order: 74.6,
  summary: `モンスター1体に容疑をかける：攻撃力+${B.attack}、挑発を失い、攻撃されても反撃しない。攻撃したときは相手の反撃を受けない（場を離れるまで。封印されても残る。相手の挑発を外す除去にも、モンスターのカードなら「このモンスター」を攻撃役にもできる）`,
  targetRule: 'enemyMonster',
  thisMonsterToo: true,
  basePoints: () => B.flat,
  baseFormula: () => `${B.flat}`,
  describe: (_e, c) => `${c.target}に容疑をかける（攻撃力+${B.attack}・挑発を失う・反撃しない）`,
  battle: {
    resolve(rt) {
      for (const t of rt.targets) rt.markMonster(t, 'suspected');
    },
  },
});
