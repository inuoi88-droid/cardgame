// オンライン対戦のサーバー処理：2人の対戦をサーバーの中身だけで再現する
import { describe, expect, it } from 'vitest';
import { ai, battle, type CardDef } from '../../src/engine/index.ts';
import { BALANCE } from '../../src/engine/balance.ts';
import { PRESET_DECKS } from '../../src/presets.ts';
import { CODE_ALPHABET, generateCode, normalizeCode, normalizeName } from '../../src/online/codes.ts';
import { parseAction, parseRequest, type OnlineResponse, type ParsedRequest, type RoomView } from '../../src/online/protocol.ts';
import { ROOM_TTL_MS, applyTimeouts, type RoomRecord } from '../../src/online/room.ts';
import { serve, type ServeDeps } from '../../src/online/server.ts';
import { card } from '../helpers.ts';
import { giveCard } from '../battle/helpers.ts';

const [POISON, BEASTS, CURSES] = PRESET_DECKS as [(typeof PRESET_DECKS)[number], (typeof PRESET_DECKS)[number], (typeof PRESET_DECKS)[number]];
const T0 = 1_800_000_000_000;
const TURN_MS = BALANCE.online.turnSeconds * 1000;
const MULLIGAN_MS = BALANCE.online.mulliganSeconds * 1000;
const HOST = 'a'.repeat(64);
const GUEST = 'b'.repeat(64);

/** サーバー役：DB の代わりに部屋を1つ持ち、serve() の結果を保存する */
class FakeServer {
  room: RoomRecord | null = null;
  notified = 0;
  /** 送ったものを JSON にして戻す（実際の通信と同じく、関数や undefined は落ちる） */
  send(raw: unknown, deps: Partial<ServeDeps> & { tokenHash: string; now: number }): OnlineResponse {
    const parsed = parseRequest(JSON.parse(JSON.stringify(raw)));
    if (!parsed.ok) return { ok: false, error: parsed.error, reason: 'invalid' };
    const r = serve(parsed.value, parsed.value.op === 'create' ? null : this.room, { code: 'ABC234', seed: 7, ...deps });
    if (r.save) this.room = r.save;
    if (r.notify) this.notified++;
    return JSON.parse(JSON.stringify(r.response)) as OnlineResponse;
  }
}

function ok(res: OnlineResponse): RoomView {
  if (!res.ok) throw new Error(res.error);
  return res;
}

const createReq = (deck = POISON, name = 'ホスト') => ({ op: 'create', name, deck: deck.deck, cards: deck.cards });
const joinReq = (deck = BEASTS, name = 'ゲスト', code = 'abc234') => ({ op: 'join', code, name, deck: deck.deck, cards: deck.cards });
const stateReq = (token: string) => ({ op: 'state', code: 'ABC234', token });
const actionReq = (token: string, version: number, action: battle.Action) => ({ op: 'action', code: 'ABC234', token, version, action });

/** 部屋を作って2人目が入った状態（マリガン中） */
function started(host = POISON, guest = BEASTS) {
  const s = new FakeServer();
  ok(s.send(createReq(host), { tokenHash: HOST, now: T0 }));
  const joined = ok(s.send(joinReq(guest), { tokenHash: GUEST, now: T0 + 1000 }));
  return { s, joined };
}

/** 両者が手札を決めて対戦が始まった状態 */
function playing(host = POISON, guest = BEASTS) {
  const { s } = started(host, guest);
  let now = T0 + 2000;
  for (const [p, token] of [
    [0, HOST],
    [1, GUEST],
  ] as const) {
    ok(s.send(actionReq(token, s.room!.version, { type: 'mulligan', player: p, mode: 'keep' }), { tokenHash: token, now: now++ }));
  }
  return { s, now };
}

const tokenOf = (p: battle.PlayerId) => (p === 0 ? HOST : GUEST);

function expectHidden(view: battle.GameState, me: battle.PlayerId) {
  const opp = battle.other(me);
  expect(view.rng).toBe(0);
  expect(view.queue).toEqual([]);
  for (const c of view.players[opp].hand) expect(c.cardId).toBe(battle.HIDDEN_CARD_ID);
  for (const p of [0, 1] as const) for (const c of view.players[p].deck) expect(c.cardId).toBe(battle.HIDDEN_CARD_ID);
}

