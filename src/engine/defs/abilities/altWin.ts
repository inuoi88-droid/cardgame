import { BALANCE } from '../../balance.ts';
import { ALT_WIN_GOALS, defineAbility, optionOf, type AltWinGoal } from '../../define.ts';

const B = BALANCE.abilities.altWin;
const T = BALANCE.battle.altWinEarliestTurn;
export const ALT_WIN_LABEL: Record<AltWinGoal, string> = {
  cards: `このパワーがある間にカードを${B.goals.cards}枚使う`,
  turns: `このパワーを置いてから自分のターン開始を${B.goals.turns}回迎える`,
  board: `自分のターン開始時に自分のモンスターが${B.goals.board}体以上`,
};
const OPTION = { label: '目標', choices: ALT_WIN_GOALS.map((id) => ({ id, label: ALT_WIN_LABEL[id] })), default: 'cards' };
export const altWinGoal = (a: { option?: string }): AltWinGoal => {
  const id = optionOf({ option: OPTION }, a) as AltWinGoal;
  return ALT_WIN_GOALS.includes(id) ? id : 'cards';
};

// 特殊勝利：MTG #115・#605（特殊勝利・代替勝利条件）。レジェンドのパワー：目標を達成したら、その時点で勝つ。進み具合は相手にも見える
export default defineAbility({
  id: 'altWin',
  name: '特殊勝利',
  order: 70,
  group: '場・パワー',
  summary: `レジェンドのパワー：目標を達成したら、その時点で勝つ（通算${T}ターン目より前には勝たない。進みはたまる）。進み具合は相手にも見える。対策は解除（パワーごと消える）とパワーの上限での押し出し。ポイントは固定${B.flat}`,
  option: OPTION,
  cardTypes: ['power', 'powerAttack'],
  minRarity: 'legend',
  conflicts: ['trap', 'quest', 'loyalty', 'emblem'],
  points: () => B.flat,
  formula: () => `${B.flat}`,
  displayName: () => '特殊勝利',
  describe: (a) => `特殊勝利：${ALT_WIN_LABEL[altWinGoal(a)]}を達成したら勝つ`,
  battle: { altWin: (a) => altWinGoal(a) },
});
