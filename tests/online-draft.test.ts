// オンラインのドラフト戦と再戦（決定事項 #115）：サーバーの中身だけで2人の流れを再現する。倍率1
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { BALANCE, analyzeDeck, battle, draft, type CardDef } from '../src/engine/index.ts';
import { PRESET_DECKS } from '../src/presets.ts';
import { parseRequest, type OnlineResponse, type RoomView } from '../src/online/protocol.ts';
import { handleBody, type HttpDeps, type RoomRecord, type RoomStore } from '../src/online/index.ts';
import { serve, type ServeDeps } from '../src/online/server.ts';

const [POISON, BEASTS] = PRESET_DECKS as unknown as [(typeof PRESET_DECKS)[number], (typeof PRESET_DECKS)[number]];
const POOL: CardDef[] = PRESET_DECKS.flatMap((p) => p.cards);
const T0 = 1_800_000_000_000;
const PICK_MS = BALANCE.online.draftPickSeconds * 1000;
const MULLIGAN_MS = BALANCE.online.mulliganSeconds * 1000;
const D = BALANCE.draft;
const HOST = 'a'.repeat(64);
const GUEST = 'b'.repeat(64);
const tokenOf = (p: battle.PlayerId) => (p === 0 ? HOST : GUEST);

class FakeServer {
  room: RoomRecord | null = null;
  notified = 0;
  now = T0;
  seed = 7;
  send(raw: unknown, tokenHash: string, extra: Partial<ServeDeps> = {}): OnlineResponse {
    const parsed = parseRequest(JSON.parse(JSON.stringify(raw)));
    if (!parsed.ok) return { ok: false, error: parsed.error, reason: 'invalid' };
    const r = serve(parsed.value, parsed.value.op === 'create' ? null : this.room, {
      code: 'ABC234',
      seed: this.seed,
      draftPool: POOL,
      tokenHash,
      now: this.now,
      ...extra,
    });
    if (r.save) this.room = JSON.parse(JSON.stringify(r.save)) as RoomRecord;
    if (r.notify) this.notified++;
    return JSON.parse(JSON.stringify(r.response)) as OnlineResponse;
  }
  state(p: battle.PlayerId): RoomView {
    return ok(this.send({ op: 'state', code: 'ABC234', token: tokenOf(p) }, tokenOf(p)));
  }
  take(p: battle.PlayerId, cardId: string, version = this.room!.version): OnlineResponse {
    return this.send({ op: 'take', code: 'ABC234', token: tokenOf(p), version, cardId }, tokenOf(p));
  }
  auto(p: battle.PlayerId, on: boolean): OnlineResponse {
    return this.send({ op: 'auto', code: 'ABC234', token: tokenOf(p), on }, tokenOf(p));
  }
  rematch(p: battle.PlayerId): OnlineResponse {
    return this.send({ op: 'rematch', code: 'ABC234', token: tokenOf(p) }, tokenOf(p));
  }
  action(p: battle.PlayerId, action: battle.Action, version = this.room!.version): OnlineResponse {
    return this.send({ op: 'action', code: 'ABC234', token: tokenOf(p), version, action }, tokenOf(p));
  }
}

function ok(res: OnlineResponse): RoomView {
  if (!res.ok) throw new Error(res.error);
  return res;
}

const createDraftReq = (extra: Record<string, unknown> = {}) => ({ op: 'create', mode: 'draft', name: 'ホスト', ...extra });
const joinReq = (extra: Record<string, unknown> = {}) => ({ op: 'join', code: 'abc234', name: 'ゲスト', features: ['draft'], ...extra });

/** ドラフトの部屋に2人目が入った状態 */
function drafting(createExtra: Record<string, unknown> = {}, joinExtra: Record<string, unknown> = {}) {
  const s = new FakeServer();
  ok(s.send(createDraftReq(createExtra), HOST));
  s.now += 1000;
  const joined = ok(s.send(joinReq(joinExtra), GUEST));
  return { s, joined };
}