describe('部屋コードと名前', () => {
  it('コードは紛らわしい文字を使わない6文字', () => {
    let i = 0;
    const code = generateCode((n) => i++ % n);
    expect(code).toHaveLength(6);
    for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
    for (const ch of '0O1IL') expect(CODE_ALPHABET).not.toContain(ch);
  });

  it('入力は大文字・小文字を区別せず、空白やハイフンを無視する', () => {
    expect(normalizeCode(' abc-234 ')).toBe('ABC234');
    expect(normalizeCode('ABC23')).toBeNull();
    expect(normalizeCode('ABC230')).toBeNull();
    expect(normalizeCode(123456)).toBeNull();
  });

  it('名前は12文字まで、空なら「プレイヤー」', () => {
    expect(normalizeName('  ')).toBe('プレイヤー');
    expect(normalizeName(undefined)).toBe('プレイヤー');
    expect(normalizeName('あいうえおかきくけこさしすせそ')).toBe('あいうえおかきくけこさし');
  });
});

describe('届いたデータの検証', () => {
  it('知らない項目は捨て、ブラウザからの理由付き降参は認めない', () => {
    expect(parseAction({ type: 'concede', player: 1, reason: 'timeout', extra: 1 })).toEqual({ type: 'concede', player: 1 });
    expect(parseAction({ type: 'endTurn', player: 0, hack: true })).toEqual({ type: 'endTurn', player: 0 });
  });

  it('形が違う行動は受け付けない', () => {
    expect(parseAction({ type: 'endTurn', player: 2 })).toBeNull();
    expect(parseAction({ type: 'choose', player: 0, picks: 'x' })).toBeNull();
    expect(parseAction({ type: 'choose', player: 0, picks: [1] })).toBeNull();
    expect(parseAction({ type: 'mulligan', player: 0, mode: 'magic' })).toBeNull();
    expect(parseAction({ type: 'attack', player: 0, attackerUid: 'm1', target: { kind: 'monster' } })).toBeNull();
    expect(parseAction({ type: 'playCard', player: 0, cardUid: 'c1', chosen: { enemy: { kind: 'player', player: 5 } } })).toBeNull();
    expect(parseAction({ type: 'drawAll', player: 0 })).toBeNull();
    expect(parseAction(null)).toBeNull();
  });

  it('操作・コード・合言葉・版番号の形を調べる', () => {
    expect(parseRequest({ op: 'delete', code: 'ABC234' }).ok).toBe(false);
    expect(parseRequest({ op: 'state', code: 'ABC234', token: 'short' }).ok).toBe(false);
    expect(parseRequest({ op: 'state', code: 'XYZ', token: HOST }).ok).toBe(false);
    expect(parseRequest({ op: 'action', code: 'ABC234', token: HOST, version: '1', action: { type: 'endTurn', player: 0 } }).ok).toBe(false);
    const r = parseRequest({ op: 'state', code: 'abc234', token: HOST });
    expect(r.ok && (r.value as Extract<ParsedRequest, { op: 'state' }>).code).toBe('ABC234');
  });
});

