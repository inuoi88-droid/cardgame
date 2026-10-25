// フレンド機能（決定事項 #121）を実際の倍率で：公式カードのドラフトの部屋を公開で作り、フレンドを招待して、
// ドラフト → 対戦 → 決着で相手のデッキが見え、成績が付く → 再戦の決着も数える → 相手のデッキを公開してフレンドが見る
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { analyzeDeck, BALANCE } from '../src/engine/index.ts';
import { OFFICIAL_CARDS } from '../src/official/index.ts';
import { handleBody, MemoryStore, type HttpDeps, type OnlineResponse, type RoomView, type SocialResponse } from '../src/online/index.ts';

describe('フレンドと対戦（実際の倍率・公式カード）', () => {
  it('公開の部屋 → 招待 → ドラフト → 決着 → 再戦 → 成績と相手のデッキ', async () => {
    const store = new MemoryStore();
    let now = 1_800_000_000_000;
    const deps: HttpDeps = {
      store,
      social: store,
      now: () => now++,
      randomInt: (n) => randomInt(n),
      newToken: () => randomBytes(32).toString('hex'),
      hash: async (t) => createHash('sha256').update(t).digest('hex'),
      notify: async () => {},
      draftPool: OFFICIAL_CARDS,
    };
    const call = async (body: unknown) => {
      const r = (await handleBody(JSON.stringify(body), deps)).body as OnlineResponse | SocialResponse;
      if (!r.ok) throw new Error(r.error);
      return r as Record<string, unknown>;
    };
    const room = async (body: unknown) => (await call(body)) as unknown as RoomView & { token?: string };

    const a = await call({ op: 'register', name: 'アキ' });
    const b = await call({ op: 'register', name: 'ベン' });
    const link = await call({ op: 'inviteLink', secret: a.secret });
    await call({ op: 'friendByLink', secret: b.secret, friendCode: link.friendCode, token: link.token });

    const host = await room({ op: 'create', mode: 'draft', name: 'アキ', secret: a.secret, listed: true });
    const list = await call({ op: 'list' });
    expect((list.rooms as { code: string }[]).map((r) => r.code)).toEqual([host.code]);
    const inv = await call({ op: 'invite', secret: a.secret, friendCode: b.friendCode, roomCode: host.code });
    const acc = await call({ op: 'inviteRespond', secret: b.secret, inviteId: inv.inviteId, accept: true });
    const guest = await room({ op: 'join', code: (acc.room as { code: string }).code, name: 'ベン', features: ['draft'], secret: b.secret });
    const tokens = [host.token!, guest.token!];

    let v: RoomView = guest;
    while (v.status === 'drafting') {
      const p = v.draft!.turn!;
      const mine = await room({ op: 'state', code: host.code, token: tokens[p] });
      v = await room({ op: 'take', code: host.code, token: tokens[p], version: mine.version, cardId: mine.draft!.takeable.find((t) => t.ok)!.cardId });
    }
    expect(v.status).toBe('playing');
    expect(v.opponentDeck).toBeUndefined();
    await room({ op: 'action', code: host.code, token: tokens[1], version: store.rooms.get(host.code)!.version, action: { type: 'concede', player: 1 } });
    const end = await room({ op: 'state', code: host.code, token: tokens[0] });
    const theirs = end.opponentDeck!;
    expect(theirs.deck.entries.reduce((n, e) => n + e.count, 0)).toBe(BALANCE.deck.size);
    expect(analyzeDeck(theirs.deck, new Map(theirs.cards.map((c) => [c.id, c]))).valid).toBe(true);
    expect(end.opponentFriendCode).toBe(b.friendCode);

    await room({ op: 'rematch', code: host.code, token: tokens[0] });
    await room({ op: 'rematch', code: host.code, token: tokens[1] });
    await room({ op: 'action', code: host.code, token: tokens[0], version: store.rooms.get(host.code)!.version, action: { type: 'concede', player: 0 } });
    const hello = await call({ op: 'hello', secret: a.secret });
    expect((hello.friends as { record: unknown }[])[0]!.record).toEqual({ win: 1, loss: 1, draw: 0 });

    // ドラフトで作ったデッキをそのまま公開し、フレンドが見る（公式カードでもルールの確かめを通る）
    await call({ op: 'shareDeck', secret: a.secret, deck: { ...theirs.deck, id: 'from-draft', name: 'ドラフトで' }, cards: theirs.cards });
    const decks = await call({ op: 'friendDecks', secret: b.secret, friendCode: a.friendCode });
    expect((decks.decks as { deckId: string }[]).map((d) => d.deckId)).toEqual(['from-draft']);
  });
});
