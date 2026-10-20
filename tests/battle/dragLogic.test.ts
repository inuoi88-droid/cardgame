/** ドラッグ＆ドロップの判断（src/ui/battle/dragLogic.ts）。DOM は使わない */
import { describe, expect, it } from 'vitest';
import { arrowPath, gestureOf, parseSpot, pickSpot, planDrag, resolveDrop, resolveModeDrop, spotKey, type DragSource } from '../../src/ui/battle/dragLogic.ts';

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

// ---------------------------------------------------------------- MTG 要素 ○ バッチC1：捨て札から使う・起動・捨て札の山（サイクリング・魂力）
describe('新しい出どころ（捨て札・起動）と捨て札の山', () => {
  const act = (over: Partial<Extract<DragSource, { kind: 'activate' }>> = {}): DragSource => ({ kind: 'activate', uid: 'a1', blocked: null, enemyTargets: [], allyTargets: [], ...over });

  it('pile の鍵も行き来できる', () => {
    expect(spotKey(parseSpot('pile'))).toBe('pile');
  });

  it('サイクリング・魂力のカードは捨て札の山も光り、山に落とすと手札から使う能力', () => {
    const p = planDrag(card({ handAbilities: ['cycling'] }));
    expect(p.pile).toBe(true);
    expect(p.zone).toBe('play');
    expect(p.hint).toContain('サイクリング');
    expect(resolveDrop(card({ handAbilities: ['cycling'] }), { kind: 'pile' })).toEqual({ t: 'pile', abilities: ['cycling'] });
    // 使えない（エナジー不足）カードでも、山には落とせる
    const blocked = card({ blocked: 'エナジーが足りません', handAbilities: ['channel'] });
    expect(planDrag(blocked)).toMatchObject({ pile: true, targets: [], zone: null });
    expect(resolveDrop(blocked, { kind: 'pile' })).toEqual({ t: 'pile', abilities: ['channel'] });
    expect(resolveDrop(blocked, { kind: 'zone' })).toMatchObject({ t: 'invalid' });
    // 能力の無いカードは山を光らせない（山はプレイヤーの枠と同じ扱い）
    expect(planDrag(card()).pile).toBe(false);
    expect(resolveDrop(card(), { kind: 'pile' })).toEqual({ t: 'play', chosen: {} });
  });

  it('捨て札から持ってきたカードは手札と同じように使い、山に落としても何もしない', () => {
    const src = card({ from: 'discard', enemyTargets: [opp, m('e1')], handAbilities: ['cycling'] });
    expect(planDrag(src)).toMatchObject({ mode: 'arrow', pile: false, targets: [opp, m('e1')] });
    expect(resolveDrop(src, { kind: 'monster', uid: 'e1' })).toEqual({ t: 'play', chosen: { enemy: m('e1') } });
    expect(resolveDrop(src, { kind: 'pile' })).toEqual({ t: 'cancel' });
  });

  it('起動：対象が要らなければ場で離す。要るなら候補が光り、自分のモンスター（起動するモンスター自身も）を選べる', () => {
    expect(planDrag(act())).toMatchObject({ mode: 'ghost', zone: 'play', pile: false, hint: '場で離すと起動' });
    expect(resolveDrop(act(), { kind: 'zone' })).toEqual({ t: 'play', chosen: {} });
    expect(resolveDrop(act(), { kind: 'none' })).toMatchObject({ t: 'invalid' });
    const ally = act({ allyTargets: ['a1', 'a2'] });
    expect(planDrag(ally)).toMatchObject({ mode: 'arrow', targets: [m('a1'), m('a2')], zone: null });
    expect(resolveDrop(ally, { kind: 'monster', uid: 'a1' })).toEqual({ t: 'play', chosen: { ally: 'a1' } });
    const enemy = act({ enemyTargets: [opp] });
    expect(resolveDrop(enemy, { kind: 'player', player: 1 })).toEqual({ t: 'play', chosen: { enemy: opp } });
    expect(resolveDrop(act({ blocked: 'このターンはもう起動しました' }), { kind: 'zone' })).toEqual({ t: 'invalid', reason: 'このターンはもう起動しました' });
  });

  it('当たり判定：落とせる捨て札の山は、それを含むプレイヤーの枠より優先。落とせないなら枠', () => {
    const boxes = [
      { key: 'p:0', box: { left: 0, top: 0, right: 300, bottom: 100 } },
      { key: 'pile', box: { left: 10, top: 60, right: 50, bottom: 90 } },
    ];
    expect(pickSpot(20, 70, boxes, new Set(['pile']))).toBe('pile');
    expect(pickSpot(20, 70, boxes, new Set())).toBe('p:0');
    // 山の少し外でも吸い付く
    expect(pickSpot(55, 95, boxes, new Set(['pile']))).toBe('pile');
  });

  it('縦の一覧（捨て札）からは、タッチなら横の動きでつかむ（縦は一覧のスクロール）', () => {
    expect(gestureOf(3, 2, 'touch', 'list')).toBe('wait');
    expect(gestureOf(20, 4, 'touch', 'list')).toBe('drag');
    expect(gestureOf(3, 20, 'touch', 'list')).toBe('scroll');
    expect(gestureOf(0, -20, 'mouse', 'list')).toBe('drag');
  });
});