describe('部屋の作成と入室', () => {
  it('作成すると相手待ちの部屋ができ、作成者は席0', () => {
    const s = new FakeServer();
    const v = ok(s.send(createReq(), { tokenHash: HOST, now: T0 }));
    expect(v).toMatchObject({ code: 'ABC234', seat: 0, status: 'waiting', view: null, names: ['ホスト', null], opponentConnected: false });
    expect(s.room!.seats[0]!.tokenHash).toBe(HOST);
  });

  it('2人目が入るとマリガンから対戦が始まり、締め切りが置かれる', () => {
    const { s, joined } = started();
    expect(joined).toMatchObject({ seat: 1, status: 'playing', names: ['ホスト', 'ゲスト'], opponentConnected: true });
    expect(joined.view!.phase).toBe('mulligan');
    expect(joined.deadline).toBe(T0 + 1000 + MULLIGAN_MS);
    expect(s.notified).toBe(1);
    expect(s.room!.hostDeck).toBeNull();
  });

  it('同じ名前なら2人目に印を付ける', () => {
    const s = new FakeServer();
    ok(s.send(createReq(POISON, '太郎'), { tokenHash: HOST, now: T0 }));
    const v = ok(s.send(joinReq(BEASTS, '太郎'), { tokenHash: GUEST, now: T0 }));
    expect(v.names).toEqual(['太郎', '太郎（2）']);
  });

  it('プリセット3つはどれもオンラインで使える', () => {
    for (const d of [POISON, BEASTS, CURSES]) {
      const s = new FakeServer();
      expect(s.send(createReq(d), { tokenHash: HOST, now: T0 }).ok).toBe(true);
    }
  });

  it('始まった部屋・ない部屋・古い部屋には入れない', () => {
    const { s } = started();
    const third = s.send(joinReq(CURSES), { tokenHash: 'c'.repeat(64), now: T0 + 2000 });
    expect(third.ok).toBe(false);

    const empty = new FakeServer();
    expect(empty.send(joinReq(), { tokenHash: GUEST, now: T0 })).toMatchObject({ ok: false, reason: 'notFound' });

    const old = new FakeServer();
    ok(old.send(createReq(), { tokenHash: HOST, now: T0 }));
    expect(old.send(joinReq(), { tokenHash: GUEST, now: T0 + ROOM_TTL_MS + 1 })).toMatchObject({ ok: false, reason: 'notFound' });
  });
});

describe('デッキはサーバーで検証する', () => {
  const tooStrong = card({
    id: 'cheat',
    name: '最強のカード',
    effects: [{ id: 'damage', value: 999, timing: 'play', target: 'chosen', condition: null }],
  });

  it('29枚のデッキは作成できない', () => {
    const deck = { ...POISON.deck, entries: POISON.deck.entries.map((e, i) => (i === 0 ? { ...e, count: e.count - 1 } : e)) };
    const r = new FakeServer().send({ ...createReq(), deck }, { tokenHash: HOST, now: T0 });
    expect(r).toMatchObject({ ok: false, reason: 'invalid' });
    expect(!r.ok && r.error).toContain('30枚');
  });

  it('ポイントの上限を超えたカードが入ったデッキでは入室できない', () => {
    const s = new FakeServer();
    ok(s.send(createReq(), { tokenHash: HOST, now: T0 }));
    const cards: CardDef[] = [tooStrong];
    const deck = { v: 1, id: 'd', name: 'ずる', entries: [{ cardId: 'cheat', count: 30 }] };
    const r = s.send({ op: 'join', code: 'ABC234', name: 'x', deck, cards }, { tokenHash: GUEST, now: T0 });
    expect(r).toMatchObject({ ok: false, reason: 'invalid' });
    expect(s.room!.status).toBe('waiting');
  });

  it('カードのデータが壊れていれば受け付けない', () => {
    const s = new FakeServer();
    expect(s.send({ ...createReq(), cards: 'nope' }, { tokenHash: HOST, now: T0 }).ok).toBe(false);
    expect(s.send({ ...createReq(), cards: [{ id: 1 }] }, { tokenHash: HOST, now: T0 }).ok).toBe(false);
    expect(s.room).toBeNull();
  });
});

describe('非公開情報', () => {
  it('どちらの席にも、相手の手札と両者の山札の中身・乱数は届かない', () => {
    const { s, now } = playing();
    for (const p of [0, 1] as const) {
      const v = ok(s.send(stateReq(tokenOf(p)), { tokenHash: tokenOf(p), now }));
      expectHidden(v.view!, p);
      // 自分の手札は見える
      for (const c of v.view!.players[p].hand) expect(c.cardId).not.toBe(battle.HIDDEN_CARD_ID);
      // 相手の手札のカード ID は、応答のどこにも出てこない
      const full = s.room!.state!;
      const oppHandUids = full.players[battle.other(p)].hand.map((c) => c.uid);
      const json = JSON.stringify(v);
      for (const uid of oppHandUids) expect(json).not.toContain(`"${uid}"`);
    }
  });
});

