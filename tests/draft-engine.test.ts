// 場から交互に取るドラフト（決定事項 #115）のエンジン。倍率1
import { describe, expect, it } from 'vitest';
import { analyzeDeck, BALANCE, battle, draft, type CardDef } from '../src/engine/index.ts';
import { PRESET_DECKS } from '../src/presets.ts';
import { card } from './helpers.ts';

const D = BALANCE.draft;
const PRESET_CARDS = PRESET_DECKS.flatMap((p) => p.cards);

function mustCreate(input: draft.CreateDraftInput): draft.DraftState {
  const r = draft.createDraft(input);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

function take(s: draft.DraftState, p: battle.PlayerId, id: string): draft.DraftState {
  const r = draft.applyTake(s, p, id);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

/** 両者おまかせで最後まで。途中の状態を毎回 check に渡す */
function runAuto(s: draft.DraftState, levels: [string, string] = ['normal', 'normal'], check?: (s: draft.DraftState) => void): draft.DraftState {
  for (let i = 0; i < 100 && !draft.isDraftDone(s); i++) {
    const p = draft.draftTurn(s)!;
    const id = draft.autoPick(s, p, levels[p] as 'normal');
    expect(id).not.toBeNull();
    s = take(s, p, id!);
    check?.(s);
  }
  return s;
}

const rarityCount = (s: draft.DraftState, p: battle.PlayerId, rarity: string) =>
  s.picks.filter((x) => x.player === p && s.cards[x.cardId]!.rarity === rarity).length;

/** 小さな山（コモン n 枚・レア r 枚・エピック e 枚。名前は別々） */
function pool(n: number, r: number, e: number, extra: CardDef[] = []): CardDef[] {
  const mk = (rarity: CardDef['rarity'], i: number) =>
    card({ id: `${rarity}-${String(i).padStart(2, '0')}`, name: `${rarity}${i}`, rarity, cost: 1, stats: { attack: 1, hp: 1, defense: 0 } });
  return [
    ...Array.from({ length: n }, (_, i) => mk('common', i)),
    ...Array.from({ length: r }, (_, i) => mk('rare', i)),
    ...Array.from({ length: e }, (_, i) => mk('epic', i)),
    ...extra,
  ];
}

describe('ドラフトの始まり', () => {
  it('同じシードなら山・場・先手が同じ（渡す並びに関係なく）。違うシードなら変わる', () => {
    const a = mustCreate({ seed: 42, pool: PRESET_CARDS });
    const b = mustCreate({ seed: 42, pool: [...PRESET_CARDS].reverse() });
    expect(b).toEqual(a);
    const c = mustCreate({ seed: 43, pool: PRESET_CARDS });
    expect(c.pile.join()).not.toBe(a.pile.join());
  });

  it(`場は${D.field}枚、レジェンドとルール違反は山に入らない`, () => {
    const legend = card({ id: 'zz-legend', name: '伝説', rarity: 'legend', cost: 1, stats: { attack: 1, hp: 1, defense: 0 } });
    const broken = card({ id: 'zz-bad', name: '壊れ', cost: 0, effects: [{ id: 'damage', value: 99, timing: 'play', target: 'chosen', condition: null }] });
    const s = mustCreate({ seed: 1, pool: [...PRESET_CARDS, legend, broken] });
    expect(s.field).toHaveLength(D.field);
    const all = [...s.field, ...s.pile];
    expect(all).not.toContain('zz-legend');
    expect(all).not.toContain('zz-bad');
    expect(Object.values(s.cards).some((c) => c.rarity === 'legend')).toBe(false);
    // 1種類が山に入る枚数はレアリティで決まる（コモン2枚・レアとエピック1枚。#117）
    const byCount = new Map<string, number>();
    for (const id of all) byCount.set(id, (byCount.get(id) ?? 0) + 1);
    for (const [id, n] of byCount) expect(n, id).toBe(D.pileCopies[s.cards[id]!.rarity]);
  });

  it('先手はシードで決まり、指定もできる。対戦の先攻は後から取り始めた人', () => {
    const firsts = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => mustCreate({ seed, pool: PRESET_CARDS }).first));
    expect(firsts).toEqual(new Set([0, 1]));
    const s = mustCreate({ seed: 1, pool: PRESET_CARDS, first: 1 });
    expect(s.first).toBe(1);
    expect(draft.draftTurn(s)).toBe(1);
    expect(draft.battleFirstAfterDraft(s)).toBe(0);
  });

  it('山が足りなければ始められない', () => {
    const r = draft.createDraft({ seed: 1, pool: pool(10, 4, 2) });
    expect(r.ok).toBe(false);
    expect(draft.poolProblem(draft.draftPool(PRESET_CARDS))).toBeNull();
    // コモンは山に pileCopies.common（2）枚ずつ入るので、2人分30回 − レア4・エピック2 ＝ 24枚 ＝ 12種類
    expect(draft.poolProblem(pool(12, 4, 2))).toBeNull();
    expect(draft.poolProblem(pool(11, 4, 2))).not.toBeNull();
  });
});

