// 実際のインフレ倍率で確かめる（決定事項 #65）。ほかのテストは倍率1（元の仕様の数字）で動く
import { describe, expect, it } from 'vitest';
import { BALANCE, ai, analyzeCard, battle, getEffect, newCard, DEFAULT_STATS, parseCard, type CardDef } from '../src/engine/index.ts';
import { PRESET_DECKS } from '../src/presets.ts';
import { SAMPLE_CARDS } from '../src/samples.ts';
import { card } from './helpers.ts';

const S = BALANCE.scale;
const sample = (id: string) => SAMPLE_CARDS.find((c) => c.id === `sample-${id}`)!;

describe('インフレ倍率', () => {
  it('倍率は10。HP・上限・コストのポイントが10倍', () => {
    expect(S).toBe(10);
    expect(BALANCE.battle.playerHp).toBe(600);
    expect(Object.values(BALANCE.rarity).map((r) => r.cap)).toEqual([50, 80, 120, 180]);
    expect(BALANCE.card.pointsPerCost).toBe(100);
    // 枚数・エナジー・ターン数は変わらない
    expect(BALANCE.battle).toMatchObject({ energyPerTurn: 3, drawPerTurn: 5, maxTurns: 30, burnTurns: 3 });
    expect(BALANCE.params.hitsMax).toBe(5);
  });

  it('作成例4枚は数字が10倍になり、ポイントも10倍で同じ判定', () => {
    const hinoko = analyzeCard(sample('hinoko'));
    expect(sample('hinoko').effects[0]!.value).toBe(20);
    expect(hinoko.points.total).toBe(40);
    expect(hinoko.text.effects[0]).toBe('相手1体に20ダメージを与える。');

    const nezumi = analyzeCard(sample('dokuga-nezumi'));
    expect(sample('dokuga-nezumi').stats).toEqual({ attack: 10, hp: 20, defense: 0 });
    expect(nezumi.points.total).toBe(30);

    const todome = analyzeCard(sample('todome'));
    expect(todome.points.total).toBe(40);

    const kyosenshi = analyzeCard(sample('kyosenshi'));
    expect(kyosenshi.points.total).toBe(120);
    expect(kyosenshi.points.drawbackTotal).toBe(180);
    for (const a of [hinoko, nezumi, todome, kyosenshi]) expect(a.valid).toBe(true);
    expect([hinoko, nezumi, todome, kyosenshi].map((a) => a.cardType)).toEqual(['attack', 'monster', 'attack', 'power']);
  });

  it('プリセット3つはこの倍率でもルールを守る', () => {
    for (const p of PRESET_DECKS) {
      for (const c of p.cards) expect(analyzeCard(c).violations, `${p.name}：${c.name}`).toEqual([]);
    }
  });

  it('エディターの初期値：量は10倍、枚数などはそのまま', () => {
    expect(DEFAULT_STATS).toEqual({ attack: 10, hp: 10, defense: 0 });
    expect(newCard('n').scale).toBe(10);
    expect(getEffect('damage')!.value!.default).toBe(20);
    expect(getEffect('draw')!.value!.default).toBe(1);
    expect(getEffect('multiHit')!.hits!.max).toBe(5);
  });
});

