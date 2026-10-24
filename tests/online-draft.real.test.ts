// オンラインのドラフト戦（決定事項 #115）を実際の倍率で：作成 → 入室 → ドラフト → 対戦 → 決着 → 再戦
import { describe, expect, it } from 'vitest';
import { BALANCE, battle, type CardDef } from '../src/engine/index.ts';
import { PRESET_DECKS } from '../src/presets.ts';
import { parseRequest, type OnlineResponse, type RoomView } from '../src/online/protocol.ts';
import type { RoomRecord } from '../src/online/room.ts';
import { serve } from '../src/online/server.ts';

const POOL: CardDef[] = PRESET_DECKS.flatMap((p) => p.cards);
const HOST = 'a'.repeat(64);
const GUEST = 'b'.repeat(64);

describe('オンラインのドラフト（実際の倍率）', () => {
  it('作成から再戦まで', () => {
    let room: RoomRecord | null = null;
    let now = 1_800_000_000_000;
    const send = (raw: unknown, tokenHash: string): RoomView => {
      const parsed = parseRequest(JSON.parse(JSON.stringify(raw)));
      if (!parsed.ok) throw new Error(parsed.error);
      const r = serve(parsed.value, parsed.value.op === 'create' ? null : room, { code: 'ABC234', seed: 99, draftPool: POOL, tokenHash, now: now++ });
      if (r.save) room = JSON.parse(JSON.stringify(r.save)) as RoomRecord;
      const res = JSON.parse(JSON.stringify(r.response)) as OnlineResponse;
      if (!res.ok) throw new Error(res.error);
      return res;
    };
    const token = (p: battle.PlayerId) => (p === 0 ? HOST : GUEST);
    send({ op: 'create', mode: 'draft', name: 'A', leader: 'knight' }, HOST);
    let v = send({ op: 'join', code: 'ABC234', name: 'B', features: ['draft'] }, GUEST);
    while (v.status === 'drafting') {
      const p = v.draft!.turn!;
      const mine = send({ op: 'state', code: 'ABC234', token: token(p) }, token(p));
      v = send({ op: 'take', code: 'ABC234', token: token(p), version: mine.version, cardId: mine.draft!.takeable.find((t) => t.ok)!.cardId }, token(p));
    }
    expect(v.status).toBe('playing');
    const g = room!.state!;
    expect(g.players[0].maxHp).toBeGreaterThan(BALANCE.battle.playerHp);
    for (const p of [0, 1] as const) expect(g.players[p].deck.length + g.players[p].hand.length).toBe(BALANCE.deck.size);
    send({ op: 'action', code: 'ABC234', token: GUEST, version: room!.version, action: { type: 'concede', player: 1 } }, GUEST);
    send({ op: 'rematch', code: 'ABC234', token: GUEST }, GUEST);
    const w = send({ op: 'rematch', code: 'ABC234', token: HOST }, HOST);
    expect(w.status).toBe('playing');
    expect(w.view!.first).toBe(1);
    expect(w.games).toBe(2);
  });
});
