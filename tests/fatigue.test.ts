// 疲労（山札切れ。決定事項 #102）：山札も捨て札も無くて引けなかった1枚ごとに、その試合で n 枚目なら n×fatigueStep のダメージ。
// 倍率1で確かめる（fatigueStep＝1）
import { describe, expect, it } from 'vitest';
import { ai, BALANCE, battle, type CardDef } from '../src/engine/index.ts';
import { leanView, simulate } from '../src/engine/ai/sim.ts';
import { buildEvents } from '../src/ui/battle/events.ts';
import { summarizeResult } from '../src/ui/battle/summary.ts';
import { card } from './helpers.ts';
import { act, endTurn, fx, giveCard, logText, rich, startGame } from './battle/helpers.ts';

type G = battle.GameState;
const B = BALANCE.battle;

/** 山札・捨て札（hand なら手札も）を空にする */
function drain(g: G, p: battle.PlayerId, hand = true): G {
  const ps = g.players[p];
  ps.deck = [];
  ps.discard = [];
  if (hand) ps.hand = [];
  return g;
}
/** プレイヤー p が受けた疲労のダメージ（ログの構造化イベントから、順に） */
const fatigueHits = (g: G, p: battle.PlayerId, from = 0) =>
  g.log
    .slice(from)
    .filter((e) => e.ev?.kind === 'damage' && e.ev.damageKind === 'fatigue' && e.ev.target?.kind === 'player' && e.ev.target.player === p)
    .map((e) => e.ev!.amount);
/** n 枚目からの k 枚ぶんの疲労 */
const steps = (from: number, k: number) => Array.from({ length: k }, (_, i) => (from + i) * B.fatigueStep);
const drawMonster = (count: number): CardDef =>
  card({ id: `drawer${count}`, name: `引く獣${count}`, rarity: 'common', cost: 1, stats: { attack: 1, hp: 1, defense: 0 }, effects: [fx({ id: 'draw', value: count, target: 'self', timing: 'summon' })] });

