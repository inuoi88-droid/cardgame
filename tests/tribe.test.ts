// 種族の特徴（決定事項 #143）：得意・苦手のポイント、常時の特性、揃えたときのボーナス。倍率1で確かめる（数値は BALANCE.tribes から読む）
import { describe, expect, it } from 'vitest';
import { analyzeCard, BALANCE, battle, getEffect, getKeyword, TRIBE_IDS, type CardDef, type TribeId } from '../src/engine/index.ts';
import { card } from './helpers.ts';
import { act, attack, endTurn, fx, giveCard, logText, M, P, play, putMonster, rich, startGame } from './battle/helpers.ts';

type G = battle.GameState;
const T = BALANCE.tribes;

const mon = (tribe: TribeId | undefined, patch: Partial<CardDef> = {}): CardDef =>
  card({ id: `m-${tribe ?? 'none'}-${patch.name ?? 'x'}`, name: `${tribe ?? 'none'}${patch.name ?? ''}`, rarity: 'epic', cost: 3, stats: { attack: 2, hp: 6, defense: 0 }, ...(tribe ? { tribe } : {}), ...patch });
const line = (c: CardDef, label: string) => analyzeCard(c).points.lines.find((l) => l.label.includes(label));
const tribeEvs = (g: G, from = 0) => g.log.slice(from).filter((e) => e.ev?.kind === 'tribe').map((e) => e.ev!);

/** 3体並べる（同じ定義でも別のモンスター） */
function line3(g: G, p: battle.PlayerId, tribe: TribeId, patch: Partial<CardDef> = {}): string[] {
  return [0, 1, 2].map((i) => putMonster(g, p, mon(tribe, { name: `${i}`, ...patch })));
}

describe('得意・苦手（ポイント）', () => {
  it('得意・苦手の ID はどれも登録にある（キーワード・効果・stat:defense）', () => {
    for (const t of TRIBE_IDS) {
      for (const id of [...T[t].favored, ...T[t].unfavored]) {
        expect(id === 'stat:defense' || getKeyword(id) !== undefined || getEffect(id) !== undefined, `${t}:${id}`).toBe(true);
      }
      // 得意と苦手は重ならない
      expect(T[t].favored.filter((id) => (T[t].unfavored as readonly string[]).includes(id))).toEqual([]);
    }
    expect(T.human.unfavored).toEqual([]);
  });

  it('得意のキーワードは2割引き（切り捨て）。種族なし・ほかの種族では安くならない', () => {
    const base = { stats: { attack: 5, hp: 6, defense: 0 }, keywords: [{ id: 'haste' }] };
    const beast = mon('beast', base);
    const none = mon(undefined, base);
    const haste = analyzeCard(none).points.lines.find((l) => l.kind === 'keyword')!.value;
    const discount = Math.floor(haste * (1 - T.favorRate) + 1e-9);
    expect(discount).toBeGreaterThan(0);
    expect(line(beast, '種族（獣）の得意')!.value).toBe(-discount);
    expect(analyzeCard(beast).points.total).toBe(analyzeCard(none).points.total - discount);
    expect(line(mon('dragon', base), '種族')).toBeUndefined();
  });

  it('苦手は2割5分増し（切り上げ）。効果も数える', () => {
    const shield = mon('undead', { keywords: [{ id: 'divineShield' }] });
    const kw = analyzeCard(mon(undefined, { keywords: [{ id: 'divineShield' }] })).points.lines.find((l) => l.kind === 'keyword')!.value;
    expect(line(shield, '種族（不死）の苦手')!.value).toBe(Math.ceil(kw * (T.unfavorRate - 1) - 1e-9));
    const healer = mon('undead', { effects: [fx({ id: 'heal', value: 4, timing: 'summon', target: 'self' })] });
    expect(line(healer, '種族（不死）の苦手')!.value).toBeGreaterThan(0);
  });

  it('機械は守備力が得意', () => {
    const c = mon('machine', { stats: { attack: 2, hp: 6, defense: 3 } });
    const def = 3 * BALANCE.stats.defensePoints;
    expect(line(c, '種族（機械）の得意')!.value).toBe(-Math.floor(def * (1 - T.favorRate) + 1e-9));
  });

  it('呪文の種族は割引にならない（モンスターのカードだけ）', () => {
    const spell = card({ name: '獣の呪文', tribe: 'beast', effects: [fx({ id: 'damage', value: 5 })] });
    expect(line(spell, '種族')).toBeUndefined();
  });
});