/** 手番の人が、自分から見て取れる最初のカードを取る */
function takeFirstOk(s: FakeServer): RoomView {
  const turn = s.room!.meta!.draft!.picks.length % 2 === 0 ? s.room!.meta!.draft!.first : battle.other(s.room!.meta!.draft!.first);
  const v = s.state(turn);
  const t = v.draft!.takeable.find((x) => x.ok)!;
  return ok(s.take(turn, t.cardId, v.version));
}

/** ドラフトを最後まで（自分で取る） */
function finishDraft(s: FakeServer): RoomView {
  let v: RoomView | null = null;
  for (let i = 0; i < 2 * D.takes; i++) {
    s.now += 100;
    v = takeFirstOk(s);
  }
  return v!;
}

function expectPileHidden(s: FakeServer, v: RoomView) {
  const json = JSON.stringify(v);
  const d = s.room!.meta!.draft!;
  expect(json).not.toContain('"pile"');
  expect(json).not.toContain('"rng"');
  // 山にしか無いカード（場・取ったカード・場から入れ替えたカードと重ならないもの。コモンは山に2枚ずつ入る：#117・#134）は見え方に出ない
  const shown = new Set([...d.field, ...d.picks.flatMap((x) => [x.cardId, ...(x.swapped ?? [])])]);
  for (const id of d.pile) if (!shown.has(id)) expect(json).not.toContain(`"${id}"`);
  expect(v.draft!.pileSize).toBe(d.pile.length);
}

