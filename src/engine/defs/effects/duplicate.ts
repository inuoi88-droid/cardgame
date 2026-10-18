import { BALANCE } from '../../balance.ts';
import { defineEffect, optionOf } from '../../define.ts';

const B = BALANCE.effects.duplicate;
const option = {
  label: 'コピー',
  choices: [
    { id: 'temp', label: '残らない（使うかターン終了で除外）' },
    { id: 'keep', label: 'デッキに残る（その試合中）' },
  ],
  default: 'temp',
};
const keeps = (e: { option?: string }) => optionOf({ option }, e) === 'keep';

export default defineEffect({
  id: 'duplicate',
  name: '複製',
  group: 'special',
  order: 71,
  summary: `手札のカード1枚のコピーを手札に加える（エピック以上。コピーが残る版は${B.flatKeep}pt）`,
  option,
  targetRule: 'self',
  minRarity: 'epic',
  basePoints: (e) => (keeps(e) ? B.flatKeep : B.flat),
  baseFormula: (e) => (keeps(e) ? `${B.flatKeep}` : `${B.flat}`),
  describe: (e) =>
    keeps(e)
      ? '手札のカード1枚のコピーを手札に加える（コピーはこの試合のデッキに残る）'
      : '手札のカード1枚のコピーを手札に加える（コピーは使うかターン終了で除外）',
  shortValue: (e) => (keeps(e) ? '（残る）' : ''),
  battle: {
    choose(rt) {
      return {
        prompt: 'コピーする手札のカードを選んでください',
        options: rt
          .player(rt.controller)
          .hand.filter((c) => rt.cardDef(c.cardId))
          .map((c) => ({ id: c.uid, label: rt.cardName(c.cardId), cardId: c.cardId })),
        min: 1,
        max: 1,
      };
    },
    resolve(rt, e, picks) {
      if (picks?.[0]) rt.copyFromHand(rt.controller, picks[0], keeps(e));
    },
  },
});