describe('本人確認・手番・同時送信', () => {
  it('合言葉が違えば読めない・動かせない', () => {
    const { s, now } = playing();
    const bad = 'f'.repeat(64);
    expect(s.send(stateReq(bad), { tokenHash: bad, now })).toMatchObject({ ok: false, reason: 'auth' });
    const a = actionReq(bad, s.room!.version, { type: 'endTurn', player: s.room!.state!.active });
    expect(s.send(a, { tokenHash: bad, now })).toMatchObject({ ok: false, reason: 'auth' });
  });

  it('相手の席の行動は送れない', () => {
    const { s, now } = playing();
    const g = s.room!.state!;
    const opp = battle.other(g.active);
    const r = s.send(actionReq(tokenOf(opp), s.room!.version, { type: 'endTurn', player: g.active }), { tokenHash: tokenOf(opp), now });
    expect(r).toMatchObject({ ok: false, reason: 'auth' });
    expect(s.room!.state!.turnIndex).toBe(g.turnIndex);
  });

  it('自分の手番でなければ動けない', () => {
    const { s, now } = playing();
    const g = s.room!.state!;
    const opp = battle.other(g.active);
    const r = s.send(actionReq(tokenOf(opp), s.room!.version, { type: 'endTurn', player: opp }), { tokenHash: tokenOf(opp), now });
    expect(r).toMatchObject({ ok: false, reason: 'invalid', error: '自分のターンではありません' });
  });

  it('古い版の状態を見て送った行動は、やり直してもらう', () => {
    const { s, now } = playing();
    const active = s.room!.state!.active;
    const old = s.room!.version - 1;
    const r = s.send(actionReq(tokenOf(active), old, { type: 'endTurn', player: active }), { tokenHash: tokenOf(active), now });
    expect(r).toMatchObject({ ok: false, reason: 'version' });
    expect(s.room!.state!.active).toBe(active);
  });

  it('マリガンは両者が同じ版を見て同時に送っても、どちらも受け付ける', () => {
    const { s } = started();
    const version = s.room!.version;
    ok(s.send(actionReq(HOST, version, { type: 'mulligan', player: 0, mode: 'keep' }), { tokenHash: HOST, now: T0 + 2000 }));
    const v = ok(s.send(actionReq(GUEST, version, { type: 'mulligan', player: 1, mode: 'keep' }), { tokenHash: GUEST, now: T0 + 2001 }));
    expect(v.view!.phase).toBe('main');
    expect(v.timeouts).toEqual([0, 0]);
  });

  it('降参は古い版を見ていても受け付ける', () => {
    const { s, now } = playing();
    const g = s.room!.state!;
    const opp = battle.other(g.active);
    const v = ok(s.send(actionReq(tokenOf(opp), 1, { type: 'concede', player: opp }), { tokenHash: tokenOf(opp), now }));
    expect(v.view!.result).toMatchObject({ winner: g.active, reason: 'concede' });
  });

  it('行動が通ると版が上がり、通知する', () => {
    const { s, now } = playing();
    const before = { version: s.room!.version, notified: s.notified };
    const active = s.room!.state!.active;
    const v = ok(s.send(actionReq(tokenOf(active), before.version, { type: 'endTurn', player: active }), { tokenHash: tokenOf(active), now }));
    expect(v.version).toBe(before.version + 1);
    expect(s.notified).toBe(before.notified + 1);
    expect(v.view!.active).toBe(battle.other(active));
    expect(v.deadline).toBe(now + TURN_MS);
  });
});