describe('ドラフトの部屋を作る・入る', () => {
  it('作成にデッキは要らない。リーダーとルールは選べる', () => {
    const s = new FakeServer();
    const v = ok(s.send(createDraftReq({ leader: 'knight', rules: { field: 'random', dayNight: true } }), HOST));
    expect(v).toMatchObject({ status: 'waiting', mode: 'draft', seat: 0, view: null, leaders: ['knight', null] });
    expect(v.rules).toEqual({ field: 'random', dayNight: true });
    expect(v.draft).toBeUndefined();
    expect(s.room!.hostDeck).toBeNull();
  });

  it('形式の指定が壊れていれば受け付けない。自分のデッキの部屋は今までどおりデッキが要る', () => {
    const s = new FakeServer();
    expect(s.send(createDraftReq({ mode: 'sealed' }), HOST).ok).toBe(false);
    expect(s.send({ op: 'create', name: 'x' }, HOST)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(ok(s.send({ op: 'create', name: 'x', deck: POISON.deck, cards: POISON.cards }, HOST)).mode).toBe('deck');
  });

  it('2人目が入るとドラフトが始まる（デッキは送らなくてよい・送っても無視）', () => {
    const { s, joined } = drafting({ leader: 'mage' }, { leader: 'summoner', deck: POISON.deck, cards: POISON.cards });
    expect(joined).toMatchObject({ status: 'drafting', mode: 'draft', seat: 1, view: null, leaders: ['mage', 'summoner'], names: ['ホスト', 'ゲスト'] });
    expect(joined.deadline).toBe(s.now + PICK_MS);
    expect(s.notified).toBe(1);
    const d = joined.draft!;
    expect(d.field).toHaveLength(D.field);
    expect(d.takeable).toHaveLength(D.field);
    expect(d.takesLeft).toEqual([D.takes, D.takes]);
    expect(d.turn).toBe(d.first);
    expect(d.auto).toEqual([false, false]);
    const pileTotal = Object.values(s.room!.meta!.draft!.cards).reduce((n, c) => n + D.pileCopies[c.rarity], 0);
    expect(d.pileSize).toBe(pileTotal - D.field);
    // レジェンドも山に1枚ずつ入る（#134）
    expect(Object.values(s.room!.meta!.draft!.cards).some((c) => c.rarity === 'legend')).toBe(true);
    expectPileHidden(s, joined);
    expectPileHidden(s, s.state(0));
  });

  it('使えるカードが足りなければドラフトを始めない', () => {
    const s = new FakeServer();
    ok(s.send(createDraftReq(), HOST));
    const r = s.send(joinReq(), GUEST, { draftPool: POOL.slice(0, 10) });
    expect(r).toMatchObject({ ok: false, reason: 'invalid' });
    expect(s.room!.status).toBe('waiting');
  });
});

describe('ドラフトで取る', () => {
  it('手番の人だけが、見ていた版で、場にあって取れるカードだけを取れる', () => {
    const { s } = drafting();
    const d = s.room!.meta!.draft!;
    const turn = d.first;
    const other = battle.other(turn);
    const v = s.room!.version;
    expect(s.take(other, d.field[0]!)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(s.take(turn, d.field[0]!, v - 1)).toMatchObject({ ok: false, reason: 'version' });
    expect(s.take(turn, d.pile.find((id) => !d.field.includes(id))!)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(s.take(turn, 'x'.repeat(101))).toMatchObject({ ok: false, reason: 'invalid' });
    expect(s.send({ op: 'take', code: 'ABC234', token: 'f'.repeat(64), version: v, cardId: d.field[0] }, 'f'.repeat(64))).toMatchObject({ ok: false, reason: 'auth' });
    expect(s.room!.version).toBe(v);

    // 取れないカード（エピックを上限まで取ったあとのエピック）は断る
    const room = s.room!;
    const epics = Object.values(room.meta!.draft!.cards).filter((c) => c.rarity === 'epic');
    room.meta!.draft = {
      ...room.meta!.draft!,
      field: [epics[2]!.id, ...room.meta!.draft!.field.slice(1)],
      picks: [
        { player: turn, cardId: epics[0]!.id },
        { player: other, cardId: room.meta!.draft!.pile[5]! },
        { player: turn, cardId: epics[1]!.id },
        { player: other, cardId: room.meta!.draft!.pile[6]! },
      ],
    };
    const view = s.state(turn);
    expect(view.draft!.takeable[0]).toMatchObject({ cardId: epics[2]!.id, ok: false, reason: 'rarityLimit' });
    expect(s.state(other).draft!.takeable[0]).toMatchObject({ ok: true });
    expect(s.take(turn, epics[2]!.id)).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('取ると場が補充され、相手の番になる。どの返事にも伏せた山は入らない', () => {
    const { s } = drafting();
    const first = s.room!.meta!.draft!.first;
    const before = s.room!.meta!.draft!;
    const v = takeFirstOk(s);
    expect(v.draft!.turn).toBe(battle.other(first));
    expect(v.draft!.field).toHaveLength(D.field);
    expect(v.draft!.pileSize).toBe(before.pile.length - 1);
    expect(v.draft!.taken[first]).toHaveLength(1);
    expect(v.draft!.taken[first][0]!.count).toBe(v.draft!.taken[first][0]!.card.rarity === 'legend' ? 1 : D.copies);
    // 取った枠の補充とは別に、場の古い2枚が入れ替わる（#134）
    expect(v.draft!.picks.at(-1)!.swappedNames).toHaveLength(D.refresh);
    expect(v.deadline).toBe(s.now + PICK_MS);
    expectPileHidden(s, v);
    expectPileHidden(s, s.state(battle.other(first)));
  });

  it('ドラフト中は対戦の行動を受け付けず、自分のデッキの部屋では取る操作を受け付けない', () => {
    const { s } = drafting();
    expect(s.action(0, { type: 'endTurn', player: 0 })).toMatchObject({ ok: false, reason: 'invalid' });
    const n = new FakeServer();
    ok(n.send({ op: 'create', name: 'a', deck: POISON.deck, cards: POISON.cards }, HOST));
    ok(n.send({ ...joinReq(), deck: BEASTS.deck, cards: BEASTS.cards }, GUEST));
    expect(n.take(0, 'x')).toMatchObject({ ok: false, error: 'ドラフト中ではありません' });
  });
});

describe('ドラフトから対戦・再戦まで', () => {
  it('30回取ると、そのデッキで対戦が始まる（先攻・後攻はランダム・リーダーとルールもそのまま）', () => {
    const { s } = drafting({ leader: 'knight', rules: { field: 'none', dayNight: true } }, { leader: 'scholar' });
    const v = finishDraft(s);
    expect(v.status).toBe('playing');
    expect(v.view!.phase).toBe('mulligan');
    // 先攻は取った順と関係なく、対戦のシード（リクエストの乱数）で決まる（決定事項 #125）
    expect([0, 1]).toContain(v.view!.first);
    expect(v.view!.first).toBe(s.room!.state!.first);
    expect(v.deadline).toBe(s.now + MULLIGAN_MS);
    expect(v.draft!.done).toBe(true);
    expect(v.draft!.turn).toBeNull();
    expect(v.draft!.takesLeft).toEqual([0, 0]);
    expect(v.leaders).toEqual(['knight', 'scholar']);
    expect(s.room!.state!.players[0].leader).toBe('knight');
    expect(v.rules?.dayNight).toBe(true);
    expect(v.games).toBe(1);
    // ドラフトのカードがそのままデッキ（30枚・ルールどおり）
    const decks = s.room!.meta!.decks!;
    for (const p of [0, 1] as const) {
      const a = analyzeDeck(decks[p].deck, new Map(decks[p].cards.map((c) => [c.id, c])));
      expect(a.violations).toEqual([]);
      const taken = v.draft!.taken[p].map((t) => [t.card.id, t.count]);
      expect(decks[p].deck.entries.map((e) => [e.cardId, e.count])).toEqual(taken);
    }
    // 終わったドラフトの記録は小さくなる（伏せた山は捨てる）
    expect(s.room!.meta!.draft!.pile).toEqual([]);
    expect(s.room!.meta!.auto).toBeUndefined();
  });

  it('決着後、両者が「同じデッキでもう一戦」を押すと、同じデッキ・新しいシードで負けた人が先攻の対戦が始まる', () => {
    const { s } = drafting();
    finishDraft(s);
    const decks = JSON.stringify(s.room!.meta!.decks);
    // 席1が降参
    ok(s.action(1, { type: 'concede', player: 1 }));
    expect(s.room!.status).toBe('ended');
    expect(s.state(0).rematch).toEqual([false, false]);
    // 決着前・自分のデッキで遊べない古い部屋は再戦できない、は別のテスト
    const v1 = ok(s.rematch(0));
    expect(v1).toMatchObject({ status: 'ended', rematch: [true, false] });
    const version = s.room!.version;
    ok(s.rematch(0)); // 2回押しても変わらない
    expect(s.room!.version).toBe(version);
    s.seed = 12345;
    const v2 = ok(s.rematch(1));
    expect(v2.status).toBe('playing');
    expect(v2.view!.phase).toBe('mulligan');
    expect(v2.view!.first).toBe(1);
    expect(v2.rematch).toBeUndefined();
    expect(v2.games).toBe(2);
    expect(JSON.stringify(s.room!.meta!.decks)).toBe(decks);
    expect(s.room!.meta!.rematch).toEqual([false, false]);
    expect(s.room!.state!.log.some((l) => l.text.includes('対戦開始'))).toBe(true);
  });

  it('対戦が終わる前は再戦できない', () => {
    const { s } = drafting();
    expect(s.rematch(0)).toMatchObject({ ok: false, reason: 'invalid' });
    finishDraft(s);
    expect(s.rematch(0)).toMatchObject({ ok: false, reason: 'invalid' });
  });
});

describe('ドラフトの時間切れとおまかせ', () => {
  it('時間切れは負けにならず、代わりにおまかせで1枚取る。続けて3回でおまかせになり、番が来たらすぐ取られる', () => {
    const { s } = drafting();
    const late = s.room!.meta!.draft!.first;
    const other = battle.other(late);
    // 1回目：締め切りを過ぎてから相手が状態を取りに来る
    s.now += PICK_MS + 1;
    const v = s.state(other);
    expect(v.status).toBe('drafting');
    expect(v.timeouts[late]).toBe(1);
    expect(v.draft!.taken[late]).toHaveLength(1);
    expect(v.draft!.turn).toBe(other);
    expect(v.draft!.auto).toEqual([false, false]);
    expect(v.deadline).toBe(s.now + PICK_MS);
    for (let i = 2; i <= BALANCE.online.timeoutLoseCount; i++) {
      s.now += 100;
      ok(s.take(other, s.state(other).draft!.takeable.find((t) => t.ok)!.cardId));
      s.now += PICK_MS + 1;
      const w = s.state(other);
      expect(w.timeouts[late]).toBe(i);
      expect(w.status).toBe('drafting');
    }
    expect(s.state(other).draft!.auto[late]).toBe(true);
    // 以後、相手が取ると、おまかせの人の分もすぐ取られて相手の番に戻る
    const picks = s.room!.meta!.draft!.picks.length;
    s.now += 100;
    const after = ok(s.take(other, s.state(other).draft!.takeable.find((t) => t.ok)!.cardId));
    expect(s.room!.meta!.draft!.picks.length).toBe(picks + 2);
    expect(after.draft!.turn).toBe(other);
    // 自分でおまかせを切ると、時間切れの回数も0に戻る
    const back = ok(s.auto(late, false));
    expect(back.draft!.auto[late]).toBe(false);
    expect(back.timeouts[late]).toBe(0);
  });

  it('自分の番におまかせを入れると、すぐ代わりに取る。自分で取るとおまかせは切れる', () => {
    const { s } = drafting();
    const me = s.room!.meta!.draft!.first;
    const v = ok(s.auto(me, true));
    expect(v.draft!.auto[me]).toBe(true);
    expect(v.draft!.turn).toBe(battle.other(me));
    expect(v.draft!.taken[me]).toHaveLength(1);
    // 相手の番の間におまかせを切り、自分で取る
    ok(s.auto(me, false));
    takeFirstOk(s);
    expect(s.room!.meta!.draft!.picks.length).toBe(2);
    const w = takeFirstOk(s);
    expect(w.draft!.auto).toEqual([false, false]);
  });

  it('2人とも離れていても、時間切れのたびに進み、最後は対戦が始まる（ドラフトでは負けにならない）', () => {
    const { s } = drafting();
    let v: RoomView = s.state(0);
    for (let i = 0; i < 2 * D.takes && v.status === 'drafting'; i++) {
      s.now += PICK_MS + 1;
      v = s.state(0);
    }
    expect(v.status).toBe('playing');
    expect(v.view!.phase).toBe('mulligan');
    expect(v.timeouts).toEqual([0, 0]);
    expect(s.room!.state!.result).toBeNull();
  });
});

describe('レビューの指摘（決定事項 #120）', () => {
  it('相手がおまかせを切り替えても、自分の取る操作はやり直しにならない。同じ値のおまかせは版を上げない', () => {
    const { s } = drafting();
    const me = s.room!.meta!.draft!.first;
    const opp = battle.other(me);
    const seen = s.state(me);
    const v = s.room!.version;
    // 同じ値（もう切れている）なら何も変わらない
    ok(s.auto(opp, false));
    expect(s.room!.version).toBe(v);
    // 相手の番ではないときにおまかせを入れる・切る（場は変わらない）
    ok(s.auto(opp, true));
    ok(s.auto(opp, false));
    expect(s.room!.version).toBe(v + 2);
    expect(s.room!.deadline).toBe(seen.deadline);
    // 見ていた版（切り替えの前）のままで取れる
    const card = seen.draft!.takeable.find((t) => t.ok)!.cardId;
    expect(ok(s.take(me, card, seen.version)).draft!.picks).toHaveLength(1);
    // 取られたあと（場が変わった）は、前の版ではやり直し
    const before = s.state(opp);
    takeFirstOk(s);
    expect(s.take(me, s.room!.meta!.draft!.field[0]!, before.version)).toMatchObject({ ok: false, reason: 'version' });
    // 未来の版も受け付けない
    expect(s.take(me, s.room!.meta!.draft!.field[0]!, s.room!.version + 5)).toMatchObject({ ok: false, reason: 'version' });
  });

  it('ドラフトを知らない古い画面（features に draft が無い）はドラフトの部屋に入れない。自分のデッキの部屋には入れる', () => {
    const s = new FakeServer();
    ok(s.send(createDraftReq(), HOST));
    const r = s.send({ op: 'join', code: 'abc234', name: '古い', deck: BEASTS.deck, cards: BEASTS.cards }, GUEST);
    expect(r).toMatchObject({ ok: false, reason: 'invalid', error: 'この部屋はドラフト戦です。アプリを新しくしてから入ってください' });
    expect(s.room!.status).toBe('waiting');
    const n = new FakeServer();
    ok(n.send({ op: 'create', name: 'a', deck: POISON.deck, cards: POISON.cards }, HOST));
    expect(ok(n.send({ op: 'join', code: 'abc234', name: '古い', deck: BEASTS.deck, cards: BEASTS.cards }, GUEST)).status).toBe('playing');
  });

  it('時間切れ・おまかせで取ったカードには印が付く（自分で取ったものには付かない）', () => {
    const { s } = drafting();
    const late = s.room!.meta!.draft!.first;
    s.now += PICK_MS + 1;
    const v = s.state(battle.other(late));
    expect(v.draft!.picks[0]).toMatchObject({ player: late, by: 'timeout' });
    takeFirstOk(s);
    expect(s.room!.meta!.draft!.picks[1]!.by).toBeUndefined();
    ok(s.auto(late, true));
    expect(s.room!.meta!.draft!.picks[2]).toMatchObject({ player: late, by: 'auto' });
  });

  it('山の並びと対戦のシードは、そのリクエストの乱数で決まる（ドラフトの乱数だけからは読めない）', () => {
    const run = (finalSeed: number, takeSeed: number) => {
      const { s } = drafting();
      for (let i = 0; i < 2 * D.takes - 1; i++) {
        s.now += 100;
        takeFirstOk(s);
      }
      const snapshot = JSON.stringify(s.room);
      s.seed = takeSeed;
      const r1 = new FakeServer();
      r1.room = JSON.parse(snapshot) as RoomRecord;
      r1.now = s.now + 100;
      r1.seed = finalSeed;
      takeFirstOk(r1);
      return r1.room!.state!;
    };
    const a = run(111, 0);
    const b = run(222, 0);
    expect(a.players[0].deck.map((c) => c.uid)).not.toEqual(b.players[0].deck.map((c) => c.uid));
    // 同じ部屋・同じ取り方でも、取ったあとに補充されるカードはリクエストの乱数で変わりうる（山を混ぜ直す）
    const fields = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { s } = drafting();
      s.seed = seed;
      takeFirstOk(s);
      fields.add(JSON.stringify(s.room!.meta!.draft!.field));
    }
    expect(fields.size).toBeGreaterThan(1);
  });
});

describe('自分のデッキの部屋（今までどおり＋再戦）', () => {
  function normalRoom() {
    const s = new FakeServer();
    ok(s.send({ op: 'create', name: 'ホスト', deck: POISON.deck, cards: POISON.cards, leader: 'mage' }, HOST));
    const v = ok(s.send({ ...joinReq(), deck: BEASTS.deck, cards: BEASTS.cards }, GUEST));
    return { s, v };
  }

  it('入室ですぐ対戦が始まり、デッキは再戦のために残る', () => {
    const { s, v } = normalRoom();
    expect(v).toMatchObject({ status: 'playing', mode: 'deck', games: 1 });
    expect(v.draft).toBeUndefined();
    expect(s.room!.hostDeck).toBeNull();
    expect(s.room!.meta!.decks![0].deck.id).toBe(POISON.deck.id);
    expect(s.room!.meta!.decks![1].deck.id).toBe(BEASTS.deck.id);
  });

  it('再戦：負けた人が先攻。引き分けなら前の対戦で後攻だった人が先攻', () => {
    const { s } = normalRoom();
    ok(s.action(0, { type: 'concede', player: 0 }));
    ok(s.rematch(1));
    const v = ok(s.rematch(0));
    expect(v.status).toBe('playing');
    expect(v.view!.first).toBe(0);
    expect(v.leaders).toEqual(['mage', 'none']);
    expect(s.room!.state!.players[0].leader).toBe('mage');

    // 引き分けにして終わらせる
    const prevFirst = s.room!.state!.first;
    s.room!.state!.phase = 'ended';
    s.room!.state!.result = { winner: null, reason: 'turnLimit' };
    s.room!.status = 'ended';
    s.room!.deadline = null;
    ok(s.rematch(0));
    const w = ok(s.rematch(1));
    expect(w.view!.first).toBe(battle.other(prevFirst));
    expect(w.games).toBe(3);
  });

  it('meta の無い古い部屋は、今までどおり遊べるが再戦はできない', () => {
    const { s } = normalRoom();
    delete s.room!.meta;
    ok(s.action(1, { type: 'concede', player: 1 }));
    const v = s.state(0);
    expect(v.mode).toBe('deck');
    expect(v.rematch).toBeUndefined();
    expect(s.rematch(0)).toMatchObject({ ok: false, error: 'この部屋では再戦できません' });
  });
});

describe('受付（handleBody）', () => {
  class MemoryStore implements RoomStore {
    rooms = new Map<string, RoomRecord>();
    async insert(room: RoomRecord) {
      if (this.rooms.has(room.code)) return false;
      this.rooms.set(room.code, structuredClone(room));
      return true;
    }
    async update<T>(code: string, fn: (room: RoomRecord | null) => { save: RoomRecord | null; value: T }) {
      const current = this.rooms.get(code);
      const r = fn(current ? structuredClone(current) : null);
      if (r.save) this.rooms.set(code, structuredClone(r.save));
      return r.value;
    }
    async removeOlderThan() {}
  }

  it('ドラフトの部屋を作り、入り、取る（山は外から渡せる）', async () => {
    const store = new MemoryStore();
    const deps: HttpDeps = {
      store,
      now: () => T0,
      randomInt: (n) => randomInt(n),
      newToken: () => randomBytes(32).toString('hex'),
      hash: async (t) => createHash('sha256').update(t).digest('hex'),
      notify: async () => {},
      draftPool: POOL,
    };
    const call = async (body: unknown) => (await handleBody(JSON.stringify(body), deps)).body as OnlineResponse;
    const host = await call({ op: 'create', mode: 'draft', name: 'A' });
    if (!host.ok) throw new Error(host.error);
    const guest = await call({ op: 'join', code: host.code, name: 'B', features: ['draft'] });
    if (!guest.ok) throw new Error(guest.error);
    expect(guest.status).toBe('drafting');
    const d = guest.draft!;
    const token = d.turn === 0 ? host.token! : guest.token!;
    const r = await call({ op: 'take', code: host.code, token, version: guest.version, cardId: d.takeable.find((t) => t.ok)!.cardId });
    expect(r.ok && r.draft!.picks).toHaveLength(1);
    const room = store.rooms.get(host.code)!;
    expect(room.meta!.draft!.picks).toHaveLength(1);
    // 保存した部屋は JSON にできる
    expect(JSON.parse(JSON.stringify(room))).toEqual(room);
    expect(draft.isDraftDone(room.meta!.draft!)).toBe(false);
  });
});