describe('揃えたときのボーナス', () => {
  it('獣「群れ」：3体以上いる間だけ獣の攻撃力が上がる。封印中の獣は数えない', () => {
    const g = startGame();
    const [a, b] = line3(g, 0, 'beast');
    const m = battle.findMonster(g, a!)!;
    expect(battle.tribeSetActive(g, 0, 'beast')).toBe(true);
    expect(battle.effectiveAttack(g, m)).toBe(m.attack + T.beast.set.attack);
    battle.findMonster(g, b!)!.sealed = true;
    expect(battle.tribeCount(g, 0, 'beast')).toBe(2);
    expect(battle.effectiveAttack(g, m)).toBe(m.attack);
    // 相手の場の獣は数えない
    line3(g, 1, 'beast');
    expect(battle.effectiveAttack(g, m)).toBe(m.attack);
  });

  it('機械「連結」：守備力が上がり、受けるダメージが減る', () => {
    let g = rich(startGame());
    const [a] = line3(g, 1, 'machine');
    const target = battle.findMonster(g, a!)!;
    expect(battle.effectiveDefense(g, target)).toBe(T.machine.set.defense);
    const bolt = giveCard(g, 0, card({ id: 'bolt', name: '雷', effects: [fx({ id: 'damage', value: 4 })] }));
    g = play(g, bolt, { enemy: M(a!) });
    expect(battle.findMonster(g, a!)!.hp).toBe(6 - (4 - T.machine.set.defense));
  });

  it('竜「竜の息」・人「隊列」：ターン開始時に相手にダメージ・自分が回復', () => {
    let g = startGame();
    line3(g, 0, 'dragon');
    line3(g, 0, 'human');
    g.players[0].hp -= 10;
    const hp0 = g.players[0].hp;
    const hp1 = g.players[1].hp;
    g = endTurn(endTurn(g));
    expect(g.players[1].hp).toBe(hp1 - T.dragon.set.breath);
    expect(g.players[0].hp).toBe(hp0 + T.human.set.heal);
    expect(tribeEvs(g).map((e) => `${e.tribe}:${e.status}`)).toEqual(expect.arrayContaining(['dragon:set', 'human:set']));
  });

  it('精霊「共鳴」：ターン開始時に多く引く', () => {
    let g = startGame();
    line3(g, 0, 'spirit');
    g = endTurn(endTurn(g));
    expect(g.players[0].hand).toHaveLength(BALANCE.battle.drawPerTurn + T.spirit.set.draw);
  });

  it('不死「怨嗟」：揃っている不死が破壊されるたび相手にダメージ（破壊の前に3体いれば）', () => {
    let g = rich(startGame());
    const [a, b] = line3(g, 1, 'undead', { stats: { attack: 1, hp: 2, defense: 0 } });
    const hp0 = g.players[0].hp;
    const kill = card({ id: 'kill', name: '処刑', effects: [fx({ id: 'damage', value: 9 })] });
    g = play(g, giveCard(g, 0, kill), { enemy: M(a!) });
    expect(g.players[0].hp).toBe(hp0 - T.undead.set.onDeath);
    // 残り2体：もう揃っていない
    g = play(g, giveCard(g, 0, kill), { enemy: M(b!) });
    expect(g.players[0].hp).toBe(hp0 - T.undead.set.onDeath);
  });

  it('2体では働かない', () => {
    let g = startGame();
    putMonster(g, 0, mon('dragon', { name: 'a' }));
    putMonster(g, 0, mon('dragon', { name: 'b' }));
    const hp1 = g.players[1].hp;
    g = endTurn(endTurn(g));
    expect(g.players[1].hp).toBe(hp1);
  });
});

