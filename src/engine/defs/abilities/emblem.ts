import { BALANCE } from '../../balance.ts';
import { defineAbility } from '../../define.ts';
import { round2 } from '../../math.ts';

const B = BALANCE.abilities.emblem;

// 紋章：MTG #191。レジェンドのパワー：場のパワーではなく「紋章」になる。パワーの上限に数えず、解除もされない（1人1つまで）
export default defineAbility({
  id: 'emblem',
  name: '紋章',
  order: 71,
  group: '場・パワー',
  summary: `レジェンドのパワー：場のパワーではなく「紋章」になる。パワーの上限に数えず、解除・差し出しの対象にならない（1人${BALANCE.battle.maxEmblems}つまで。もうあれば使えない）。ポイントはパワーの効果×${B.rate}（能力の行は×${round2(B.rate - 1)}の分）`,
  cardTypes: ['power', 'powerAttack'],
  minRarity: 'legend',
  conflicts: ['charge', 'trap', 'quest', 'loyalty', 'levelUp', 'altWin', 'activate'],
  noSaga: true,
  points: (_a, ctx) => ctx.powerEffectPoints * (B.rate - 1),
  formula: (_a, ctx) => `パワーの効果${round2(ctx.powerEffectPoints)}×${round2(B.rate - 1)}`,
  displayName: () => '紋章',
  describe: () => '紋章（パワーの上限に数えず、解除されない）',
  battle: { emblem: true },
});