describe('モード選択のカード（MTG 要素 ○ バッチC2）', () => {
  // A：相手に5ダメージ（相手プレイヤー・m2）／B：引く（対象なし）。合わせた候補は相手側だけ
  const modal = card({ modal: true, enemyTargets: [opp, m('m2')], allyTargets: [] });
  const modeA = { blocked: null, enemyTargets: [opp, m('m2')], allyTargets: [] };
  const modeB = { blocked: null, enemyTargets: [], allyTargets: [] };

  it('候補は光り、場のどこでも落とせる（離すとモードを選ぶ）', () => {
    expect(planDrag(modal)).toEqual({ mode: 'arrow', targets: [opp, m('m2')], zone: 'play', hint: '離すとモードを選ぶ', pile: false });
    expect(planDrag(card({ modal: true }))).toMatchObject({ mode: 'ghost', zone: 'play' });
    expect(planDrag(card({ modal: true, blocked: 'エナジーが足りません' }))).toMatchObject({ zone: null, hint: 'エナジーが足りません' });
  });

  it('落とした場所は、どれかのモードの対象なら覚えておく', () => {
    expect(resolveDrop(modal, { kind: 'player', player: 1 })).toEqual({ t: 'modes', chosen: { enemy: opp } });
    expect(resolveDrop(modal, { kind: 'zone' })).toEqual({ t: 'modes', chosen: {} });
    expect(resolveDrop(modal, { kind: 'monster', uid: 'mine1' })).toEqual({ t: 'modes', chosen: {} });
    expect(resolveDrop(modal, { kind: 'none' })).toMatchObject({ t: 'invalid' });
    expect(resolveDrop(modal, { kind: 'hand' })).toEqual({ t: 'cancel' });
    expect(resolveDrop(card({ modal: true, blocked: '今は使えません' }), { kind: 'zone' })).toEqual({ t: 'invalid', reason: '今は使えません' });
  });

  it('モードを選んだあと：合法な対象ならそのまま使い、違えば対象選びに入る', () => {
    expect(resolveModeDrop(modeA, { enemy: opp })).toEqual({ t: 'play', chosen: { enemy: opp } });
    expect(resolveModeDrop(modeA, {})).toEqual({ t: 'need', chosen: {}, need: 'enemy' });
    expect(resolveModeDrop({ ...modeA, enemyTargets: [m('m2')] }, { enemy: opp })).toEqual({ t: 'play', chosen: { enemy: m('m2') } });
    expect(resolveModeDrop(modeB, { enemy: opp })).toEqual({ t: 'play', chosen: {} });
    expect(resolveModeDrop({ blocked: 'エナジーが足りません', enemyTargets: [], allyTargets: [] }, {})).toEqual({ t: 'invalid', reason: 'エナジーが足りません' });
    // 召喚するモンスター自身しか選べないモード（製造の「このモンスター」など）
    expect(resolveModeDrop({ blocked: null, enemyTargets: [], allyTargets: ['h1'] }, {}, 'h1')).toEqual({ t: 'play', chosen: { ally: 'h1' } });
    expect(resolveModeDrop({ blocked: null, enemyTargets: [], allyTargets: ['h1', 'm5'] }, { ally: 'm5' }, 'h1')).toEqual({ t: 'play', chosen: { ally: 'm5' } });
    expect(resolveModeDrop({ blocked: null, enemyTargets: [], allyTargets: ['h1', 'm5'] }, {}, 'h1')).toEqual({ t: 'need', chosen: {}, need: 'ally' });
  });
});