describe('常時の特性', () => {
  it('竜「竜鱗」はやけど・凍結に、機械「鋼の体」は毒・出血にならない', () => {
    let g = rich(startGame());
    const d = putMonster(g, 1, mon('dragon'));
    const m = putMonster(g, 1, mon('machine'));
    const burn = card({ id: 'burn', name: '火', effects: [fx({ id: 'burn', value: 2 })] });
    const poison = card({ id: 'poison', name: '毒', effects: [fx({ id: 'poison', value: 3 })] });
    g = play(g, giveCard(g, 0, burn), { enemy: M(d) });
    g = play(g, giveCard(g, 0, poison), { enemy: M(m) });
    expect(battle.findMonster(g, d)!.status.burn).toBe(0);
    expect(battle.findMonster(g, m)!.status.poison).toBe(0);
    expect(logText(g)).toContain('竜鱗でやけどにならない');
    expect(logText(g)).toContain('鋼の体で毒にならない');
    // 封印中は働かない
    battle.findMonster(g, m)!.sealed = true;
    g = play(g, giveCard(g, 0, poison), { enemy: M(m) });
    expect(battle.findMonster(g, m)!.status.poison).toBe(3);
  });

  it('不死「腐食」：攻撃・反撃でダメージを与えた相手のモンスターに毒', () => {
    let g = startGame();
    const u = putMonster(g, 0, mon('undead', { stats: { attack: 1, hp: 9, defense: 0 } }));
    const foe = putMonster(g, 1, mon(undefined, { stats: { attack: 1, hp: 9, defense: 0 } }));
    g = attack(g, u, M(foe));
    expect(battle.findMonster(g, foe)!.status.poison).toBe(T.undead.trait.poisonOnHit);
    // 反撃側が不死なら、攻撃したモンスターに毒
    let h = startGame();
    const a = putMonster(h, 0, mon(undefined, { stats: { attack: 1, hp: 9, defense: 0 } }));
    const d = putMonster(h, 1, mon('undead', { stats: { attack: 1, hp: 9, defense: 0 } }));
    h = attack(h, a, M(d));
    expect(battle.findMonster(h, a)!.status.poison).toBe(T.undead.trait.poisonOnHit);
  });

  it('獣「狩猟本能」：攻撃で倒すたび攻撃力+（上限まで）', () => {
    let g = startGame();
    const b = putMonster(g, 0, mon('beast', { stats: { attack: 5, hp: 50, defense: 0 } }), { counters: {} });
    const steps = Math.ceil(T.beast.trait.maxBonus / T.beast.trait.attackPerKill) + 1;
    for (let i = 0; i < steps; i++) {
      const prey = putMonster(g, 1, mon(undefined, { name: `p${i}`, stats: { attack: 0, hp: 1, defense: 0 } }));
      battle.findMonster(g, b)!.attacksUsed = 0;
      g = attack(g, b, M(prey));
    }
    expect(battle.findMonster(g, b)!.attack).toBe(5 + T.beast.trait.maxBonus);
    // プレイヤーを殴っても増えない
    battle.findMonster(g, b)!.attacksUsed = 0;
    g = attack(g, b, P(1));
    expect(battle.findMonster(g, b)!.attack).toBe(5 + T.beast.trait.maxBonus);
  });

  it('精霊「霊体」：出たターンと相手の次のターンは相手のカードに選ばれず、自分の次のターンからは選ばれる', () => {
    let g = rich(startGame());
    const s = giveCard(g, 0, mon('spirit', { cost: 1 }));
    g = play(g, s);
    const spirit = g.players[0].board[0]!;
    expect(battle.cardTargetable(g, spirit)).toBe(false);
    g = endTurn(g);
    expect(battle.cardTargetable(g, battle.findMonster(g, spirit.uid)!)).toBe(false);
    g = endTurn(g);
    expect(battle.cardTargetable(g, battle.findMonster(g, spirit.uid)!)).toBe(true);
  });

  it('人「研鑽」：攻撃力アップ・鍛錬・装備でさらに上がる（人でなければ上がらない）', () => {
    let g = rich(startGame());
    const h = putMonster(g, 0, mon('human'));
    const o = putMonster(g, 0, mon('beast'));
    const up = card({ id: 'up', name: '鼓舞', effects: [fx({ id: 'attackUp', value: 2, target: 'chosen' })] });
    g = play(g, giveCard(g, 0, up), { ally: h });
    g = play(g, giveCard(g, 0, up), { ally: o });
    expect(battle.findMonster(g, h)!.attack).toBe(2 + 2 + T.human.trait.growBonus);
    expect(battle.findMonster(g, o)!.attack).toBe(2 + 2);
  });

  it('裏向き・休眠のモンスターは種族の特徴を持たない', () => {
    const g = startGame();
    const d = putMonster(g, 0, mon('dragon'));
    const m = battle.findMonster(g, d)!;
    expect(battle.traitTribe(g, m)).toBe('dragon');
    m.faceDown = { cardId: m.card.cardId } as never;
    expect(battle.monsterTribe(g, m)).toBeUndefined();
  });
});

describe('出来事', () => {
  it('特性・揃いの出来事は kind tribe（種族と trait / set）', () => {
    let g = rich(startGame());
    const d = putMonster(g, 1, mon('dragon'));
    g = play(g, giveCard(g, 0, card({ id: 'burn2', name: '火', effects: [fx({ id: 'burn', value: 1 })] })), { enemy: M(d) });
    expect(tribeEvs(g)).toEqual([{ kind: 'tribe', tribe: 'dragon', status: 'trait', target: M(d) }]);
    void act;
  });
});