describe('時間切れ（決定事項 #57）', () => {
  it('マリガンの時間切れ：決めていないプレイヤーは今の手札で始める', () => {
    const { s } = started();
    const deadline = s.room!.deadline!;
    // ホストだけ手札を決める
    ok(s.send(actionReq(HOST, s.room!.version, { type: 'mulligan', player: 0, mode: 'keep' }), { tokenHash: HOST, now: T0 + 5000 }));
    const v = ok(s.send(stateReq(HOST), { tokenHash: HOST, now: deadline + 1 }));
    expect(v.view!.phase).toBe('main');
    expect(v.timeouts).toEqual([0, 1]);
    expect(v.deadline).toBe(deadline + 1 + TURN_MS);
  });

  it('締め切り前なら何もしない', () => {
    const { s } = playing();
    const room = s.room!;
    expect(applyTimeouts(room, room.deadline!)).toBe(room);
  });

  it('手番の時間切れ：自動でターンを終え、相手に新しい締め切り', () => {
    const { s } = playing();
    const active = s.room!.state!.active;
    const late = s.room!.deadline! + 1;
    const v = ok(s.send(stateReq(tokenOf(active)), { tokenHash: tokenOf(active), now: late }));
    expect(v.view!.active).toBe(battle.other(active));
    expect(v.timeouts[active]).toBe(1);
    expect(v.deadline).toBe(late + TURN_MS);
  });

  it('自分で動けば、続けて時間切れになった回数は0に戻る', () => {
    const { s } = playing();
    const first = s.room!.state!.active;
    let now = s.room!.deadline! + 1;
    ok(s.send(stateReq(HOST), { tokenHash: HOST, now })); // first の時間切れ
    expect(s.room!.seats[first]!.timeouts).toBe(1);
    // 相手のターンを進め、first の番で自分でターンを終える
    const second = battle.other(first);
    ok(s.send(actionReq(tokenOf(second), s.room!.version, { type: 'endTurn', player: second }), { tokenHash: tokenOf(second), now: ++now }));
    ok(s.send(actionReq(tokenOf(first), s.room!.version, { type: 'endTurn', player: first }), { tokenHash: tokenOf(first), now: ++now }));
    expect(s.room!.seats[first]!.timeouts).toBe(0);
  });

  it('3回続けて時間切れになると負け', () => {
    const { s } = playing();
    const slow = s.room!.state!.active;
    const fast = battle.other(slow);
    let now = s.room!.deadline!;
    for (let i = 0; i < BALANCE.online.timeoutLoseCount; i++) {
      // slow が時間切れ → fast はすぐターンを終える
      now = s.room!.deadline! + 1;
      ok(s.send(stateReq(tokenOf(fast)), { tokenHash: tokenOf(fast), now }));
      if (s.room!.status === 'ended') break;
      ok(s.send(actionReq(tokenOf(fast), s.room!.version, { type: 'endTurn', player: fast }), { tokenHash: tokenOf(fast), now: now + 1 }));
    }
    const v = ok(s.send(stateReq(tokenOf(fast)), { tokenHash: tokenOf(fast), now: now + 2 }));
    expect(v.status).toBe('ended');
    expect(v.view!.result).toMatchObject({ winner: fast, reason: 'timeout' });
    expect(v.deadline).toBeNull();
  });

  it('選択の途中で時間切れなら、自動で選んでからターンを終える', () => {
    const { s, now } = playing(BEASTS, BEASTS);
    const room = s.room!;
    const g = room.state!;
    const p = g.active;
    const searcher = card({
      id: 'searcher',
      name: '探し物',
      effects: [{ id: 'search', value: 0, timing: 'play', target: 'self', condition: null, option: 'monster' }],
    });
    const uid = giveCard(g, p, searcher);
    g.players[p].energy = 10;
    ok(s.send(actionReq(tokenOf(p), room.version, { type: 'playCard', player: p, cardUid: uid }), { tokenHash: tokenOf(p), now }));
    const pending = s.room!.state!.pending;
    expect(pending?.player).toBe(p);
    const picked = pending!.options[0]!.id;
    const v = ok(s.send(stateReq(tokenOf(p)), { tokenHash: tokenOf(p), now: s.room!.deadline! + 1 }));
    expect(v.view!.pending).toBeNull();
    expect(v.view!.active).toBe(battle.other(p));
    // 先頭の候補が山札から手札に加わり、ターン終了で捨て札へ
    const after = s.room!.state!.players[p];
    expect(after.deck.some((c) => c.uid === picked)).toBe(false);
    expect(after.discard.some((c) => c.uid === picked)).toBe(true);
  });

  it('濫用（選ばなくてもよい選択）の途中で時間切れなら、選ばずに進む（MTG 要素 ○ バッチA）', () => {
    const { s, now } = playing(BEASTS, BEASTS);
    const room = s.room!;
    const g = room.state!;
    const p = g.active;
    const opp = battle.other(p);
    const pet = card({ id: 'pet', name: '生け贄の獣', stats: { attack: 1, hp: 1, defense: 0 } });
    g.cards[`p${p}:pet`] = pet;
    giveCard(g, p, pet);
    const exploit = card({ id: 'exploit', name: '濫用', effects: [{ id: 'damage', value: 5, timing: 'play', target: 'chosen', condition: 'exploit' }] });
    const uid = giveCard(g, p, exploit);
    g.players[p].energy = 10;
    const petUid = g.players[p].hand.find((c) => c.cardId === `p${p}:pet`)!.uid;
    ok(s.send(actionReq(tokenOf(p), room.version, { type: 'playCard', player: p, cardUid: petUid }), { tokenHash: tokenOf(p), now }));
    const hp = s.room!.state!.players[opp].hp;
    ok(s.send(actionReq(tokenOf(p), s.room!.version, { type: 'playCard', player: p, cardUid: uid, chosen: { enemy: { kind: 'player', player: opp } } }), { tokenHash: tokenOf(p), now: now + 1 }));
    expect(s.room!.state!.pending).toMatchObject({ player: p, min: 0, max: 1 });
    ok(s.send(stateReq(tokenOf(p)), { tokenHash: tokenOf(p), now: s.room!.deadline! + 1 }));
    const after = s.room!.state!;
    expect(after.pending).toBeNull();
    expect(after.players[opp].hp).toBe(hp);
    expect(after.players[p].board.some((m) => m.uid === petUid)).toBe(true);
  });

  it('お互いの手札整理：相手側の選択は相手が送る（MTG 要素 ○ バッチA）', () => {
    const { s, now } = playing(BEASTS, BEASTS);
    const room = s.room!;
    const g = room.state!;
    const p = g.active;
    const opp = battle.other(p);
    const loot = card({ id: 'loot2', name: 'お互いの整理', effects: [{ id: 'loot', value: 1, timing: 'play', target: 'bothPlayers', condition: null }] });
    const uid = giveCard(g, p, loot);
    g.players[p].energy = 10;
    ok(s.send(actionReq(tokenOf(p), room.version, { type: 'playCard', player: p, cardUid: uid }), { tokenHash: tokenOf(p), now }));
    const mine = s.room!.state!.pending!;
    expect(mine.player).toBe(p);
    ok(s.send(actionReq(tokenOf(p), s.room!.version, { type: 'choose', player: p, picks: [mine.options[0]!.id] }), { tokenHash: tokenOf(p), now: now + 1 }));
    const theirs = s.room!.state!.pending!;
    expect(theirs.player).toBe(opp);
    // 相手の画面には選択肢が出る（自分の画面では隠れる）
    expect(ok(s.send(stateReq(tokenOf(p)), { tokenHash: tokenOf(p), now: now + 2 })).view!.pending!.options).toEqual([]);
    expect(ok(s.send(stateReq(tokenOf(opp)), { tokenHash: tokenOf(opp), now: now + 2 })).view!.pending!.options.length).toBeGreaterThan(0);
    ok(s.send(actionReq(tokenOf(opp), s.room!.version, { type: 'choose', player: opp, picks: [theirs.options[0]!.id] }), { tokenHash: tokenOf(opp), now: now + 3 }));
    expect(s.room!.state!.pending).toBeNull();
    expect(s.room!.state!.active).toBe(p);
  });
});