describe('支払いのシート・捨て札のカードの能力（MTG 要素 △ バッチB）', () => {
  it('支払いの選ぶものがあるカード：対象が決まったら（落とした場所が合法でも）支払いのシートへ', () => {
    expect(resolveDrop(card({ pay: true }), { kind: 'zone' })).toEqual({ t: 'pay', chosen: {} });
    expect(resolveDrop(card({ pay: true, enemyTargets: [opp, m('e1')] }), { kind: 'monster', uid: 'e1' })).toEqual({ t: 'pay', chosen: { enemy: m('e1') } });
    // 対象がまだなら、先に対象選び（シートはそのあと）
    expect(resolveDrop(card({ pay: true, enemyTargets: [opp, m('e1')], allyTargets: ['a1', 'a2'] }), { kind: 'monster', uid: 'e1' })).toMatchObject({ t: 'need', need: 'ally' });
    // 選ぶものが無ければ今までどおり
    expect(resolveDrop(card({ enemyTargets: [opp] }), { kind: 'player', player: 1 })).toEqual({ t: 'play', chosen: { enemy: opp } });
  });
  it('超過（対象を選ばない使い方）があるカード：場のどこに落としても支払いのシート。場の外は戻す', () => {
    const src = card({ pay: true, anyDrop: true, enemyTargets: [m('e1'), m('e2')] });
    expect(planDrag(src).zone).toBe('play');
    expect(resolveDrop(src, { kind: 'zone' })).toEqual({ t: 'pay', chosen: {} });
    expect(resolveDrop(src, { kind: 'monster', uid: 'e2' })).toEqual({ t: 'pay', chosen: { enemy: m('e2') } });
    expect(resolveDrop(src, { kind: 'none' }).t).toBe('invalid');
    expect(resolveDrop(src, { kind: 'hand' }).t).toBe('cancel');
    // 使えないなら戻す
    expect(resolveDrop({ ...src, blocked: 'エナジーが足りません' } as DragSource, { kind: 'zone' }).t).toBe('invalid');
  });
  it('捨て札のカードの能力：対象が要らなければ場で離す、要れば候補が光る', () => {
    const renew: DragSource = { kind: 'discardAbility', uid: 'd1', ability: 'renew', blocked: null, enemyTargets: [opp, m('e1')], allyTargets: [] };
    const plan = planDrag(renew);
    expect(plan.mode).toBe('arrow');
    expect(plan.targets).toEqual([opp, m('e1')]);
    expect(resolveDrop(renew, { kind: 'monster', uid: 'e1' })).toEqual({ t: 'play', chosen: { enemy: m('e1') } });
    const dredge: DragSource = { kind: 'discardAbility', uid: 'd2', ability: 'dredge', blocked: null, enemyTargets: [], allyTargets: [] };
    expect(planDrag(dredge)).toMatchObject({ mode: 'ghost', zone: 'play' });
    expect(resolveDrop(dredge, { kind: 'zone' })).toEqual({ t: 'play', chosen: {} });
    expect(resolveDrop({ ...dredge, blocked: '発掘は1ターン1回までです' }, { kind: 'zone' })).toEqual({ t: 'invalid', reason: '発掘は1ターン1回までです' });
  });
  it('予見のあるカードは、捨て札の山に落とすと手札の能力（複数なら画面が選ばせる）', () => {
    expect(resolveDrop(card({ handAbilities: ['cycling', 'forecast'] }), { kind: 'pile' })).toEqual({ t: 'pile', abilities: ['cycling', 'forecast'] });
    expect(planDrag(card({ handAbilities: ['forecast'] })).hint).toContain('予見');
  });
});