describe('保存してあったカードの移行', () => {
  const old = {
    v: 1,
    id: 'old',
    name: '古いカード',
    icon: '🃏',
    rarity: 'legend',
    cost: 2,
    stats: { attack: 3, hp: 4, defense: 1 },
    keywords: [{ id: 'selfRepair', value: 2 }],
    effects: [
      { id: 'multiHit', value: 2, hits: 3, timing: 'summon', target: 'chosen', condition: null },
      { id: 'draw', value: 2, timing: 'summon', target: 'self', condition: null },
      { id: 'burn', value: 1, timing: 'summon', target: 'chosen', condition: null },
    ],
    drawbacks: [{ id: 'selfDamage', value: 3, timing: 'summon' }],
  };

  it('倍率の印がないカードは、量だけ10倍にする（回数・枚数・延長ターンはそのまま）', () => {
    const r = parseCard(old);
    expect(r.ok).toBe(true);
    const c = (r as { value: CardDef }).value;
    expect(c.scale).toBe(10);
    expect(c.stats).toEqual({ attack: 30, hp: 40, defense: 10 });
    expect(c.keywords[0]!.value).toBe(20);
    expect(c.effects.map((e) => [e.value, e.hits])).toEqual([
      [20, 3],
      [2, undefined],
      [1, undefined],
    ]);
    expect(c.drawbacks[0]!.value).toBe(30);
  });

  it('今の倍率の印があるカードは変えない（2回読んでも同じ）', () => {
    const once = (parseCard(old) as { value: CardDef }).value;
    const twice = (parseCard(JSON.parse(JSON.stringify(once))) as { value: CardDef }).value;
    expect(twice).toEqual(once);
  });

  it('移行しても、前に作れたカードは作れて、作れなかったカードは作れない', () => {
    // 作成例の違反ケース：コモンで「ダメージ2＋やけど」は4pt で作れ、「ダメージ3＋やけど」は6pt で超過
    const fire = (damage: number) =>
      (
        parseCard(
          card({
            effects: [
              { id: 'damage', value: damage, timing: 'play', target: 'chosen', condition: null },
              { id: 'burn', value: 0, timing: 'play', target: 'chosen', condition: null },
            ],
          }),
        ) as { value: CardDef }
      ).value;
    expect(analyzeCard(fire(2)).points.total).toBe(40);
    expect(analyzeCard(fire(2)).valid).toBe(true);
    expect(analyzeCard(fire(3)).points.total).toBe(60);
    expect(analyzeCard(fire(3)).valid).toBe(false);
  });
});

describe('この倍率での対戦', () => {
  it('毒は毎ターン10ずつ減る', () => {
    const [A, B] = PRESET_DECKS as [(typeof PRESET_DECKS)[number], (typeof PRESET_DECKS)[number]];
    const r = battle.createGame({
      seed: 3,
      first: 0,
      players: [
        { name: 'A', deck: A.deck, cards: A.cards },
        { name: 'B', deck: B.deck, cards: B.cards },
      ],
    });
    if (!r.ok) throw new Error(r.error);
    let g = r.state;
    for (const p of [0, 1] as const) {
      const m = battle.applyAction(g, { type: 'mulligan', player: p, mode: 'keep' });
      if (!m.ok) throw new Error(m.error);
      g = m.state;
    }
    expect(g.players[1].hp).toBe(600);
    g.players[1].status.poison = 25;
    const end = battle.applyAction(g, { type: 'endTurn', player: 0 });
    if (!end.ok) throw new Error(end.error);
    expect(end.state.players[1].hp).toBe(575);
    expect(end.state.players[1].status.poison).toBe(15);
  });

  it('CPU 同士がプリセットで最後まで対戦できる', () => {
    for (const [i, j] of [
      [0, 1],
      [1, 2],
      [2, 0],
    ] as const) {
      const [A, B] = [PRESET_DECKS[i]!, PRESET_DECKS[j]!];
      const r = battle.createGame({
        seed: 11 + i,
        players: [
          { name: A.name, deck: A.deck, cards: A.cards },
          { name: B.name, deck: B.deck, cards: B.cards },
        ],
      });
      if (!r.ok) throw new Error(r.error);
      let g = r.state;
      for (let k = 0; k < 4000 && g.phase !== 'ended'; k++) {
        const p: battle.PlayerId = g.phase === 'mulligan' ? (g.players[0].mulligan.done ? 1 : 0) : g.pending ? g.pending.player : g.active;
        const next = battle.applyAction(g, ai.cpuAction(g, p, k));
        if (!next.ok) throw new Error(next.error);
        g = next.state;
      }
      expect(g.phase, `${A.name} 対 ${B.name}`).toBe('ended');
    }
  });
});
