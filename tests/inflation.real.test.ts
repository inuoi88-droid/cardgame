// 実際の倍率で確かめる（インフレ倍率 #65・予算倍率 #66）。ほかのテストは倍率1（元の仕様の数字）で動く
import { describe, expect, it } from 'vitest';
import { BALANCE, ai, analyzeCard, battle, getEffect, newCard, DEFAULT_STATS, parseCard } from '../src/engine/index.ts';
import { PRESET_DECKS } from '../src/presets.ts';
import { SAMPLE_CARDS } from '../src/samples.ts';
import { card } from './helpers.ts';

const sample = (id: string) => SAMPLE_CARDS.find((c) => c.id === `sample-${id}`)!;
const parsed = (x: unknown) => {
  const r = parseCard(x);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe('倍率', () => {
  it('インフレ10倍・予算2倍：量は20倍、予算（上限・コスト）も20倍、効果やキーワードの固定ポイントは10倍', () => {
    expect(BALANCE.scale).toBe(10);
    expect(BALANCE.amountScale).toBe(20);
    expect(BALANCE.battle.playerHp).toBe(1200);
    expect(Object.values(BALANCE.rarity).map((r) => r.cap)).toEqual([100, 160, 240, 360]);
    expect(Object.values(BALANCE.rarity).map((r) => r.maxEffects)).toEqual([3, 4, 4, 4]);
    expect(BALANCE.card.pointsPerCost).toBe(200);
    expect(BALANCE.keywords.flying.flat).toBe(60);
    expect(BALANCE.effects.draw.perValue).toBe(50);
    // デメリットは予算と同じだけ増える（呪いの作りやすさは変えない）
    expect(BALANCE.drawbacks.gift.flat).toBe(80);
    // 枚数・エナジー・ターン数は変わらない
    expect(BALANCE.battle).toMatchObject({ energyPerTurn: 3, drawPerTurn: 5, maxTurns: 30, burnTurns: 3 });
    expect(BALANCE.params.hitsMax).toBe(5);
  });

  it('作成例4枚は数字が20倍になり、どれも作れる', () => {
    const hinoko = analyzeCard(sample('hinoko'));
    expect(sample('hinoko').effects[0]!.value).toBe(40);
    expect(hinoko.text.effects[0]).toBe('相手1体に40ダメージを与える。');
    // ダメージ40（80pt）＋やけど100pt − コスト200pt
    expect(hinoko.points.total).toBe(-20);

    const nezumi = analyzeCard(sample('dokuga-nezumi'));
    expect(sample('dokuga-nezumi').stats).toEqual({ attack: 20, hp: 40, defense: 0 });
    expect(nezumi.points.total).toBe(60);

    expect(analyzeCard(sample('todome')).points.total).toBe(80);

    const kyosenshi = analyzeCard(sample('kyosenshi'));
    expect(kyosenshi.points.total).toBe(240);
    expect(kyosenshi.points.drawbackTotal).toBe(360);

    const all = ['hinoko', 'dokuga-nezumi', 'todome', 'kyosenshi'].map((id) => analyzeCard(sample(id)));
    for (const a of all) expect(a.valid).toBe(true);
    expect(all.map((a) => a.cardType)).toEqual(['attack', 'monster', 'attack', 'power']);
  });

  it('予算が増えた分、キーワードや効果を1枚に多く積める', () => {
    // コモン・コスト1（予算300pt）：飛行60 ＋ 攻撃するたび毒20（240pt…は多いので毒10＝60）＋ 攻撃力20・体力60
    const c = card({
      rarity: 'common',
      cost: 1,
      stats: { attack: 20, hp: 60, defense: 0 },
      keywords: [{ id: 'flying' }],
      effects: [{ id: 'poison', value: 10, timing: 'attack', target: 'chosen', condition: null }],
    });
    const a = analyzeCard(c);
    expect(a.points.total).toBe(60 + 120 + 60 + 60 - 200);
    expect(a.valid).toBe(true);
  });

  it('プリセット3つはこの倍率でもルールを守る', () => {
    for (const p of PRESET_DECKS) {
      for (const c of p.cards) expect(analyzeCard(c).violations, `${p.name}：${c.name}`).toEqual([]);
    }
  });

  it('エディターの初期値：量は20倍、枚数などはそのまま', () => {
    expect(DEFAULT_STATS).toEqual({ attack: 20, hp: 20, defense: 0 });
    expect(newCard('n').scale).toBe(20);
    expect(getEffect('damage')!.value!.default).toBe(40);
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

  it('倍率の印がないカード（最初の版）は、量だけ20倍にする（回数・枚数・延長ターンはそのまま）', () => {
    const c = parsed(old);
    expect(c.scale).toBe(20);
    expect(c.stats).toEqual({ attack: 60, hp: 80, defense: 20 });
    expect(c.keywords[0]!.value).toBe(40);
    expect(c.effects.map((e) => [e.value, e.hits])).toEqual([
      [40, 3],
      [2, undefined],
      [1, undefined],
    ]);
    expect(c.drawbacks[0]!.value).toBe(60);
  });

  it('10倍の印があるカード（予算2倍の前の版）は、量を2倍にする', () => {
    const c = parsed({ ...old, scale: 10, stats: { attack: 30, hp: 40, defense: 10 } });
    expect(c.scale).toBe(20);
    expect(c.stats).toEqual({ attack: 60, hp: 80, defense: 20 });
  });

  it('今の倍率の印があるカードは変えない（2回読んでも同じ）', () => {
    const once = parsed(old);
    expect(parsed(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });

  it('前に作れたカードは、移行しても作れる（予算が増えた分だけ余る）', () => {
    // 前の版（10倍）でコモン上限ちょうどだった「ダメージ20＋やけど」（40 + 100 − 100 = 40 / 50）
    const fire = parsed({
      ...card({
        effects: [
          { id: 'damage', value: 20, timing: 'play', target: 'chosen', condition: null },
          { id: 'burn', value: 0, timing: 'play', target: 'chosen', condition: null },
        ],
      }),
      scale: 10,
    });
    expect(fire.effects[0]!.value).toBe(40);
    const a = analyzeCard(fire);
    expect(a.valid).toBe(true);
    expect(a.points.remaining).toBe(120);
  });
});

describe('この倍率での対戦', () => {
  it('HP は1200、毒は毎ターン20ずつ減る', () => {
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
    expect(g.players[1].hp).toBe(1200);
    g.players[1].status.poison = 50;
    const end = battle.applyAction(g, { type: 'endTurn', player: 0 });
    if (!end.ok) throw new Error(end.error);
    expect(end.state.players[1].hp).toBe(1150);
    expect(end.state.players[1].status.poison).toBe(30);
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
