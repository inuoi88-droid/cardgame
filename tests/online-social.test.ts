// フレンド機能・公開の部屋・対戦成績・相手のデッキ（決定事項 #121）：サーバーの中身だけで試す。倍率1
import { describe, expect, it } from 'vitest';
import { BALANCE, battle, type CardDef } from '../src/engine/index.ts';
import { PRESET_DECKS } from '../src/presets.ts';
import { parseRequest, type OnlineResponse, type RoomView } from '../src/online/protocol.ts';
import type { RoomRecord } from '../src/online/room.ts';
import { serve, type ServeDeps } from '../src/online/server.ts';

const [POISON, BEASTS] = PRESET_DECKS as unknown as [(typeof PRESET_DECKS)[number], (typeof PRESET_DECKS)[number]];
const POOL: CardDef[] = PRESET_DECKS.flatMap((p) => p.cards);
const T0 = 1_800_000_000_000;
const D = BALANCE.draft;
const HOST = 'a'.repeat(64);
const GUEST = 'b'.repeat(64);
const tokenOf = (p: battle.PlayerId) => (p === 0 ? HOST : GUEST);

function ok(res: OnlineResponse): RoomView {
  if (!res.ok) throw new Error(res.error);
  return res;
}

/** serve() だけを使う部屋1つのサーバー役 */
class FakeServer {
  room: RoomRecord | null = null;
  now = T0;
  send(raw: unknown, tokenHash: string, extra: Partial<ServeDeps> = {}): OnlineResponse {
    const parsed = parseRequest(JSON.parse(JSON.stringify(raw)));
    if (!parsed.ok) return { ok: false, error: parsed.error, reason: 'invalid' };
    const r = serve(parsed.value, parsed.value.op === 'create' ? null : this.room, { code: 'ABC234', seed: 7, draftPool: POOL, tokenHash, now: this.now, ...extra });
    if (r.save) this.room = JSON.parse(JSON.stringify(r.save)) as RoomRecord;
    return JSON.parse(JSON.stringify(r.response)) as OnlineResponse;
  }
  state(p: battle.PlayerId): RoomView {
    return ok(this.send({ op: 'state', code: 'ABC234', token: tokenOf(p) }, tokenOf(p)));
  }
  action(p: battle.PlayerId, action: battle.Action): OnlineResponse {
    return this.send({ op: 'action', code: 'ABC234', token: tokenOf(p), version: this.room!.version, action }, tokenOf(p));
  }
  rematch(p: battle.PlayerId): OnlineResponse {
    return this.send({ op: 'rematch', code: 'ABC234', token: tokenOf(p) }, tokenOf(p));
  }
}

function deckRoom() {
  const s = new FakeServer();
  const created = ok(s.send({ op: 'create', name: 'ホスト', deck: POISON.deck, cards: POISON.cards }, HOST));
  const joined = ok(s.send({ op: 'join', code: 'ABC234', name: 'ゲスト', deck: BEASTS.deck, cards: BEASTS.cards }, GUEST));
  return { s, created, joined };
}

function draftRoom() {
  const s = new FakeServer();
  ok(s.send({ op: 'create', mode: 'draft', name: 'ホスト' }, HOST));
  const joined = ok(s.send({ op: 'join', code: 'ABC234', name: 'ゲスト', features: ['draft'] }, GUEST));
  return { s, joined };
}

function finishDraft(s: FakeServer): RoomView {
  let v: RoomView | null = null;
  for (let i = 0; i < 2 * D.takes; i++) {
    const d = s.room!.meta!.draft!;
    const turn = d.picks.length % 2 === 0 ? d.first : battle.other(d.first);
    const view = s.state(turn);
    const t = view.draft!.takeable.find((x) => x.ok)!;
    v = ok(s.send({ op: 'take', code: 'ABC234', token: tokenOf(turn), version: view.version, cardId: t.cardId }, tokenOf(turn)));
  }
  return v!;
}

describe('相手のデッキ（RoomView.opponentDeck）', () => {
  it('自分のデッキの部屋：待機中・対戦中は無く、決着すると相手が出したデッキが見える。再戦が始まるとまた消える', () => {
    const { s, created, joined } = deckRoom();
    expect(created.opponentDeck).toBeUndefined();
    expect(joined.opponentDeck).toBeUndefined();
    expect(s.state(0).opponentDeck).toBeUndefined();
    // 対戦中の返事には、相手のデッキの ID もカードの定義も入らない（相手だけが持つカード）
    const onlyBeasts = BEASTS.cards.filter((c) => !POISON.cards.some((p) => p.id === c.id));
    expect(onlyBeasts.length).toBeGreaterThan(0);
    const hostView = JSON.stringify(s.state(0));
    expect(hostView).not.toContain(`"${BEASTS.deck.id}"`);

    ok(s.action(1, { type: 'concede', player: 1 }));
    const host = s.state(0);
    const guest = s.state(1);
    expect(host.opponentDeck).toEqual({ name: BEASTS.deck.name, deck: s.room!.meta!.decks![1].deck, cards: s.room!.meta!.decks![1].cards });
    expect(guest.opponentDeck!.deck.id).toBe(POISON.deck.id);
    expect(guest.opponentDeck!.cards.map((c) => c.id).sort()).toEqual(POISON.cards.filter((c) => POISON.deck.entries.some((e) => e.cardId === c.id)).map((c) => c.id).sort());

    ok(s.rematch(0));
    expect(s.state(0).opponentDeck).toBeDefined(); // 片方が押しただけなら、まだ決着した状態
    const again = ok(s.rematch(1));
    expect(again.status).toBe('playing');
    expect(again.opponentDeck).toBeUndefined();
  });

  it('ドラフトの部屋：ドラフト中・対戦中は無く、決着すると相手がドラフトで作ったデッキが見える', () => {
    const { s, joined } = draftRoom();
    expect(joined.opponentDeck).toBeUndefined();
    const started = finishDraft(s);
    expect(started.status).toBe('playing');
    expect(started.opponentDeck).toBeUndefined();
    expect(s.state(1).opponentDeck).toBeUndefined();
    ok(s.action(0, { type: 'concede', player: 0 }));
    const guest = s.state(1);
    const theirs = s.room!.meta!.decks![0];
    expect(guest.opponentDeck).toEqual({ name: theirs.deck.name, deck: theirs.deck, cards: theirs.cards });
    expect(guest.opponentDeck!.deck.entries.reduce((n, e) => n + e.count, 0)).toBe(2 * D.takes);
  });
});