describe('MTG 要素 ○ バッチB（サーバー越し）', () => {
  it('発見：選択肢（山札の上）は相手に見えず、本人が選んで送れる', () => {
    const { s, now } = playing(BEASTS, BEASTS);
    const g = s.room!.state!;
    const p = g.active;
    const opp = battle.other(p);
    const uid = giveCard(g, p, card({ id: 'disc', name: '発見', effects: [{ id: 'discover', timing: 'play', target: 'self', condition: null }] }));
    g.players[p].energy = 10;
    ok(s.send(actionReq(tokenOf(p), s.room!.version, { type: 'playCard', player: p, cardUid: uid }), { tokenHash: tokenOf(p), now }));
    const mine = ok(s.send(stateReq(tokenOf(p)), { tokenHash: tokenOf(p), now: now + 1 })).view!;
    const theirs = ok(s.send(stateReq(tokenOf(opp)), { tokenHash: tokenOf(opp), now: now + 1 })).view!;
    expect(mine.pending!.options).toHaveLength(3);
    expect(theirs.pending!.options).toEqual([]);
    expectHidden(theirs, opp);
    const pick = mine.pending!.options[1]!.id;
    ok(s.send(actionReq(tokenOf(p), s.room!.version, { type: 'choose', player: p, picks: [pick] }), { tokenHash: tokenOf(p), now: now + 2 }));
    expect(s.room!.state!.players[p].hand.some((c) => c.uid === pick)).toBe(true);
  });

  it('続唱：無料で使うカードの対象は、使った人が選んで送る（護法の追加コストは払わない）', () => {
    const { s, now } = playing(BEASTS, BEASTS);
    const g = s.room!.state!;
    const p = g.active;
    const opp = battle.other(p);
    const bolt = card({ id: 'bolt9', name: '雷', cost: 1, effects: [{ id: 'damage', value: 3, timing: 'play', target: 'chosen', condition: null }] });
    g.cards[`p${p}:bolt9`] = bolt;
    g.players[p].deck.unshift({ uid: 'top', cardId: `p${p}:bolt9`, owner: p });
    const uid = giveCard(g, p, card({ id: 'casc', name: '続唱', rarity: 'rare', effects: [{ id: 'cascade', value: 1, timing: 'play', target: 'self', condition: null }] }));
    g.players[p].energy = 1;
    const hp = g.players[opp].hp;
    ok(s.send(actionReq(tokenOf(p), s.room!.version, { type: 'playCard', player: p, cardUid: uid }), { tokenHash: tokenOf(p), now }));
    const pending = s.room!.state!.pending;
    if (pending) {
      expect(pending.player).toBe(p);
      ok(s.send(actionReq(tokenOf(p), s.room!.version, { type: 'choose', player: p, picks: [`player:${opp}`] }), { tokenHash: tokenOf(p), now: now + 1 }));
    }
    expect(s.room!.state!.players[opp].hp).toBe(hp - 3 * BALANCE.amountScale);
    expect(s.room!.state!.players[p].energy).toBe(0);
  });
});