describe('交互に取る', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    it(`${D.takes}回ずつ取ると、どちらも${BALANCE.deck.size}枚の合法なデッキ（seed ${seed}）`, () => {
      let s = mustCreate({ seed, pool: PRESET_CARDS });
      const levels: [string, string] = seed % 2 ? ['easy', 'hard'] : ['hard', 'normal'];
      s = runAuto(s, levels, (st) => {
        const last = st.picks[st.picks.length - 1]!;
        if (draft.isDraftDone(st)) return;
        // 場はいつも6枚（山が尽きたとき・追加で出したときを除く）
        if (st.field.length !== D.field) expect(last.extra !== undefined || st.pile.length === 0 || st.field.length > D.field).toBe(true);
        // 手番の人は必ず何か取れる
        expect(draft.takeInfos(st, draft.draftTurn(st)!).some((t) => t.ok)).toBe(true);
      });
      expect(draft.isDraftDone(s)).toBe(true);
      expect(s.picks).toHaveLength(2 * D.takes);
      const decks = draft.draftDecks(s);
      for (const p of [0, 1] as const) {
        expect(s.picks.filter((x) => x.player === p)).toHaveLength(D.takes);
        const d = decks[p];
        const a = analyzeDeck(d.deck, new Map(d.cards.map((c) => [c.id, c])));
        expect(a.violations).toEqual([]);
        expect(a.total).toBe(BALANCE.deck.size);
        expect(d.cards.some((c) => c.rarity === 'legend')).toBe(false);
        expect(rarityCount(s, p, 'rare')).toBeLessThanOrEqual(BALANCE.rarity.rare.deckLimit! / D.copies);
        expect(rarityCount(s, p, 'epic')).toBeLessThanOrEqual(BALANCE.rarity.epic.deckLimit! / D.copies);
      }
      // 同じカードは山に入った枚数までしか取れない（取ったら場から消える）
      const taken = new Map<string, number>();
      for (const x of s.picks) taken.set(x.cardId, (taken.get(x.cardId) ?? 0) + 1);
      for (const [id, n] of taken) expect(n, id).toBeLessThanOrEqual(D.pileCopies[s.cards[id]!.rarity]);
      // ドラフトのデッキでそのまま対戦を始められる（後から取り始めた人が先攻）
      const g = battle.createGame({
        seed,
        players: [
          { name: 'A', ...decks[0] },
          { name: 'B', ...decks[1] },
        ],
        first: draft.battleFirstAfterDraft(s),
      });
      expect(g.ok && g.state.first).toBe(battle.other(s.first));
    });
  }

  it('手番でない・場にない・終わったあとは取れない（元の状態は変わらない）', () => {
    const s = mustCreate({ seed: 3, pool: PRESET_CARDS, first: 0 });
    const before = JSON.stringify(s);
    expect(draft.applyTake(s, 1, s.field[0]!)).toMatchObject({ ok: false, reason: 'turn' });
    expect(draft.applyTake(s, 0, s.pile[0]!)).toMatchObject({ ok: false, reason: 'notInField' });
    expect(draft.applyTake(s, 0, 'nope')).toMatchObject({ ok: false, reason: 'notInField' });
    const t = take(s, 0, s.field[2]!);
    expect(JSON.stringify(s)).toBe(before);
    expect(t.field).toHaveLength(D.field);
    expect(t.pile).toHaveLength(s.pile.length - 1);
    expect(t.field).not.toContain(s.field[2]);
    expect(t.field[D.field - 1]).toBe(s.pile[0]);
    const done = runAuto(t);
    expect(draft.applyTake(done, draft.draftTurn(done) ?? 0, done.field[0]!)).toMatchObject({ ok: false, reason: 'done' });
  });

  it('レアは4回・エピックは2回まで。超えるカードは場に見えたまま「取れない」になる', () => {
    let s = mustCreate({ seed: 11, pool: pool(30, 12, 6), first: 0 });
    // 席0はレア・エピックを優先し、席1はコモンを取る
    const rank = { epic: 0, rare: 1, common: 2, legend: 3 } as const;
    for (let i = 0; i < 2 * D.takes; i++) {
      const p = draft.draftTurn(s)!;
      const infos = draft.takeInfos(s, p).filter((t) => t.ok);
      const sorted = infos.map((t) => s.cards[t.cardId]!).sort((a, b) => (p === 0 ? rank[a.rarity] - rank[b.rarity] : rank[b.rarity] - rank[a.rarity]));
      s = take(s, p, sorted[0]!.id);
      if (draft.draftTurn(s) === 0 && rarityCount(s, 0, 'rare') === 4) {
        for (const t of draft.takeInfos(s, 0)) {
          if (s.cards[t.cardId]!.rarity === 'rare') expect(t).toMatchObject({ ok: false, reason: 'rarityLimit' });
        }
      }
    }
    expect(rarityCount(s, 0, 'rare')).toBe(4);
    expect(rarityCount(s, 0, 'epic')).toBe(2);
    const view = draft.draftView(s, 0);
    expect(view.done).toBe(true);
  });

  it('同名の上限：同じ名前のレアを2種類目は取れない', () => {
    const twins = [
      card({ id: 'tw-a', name: '双子', rarity: 'rare', cost: 1, stats: { attack: 1, hp: 1, defense: 0 } }),
      card({ id: 'tw-b', name: '双子', rarity: 'rare', cost: 1, stats: { attack: 2, hp: 1, defense: 0 } }),
    ];
    const s: draft.DraftState = {
      v: 1,
      rng: 1,
      cards: Object.fromEntries([...pool(30, 0, 0), ...twins].map((c) => [c.id, c])),
      pile: pool(30, 0, 0).slice(6).map((c) => c.id),
      field: ['tw-b', ...pool(30, 0, 0).slice(0, 5).map((c) => c.id)],
      picks: [{ player: 0, cardId: 'tw-a' }, { player: 1, cardId: 'common-29' }],
      first: 0,
    };
    expect(draft.takeInfos(s, 0)[0]).toMatchObject({ cardId: 'tw-b', ok: false, reason: 'sameName' });
    expect(draft.takeInfos(s, 1)[0]).toMatchObject({ cardId: 'tw-b', ok: true });
    expect(draft.applyTake(s, 0, 'tw-b')).toMatchObject({ ok: false, reason: 'untakeable' });
  });

  it('手番の人が場のどれも取れなければ、取れるカードが出るまで山から追加で出す（6枚を超えている間は補充しない）', () => {
    const p = pool(30, 12, 0);
    const rare = (i: number) => `rare-${String(i).padStart(2, '0')}`;
    const common = (i: number) => `common-${String(i).padStart(2, '0')}`;
    let s: draft.DraftState = {
      v: 1,
      rng: 5,
      cards: Object.fromEntries(p.map((c) => [c.id, c])),
      field: [rare(0), rare(1), rare(2), rare(3), rare(4), rare(5)],
      pile: [rare(10), rare(11), common(10), common(11), common(12), ...Array.from({ length: 15 }, (_, i) => common(13 + i))],
      // 席0はもうレアを4回取った。次は席1
      picks: [
        { player: 0, cardId: rare(6) },
        { player: 1, cardId: common(0) },
        { player: 0, cardId: rare(7) },
        { player: 1, cardId: common(1) },
        { player: 0, cardId: rare(8) },
        { player: 1, cardId: common(2) },
        { player: 0, cardId: rare(9) },
      ],
      first: 0,
    };
    s = take(s, 1, rare(0));
    // 補充で rare(10)、席0が取れないので rare(11)・common(10) を追加
    expect(s.field).toEqual([rare(1), rare(2), rare(3), rare(4), rare(5), rare(10), rare(11), common(10)]);
    expect(s.picks[s.picks.length - 1]!.extra).toBe(2);
    expect(draft.takeInfos(s, 0).filter((t) => t.ok).map((t) => t.cardId)).toEqual([common(10)]);
    expect(draft.autoPick(s, 0)).toBe(common(10));
    s = take(s, 0, common(10));
    expect(s.field).toHaveLength(7);
    // 席1が取って6枚に戻るが、場はレアだけなので席0のためにまた1枚追加
    s = take(s, 1, rare(1));
    expect(s.field).toHaveLength(7);
    expect(s.picks[s.picks.length - 1]!.extra).toBe(1);
    s = take(s, 0, common(11));
    expect(s.field).toHaveLength(6);
    expect(s.picks[s.picks.length - 1]!.extra).toBeUndefined();
    // 6枚に戻ったら、また取るたびに補充する
    s = take(s, 1, rare(2));
    expect(s.field).toHaveLength(6);
  });

  it('どの強さのおまかせも、取れるカードだけを選ぶ', () => {
    for (const level of ['easy', 'normal', 'hard'] as const) {
      for (const seed of [21, 22, 23]) {
        let s = mustCreate({ seed, pool: PRESET_CARDS });
        while (!draft.isDraftDone(s)) {
          const p = draft.draftTurn(s)!;
          const id = draft.autoPick(s, p, level, seed);
          const info = draft.takeInfos(s, p).find((t) => t.cardId === id);
          expect(info?.ok).toBe(true);
          s = take(s, p, id!);
        }
      }
    }
  });

  it('おまかせの判断：強いカードを取り、同じ状態なら同じ答え', () => {
    const weak = card({ id: 'a-weak', name: '弱', cost: 1, effects: [{ id: 'draw', value: 1, timing: 'play', target: 'self', condition: null }] });
    const strong = card({ id: 'b-strong', name: '強', rarity: 'epic', cost: 3, stats: { attack: 5, hp: 5, defense: 0 } });
    const s: draft.DraftState = {
      v: 1,
      rng: 9,
      cards: Object.fromEntries([...pool(30, 0, 0), weak, strong].map((c) => [c.id, c])),
      field: ['a-weak', 'b-strong'],
      pile: [],
      picks: [],
      first: 0,
    };
    expect(draft.autoPick(s, 0, 'hard')).toBe('b-strong');
    expect(draft.autoPick(s, 0, 'normal')).toBe(draft.autoPick(structuredClone(s), 0, 'normal'));
  });
});

