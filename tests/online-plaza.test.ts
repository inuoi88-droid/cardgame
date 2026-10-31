// みんなの広場・運営・公式カードの上書き（決定事項 #141）：パスワードで運営になる・公開は運営だけ・見るのは誰でも・
// 公式カードの書き換えは保存した時点でオンラインのドラフトの山にも効く（倍率1）
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { analyzeCard, analyzeDeck, type CardDef } from '../src/engine/index.ts';
import { OFFICIAL_CARDS, officialCard, officialPoolProblem, withOfficialOverrides } from '../src/official/index.ts';
import {
  MemoryStore,
  STAFF_FAIL_PER_PLAYER_HOUR,
  createMemoryPlazaStore,
  handleBody,
  staffPasswordHash,
  type HttpDeps,
  type HttpResult,
} from '../src/online/index.ts';
import { PRESET_DECKS, presetEditProblem, withPresetOverrides, type PresetOverride } from '../src/presets.ts';

const hash = async (t: string) => createHash('sha256').update(t).digest('hex');
const PASSWORD = 'test-password-1234';

async function setup(opts: { password?: string | null } = {}) {
  let now = 1_800_000_000_000;
  const store = new MemoryStore();
  const plaza = createMemoryPlazaStore({ staffPassword: opts.password === null ? null : await staffPasswordHash(opts.password ?? PASSWORD, 'salt01', 3, hash) });
  const deps: HttpDeps = {
    store,
    social: store,
    plaza,
    now: () => now,
    randomInt: (n) => randomInt(n),
    newToken: () => randomBytes(32).toString('hex'),
    hash,
    notify: async () => {},
  };
  const seen: HttpResult['body'][] = [];
  const call = async (body: unknown): Promise<any> => {
    const r = await handleBody(JSON.stringify(body), deps);
    seen.push(r.body);
    return r.body;
  };
  const player = async (name: string) => {
    const r = await call({ op: 'register', name });
    expect(r.ok).toBe(true);
    return { secret: r.secret as string, friendCode: r.friendCode as string, name };
  };
  const staff = async (name: string) => {
    const p = await player(name);
    expect(await call({ op: 'staffLogin', secret: p.secret, password: PASSWORD })).toMatchObject({ ok: true, staff: true });
    return p;
  };
  return { store, plaza, call, player, staff, seen, tick: (ms: number) => (now += ms) };
}

const cardOf = (over: Partial<CardDef> = {}): CardDef => ({
  v: 1,
  id: 'my-card-1',
  name: '火の粉',
  icon: '🔥',
  rarity: 'common',
  cost: 1,
  stats: null,
  keywords: [],
  effects: [{ id: 'damage', value: 1, timing: 'play', target: 'chosen', condition: null }],
  drawbacks: [],
  ...over,
});

describe('運営になる', () => {
  it('パスワードが違えば断り、合えば運営になる。やめることもできる', async () => {
    const s = await setup();
    const p = await s.player('あなた');
    expect(await s.call({ op: 'plazaMe', secret: p.secret })).toMatchObject({ ok: true, staff: false, mine: [] });
    expect(await s.call({ op: 'staffLogin', secret: p.secret, password: 'wrong' })).toMatchObject({ ok: false, reason: 'denied' });
    expect(await s.call({ op: 'staffLogin', secret: p.secret, password: PASSWORD })).toMatchObject({ ok: true, staff: true });
    expect(await s.call({ op: 'plazaMe', secret: p.secret })).toMatchObject({ staff: true, friendCode: p.friendCode });
    expect(await s.call({ op: 'staffLogout', secret: p.secret })).toMatchObject({ ok: true, staff: false });
    expect(await s.call({ op: 'plazaMe', secret: p.secret })).toMatchObject({ staff: false });
  });

  it('間違いが続くと、正しいパスワードでもしばらく入れない', async () => {
    const s = await setup();
    const p = await s.player('あなた');
    for (let i = 0; i < STAFF_FAIL_PER_PLAYER_HOUR; i++) await s.call({ op: 'staffLogin', secret: p.secret, password: `x${i}` });
    expect(await s.call({ op: 'staffLogin', secret: p.secret, password: PASSWORD })).toMatchObject({ ok: false, reason: 'limit' });
    s.tick(61 * 60 * 1000);
    expect(await s.call({ op: 'staffLogin', secret: p.secret, password: PASSWORD })).toMatchObject({ ok: true });
  });

  it('パスワードが用意されていなければ誰も入れない。プレイヤーの鍵が無ければ断る', async () => {
    const s = await setup({ password: null });
    const p = await s.player('あなた');
    expect(await s.call({ op: 'staffLogin', secret: p.secret, password: PASSWORD })).toMatchObject({ ok: false, reason: 'unsupported' });
    expect(await s.call({ op: 'staffLogin', secret: 'f'.repeat(64), password: PASSWORD })).toMatchObject({ ok: false, reason: 'auth' });
  });

  it('保存値は回数・塩・ハッシュ。パスワードそのものは入っていない', async () => {
    const v = await staffPasswordHash(PASSWORD, 'abc', 5, hash);
    expect(v.split('$')).toHaveLength(3);
    expect(v).not.toContain(PASSWORD);
    expect(v).toBe(await staffPasswordHash(PASSWORD, 'abc', 5, hash));
    expect(v).not.toBe(await staffPasswordHash(PASSWORD, 'abd', 5, hash));
  });
});