describe('接続状態と再接続', () => {
  it('相手から30秒以上通信がなければ「切断中」', () => {
    const { s, now } = playing();
    expect(ok(s.send(stateReq(HOST), { tokenHash: HOST, now })).opponentConnected).toBe(true);
    expect(ok(s.send(stateReq(HOST), { tokenHash: HOST, now: now + 31_000 })).opponentConnected).toBe(false);
  });

  it('同じ合言葉で開き直せば、同じ席の続きから遊べる', () => {
    const { s, now } = playing();
    const before = ok(s.send(stateReq(GUEST), { tokenHash: GUEST, now }));
    const again = ok(s.send(stateReq(GUEST), { tokenHash: GUEST, now: now + 10_000 }));
    expect(again.seat).toBe(1);
    expect(again.view).toEqual(before.view);
  });
});

describe('通しの対戦', () => {
  it('CPU 同士がサーバー越しに最後まで対戦でき、カードは消えない', () => {
    const { s } = playing(POISON, CURSES);
    let now = T0 + 10_000;
    for (let i = 0; i < 3000 && s.room!.status === 'playing'; i++) {
      const g = s.room!.state!;
      const p: battle.PlayerId = g.pending ? g.pending.player : g.active;
      // ブラウザと同じく、自分から見える状態だけで行動を決める
      const view = ok(s.send(stateReq(tokenOf(p)), { tokenHash: tokenOf(p), now: now++ }));
      expectHidden(view.view!, p);
      const action = ai.cpuAction(view.view!, p, i);
      const r = s.send(actionReq(tokenOf(p), view.version, action), { tokenHash: tokenOf(p), now: now++ });
      if (!r.ok) {
        // 見えない情報のせいで選べなかったときは、ターンを終える
        const fallback: battle.Action = g.pending ? ai.cpuAction(g, p, i) : { type: 'endTurn', player: p };
        ok(s.send(actionReq(tokenOf(p), s.room!.version, fallback), { tokenHash: tokenOf(p), now: now++ }));
      }
    }
    const room = s.room!;
    expect(room.status).toBe('ended');
    expect(room.state!.result).not.toBeNull();
    const g = room.state!;
    for (const p of [0, 1] as const) {
      const owned = g.players
        .flatMap((pl) => [...pl.deck, ...pl.hand, ...pl.discard, ...pl.exile, ...pl.board.map((m) => m.card)])
        .filter((c) => c.owner === p && !c.copy && c.cardId !== battle.NOISE_CARD_ID);
      expect(owned).toHaveLength(BALANCE.deck.size);
    }
  });
});