describe('見え方と保存', () => {
  it('JSON にしても同じ（続きも同じ結果になる）', () => {
    const start = mustCreate({ seed: 77, pool: PRESET_CARDS });
    const mid = take(start, start.first, start.field[0]!);
    const copy = JSON.parse(JSON.stringify(mid)) as draft.DraftState;
    expect(copy).toEqual(mid);
    expect(runAuto(copy)).toEqual(runAuto(mid));
    const s = runAuto(mid);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it('見え方には伏せた山の中身・順番・乱数を含めない（枚数だけ）', () => {
    let s = mustCreate({ seed: 5, pool: PRESET_CARDS });
    for (let i = 0; i < 7; i++) s = take(s, draft.draftTurn(s)!, draft.autoPick(s, draft.draftTurn(s)!)!);
    for (const seat of [0, 1] as const) {
      const v = draft.draftView(s, seat);
      const json = JSON.stringify(v);
      expect(json).not.toContain('"pile"');
      expect(json).not.toContain('"rng"');
      // 山にしか無いカード（場・取ったカードと重ならないもの）は見え方に出ない
      const shown = new Set([...s.field, ...s.picks.map((x) => x.cardId)]);
      for (const id of s.pile) if (!shown.has(id)) expect(json).not.toContain(`"${id}"`);
      expect(v.pileSize).toBe(s.pile.length);
      expect(v.field.map((c) => c.id)).toEqual(s.field);
      expect(v.takeable.map((t) => t.cardId)).toEqual(s.field);
      expect(v.takesLeft).toEqual([D.takes - s.picks.filter((x) => x.player === 0).length, D.takes - s.picks.filter((x) => x.player === 1).length]);
      expect(v.turn).toBe(draft.draftTurn(s));
      expect(v.taken[0].reduce((a, t) => a + t.count, 0) + v.taken[1].reduce((a, t) => a + t.count, 0)).toBe(7 * D.copies);
    }
  });

  it('終わったドラフトを小さくしても、デッキと見え方は変わらない', () => {
    const s = runAuto(mustCreate({ seed: 8, pool: PRESET_CARDS }));
    const c = draft.compactDraft(s);
    expect(c.pile).toEqual([]);
    expect(Object.keys(c.cards).length).toBeLessThan(Object.keys(s.cards).length);
    expect(draft.draftDecks(c)).toEqual(draft.draftDecks(s));
    expect({ ...draft.draftView(c, 0), pileSize: 0 }).toEqual({ ...draft.draftView(s, 0), pileSize: 0 });
  });
});

describe('対戦の開始の先攻（GameConfig.first）', () => {
  it('指定すればその人、無ければシードで決まる', () => {
    const [a, b] = PRESET_DECKS as unknown as [(typeof PRESET_DECKS)[number], (typeof PRESET_DECKS)[number]];
    for (const first of [0, 1] as const) {
      const g = battle.createGame({ seed: 3, first, players: [{ name: 'A', deck: a.deck, cards: a.cards }, { name: 'B', deck: b.deck, cards: b.cards }] });
      expect(g.ok && g.state.first).toBe(first);
      expect(g.ok && g.state.active).toBe(first);
    }
  });
});
