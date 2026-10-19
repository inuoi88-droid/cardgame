// CPU とランダムな行動による通し対戦：エラーなく終わり、カードが増えたり消えたりしないこと。
// CPU の思考（リーサル探索・タイブレーク・難易度・マリガン：決定事項 #72）
import { describe, expect, it } from 'vitest';
import { ai, battle } from '../../src/engine/index.ts';
import { PRESET_DECKS } from '../../src/presets.ts';
import { randInt } from '../../src/engine/battle/rng.ts';
import { card } from '../helpers.ts';
import { act, fx, giveCard, putMonster, startGame } from './helpers.ts';

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
  const seedsFor: Record<ai.CpuLevel, number[]> = { easy: [11], normal: [11, 22], hard: [11] };
  for (const level of ai.CPU_LEVELS) {
    for (const [a, b] of matchups) {
      it(`${ai.CPU_LEVEL_LABEL[level]}：${PRESET_DECKS[a]!.name} 対 ${PRESET_DECKS[b]!.name}：最後まで不正な行動なしで終わる`, () => {
        for (const seed of seedsFor[level]) {
          let g = newGame(seed, a, b);
          let steps = 0;
          while (g.phase !== 'ended') {
            const p = whoActs(g)!;
            const action = ai.cpuAction(g, p, seed + steps, level);
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
      }, 120000);
    }
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

// ---------------------------------------------------------------- CPU の思考（決定事項 #72）

/** CPU（P0）にこのターンを最後まで指させる（ターン終了も実行する） */
function playTurn(g: G, level: ai.CpuLevel = 'normal'): G {
  for (let i = 0; i < 30 && g.phase !== 'ended'; i++) {
    const a = ai.cpuAction(g, 0, i, level);
    g = act(g, a);
    if (a.type === 'endTurn') break;
  }
  return g;
}

const DAMAGE = (n: number, cost = 1) => card({ id: `dmg${n}c${cost}`, name: `ダメージ${n}`, cost, effects: [fx({ id: 'damage', value: n })] });

describe('リーサル探索（A1）：このターンに勝てる手順を見逃さない', () => {
  it('シールド越しの、ダメージカード＋攻撃', () => {
    const g = startGame();
    g.players[1].hp = 4;
    g.players[1].shield = 4;
    putMonster(g, 0, card({ id: 'm44', name: '牛', cost: 3, stats: { attack: 4, hp: 4, defense: 0 } }));
    giveCard(g, 0, DAMAGE(4));
    g.players[0].energy = 1;
    const end = playTurn(g);
    expect(end.result?.winner).toBe(0);
  });

  it('連撃＋攻撃（相手の場に倒したくなるモンスターがいても顔を狙う）', () => {
    const g = startGame();
    g.players[1].hp = 5;
    putMonster(g, 0, card({ id: 'm22', name: '犬', cost: 1, stats: { attack: 2, hp: 2, defense: 0 } }));
    putMonster(g, 1, card({ id: 'e11', name: '鷹', cost: 1, stats: { attack: 1, hp: 1, defense: 0 } }));
    giveCard(g, 0, card({ id: 'mh13', name: '連撃1×3', cost: 1, effects: [fx({ id: 'multiHit', value: 1, hits: 3 })] }));
    g.players[0].energy = 1;
    const end = playTurn(g);
    expect(end.result?.winner).toBe(0);
  });

  it('速攻モンスターを召喚して攻撃', () => {
    const g = startGame();
    g.players[1].hp = 3;
    giveCard(g, 0, card({ id: 'haste33', name: '狼', cost: 2, stats: { attack: 3, hp: 3, defense: 0 }, keywords: [{ id: 'haste' }] }));
    g.players[0].energy = 2;
    const end = playTurn(g);
    expect(end.result?.winner).toBe(0);
  });

  it('2枚の順番が要るリーサル（脆弱 → ダメージ）', () => {
    const g = startGame();
    g.players[1].hp = 9;
    giveCard(g, 0, DAMAGE(6));
    giveCard(g, 0, card({ id: 'vul1', name: '脆弱', cost: 1, effects: [fx({ id: 'vulnerable', value: 1 })] }));
    g.players[0].energy = 2;
    const end = playTurn(g);
    expect(end.result?.winner).toBe(0);
  });

  it('相手の毒が HP 以上なら、ターンを終えて毒で倒す', () => {
    const g = startGame();
    g.players[1].hp = 3;
    g.players[1].status.poison = 3;
    const end = playTurn(g);
    expect(end.result?.winner).toBe(0);
  });

  it('「つよい」も「やさしい」も不正な手は指さない（やさしいはリーサル探索なしでも手順自体は合法）', () => {
    for (const level of ai.CPU_LEVELS) {
      const g = startGame();
      g.players[1].hp = 9;
      giveCard(g, 0, DAMAGE(6));
      giveCard(g, 0, card({ id: 'vul1', name: '脆弱', cost: 1, effects: [fx({ id: 'vulnerable', value: 1 })] }));
      g.players[0].energy = 2;
      const end = playTurn(g, level);
      if (level !== 'easy') expect(end.result?.winner).toBe(0);
      else expect(end.phase === 'ended' || end.active === 1).toBe(true);
    }
  });
});

describe('タイブレーク（A2）：評価が同じなら除去 → コストの高いカード → 顔', () => {
  const cand = (score: number, kills: number, cost: number, face: number): ai.Candidate => ({ action: { type: 'endTurn', player: 0 }, score, state: null, kills, cost, face });

  it('比較の順序', () => {
    expect(ai.better(cand(100, 1, 0, 0), cand(100, 0, 3, 5))).toBe(true);
    expect(ai.better(cand(100, 0, 2, 0), cand(100, 0, 1, 5))).toBe(true);
    expect(ai.better(cand(100, 0, 1, 5), cand(100, 0, 1, 0))).toBe(true);
    // 評価の差がはっきりあれば評価で決まる
    expect(ai.better(cand(100, 0, 0, 0), cand(90, 1, 3, 5))).toBe(true);
  });

  it('次のターンに攻撃してくるモンスターの除去を、同じくらいの顔ダメージより優先する', () => {
    const g = startGame();
    g.players[1].hp = 100;
    const mine = putMonster(g, 0, card({ id: 'm35', name: '熊', cost: 3, stats: { attack: 3, hp: 5, defense: 0 } }));
    const theirs = putMonster(g, 1, card({ id: 'e21', name: '犬', cost: 1, stats: { attack: 2, hp: 1, defense: 0 } }));
    g.players[0].energy = 0;
    const a = ai.cpuAction(g, 0, 1);
    expect(a).toEqual({ type: 'attack', player: 0, attackerUid: mine, target: { kind: 'monster', uid: theirs } });
  });
});

describe('マリガン（A9）：コストの分布で決める', () => {
  const cheap = (i: number) => card({ id: `cheap${i}`, name: `安い${i}`, cost: 1, effects: [fx({ id: 'damage', value: 2 })] });
  const heavy = (i: number) => card({ id: `heavy${i}`, name: `重い${i}`, cost: 5, effects: [fx({ id: 'damage', value: 10 })] });

  function handOf(defs: ReturnType<typeof card>[]): { g: G; uids: string[] } {
    const g = startGame({ mulligan: false });
    g.players[0].hand = [];
    const uids = defs.map((d) => giveCard(g, 0, d));
    return { g, uids };
  }

  it('早いターンに使えるカードが2枚以上あれば手札を決める', () => {
    const { g } = handOf([cheap(1), cheap(2), cheap(3), cheap(4), cheap(5)]);
    expect(ai.cpuAction(g, 0, 1)).toEqual({ type: 'mulligan', player: 0, mode: 'keep' });
  });

  it('重すぎるカードがあれば、それだけ一部引き直す', () => {
    const { g, uids } = handOf([cheap(1), cheap(2), cheap(3), heavy(1), heavy(2)]);
    const a = ai.cpuAction(g, 0, 1);
    expect(a.type === 'mulligan' && a.mode === 'partial' && [...(a.cardUids ?? [])].sort()).toEqual([uids[3], uids[4]].sort());
  });

  it('使えるカードが足りなければ、1回目は全部引き直す', () => {
    const { g } = handOf([heavy(1), heavy(2), heavy(3), heavy(4), heavy(5)]);
    expect(ai.cpuAction(g, 0, 1)).toEqual({ type: 'mulligan', player: 0, mode: 'all' });
  });

  it('2回目以降は、使えないカードだけ一部引き直す', () => {
    const { g, uids } = handOf([cheap(1), heavy(1), heavy(2), heavy(3)]);
    g.players[0].mulligan.fullCount = 1;
    const a = ai.cpuAction(g, 0, 1);
    expect(a.type === 'mulligan' && a.mode === 'partial' && [...(a.cardUids ?? [])].sort()).toEqual([uids[1], uids[2], uids[3]].sort());
  });
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

describe('レースの見込みの固定（決定事項 #81）', () => {
  it('判断の前の盤面で固定した frame を渡すと、候補の盤面でレースの判定が切り替わらない', () => {
    const g = startGame();
    putMonster(g, 1, card({ id: 'giant', name: '巨人', rarity: 'legend', stats: { attack: 30, hp: 5, defense: 0 } }));
    const frame = ai.raceFrame(g, 0);
    expect(frame.raceFavor).toBe(false);
    // 相手のモンスターを倒した後の盤面：そのまま計算すると「有利」に切り替わる
    const after = structuredClone(g);
    after.players[1].board = [];
    expect(ai.raceContext(after, 0).raceFavor).toBe(true);
    expect(ai.raceContext(after, 0, frame).raceFavor).toBe(false);
    expect(ai.raceContext(after, 0, frame).turnsLeft).toBe(frame.turnsLeft);
    // 固定しないと、切り替わりの分（相手の HP × (raceFaceBonus − 1)）だけ評価が跳ねる（場にモンスターがいないので他の差はない）
    const jump = ai.evaluate(after, 0) - ai.evaluate(after, 0, frame);
    expect(jump).toBeCloseTo(-after.players[1].hp * ai.WEIGHTS.hp * (ai.WEIGHTS.raceFaceBonus - 1));
  });
});
