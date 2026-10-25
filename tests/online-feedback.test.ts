// プレイヤーからの報告のサーバー処理（決定事項 #129）：検証・保存・回数の上限・自分の報告の状況・鍵のハッシュ
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  cleanBody,
  FEEDBACK_BODY_MAX,
  FEEDBACK_CARDS_MAX,
  FEEDBACK_CONTEXT_MAX_CHARS,
  FEEDBACK_PER_CLIENT_DAY,
  FEEDBACK_PER_KEY_DAY,
  handleBody,
  MemoryFeedbackStore,
  MemoryStore,
  parseFeedbackRequest,
  type FeedbackResponse,
  type HttpDeps,
} from '../src/online/index.ts';
import { SAMPLE_CARDS } from '../src/samples.ts';

const KEY = 'a'.repeat(32);
const KEY2 = 'b'.repeat(40);

function setup() {
  const rooms = new MemoryStore();
  const feedback = new MemoryFeedbackStore();
  let now = Date.UTC(2026, 9, 26, 3);
  const deps: HttpDeps = {
    store: rooms,
    feedback,
    now: () => now,
    randomInt: (n) => Math.floor(n / 2),
    newToken: () => 'f'.repeat(64),
    hash: async (t) => createHash('sha256').update(t).digest('hex'),
    notify: async () => {},
  };
  const send = async (body: unknown, clientKey = 'client-1') => {
    const r = await handleBody(JSON.stringify(body), deps, { clientKey });
    return { status: r.status, body: r.body as FeedbackResponse };
  };
  return { feedback, deps, send, tick: (ms: number) => (now += ms) };
}

const report = (extra: Record<string, unknown> = {}) => ({ op: 'feedback', key: KEY, kind: 'bug', topic: 'rules', source: 'result', body: '毒が2回入った', ...extra });

describe('報告の検証', () => {
  it('種類と中身の組み合わせ・送った画面・鍵の形を確かめる', () => {
    expect(parseFeedbackRequest(report()).ok).toBe(true);
    expect(parseFeedbackRequest(report({ kind: 'balance', topic: 'otk' })).ok).toBe(true);
    expect(parseFeedbackRequest(report({ kind: 'balance', topic: 'rules' })).ok).toBe(false);
    expect(parseFeedbackRequest(report({ kind: 'oops' })).ok).toBe(false);
    expect(parseFeedbackRequest(report({ source: 'lobby' })).ok).toBe(false);
    expect(parseFeedbackRequest(report({ key: 'xyz' })).ok).toBe(false);
    expect(parseFeedbackRequest(report({ key: 'A'.repeat(32) })).ok).toBe(false);
    expect(parseFeedbackRequest({ op: 'feedbackStatus', key: KEY }).ok).toBe(true);
  });

  it('本文かカードのどちらかが要る。本文は見えない文字を消し、改行は残す', () => {
    expect(parseFeedbackRequest(report({ body: '   ' })).ok).toBe(false);
    const withCard = parseFeedbackRequest(report({ kind: 'balance', topic: 'strong', body: '', cards: [SAMPLE_CARDS[0]] }));
    expect(withCard.ok).toBe(true);
    expect(cleanBody('1行目\r\n2行目​\n\n\n\n3行目\u0007')).toBe('1行目\n2行目\n\n3行目');
    const long = parseFeedbackRequest(report({ body: 'あ'.repeat(FEEDBACK_BODY_MAX + 50) }));
    expect(long.ok && long.value.op === 'feedback' && [...long.value.body].length).toBe(FEEDBACK_BODY_MAX);
  });

  it('カードの数・形・大きさ、記録の大きさに上限がある', () => {
    const card = SAMPLE_CARDS[0]!;
    expect(parseFeedbackRequest(report({ cards: Array.from({ length: FEEDBACK_CARDS_MAX + 1 }, () => card) })).ok).toBe(false);
    expect(parseFeedbackRequest(report({ cards: [{ foo: 1 }] })).ok).toBe(false);
    expect(parseFeedbackRequest(report({ cards: [{ ...card, description: 'x'.repeat(7000) }] })).ok).toBe(false);
    expect(parseFeedbackRequest(report({ context: { log: 'x'.repeat(FEEDBACK_CONTEXT_MAX_CHARS) } })).ok).toBe(false);
    expect(parseFeedbackRequest(report({ context: ['not', 'object'] })).ok).toBe(false);
    expect(parseFeedbackRequest(report({ context: { turn: 3, log: ['a', 'b'] } })).ok).toBe(true);
  });

  it('画面の情報は短く切り、知らない項目は捨てる', () => {
    const r = parseFeedbackRequest(report({ app: { build: 'abc123', page: '#/decks/x', ua: 'Mozilla'.repeat(100), secret: 'nope' } }));
    expect(r.ok).toBe(true);
    if (r.ok && r.value.op === 'feedback') {
      expect(r.value.app?.build).toBe('abc123');
      expect([...(r.value.app?.ua ?? '')].length).toBe(300);
      expect(Object.keys(r.value.app ?? {}).sort()).toEqual(['build', 'page', 'ua']);
    }
  });
});

