/** ドラッグ＆ドロップの判断（src/ui/battle/dragLogic.ts）。DOM は使わない */
import { describe, expect, it } from 'vitest';
import { arrowPath, gestureOf, parseSpot, pickSpot, planDrag, resolveDrop, spotKey, type DragSource } from '../../src/ui/battle/dragLogic.ts';

const opp = { kind: 'player', player: 1 } as const;
const m = (uid: string) => ({ kind: 'monster', uid }) as const;
const card = (over: Partial<Extract<DragSource, { kind: 'card' }>> = {}): DragSource => ({
  kind: 'card',
  uid: 'c1',
  noise: false,
  blocked: null,
  enemyTargets: [],
  allyTargets: [],
  ...over,
});

describe('spot の鍵', () => {
  it('行き来できる', () => {
    for (const k of ['m:abc', 'p:0', 'p:1', 'zone', 'hand']) expect(spotKey(parseSpot(k))).toBe(k);
    expect(parseSpot(null)).toEqual({ kind: 'none' });
    expect(parseSpot('p:2')).toEqual({ kind: 'none' });
  });
});

describe('planDrag', () => {
  it('対象のないカードは指についてくるゴーストで、場に落とす', () => {
    const p = planDrag(card());
    expect(p.mode).toBe('ghost');
    expect(p.zone).toBe('play');
    expect(p.targets).toEqual([]);
  });
  it('相手を選ぶカードは矢印で、候補が光る', () => {
    const p = planDrag(card({ enemyTargets: [opp, m('e1')] }));
    expect(p.mode).toBe('arrow');
    expect(p.targets).toEqual([opp, m('e1')]);
    expect(p.zone).toBeNull();
  });
  it('自分のモンスターを選ぶカード：自分自身の uid は光らせず、場に落とすと自分自身', () => {
    const p = planDrag(card({ allyTargets: ['a1', 'c1'] }));
    expect(p.mode).toBe('arrow');
    expect(p.targets).toEqual([m('a1')]);
    expect(p.zone).toBe('self');
  });
  it('自分自身しか選べないモンスターカードは、場に落とすだけ', () => {
    const p = planDrag(card({ allyTargets: ['c1'] }));
    expect(p.mode).toBe('ghost');
    expect(p.zone).toBe('self');
  });
  it('使えないカードは何も光らず、理由を案内に出す', () => {
    const p = planDrag(card({ blocked: 'エナジーが足りません', enemyTargets: [opp] }));
    expect(p.targets).toEqual([]);
    expect(p.zone).toBeNull();
    expect(p.hint).toBe('エナジーが足りません');
  });
  it('攻撃：攻撃できる相手だけが光る', () => {
    const p = planDrag({ kind: 'attacker', uid: 'a1', blocked: null, targets: [m('e1')] });
    expect(p.mode).toBe('arrow');
    expect(p.targets).toEqual([m('e1')]);
  });
  it('ノイズは場に落とすと除外', () => {
    expect(planDrag(card({ noise: true, blocked: 'ノイズ' })).zone).toBe('noise');
    expect(planDrag(card({ noise: true, blocked: 'エナジーが足りません' })).zone).toBeNull();
  });
});

