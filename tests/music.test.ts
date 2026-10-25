// BGM を流す本体（src/ui/sound/music.ts。決定事項 #128）を、にせの AudioContext と fetch で動かす：
// ループの区間・場面の切り替え（前の曲を消して次の曲）・対戦の曲の順番（終わったら別の曲・ループ曲は1周で次へ）・止める
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BGM_SCENES, bgmTrack } from '../src/ui/sound/bgmCatalog.ts';
import { createMusic } from '../src/ui/sound/music.ts';

interface Ramp {
  kind: 'set' | 'ramp' | 'cancel' | 'hold';
  value?: number;
  time: number;
}

class FakeParam {
  value = 1;
  events: Ramp[] = [];
  setValueAtTime(value: number, time: number) {
    this.events.push({ kind: 'set', value, time });
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.events.push({ kind: 'ramp', value, time });
  }
  cancelScheduledValues(time: number) {
    this.events.push({ kind: 'cancel', time });
  }
  cancelAndHoldAtTime(time: number) {
    this.events.push({ kind: 'hold', time });
  }
}

class FakeSource {
  buffer: { duration: number; id: string } | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  started: { when: number; offset: number } | null = null;
  stoppedAt: number | null = null;
  onended: (() => void) | null = null;
  connect(n: unknown) {
    return n;
  }
  start(when: number, offset = 0) {
    this.started = { when, offset };
  }
  stop(when: number) {
    this.stoppedAt = when;
  }
}

class FakeGain {
  gain = new FakeParam();
  connect(n: unknown) {
    return n;
  }
  disconnect() {}
}

function fakeCtx() {
  const sources: FakeSource[] = [];
  const ctx = {
    currentTime: 10,
    createBufferSource() {
      const s = new FakeSource();
      sources.push(s);
      return s;
    },
    createGain() {
      return new FakeGain();
    },
    // 中身は「どの曲か」の文字だけ（fetch のにせが返す）
    decodeAudioData(data: ArrayBuffer, ok: (b: unknown) => void) {
      const id = new TextDecoder().decode(data);
      ok({ id, duration: bgmTrack(id)!.duration });
      return undefined;
    },
  };
  return { ctx, sources };
}

const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};