describe('みんなの広場', () => {
  it('公開できるのは運営だけ。見るのは誰でも（鍵なし）', async () => {
    const s = await setup();
    const guest = await s.player('ゲスト');
    expect(await s.call({ op: 'plazaPublish', secret: guest.secret, kind: 'card', card: cardOf() })).toMatchObject({ ok: false, reason: 'staff' });
    const admin = await s.staff('運営さん');
    const pub = await s.call({ op: 'plazaPublish', secret: admin.secret, kind: 'card', card: cardOf() });
    expect(pub).toMatchObject({ ok: true, item: { kind: 'card', name: '火の粉', count: 1, owner: { name: '運営さん', friendCode: admin.friendCode } } });
    const list = await s.call({ op: 'plazaList' });
    expect(list.items).toHaveLength(1);
    expect(list.items[0].cover.id).toBe('my-card-1');
    const got = await s.call({ op: 'plazaGet', id: pub.item.id });
    expect(got.item.card.name).toBe('火の粉');
    // 内部の ID は返さない
    expect(JSON.stringify(s.seen)).not.toMatch(/ownerId/);
  });

  it('同じカードを公開し直すと置き換わる。デッキも公開でき、表紙はいちばん多いカード', async () => {
    const s = await setup();
    const admin = await s.staff('運営さん');
    const a = await s.call({ op: 'plazaPublish', secret: admin.secret, kind: 'card', card: cardOf() });
    const b = await s.call({ op: 'plazaPublish', secret: admin.secret, kind: 'card', card: cardOf({ name: '火の粉・改' }) });
    expect(b.item.id).toBe(a.item.id);
    const P = PRESET_DECKS[0]!;
    s.tick(1000);
    const d = await s.call({ op: 'plazaPublish', secret: admin.secret, kind: 'deck', deck: P.deck, cards: P.cards });
    expect(d).toMatchObject({ ok: true, item: { kind: 'deck', count: P.deck.entries.reduce((n, e) => n + e.count, 0) } });
    const top = [...P.deck.entries].sort((x, y) => y.count - x.count)[0]!;
    expect(d.item.cover.id).toBe(top.cardId);
    const full = await s.call({ op: 'plazaGet', id: d.item.id });
    expect(full.item.deck.entries).toEqual(P.deck.entries);
    expect((await s.call({ op: 'plazaList' })).items.map((x: { name: string }) => x.name)).toEqual([P.deck.name, '火の粉・改']);
    expect((await s.call({ op: 'plazaList', kind: 'card' })).items).toHaveLength(1);
  });

  it('ルール違反のカードは公開できない', async () => {
    const s = await setup();
    const admin = await s.staff('運営さん');
    const over = cardOf({ effects: [{ id: 'damage', value: 9, timing: 'play', target: 'chosen', condition: null }] });
    expect(analyzeCard(over).valid).toBe(false);
    expect(await s.call({ op: 'plazaPublish', secret: admin.secret, kind: 'card', card: over })).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('取り下げは持ち主か運営。ほかの人は取り下げられない', async () => {
    const s = await setup();
    const admin = await s.staff('運営A');
    const admin2 = await s.staff('運営B');
    const guest = await s.player('ゲスト');
    const pub = await s.call({ op: 'plazaPublish', secret: admin.secret, kind: 'card', card: cardOf() });
    expect(await s.call({ op: 'plazaRemove', secret: guest.secret, id: pub.item.id })).toMatchObject({ ok: false, reason: 'staff' });
    expect(await s.call({ op: 'plazaRemove', secret: admin2.secret, id: pub.item.id })).toMatchObject({ ok: true, removed: pub.item.id });
    expect((await s.call({ op: 'plazaList' })).items).toEqual([]);
    expect(await s.call({ op: 'plazaGet', id: pub.item.id })).toMatchObject({ ok: false, reason: 'notFound' });
  });

  it('一覧は続きの位置で次のページを読める', async () => {
    const s = await setup();
    const admin = await s.staff('運営さん');
    for (let i = 0; i < 45; i++) {
      s.tick(1000);
      await s.call({ op: 'plazaPublish', secret: admin.secret, kind: 'card', card: cardOf({ id: `c${i}`, name: `カード${i}` }) });
    }
    const p1 = await s.call({ op: 'plazaList' });
    expect(p1.items).toHaveLength(40);
    expect(p1.items[0].name).toBe('カード44');
    const p2 = await s.call({ op: 'plazaList', before: p1.next });
    expect(p2.items.map((x: { name: string }) => x.name)).toEqual(['カード4', 'カード3', 'カード2', 'カード1', 'カード0']);
    expect(p2.next).toBeNull();
  });
});

describe('公式カードの書き換え', () => {
  const base = OFFICIAL_CARDS.find((c) => c.rarity === 'common' && !c.stats)!;

  it('運営だけが書き換えられ、全員が読める。版が同じなら中身を省く', async () => {
    const s = await setup();
    const guest = await s.player('ゲスト');
    const edited = { ...base, name: `${base.name}改` };
    expect(await s.call({ op: 'officialSave', secret: guest.secret, card: edited })).toMatchObject({ ok: false, reason: 'staff' });
    const admin = await s.staff('運営さん');
    expect(await s.call({ op: 'officialSave', secret: admin.secret, card: edited })).toMatchObject({ ok: true, version: 1 });
    const list = await s.call({ op: 'officialList' });
    expect(list).toMatchObject({ ok: true, version: 1 });
    expect(list.cards.map((c: CardDef) => c.name)).toEqual([`${base.name}改`]);
    expect(await s.call({ op: 'officialList', since: 1 })).toEqual({ ok: true, op: 'officialList', version: 1 });
    expect(withOfficialOverrides(OFFICIAL_CARDS, list.cards).find((c) => c.id === base.id)!.name).toBe(`${base.name}改`);
  });

  it('レアリティも変えられる（#148）。公式でない ID・ルール違反は受け付けない', async () => {
    const s = await setup();
    const admin = await s.staff('運営さん');
    expect(await s.call({ op: 'officialSave', secret: admin.secret, card: { ...base, rarity: 'rare' } })).toMatchObject({ ok: true });
    const list = await s.call({ op: 'officialList' });
    expect(withOfficialOverrides(OFFICIAL_CARDS, list.cards).find((c) => c.id === base.id)!.rarity).toBe('rare');
    expect(await s.call({ op: 'officialSave', secret: admin.secret, card: { ...base, id: 'official-no-such-card' } })).toMatchObject({ ok: false, reason: 'invalid' });
    const over = { ...base, effects: [{ id: 'damage', value: 30, timing: 'play', target: 'chosen', condition: null }] };
    expect(await s.call({ op: 'officialSave', secret: admin.secret, card: over })).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('レアリティを変えてドラフトの山が組めなくなる書き換えは断る（#148）', async () => {
    const s = await setup();
    const admin = await s.staff('運営さん');
    const commons = OFFICIAL_CARDS.filter((c) => c.rarity === 'common');
    // 山が組めるぎりぎりまでコモンをレアにしておく（あと1枚で組めなくなる）
    const changed: CardDef[] = [];
    for (const c of commons) {
      const next = [...changed, { ...c, rarity: 'rare' as const }];
      if (officialPoolProblem(withOfficialOverrides(OFFICIAL_CARDS, next))) break;
      changed.push(next.at(-1)!);
      await s.plaza.saveOfficial(c.id, next.at(-1)!, 'x', 0);
    }
    expect(changed.length).toBeGreaterThan(0);
    const last = commons[changed.length]!;
    const r = await s.call({ op: 'officialSave', secret: admin.secret, card: { ...last, rarity: 'rare' } });
    expect(r).toMatchObject({ ok: false, reason: 'invalid' });
    expect(r.error).toContain('ドラフトの山が組めません');
    expect(await s.call({ op: 'officialSave', secret: admin.secret, card: { ...last, name: `${last.name}改` } })).toMatchObject({ ok: true });
  });

  it('元に戻すと上書きが消え、履歴には書き換えた人と中身が残る', async () => {
    const s = await setup();
    const admin = await s.staff('運営さん');
    await s.call({ op: 'officialSave', secret: admin.secret, card: { ...base, name: 'A' } });
    expect(await s.call({ op: 'officialReset', secret: admin.secret, cardId: base.id })).toMatchObject({ ok: true, version: 2 });
    expect((await s.call({ op: 'officialList' })).cards).toEqual([]);
    const h = await s.call({ op: 'officialHistory', secret: admin.secret, cardId: base.id });
    expect(h.history.map((x: { version: number; card: CardDef | null; by: string }) => [x.version, x.card?.name ?? null, x.by])).toEqual([
      [2, null, '運営さん'],
      [1, 'A', '運営さん'],
    ]);
  });

  it('書き換えた公式カードは、そのあとに始まるオンラインのドラフトの山に入る', async () => {
    const s = await setup();
    const admin = await s.staff('運営さん');
    await s.call({ op: 'officialSave', secret: admin.secret, card: { ...base, name: 'ドラフト用の改' } });
    const host = await s.call({ op: 'create', mode: 'draft', name: 'ホスト' });
    expect(host.ok).toBe(true);
    expect((await s.call({ op: 'join', code: host.code, name: 'ゲスト', features: ['draft'] })).ok).toBe(true);
    const room = s.store.rooms.get(host.code)!;
    const cards = (room.meta as { draft: { cards: Record<string, CardDef> } }).draft.cards;
    expect(cards[base.id]?.name).toBe('ドラフト用の改');
    expect(officialCard(base.id)!.name).toBe(base.name);
  });
});

describe('プリセットデッキの書き換え（決定事項 #148）', () => {
  const preset = PRESET_DECKS[0]!;
  /** 1枚目の名前を変え、1つ目の枚数を1枚減らして2つ目を1枚増やす */
  const edited = (): PresetOverride => {
    const entries = preset.deck.entries.map((e) => ({ ...e }));
    entries[0]!.count -= 1;
    entries[1]!.count += 1;
    const cards = preset.cards.map((c, i) => (i === 0 ? { ...c, name: `${c.name}改` } : c));
    return { id: preset.deck.id, deck: { ...preset.deck, entries }, cards };
  };

  it('運営だけが書き換えられ、全員に配られる（公式カードと同じ版）', async () => {
    const s = await setup();
    const o = edited();
    expect(analyzeDeck(o.deck, new Map(o.cards.map((c) => [c.id, c]))).valid).toBe(true);
    const guest = await s.player('ゲスト');
    expect(await s.call({ op: 'presetSave', secret: guest.secret, preset: o })).toMatchObject({ ok: false, reason: 'staff' });
    const admin = await s.staff('運営さん');
    expect(await s.call({ op: 'presetSave', secret: admin.secret, preset: o })).toMatchObject({ ok: true, version: 1 });
    const list = await s.call({ op: 'officialList' });
    expect(list.cards).toEqual([]);
    expect(list.presets).toHaveLength(1);
    const applied = withPresetOverrides(PRESET_DECKS, list.presets).find((p) => p.id === preset.id)!;
    expect(applied.name).toBe(preset.name);
    expect(applied.deck.entries[0]!.count).toBe(preset.deck.entries[0]!.count - 1);
    expect(applied.cards[0]!.name).toBe(`${preset.cards[0]!.name}改`);
    expect(await s.call({ op: 'officialList', since: 1 })).toEqual({ ok: true, op: 'officialList', version: 1 });
  });

  it('デッキのルール違反・知らないデッキ・preset- で始まらないカードの ID は受け付けない', async () => {
    const s = await setup();
    const admin = await s.staff('運営さん');
    const short = edited();
    short.deck = { ...short.deck, entries: short.deck.entries.map((e, i) => (i === 0 ? { ...e, count: e.count - 1 } : e)) };
    expect(await s.call({ op: 'presetSave', secret: admin.secret, preset: short })).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await s.call({ op: 'presetSave', secret: admin.secret, preset: { ...edited(), id: 'preset-deck-nothing' } })).toMatchObject({ ok: false, reason: 'invalid' });
    const o = edited();
    const id = o.cards[0]!.id;
    const renamed = { ...o, cards: o.cards.map((c) => (c.id === id ? { ...c, id: 'my-card' } : c)), deck: { ...o.deck, entries: o.deck.entries.map((e) => (e.cardId === id ? { ...e, cardId: 'my-card' } : e)) } };
    expect(await s.call({ op: 'presetSave', secret: admin.secret, preset: renamed })).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('元に戻すと上書きが消え、履歴に残る。デッキの名前と ID は元のまま', async () => {
    const s = await setup();
    const admin = await s.staff('運営さん');
    const saved = await s.call({ op: 'presetSave', secret: admin.secret, preset: { ...edited(), deck: { ...edited().deck, name: 'ちがう名前' } } });
    expect(saved.preset.deck.name).toBe(preset.deck.name);
    expect(await s.call({ op: 'presetReset', secret: admin.secret, presetId: preset.deck.id })).toMatchObject({ ok: true, version: 2 });
    expect((await s.call({ op: 'officialList' })).presets).toEqual([]);
    const h = await s.call({ op: 'presetHistory', secret: admin.secret, presetId: preset.deck.id });
    expect(h.history.map((x: { version: number; preset: PresetOverride | null; by: string }) => [x.version, x.preset === null, x.by])).toEqual([
      [2, true, '運営さん'],
      [1, false, '運営さん'],
    ]);
  });

  it('プリセットのカードの ID はどれも preset- で始まる', () => {
    for (const p of PRESET_DECKS) expect(presetEditProblem({ id: p.deck.id, cards: p.cards }), p.name).toBeNull();
  });
});
