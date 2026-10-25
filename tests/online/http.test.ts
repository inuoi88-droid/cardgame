// Edge Function の受付の中身：DB の代わりにメモリの保存場所をつないで試す
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PRESET_DECKS } from '../../src/presets.ts';
import { handleBody, ROOM_TTL_MS, type HttpDeps, type OnlineResponse, type RoomRecord, type RoomStore } from '../../src/online/index.ts';

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
  async removeOlderThan(time: number) {
    for (const [code, room] of this.rooms) if (room.updatedAt < time) this.rooms.delete(code);
  }
}

function setup() {
  const store = new MemoryStore();
  const notified: [string, number][] = [];
  let now = 1_800_000_000_000;
  const deps: HttpDeps = {
    store,
    now: () => now,
    randomInt: (n) => randomInt(n),
    newToken: () => randomBytes(32).toString('hex'),
    hash: async (t) => createHash('sha256').update(t).digest('hex'),
    notify: async (code, version) => {
      notified.push([code, version]);
    },
  };
  const call = async (body: unknown) => (await handleBody(typeof body === 'string' ? body : JSON.stringify(body), deps)).body as OnlineResponse;
  return { store, notified, deps, call, tick: (ms: number) => (now += ms) };
}

const [A, B] = PRESET_DECKS as [(typeof PRESET_DECKS)[number], (typeof PRESET_DECKS)[number]];

function okRes(r: OnlineResponse) {
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe('Edge Function の受付', () => {
  it('作成 → 入室 → 状態の取得。DB にはトークンのハッシュだけが残る', async () => {
    const { store, notified, call } = setup();
    const created = okRes(await call({ op: 'create', name: 'A', deck: A.deck, cards: A.cards }));
    expect(created.token).toMatch(/^[0-9a-f]{64}$/);
    const room = store.rooms.get(created.code)!;
    expect(JSON.stringify(room)).not.toContain(created.token!);

    const joined = okRes(await call({ op: 'join', code: created.code.toLowerCase(), name: 'B', deck: B.deck, cards: B.cards }));
    expect(joined.seat).toBe(1);
    expect(joined.token).not.toBe(created.token);
    expect(notified).toEqual([[created.code, joined.version]]);

    const host = okRes(await call({ op: 'state', code: created.code, token: created.token }));
    expect(host.seat).toBe(0);
    expect(host.status).toBe('playing');
    expect(host.token).toBeUndefined();
  });

  it('壊れた送信や大きすぎる送信は受け付けない', async () => {
    const { call, deps } = setup();
    expect(await call('{oops')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await call({ op: 'state', code: 'ABC234', token: 'x' })).toMatchObject({ ok: false });
    const big = await handleBody('x'.repeat(500_000), deps);
    expect(big.status).toBe(413);
  });

  it('ない部屋は「見つかりません」', async () => {
    const { call } = setup();
    expect(await call({ op: 'state', code: 'ABC234', token: 'a'.repeat(64) })).toMatchObject({ ok: false, reason: 'notFound' });
  });

  it('部屋を作るときに、24時間以上操作のない部屋を片付ける', async () => {
    const { store, call, tick } = setup();
    const old = okRes(await call({ op: 'create', name: 'A', deck: A.deck, cards: A.cards }));
    tick(ROOM_TTL_MS + 1);
    okRes(await call({ op: 'create', name: 'B', deck: B.deck, cards: B.cards }));
    expect(store.rooms.has(old.code)).toBe(false);
    expect(store.rooms.size).toBe(1);
  });

  it('保存場所のエラーは 500 で返し、中身は漏らさない', async () => {
    const { deps } = setup();
    deps.store.update = async () => {
      throw new Error('connection refused: secret-host:5432');
    };
    const r = await handleBody(JSON.stringify({ op: 'state', code: 'ABC234', token: 'a'.repeat(64) }), deps);
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain('secret-host');
  });
});
