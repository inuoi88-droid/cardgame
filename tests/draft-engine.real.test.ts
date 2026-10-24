// 場から交互に取るドラフト（決定事項 #115）を実際の倍率で：おまかせ同士のドラフト → そのデッキで CPU 同士が最後まで戦える
import { describe, expect, it } from 'vitest';
import { ai, analyzeDeck, BALANCE, battle, draft } from '../src/engine/index.ts';
import { SCALE } from '../src/engine/scale.ts';
import { PRESET_DECKS } from '../src/presets.ts';

const POOL = PRESET_DECKS.flatMap((p) => p.cards);

describe('ドラフト（実際の倍率）', () => {
  it('倍率は実際の値で、ドラフトの数は倍率に関係しない', () => {
    expect(SCALE).toBeGreaterThan(1);
    expect(BALANCE.draft).toMatchObject({ field: 6, copies: 2, takes: 15 });
    expect(BALANCE.online.draftPickSeconds).toBe(30);
  });

  for (const seed of [1, 2, 3]) {
    it(`おまかせ同士のドラフトのデッキで、CPU 同士が最後まで戦える（seed ${seed}）`, () => {
      const created = draft.createDraft({ seed, pool: POOL });
      if (!created.ok) throw new Error(created.error);
      let s = created.value;
      while (!draft.isDraftDone(s)) {
        const p = draft.draftTurn(s)!;
        const r = draft.applyTake(s, p, draft.autoPick(s, p, ai.CPU_LEVELS[seed % 3])!);
        if (!r.ok) throw new Error(r.error);
        s = r.state;
      }
      const decks = draft.draftDecks(s);
      for (const d of decks) expect(analyzeDeck(d.deck, new Map(d.cards.map((c) => [c.id, c]))).violations).toEqual([]);
      const r = battle.createGame({ seed, first: draft.battleFirstAfterDraft(s), players: [{ name: 'A', ...decks[0] }, { name: 'B', ...decks[1] }] });
      if (!r.ok) throw new Error(r.error);
      let g = r.state;
      for (let k = 0; k < 4000 && g.phase !== 'ended'; k++) {
        const p: battle.PlayerId = g.phase === 'mulligan' ? (g.players[0].mulligan.done ? 1 : 0) : g.pending ? g.pending.player : g.active;
        const next = battle.applyAction(g, ai.cpuAction(g, p, k, 'easy'));
        if (!next.ok) throw new Error(next.error);
        g = next.state;
      }
      expect(g.phase).toBe('ended');
    }, 60_000);
  }

  it('おまかせは、点の高いカードを先に取る（強いカードが場にあれば取る）', () => {
    const created = draft.createDraft({ seed: 4, pool: POOL });
    if (!created.ok) throw new Error(created.error);
    const s = created.value;
    const p = draft.draftTurn(s)!;
    const pick = draft.autoPick(s, p, 'hard')!;
    const best = Math.max(...s.field.map((id) => draft.cpuPickScore(s.cards[id]!, {}, new Map())));
    // 妨害（相手の点も少し足す）があるので、いちばん高い点の8割以上
    expect(draft.cpuPickScore(s.cards[pick]!, {}, new Map())).toBeGreaterThanOrEqual(best * 0.8);
  });
});
