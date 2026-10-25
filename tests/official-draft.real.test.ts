// 公式カード（決定事項 #116・#117）で「場から交互に取る」ドラフトを実際の倍率で通す：
// おまかせ同士で最後まで取る → どちらも30枚の合法なデッキ → そのデッキで CPU 同士が決着まで戦える
import { describe, expect, it } from 'vitest';
import { ai, analyzeDeck, BALANCE, battle, draft } from '../src/engine/index.ts';
import { ONLINE_DRAFT_CARDS } from '../src/online/index.ts';
import { OFFICIAL_CARDS } from '../src/official/index.ts';

const D = BALANCE.draft;

function playToEnd(g: battle.GameState, level: ai.CpuLevel): battle.GameState {
  for (let k = 0; k < 6000 && g.phase !== 'ended'; k++) {
    const p: battle.PlayerId = g.phase === 'mulligan' ? (g.players[0].mulligan.done ? 1 : 0) : g.pending ? g.pending.player : g.active;
    const next = battle.applyAction(g, ai.cpuAction(g, p, k, level));
    if (!next.ok) throw new Error(next.error);
    g = next.state;
  }
  return g;
}

describe('公式カードのドラフト（実際の倍率）', () => {
  it('オンラインのドラフトの山は公式カード', () => {
    expect(ONLINE_DRAFT_CARDS).toBe(OFFICIAL_CARDS);
    expect(draft.poolProblem(draft.draftPool(OFFICIAL_CARDS))).toBeNull();
  });

  it('山はコモン2枚・レアとエピック1枚ずつ（レジェンドなし）', () => {
    const created = draft.createDraft({ seed: 1, pool: OFFICIAL_CARDS });
    if (!created.ok) throw new Error(created.error);
    const s = created.value;
    const all = [...s.field, ...s.pile];
    const expected = OFFICIAL_CARDS.reduce((n, c) => n + D.pileCopies[c.rarity], 0);
    expect(all).toHaveLength(expected);
    expect(s.field).toHaveLength(D.field);
  });

  for (const seed of [11, 22, 33, 44]) {
    const levels: [ai.CpuLevel, ai.CpuLevel] = [ai.CPU_LEVELS[seed % 3]!, ai.CPU_LEVELS[(seed + 1) % 3]!];
    it(`おまかせ同士（${levels.join('・')}）で取り切り、CPU 同士が決着まで戦える（seed ${seed}）`, () => {
      const created = draft.createDraft({ seed, pool: OFFICIAL_CARDS });
      if (!created.ok) throw new Error(created.error);
      let s = created.value;
      for (let i = 0; i < 2 * D.takes && !draft.isDraftDone(s); i++) {
        const p = draft.draftTurn(s)!;
        // 手番の人はいつも何か取れる（取れなければ山から追加で出している）
        expect(draft.takeInfos(s, p).some((t) => t.ok)).toBe(true);
        const id = draft.autoPick(s, p, levels[p]);
        expect(id).not.toBeNull();
        const r = draft.applyTake(s, p, id!);
        if (!r.ok) throw new Error(r.error);
        s = r.state;
      }
      expect(draft.isDraftDone(s)).toBe(true);
      const decks = draft.draftDecks(s);
      for (const d of decks) {
        const a = analyzeDeck(d.deck, new Map(d.cards.map((c) => [c.id, c])));
        expect(a.violations).toEqual([]);
        expect(a.total).toBe(BALANCE.deck.size);
        expect(d.cards.every((c) => c.rarity !== 'legend')).toBe(true);
      }
      const r = battle.createGame({ seed, players: [{ name: 'A', ...decks[0] }, { name: 'B', ...decks[1] }] });
      if (!r.ok) throw new Error(r.error);
      const g = playToEnd(r.state, seed % 2 ? 'normal' : 'easy');
      expect(g.phase).toBe('ended');
      expect(g.result).toBeTruthy();
    }, 120_000);
  }
});