let fetched: string[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  fetched = [];
  vi.stubGlobal('fetch', async (url: string) => {
    fetched.push(url);
    const id = url.replace(/^.*\//, '').replace(/\.mp3$/, '');
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode(id).buffer };
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('BGM を流す本体', () => {
  it('ロビーの曲はループ区間をくり返し、のりしろの後ろ（loop.start）から始める', async () => {
    const { ctx, sources } = fakeCtx();
    const m = createMusic({ ctx: ctx as unknown as AudioContext, out: {} as AudioNode });
    m.setScene('lobby');
    await flush();
    expect(fetched).toEqual(['bgm/1/old-tower-inn.mp3']);
    expect(sources).toHaveLength(1);
    const s = sources[0]!;
    const t = bgmTrack('old-tower-inn')!;
    expect(s.loop).toBe(true);
    expect(s.loopStart).toBe(t.loop!.start);
    expect(s.loopEnd).toBe(t.loop!.end);
    expect(s.started!.offset).toBe(t.loop!.start);
    // 1曲だけの場面なので、止める予約はしない（ずっとくり返す）
    expect(s.stoppedAt).toBeNull();
  });

  it('場面が変わったら前の曲を消して、次の場面の曲を少しあとから始める', async () => {
    const { ctx, sources } = fakeCtx();
    const m = createMusic({ ctx: ctx as unknown as AudioContext, out: {} as AudioNode });
    m.setScene('lobby');
    await flush();
    ctx.currentTime = 30;
    m.setScene('deck');
    await flush();
    expect(sources[0]!.stoppedAt).toBeGreaterThan(30);
    expect(sources[0]!.stoppedAt).toBeLessThan(32);
    expect(sources).toHaveLength(2);
    expect(sources[1]!.buffer!.id).toBe('exploration');
    expect(sources[1]!.loop).toBe(false);
    expect(sources[1]!.started!.when).toBeGreaterThan(30.5);
    // 同じ場面をもう一度言っても何もしない
    m.setScene('deck');
    await flush();
    expect(sources).toHaveLength(2);
  });

  it('対戦：ループでない曲が終わったら、間をあけて別の対戦の曲', async () => {
    const { ctx, sources } = fakeCtx();
    const m = createMusic({ ctx: ctx as unknown as AudioContext, out: {} as AudioNode });
    vi.spyOn(Math, 'random').mockReturnValue(0); // 最初は dark-descent
    m.setScene('battle');
    await flush();
    expect(sources[0]!.buffer!.id).toBe('dark-descent');
    sources[0]!.onended!();
    expect(sources).toHaveLength(1);
    vi.advanceTimersByTime(2000);
    await flush();
    expect(sources).toHaveLength(2);
    expect(sources[1]!.buffer!.id).not.toBe('dark-descent');
    expect(BGM_SCENES.battle).toContain(sources[1]!.buffer!.id);
  });

  it('対戦：ループ曲は1周したら消える予約をして、終わったら次の曲', async () => {
    const { ctx, sources } = fakeCtx();
    const m = createMusic({ ctx: ctx as unknown as AudioContext, out: {} as AudioNode });
    vi.spyOn(Math, 'random').mockReturnValue(0.6); // 4曲の3番目 = epic-boss-battle
    m.setScene('battle');
    await flush();
    const s = sources[0]!;
    expect(s.buffer!.id).toBe('epic-boss-battle');
    const t = bgmTrack('epic-boss-battle')!;
    const lap = t.loop!.end - t.loop!.start;
    expect(s.loop).toBe(true);
    expect(s.stoppedAt! - s.started!.when).toBeGreaterThan(lap);
    expect(s.stoppedAt! - s.started!.when).toBeLessThan(lap + 5);
    s.onended!();
    vi.advanceTimersByTime(2000);
    await flush();
    expect(sources).toHaveLength(2);
    expect(sources[1]!.buffer!.id).not.toBe('epic-boss-battle');
  });

  it('決着（null）では消すだけで次を予約しない。止めたら読み直す', async () => {
    const { ctx, sources } = fakeCtx();
    const m = createMusic({ ctx: ctx as unknown as AudioContext, out: {} as AudioNode });
    m.setScene('battle');
    await flush();
    m.setScene(null);
    expect(sources[0]!.stoppedAt).not.toBeNull();
    sources[0]!.onended!();
    vi.advanceTimersByTime(5000);
    await flush();
    expect(sources).toHaveLength(1);
    // もう一戦：別の曲から
    const first = sources[0]!.buffer!.id;
    m.setScene('battle');
    await flush();
    expect(sources).toHaveLength(2);
    expect(sources[1]!.buffer!.id).not.toBe(first);
    // 止めると展開した曲を捨てる（次は読み直す）
    m.stop();
    const before = fetched.length;
    m.setScene('lobby');
    await flush();
    m.setScene('deck');
    await flush();
    m.setScene('lobby');
    await flush();
    expect(fetched.length).toBeGreaterThan(before);
  });

  it('読み込み中に場面が変わったら、読み終わった前の場面の曲は流さない', async () => {
    const { ctx, sources } = fakeCtx();
    const m = createMusic({ ctx: ctx as unknown as AudioContext, out: {} as AudioNode });
    m.setScene('lobby');
    m.setScene('draft');
    await flush();
    expect(sources.map((s) => s.buffer!.id)).toEqual(['bards-tale']);
  });

  it('読めなかった曲は、しばらく読み直さない（エラーは出さない）', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      fetched.push(url);
      return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    });
    const { ctx, sources } = fakeCtx();
    const m = createMusic({ ctx: ctx as unknown as AudioContext, out: {} as AudioNode });
    m.setScene('lobby');
    await flush();
    m.setScene('deck');
    await flush();
    m.setScene('lobby');
    await flush();
    expect(sources).toHaveLength(0);
    expect(fetched.filter((u) => u.endsWith('old-tower-inn.mp3'))).toHaveLength(1);
  });
});