describe('resolveDrop', () => {
  it('手札に戻すと取り消し', () => {
    expect(resolveDrop(card(), { kind: 'hand' })).toEqual({ t: 'cancel' });
    expect(resolveDrop(card({ blocked: 'x' }), { kind: 'hand' })).toEqual({ t: 'cancel' });
  });
  it('対象のないカード：場（どこでも）に落とすと使う、場の外では理由を出して戻す', () => {
    expect(resolveDrop(card(), { kind: 'zone' })).toEqual({ t: 'play', chosen: {} });
    expect(resolveDrop(card(), { kind: 'monster', uid: 'e1' })).toEqual({ t: 'play', chosen: {} });
    expect(resolveDrop(card(), { kind: 'none' }).t).toBe('invalid');
  });
  it('使えないカードは理由を出して戻す', () => {
    expect(resolveDrop(card({ blocked: 'エナジーが足りません' }), { kind: 'zone' })).toEqual({ t: 'invalid', reason: 'エナジーが足りません' });
  });
  it('相手を選ぶカード：光っている対象に落とすとその対象で使う', () => {
    const src = card({ enemyTargets: [opp, m('e1')] });
    expect(resolveDrop(src, { kind: 'monster', uid: 'e1' })).toEqual({ t: 'play', chosen: { enemy: m('e1') } });
    expect(resolveDrop(src, { kind: 'player', player: 1 })).toEqual({ t: 'play', chosen: { enemy: opp } });
  });
  it('相手を選ぶカード：候補でない対象は、エンジンに理由を聞けるように試した対象を返す', () => {
    const src = card({ enemyTargets: [m('taunt')] });
    const d = resolveDrop(src, { kind: 'player', player: 1 });
    expect(d.t).toBe('invalid');
    expect(d.t === 'invalid' && d.attempt).toEqual({ enemy: opp });
    expect(resolveDrop(src, { kind: 'zone' }).t).toBe('invalid');
  });
  it('両方選ぶカード：片方を落として決め、残りは候補で選ぶ（1つしかなければ自動）', () => {
    const src = card({ enemyTargets: [m('e1'), m('e2')], allyTargets: ['a1', 'a2'] });
    expect(resolveDrop(src, { kind: 'monster', uid: 'e1' })).toEqual({ t: 'need', chosen: { enemy: m('e1') }, need: 'ally' });
    expect(resolveDrop(src, { kind: 'monster', uid: 'a2' })).toEqual({ t: 'need', chosen: { ally: 'a2' }, need: 'enemy' });
    const one = card({ enemyTargets: [m('e1'), m('e2')], allyTargets: ['a1'] });
    expect(resolveDrop(one, { kind: 'monster', uid: 'e2' })).toEqual({ t: 'play', chosen: { enemy: m('e2'), ally: 'a1' } });
  });
  it('自分のモンスターを選ぶモンスターカード：場に落とすと自分自身、味方に落とすとその味方', () => {
    const src = card({ allyTargets: ['a1', 'c1'] });
    expect(resolveDrop(src, { kind: 'zone' })).toEqual({ t: 'play', chosen: { ally: 'c1' } });
    expect(resolveDrop(src, { kind: 'monster', uid: 'a1' })).toEqual({ t: 'play', chosen: { ally: 'a1' } });
    expect(resolveDrop(src, { kind: 'monster', uid: 'e9' }).t).toBe('invalid');
    expect(resolveDrop(card({ allyTargets: ['c1'] }), { kind: 'monster', uid: 'e9' })).toEqual({ t: 'play', chosen: { ally: 'c1' } });
  });
  it('攻撃：光っている相手に落とすと攻撃、それ以外は理由', () => {
    const src: DragSource = { kind: 'attacker', uid: 'a1', blocked: null, targets: [m('e1')] };
    expect(resolveDrop(src, { kind: 'monster', uid: 'e1' })).toEqual({ t: 'attack', target: m('e1') });
    const d = resolveDrop(src, { kind: 'player', player: 1 });
    expect(d.t === 'invalid' && d.attempt).toEqual({ target: opp });
    expect(resolveDrop({ ...src, blocked: '攻撃済み' }, { kind: 'monster', uid: 'e1' })).toEqual({ t: 'invalid', reason: '攻撃済み' });
    expect(resolveDrop(src, { kind: 'hand' })).toEqual({ t: 'cancel' });
  });
  it('ノイズ：場に落とすと除外、エナジー不足は理由', () => {
    expect(resolveDrop(card({ noise: true, blocked: 'ノイズ' }), { kind: 'zone' })).toEqual({ t: 'noise' });
    expect(resolveDrop(card({ noise: true, blocked: 'エナジーが足りません' }), { kind: 'zone' }).t).toBe('invalid');
  });
});

describe('pickSpot', () => {
  const box = (left: number, top: number, w: number, h: number) => ({ left, top, right: left + w, bottom: top + h });
  const boxes = [
    { key: 'zone', box: box(0, 0, 400, 400) },
    { key: 'm:e1', box: box(10, 10, 100, 100) },
    { key: 'm:e2', box: box(200, 10, 100, 100) },
    { key: 'hand', box: box(0, 500, 400, 150) },
  ];
  it('対象が使う場所より優先', () => {
    expect(pickSpot(50, 50, boxes)).toBe('m:e1');
    expect(pickSpot(150, 300, boxes)).toBe('zone');
    expect(pickSpot(50, 550, boxes)).toBe('hand');
    expect(pickSpot(50, 450, boxes)).toBeNull();
  });
  it('光っている対象には少し外れていても吸い付く', () => {
    expect(pickSpot(120, 50, boxes, new Set(['m:e1']))).toBe('m:e1');
    expect(pickSpot(120, 50, boxes)).toBe('zone');
    expect(pickSpot(190, 50, boxes, new Set(['m:e1', 'm:e2']))).toBe('m:e2');
  });
});

describe('gestureOf', () => {
  it('手札をタッチ：上向きの縦の動きだけドラッグ、横はスクロール', () => {
    expect(gestureOf(2, -4, 'touch', 'hand')).toBe('wait');
    expect(gestureOf(2, -12, 'touch', 'hand')).toBe('drag');
    expect(gestureOf(12, -3, 'touch', 'hand')).toBe('scroll');
    expect(gestureOf(0, 12, 'touch', 'hand')).toBe('scroll');
  });
  it('マウス・場は少し動いたらドラッグ', () => {
    expect(gestureOf(4, 0, 'mouse', 'hand')).toBe('wait');
    expect(gestureOf(8, 0, 'mouse', 'hand')).toBe('drag');
    expect(gestureOf(0, 7, 'touch', 'board')).toBe('drag');
  });
});

describe('arrowPath', () => {
  it('始点から終点への曲線を作る', () => {
    const a = arrowPath({ x: 0, y: 100 }, { x: 0, y: 0 });
    expect(a.d.startsWith('M 0 100 Q')).toBe(true);
    expect(a.d.endsWith('0 0')).toBe(true);
    expect(Number.isFinite(a.angle)).toBe(true);
  });
});