describe('報告の受付', () => {
  it('送ると番号が返り、鍵はハッシュだけを保存する。同じ鍵で状況を読める（ほかの鍵では見えない）', async () => {
    const { feedback, send, tick } = setup();
    const a = await send(report({ cards: [SAMPLE_CARDS[0]], context: { turn: 2 } }));
    expect(a.body).toEqual({ ok: true, id: 1 });
    tick(1000);
    await send(report({ kind: 'other', topic: 'feature', source: 'deck', body: 'デッキを並べ替えたい' }));
    await send({ ...report(), key: KEY2 });
    const stored = feedback.list[0]!;
    expect(stored.reporter).not.toContain(KEY);
    expect(stored.reporter).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.client).toBe('client-1');
    expect(stored.cards).toHaveLength(1);
    expect(stored.context).toEqual({ turn: 2 });
    feedback.setStatus(1, 'fixed', '直しました（次の更新から）', Date.now());
    const mine = await send({ op: 'feedbackStatus', key: KEY });
    expect(mine.body.ok).toBe(true);
    if (mine.body.ok && 'reports' in mine.body) {
      expect(mine.body.reports.map((r) => r.id)).toEqual([2, 1]);
      expect(mine.body.reports[1]).toMatchObject({ status: 'fixed', note: '直しました（次の更新から）', kind: 'bug', topic: 'rules' });
      expect(mine.body.reports[0]!.excerpt).toBe('デッキを並べ替えたい');
    }
    const other = await send({ op: 'feedbackStatus', key: KEY2 });
    expect(other.body.ok && 'reports' in other.body && other.body.reports.map((r) => r.id)).toEqual([3]);
  });

  it('1台の端末は1日に上限まで。翌日はまた送れる', async () => {
    const { send, tick } = setup();
    for (let i = 0; i < FEEDBACK_PER_KEY_DAY; i++) expect((await send(report(), `c${i}`)).body.ok).toBe(true);
    const over = await send(report(), 'cx');
    expect(over.body).toMatchObject({ ok: false, reason: 'limit' });
    tick(24 * 60 * 60 * 1000 + 1);
    expect((await send(report(), 'cy')).body.ok).toBe(true);
  });

  it('同じ送り元（IP）からは、鍵を変えても1日に上限まで', async () => {
    const { send } = setup();
    for (let i = 0; i < FEEDBACK_PER_CLIENT_DAY; i++) {
      const key = i.toString(16).padStart(32, '0');
      expect((await send({ ...report(), key }, 'same-ip')).body.ok).toBe(true);
    }
    expect((await send({ ...report(), key: 'c'.repeat(32) }, 'same-ip')).body).toMatchObject({ ok: false, reason: 'limit' });
  });

  it('形の正しくない報告は 400、保存場所が無いサーバーは unsupported', async () => {
    const { send, deps } = setup();
    expect((await send(report({ topic: 'nope' }))).status).toBe(400);
    delete deps.feedback;
    const r = await send(report());
    expect(r.body).toMatchObject({ ok: false, reason: 'unsupported' });
  });
});