describe('疲労（山札切れ）', () => {
  it('倍率1では fatigueStep は1（1・2・3…）', () => {
    expect(B.fatigueStep).toBe(1);
    expect([1, 2, 3].map(battle.fatigueDamage)).toEqual([1, 2, 3]);
    expect(battle.nextFatigueDamage({})).toBe(1);
    expect(battle.nextFatigueDamage({ fatigue: 4 })).toBe(5);
  });

  it('捨て札があれば今までどおり混ぜて山札にするので、疲労は起きない（ターン終了時に捨てた手札も混ぜる）', () => {
    let g = startGame();
    const ps = g.players[0];
    // 山札は空、捨て札に残りを移す
    ps.discard = ps.deck;
    ps.deck = [];
    g = endTurn(endTurn(g));
    expect(g.players[0].hand).toHaveLength(B.drawPerTurn);
    expect(g.players[0].fatigue).toBeUndefined();
    expect(g.players[0].hp).toBe(B.playerHp);
    expect(logText(g)).toContain('シャッフルして山札にした');
    // 山札も捨て札も空でも、手札がターン終了時に捨て札へ行けば引ける
    let h = drain(startGame(), 0, false);
    h = endTurn(endTurn(h));
    expect(h.players[0].hand).toHaveLength(B.drawPerTurn);
    expect(fatigueHits(h, 0)).toEqual([]);
  });

  it('引けなかった1枚ごとに 1・2・3…と増える（1ターン目 15、次のターン 40）。ログに知らせと構造化イベント', () => {
    let g = drain(startGame(), 0);
    g = endTurn(endTurn(g));
    expect(g.players[0].hand).toEqual([]);
    expect(fatigueHits(g, 0)).toEqual(steps(1, 5));
    expect(g.players[0].fatigue).toBe(5);
    expect(g.players[0].hp).toBe(B.playerHp - 15 * B.fatigueStep);
    const note = g.log.find((e) => e.ev?.kind === 'status' && e.ev.status === 'fatigue');
    expect(note?.ev).toMatchObject({ player: 0, amount: 5 });
    expect(note?.text).toContain('通算1〜5枚目');
    // 疲労のダメージに出どころは無い
    expect(g.log.filter((e) => e.ev?.damageKind === 'fatigue').every((e) => e.ev!.source === undefined)).toBe(true);
    // 相手（山札あり）は普通に引く
    expect(g.players[1].fatigue).toBeUndefined();
    const n = g.log.length;
    g = endTurn(endTurn(g));
    expect(fatigueHits(g, 0, n)).toEqual(steps(6, 5));
    expect(g.players[0].fatigue).toBe(10);
    expect(g.players[0].hp).toBe(B.playerHp - 55 * B.fatigueStep);
    expect(battle.nextFatigueDamage(g.players[0])).toBe(11 * B.fatigueStep);
  });

  it('足りない分だけ：山札2枚・捨て札なしで5枚引くと、2枚引いて3枚ぶん（1+2+3）', () => {
    let g = startGame();
    const ps = g.players[0];
    ps.deck = ps.deck.slice(0, 2);
    ps.discard = [];
    ps.hand = [];
    g = endTurn(endTurn(g));
    expect(g.players[0].hand).toHaveLength(2);
    expect(fatigueHits(g, 0)).toEqual(steps(1, 3));
  });

  it('守備力・シールド・無効化を無視（毒と同じ）。引かせる効果でもターンの途中で起き、引けなかった1枚も1ターンの上限に数える', () => {
    let g = rich(drain(startGame(), 0));
    g.players[0].shield = 10;
    g.players[0].status.nullify = 2;
    const uid = giveCard(g, 0, drawMonster(3));
    g = act(g, { type: 'playCard', player: 0, cardUid: uid, chosen: {} });
    expect(fatigueHits(g, 0)).toEqual(steps(1, 3));
    expect(g.players[0].shield).toBe(10);
    expect(g.players[0].status.nullify).toBe(2);
    expect(g.players[0].hp).toBe(B.playerHp - 6 * B.fatigueStep);
    // 上限：このターンもう3枚「引いた」ので、10枚引く効果でも残りの7枚ぶんだけ
    const n = g.log.length;
    const big = giveCard(g, 0, drawMonster(B.maxDrawPerTurn));
    g = act(g, { type: 'playCard', player: 0, cardUid: big, chosen: {} });
    expect(fatigueHits(g, 0, n)).toEqual(steps(4, B.maxDrawPerTurn - 3));
    expect(logText(g)).toContain(`もう引けない（1ターン${B.maxDrawPerTurn}枚まで）`);
  });

  it('相手に引かせた疲労（お互いに引く）は、手番の人が相手にダメージを与えたことに数えない（速度も上がらない）', () => {
    let g = rich(startGame());
    drain(g, 1);
    g.players[0].speed = 1;
    const uid = giveCard(g, 0, card({ id: 'both', name: 'お互いに引く', rarity: 'common', cost: 1, effects: [fx({ id: 'draw', value: 2, target: 'bothPlayers' })] }));
    g = act(g, { type: 'playCard', player: 0, cardUid: uid, chosen: {} });
    expect(fatigueHits(g, 1)).toEqual(steps(1, 2));
    expect(g.players[1].hp).toBe(B.playerHp - 3 * B.fatigueStep);
    expect(g.players[0].turn.enemyDamaged).toBeFalsy();
    expect(g.players[0].turn.enemyDamageTotal ?? 0).toBe(0);
    expect(g.players[0].speed).toBe(1);
  });

  it('疲労で HP が0になれば負け（そこで止まる）。結果の決め手は「疲労」', () => {
    let g = drain(startGame(), 0);
    g.players[0].hp = 3 * B.fatigueStep;
    g = endTurn(endTurn(g));
    expect(g.phase).toBe('ended');
    expect(g.result).toMatchObject({ winner: 1, reason: 'hp' });
    expect(fatigueHits(g, 0)).toEqual(steps(1, 2));
    expect(g.players[0].fatigue).toBe(2);
    expect(summarizeResult(battle.viewFor(g, 1), 1).decisive).toBe('疲労（山札切れ）');
  });

  it('古い保存（fatigue が無い）でも動き、続きは保存した数から数える。JSON にでき、相手にも見える（公開情報）', () => {
    let g = startGame();
    expect('fatigue' in g.players[0]).toBe(false);
    drain(g, 0);
    g = JSON.parse(JSON.stringify(g)) as G;
    g = endTurn(endTurn(g));
    expect(fatigueHits(g, 0)).toEqual(steps(1, 5));
    // 途中まで疲労した保存
    let h = drain(startGame(), 0);
    h.players[0].fatigue = 3;
    h = endTurn(endTurn(h));
    expect(fatigueHits(h, 0)).toEqual(steps(4, 5));
    expect(JSON.parse(JSON.stringify(h))).toEqual(h);
    expect(battle.viewFor(h, 1).players[0].fatigue).toBe(8);
  });

  it('対戦画面の再生：知らせ（📭 疲労）と、1枚ずつ浮かぶダメージ', () => {
    let g = drain(startGame(), 0);
    const n = g.log.length;
    g = endTurn(endTurn(g));
    const evs = buildEvents(g.log.slice(n), battle.viewFor(g, 0), 0, 0);
    // 決定事項 #126：知らせの文に絵文字は使わない（形は gi）
    expect(evs.some((e) => e.show.t === 'notice' && e.show.text === '疲労（5）' && e.show.gi !== undefined)).toBe(true);
    const floats = evs.flatMap((e) => (e.show.t === 'float' && e.show.key === 'p0' && e.show.tone === 'poison' ? [e.show.text] : []));
    expect(floats).toEqual(steps(1, 5).map((x) => `−${x}`));
  });

  it('CPU の評価：次のターンに引けない分の疲労を見込む（ふつうは0）', () => {
    const g = startGame();
    expect(ai.fatigueOutlook(g, 0)).toBe(0);
    expect(ai.fatigueOutlook(g, 1)).toBe(0);
    // 手番ではない P1：山札も捨て札も無ければ（手元の手札は保持したもので、引く山には入らない）、次のターンの5枚ぶん（1〜5）。
    // ただし1ターン目は配った手札を使うので引かない
    const dry = drain(structuredClone(g), 1, false);
    expect(ai.fatigueOutlook(dry, 1)).toBe(0);
    dry.players[1].turnsTaken = 1;
    g.players[1].turnsTaken = 1;
    expect(ai.fatigueOutlook(dry, 1)).toBe(15 * B.fatigueStep);
    expect(ai.evaluate(dry, 1)).toBeCloseTo(ai.evaluate(g, 1) - 15 * B.fatigueStep * ai.WEIGHTS.fatigue);
    // 手番の P0：手札はターン終了時に捨て札へ行くので数える（手札5枚なら0）
    const mine = drain(structuredClone(g), 0, false);
    expect(ai.fatigueOutlook(mine, 0)).toBe(0);
    mine.players[0].hand = mine.players[0].hand.slice(0, 2);
    expect(ai.fatigueOutlook(mine, 0)).toBe(6 * B.fatigueStep);
    // 相手の疲労の見込みは評価に入れない（仮の実行の盤面では相手の山札・捨て札を外すため）
    expect(ai.evaluate(dry, 0)).toBe(ai.evaluate(g, 0));
  });

  it('CPU の仮の実行（leanView）は相手の山札・捨て札を外すが、ターンを終えても相手に疲労を起こさない', () => {
    const g = startGame();
    const lean = leanView(battle.viewFor(g, 0), 0);
    expect(lean.players[1].deck).toEqual([]);
    expect(lean.players[1].noFatigue).toBe(true);
    expect(lean.players[0].noFatigue).toBeUndefined();
    const s = simulate(lean, { type: 'endTurn', player: 0 }, 1, 0)!;
    expect(s.active).toBe(1);
    expect(s.players[1].hp).toBe(B.playerHp);
    expect(s.players[1].fatigue).toBeUndefined();
    expect(ai.fatigueOutlook(lean, 1)).toBe(0);
  });
});