describe('待機ゾーン・Lv・忠誠・表にする（MTG 要素 △ バッチC）', () => {
  it('waiting の鍵も行き来できる', () => {
    expect(spotKey(parseSpot('waiting'))).toBe('waiting');
  });
  it('待機させられる手札は待機ゾーンが光り、落とすと setAside（複数なら画面が選ばせる）', () => {
    const src = card({ enemyTargets: [opp], setAside: ['foretell', 'suspend'] });
    const p = planDrag(src);
    expect(p.waiting).toBe(true);
    expect(p.targets).toEqual([opp]);
    expect(p.hint).toContain('予顕');
    expect(resolveDrop(src, { kind: 'waiting' })).toEqual({ t: 'setAside', kinds: ['foretell', 'suspend'] });
    // 使うだけならふつうに対象へ
    expect(resolveDrop(src, { kind: 'player', player: 1 })).toEqual({ t: 'play', chosen: { enemy: opp } });
  });
  it('使えない（エナジー不足）でも待機させられるなら、待機ゾーンにだけ落とせる', () => {
    const src = card({ blocked: 'エナジーが足りません', setAside: ['plot'] });
    const p = planDrag(src);
    expect(p).toMatchObject({ mode: 'ghost', zone: null, waiting: true });
    expect(resolveDrop(src, { kind: 'waiting' })).toEqual({ t: 'setAside', kinds: ['plot'] });
    expect(resolveDrop(src, { kind: 'zone' }).t).toBe('invalid');
  });
  it('待機させられないカードを待機ゾーンに落とすと理由、待機ゾーンから持ってきたカードは戻すだけ', () => {
    expect(resolveDrop(card(), { kind: 'waiting' })).toMatchObject({ t: 'invalid' });
    expect(planDrag(card()).waiting).toBeUndefined();
    const w = card({ from: 'waiting', setAside: ['foretell'] });
    expect(planDrag(w).waiting).toBeUndefined();
    expect(resolveDrop(w, { kind: 'waiting' })).toEqual({ t: 'cancel' });
    expect(resolveDrop(w, { kind: 'zone' })).toEqual({ t: 'play', chosen: {} });
  });
  it('起動の use（Lvアップ・忠誠）：対象が要らなければ場で離す。案内に名前', () => {
    const lv: DragSource = { kind: 'activate', uid: 'm1', use: 'level', blocked: null, enemyTargets: [], allyTargets: [] };
    expect(planDrag(lv).hint).toContain('Lvアップ');
    expect(resolveDrop(lv, { kind: 'zone' })).toEqual({ t: 'play', chosen: {} });
    const minus: DragSource = { kind: 'activate', uid: 'p1', use: 'minus', blocked: null, enemyTargets: [opp, m('e1')], allyTargets: [] };
    expect(planDrag(minus).targets).toEqual([opp, m('e1')]);
    expect(resolveDrop(minus, { kind: 'monster', uid: 'e1' })).toEqual({ t: 'play', chosen: { enemy: m('e1') } });
  });
  it('表にする：使えなければ理由、対象が要れば候補が光る', () => {
    const r: DragSource = { kind: 'reveal', uid: 'm1', blocked: null, enemyTargets: [m('e1'), m('e2')], allyTargets: [] };
    expect(planDrag(r)).toMatchObject({ mode: 'arrow', targets: [m('e1'), m('e2')] });
    expect(resolveDrop(r, { kind: 'zone' })).toMatchObject({ t: 'invalid' });
    expect(resolveDrop(r, { kind: 'monster', uid: 'e2' })).toEqual({ t: 'play', chosen: { enemy: m('e2') } });
    const no: DragSource = { kind: 'reveal', uid: 'm1', blocked: '場に出したターンは表にできません', enemyTargets: [], allyTargets: [] };
    expect(resolveDrop(no, { kind: 'zone' })).toEqual({ t: 'invalid', reason: '場に出したターンは表にできません' });
    expect(planDrag({ ...no, blocked: null }).hint).toContain('表にする');
  });
  it('当たり判定：落とせる待機ゾーンは、それを含むプレイヤーの枠より優先（少し外れても吸い付く）', () => {
    const boxes = [
      { key: 'p:0', box: { left: 0, top: 0, right: 300, bottom: 100 } },
      { key: 'waiting', box: { left: 200, top: 60, right: 240, bottom: 80 } },
    ];
    expect(pickSpot(210, 70, boxes, new Set(['waiting']))).toBe('waiting');
    expect(pickSpot(250, 70, boxes, new Set(['waiting']))).toBe('waiting');
    expect(pickSpot(210, 70, boxes, new Set(['p:0']))).toBe('p:0');
  });
});
