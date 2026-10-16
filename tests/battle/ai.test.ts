// CPU とランダムな行動による通し対戦：エラーなく終わり、カードが増えたり消えたりしないこと
import { describe, expect, it } from 'vitest';
import { ai, battle } from '../../src/engine/index.ts';
import { PRESET_DECKS } from '../../src/presets.ts';
import { randInt } from '../../src/engine/battle/rng.ts';

type G = battle.GameState;

function newGame(seed: number, a = 0, b = 1): G {
  const pa = PRESET_DECKS[a]!;
  const pb = PRESET_DECKS[b]!;
  const r = battle.createGame({
    seed,
    players: [
      { name: pa.name, deck: pa.deck, cards: pa.cards },
      { name: pb.name, deck: pb.deck, cards: pb.cards },
    ],
  });
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

/** 元の持ち主ごとの、コピー・ノイズ以外のカードの枚数（常に30枚のはず） */
function ownedCards(g: G, p: battle.PlayerId): number {
  let n = 0;
  for (const pl of g.players) {
    const zones = [...pl.deck, ...pl.hand, ...pl.discard, ...pl.exile, ...pl.board.map((m) => m.card)];
    n += zones.filter((c) => c.owner === p && !c.copy && c.cardId !== battle.NOISE_CARD_ID).length;
  }
  return n;
}

function checkInvariants(g: G): void {
  if (g.pending || g.queue.length > 0) return;
  for (const p of [0, 1] as const) {
    expect(ownedCards(g, p)).toBe(30);
    expect(g.players[p].hp).toBeLessThanOrEqual(g.players[p].maxHp);
    expect(g.players[p].hp).toBeGreaterThanOrEqual(0);
    for (const m of g.players[p].board) {
      expect(m.hp).toBeGreaterThan(0);
      expect(m.controller).toBe(p);
    }
  }
}

function whoActs(g: G): battle.PlayerId | null {
  if (g.phase === 'ended') return null;
  if (g.phase === 'mulligan') return g.players[0].mulligan.done ? 1 : 0;
  if (g.pending) return g.pending.player;
  return g.active;
}

describe('CPU 同士の対戦', () => {
  const matchups: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 0],
  ];
  for (const [a, b] of matchups) {
    it(`${PRESET_DECKS[a]!.name} 対 ${PRESET_DECKS[b]!.name}：最後まで不正な行動なしで終わる`, () => {
      for (const seed of [11, 22]) {
        let g = newGame(seed, a, b);
        let steps = 0;
        while (g.phase !== 'ended') {
          const p = whoActs(g)!;
          const action = ai.cpuAction(g, p, seed + steps);
          const r = battle.applyAction(g, action);
          expect(r.ok, r.ok ? '' : r.error).toBe(true);
          if (!r.ok) return;
          g = r.state;
          checkInvariants(g);
          steps++;
          expect(steps).toBeLessThan(5000);
        }
        expect(g.result).not.toBeNull();
      }
    }, 60000);
  }

  it('CPU は相手の非公開情報を使わない（見える情報が同じなら同じ行動）', () => {
    let g = newGame(5);
    g = battle.applyAction(g, { type: 'mulligan', player: 0, mode: 'keep' }).ok ? (battle.applyAction(g, { type: 'mulligan', player: 0, mode: 'keep' }) as { state: G }).state : g;
    g = (battle.applyAction(g, { type: 'mulligan', player: 1, mode: 'keep' }) as { state: G }).state;
    const a1 = ai.cpuAction(g, g.active, 1);
    // 相手の手札と山札の順番を入れ替えても、行動は変わらない
    const shuffled = structuredClone(g);
    const opp = battle.other(g.active);
    shuffled.players[opp].hand.reverse();
    shuffled.players[opp].deck.reverse();
    const a2 = ai.cpuAction(shuffled, g.active, 1);
    expect(a2).toEqual(a1);
  });
});

describe('ランダムな行動での通し対戦（ファズ）', () => {
  it('どんな合法な行動の組み合わせでもエラーなく進む', () => {
    for (let seed = 100; seed < 130; seed++) {
      let g = newGame(seed, seed % 3, (seed + 1) % 3);
      const rng = { rng: seed };
      let steps = 0;
      while (g.phase !== 'ended' && steps < 3000) {
        const p = whoActs(g)!;
        let actions = battle.legalActions(g, p);
        // 終わらせやすくするため、ターン終了を少し選ばれにくくする
        if (actions.length > 1 && randInt(rng, 4) > 0) actions = actions.filter((a) => a.type !== 'endTurn') || actions;
        const action = actions[randInt(rng, actions.length)] ?? { type: 'endTurn', player: p };
        const r = battle.applyAction(g, action);
        expect(r.ok, r.ok ? '' : `${r.error} ${JSON.stringify(action)}`).toBe(true);
        if (!r.ok) return;
        g = r.state;
        checkInvariants(g);
        steps++;
      }
    }
  }, 60000);

  it('同じシードと同じ行動なら、まったく同じ結果になる', () => {
    const run = () => {
      let g = newGame(77);
      for (let i = 0; i < 200 && g.phase !== 'ended'; i++) {
        const p = whoActs(g)!;
        g = (battle.applyAction(g, ai.cpuAction(g, p, i)) as { state: G }).state;
      }
      return JSON.stringify(g);
    };
    expect(run()).toBe(run());
  }, 60000);
});

describe('viewFor', () => {
  it('相手の手札と、両者の山札の中身を隠す', () => {
    const g = newGame(3);
    const v = battle.viewFor(g, 0);
    expect(v.players[1].hand.every((c) => c.cardId === battle.HIDDEN_CARD_ID)).toBe(true);
    expect(v.players[1].hand).toHaveLength(g.players[1].hand.length);
    expect(v.players[0].deck.every((c) => c.cardId === battle.HIDDEN_CARD_ID)).toBe(true);
    expect(v.players[0].hand).toEqual(g.players[0].hand);
    expect(v.rng).toBe(0);
    // 相手専用のログ（引いたカード名）は見えない
    expect(v.log.some((e) => e.private === 1)).toBe(false);
    // 相手のデッキのカード定義は渡さない
    expect(Object.keys(v.cards).some((k) => k.startsWith('p1:'))).toBe(false);
  });
});
