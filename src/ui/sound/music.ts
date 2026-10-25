/**
 * BGM を流す本体（決定事項 #128）。BGM をオンにしてから動的 import で読む塊（ふつうの版では本体の JS に入らない）。
 * AudioContext と BGM の音量（out）は sound/index.ts が操作の中で作って渡す。
 *
 * - 曲は流すときに1つずつ fetch して decodeAudioData で展開する（展開したものは KEEP 曲まで取っておく）。Web Audio で流すので、
 *   iPhone でも操作の外で次の曲に移れる（<audio> は操作の中でしか鳴らし始められない）。ループ曲は loopStart〜loopEnd を継ぎ目なくくり返す
 * - 場面が変わったら今の曲を FADE_OUT 秒で消し、少しあとから次の曲を FADE_IN 秒で上げる
 * - 場面の曲が2つ以上（対戦）：ループでない曲は最後まで流して GAP_MS あけて次、ループ曲は1周したら ROTATE_FADE 秒で消えて次
 * - 場面が null（決着したあとなど）なら消すだけ。stop() は消して、展開した曲も捨てる（メモリを返す）
 * - 読めなかった曲は RETRY_MS の間は読み直さない（1ファイル版でネットが無いときなど。エラーは出さない）
 */
import { BGM_SCENES, bgmTrack, pickTrack, type BgmScene, type BgmTrack } from './bgmCatalog.ts';
import { bgmUrl } from './bgmSource.ts';

export interface Music {
  setScene(scene: BgmScene | null): void;
  /** 止めて、展開した曲を捨てる（BGM をオフにしたとき） */
  stop(): void;
}

export interface MusicEnv {
  ctx: AudioContext;
  /** BGM の音量（sound/index.ts のつまみ） */
  out: AudioNode;
}

/** 試験用の口：window.__bgmTrace があれば、曲を始めた・終わった・消したことを渡す（Playwright で確かめる。ふだんは無い） */
type Trace = (ev: 'start' | 'end' | 'fade' | 'error', info: { id: string; scene: BgmScene | null }) => void;
const trace = (): Trace | undefined => (globalThis as { __bgmTrace?: Trace }).__bgmTrace;

const FADE_IN = 1.5;
const FADE_OUT = 1.2;
/** 場面が変わったとき、前の曲が消え始めてから次の曲を始めるまで（秒） */
const SWAP_DELAY = 0.6;
/** ループでない曲が終わってから次の曲まで */
const GAP_MS = 1800;
/** ループ曲を1周させたあと、消える長さ（秒） */
const ROTATE_FADE = 4;
/** 展開した曲を取っておく数（長い曲は1曲で数十 MB になる） */
const KEEP = 2;
const RETRY_MS = 15_000;

interface Voice {
  track: BgmTrack;
  src: AudioBufferSourceNode;
  g: GainNode;
  /** 消し始めた・終わった（このあと次の曲を予約しない） */
  done: boolean;
}

export function createMusic(env: MusicEnv): Music {
  const { ctx, out } = env;
  let scene: BgmScene | null = null;
  /** 場面が変わる・止めるたびに進める（読み込み中だった曲・予約した次の曲を捨てる） */
  let gen = 0;
  let stopped = false;
  let voice: Voice | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const lastByScene = new Map<BgmScene, string>();
  const cache = new Map<string, AudioBuffer>();
  const loading = new Map<string, Promise<AudioBuffer | null>>();
  const failedAt = new Map<string, number>();

  const decode = (data: ArrayBuffer): Promise<AudioBuffer> =>
    new Promise((resolve, reject) => {
      // 古い Safari はコールバックの形だけ。新しいものは Promise も返すので、その失敗は握りつぶす
      const p = ctx.decodeAudioData(data, resolve, reject) as Promise<AudioBuffer> | undefined;
      p?.catch?.(() => undefined);
    });

  /** 取っておく（新しく使ったものを後ろへ。多すぎたら、流している曲以外の古いものから捨てる） */
  const remember = (id: string, buf: AudioBuffer) => {
    cache.delete(id);
    cache.set(id, buf);
    while (cache.size > KEEP) {
      const old = [...cache.keys()].find((k) => k !== id && k !== voice?.track.id);
      if (old === undefined) break;
      cache.delete(old);
    }
  };

  const load = (id: string): Promise<AudioBuffer | null> => {
    const b = cache.get(id);
    if (b) {
      remember(id, b);
      return Promise.resolve(b);
    }
    const l = loading.get(id);
    if (l) return l;
    const f = failedAt.get(id);
    if (f !== undefined && performance.now() - f < RETRY_MS) return Promise.resolve(null);
    const p = fetch(bgmUrl(id))
      .then((res) => {
        if (!res.ok) throw new Error(`bgm ${id}: ${res.status}`);
        return res.arrayBuffer();
      })
      .then(decode)
      .then((buf) => {
        if (!stopped) remember(id, buf);
        return buf;
      })
      .catch(() => {
        failedAt.set(id, performance.now());
        trace()?.('error', { id, scene });
        return null;
      })
      .finally(() => loading.delete(id));
    loading.set(id, p);
    return p;
  };

  const fade = (v: Voice, sec: number) => {
    if (v.done) return;
    v.done = true;
    try {
      const t = ctx.currentTime;
      const p = v.g.gain;
      if (typeof p.cancelAndHoldAtTime === 'function') p.cancelAndHoldAtTime(t);
      else {
        const cur = p.value;
        p.cancelScheduledValues(t);
        p.setValueAtTime(cur, t);
      }
      p.linearRampToValueAtTime(0, t + sec);
      v.src.stop(t + sec + 0.05);
    } catch {
      // もう止まっている
    }
    trace()?.('fade', { id: v.track.id, scene });
  };

  const begin = (track: BgmTrack, buf: AudioBuffer, at: number, g0: number) => {
    const s = scene;
    try {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      const t = Math.max(at, ctx.currentTime + 0.02);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1, t + FADE_IN);
      src.connect(g);
      g.connect(out);
      const v: Voice = { track, src, g, done: false };
      if (track.loop) {
        src.loop = true;
        src.loopStart = track.loop.start;
        src.loopEnd = track.loop.end;
        src.start(t, track.loop.start);
        if (s && BGM_SCENES[s].length > 1) {
          // ほかにも曲がある場面：1周したら消えながら次の曲へ（ループ曲には終わりが無いので）
          const end = t + (track.loop.end - track.loop.start);
          g.gain.setValueAtTime(1, end);
          g.gain.linearRampToValueAtTime(0, end + ROTATE_FADE);
          src.stop(end + ROTATE_FADE + 0.05);
        }
      } else {
        src.start(t);
      }
      src.onended = () => {
        try {
          g.disconnect();
        } catch {
          // もう外れている
        }
        if (voice !== v) return;
        voice = null;
        trace()?.('end', { id: track.id, scene });
        if (v.done || g0 !== gen || !scene) return;
        v.done = true;
        timer = setTimeout(() => next(g0, 0), GAP_MS);
      };
      voice = v;
      trace()?.('start', { id: track.id, scene: s });
    } catch {
      // 流せなくても画面は止めない
    }
  };

  /** 場面の曲から1つ選んで流す（delay 秒あとから。読み込みに時間がかかったら、その分は待たない） */
  const next = (g0: number, delay: number) => {
    if (g0 !== gen || !scene) return;
    const s = scene;
    const id = pickTrack(BGM_SCENES[s], lastByScene.get(s) ?? null, Math.random);
    lastByScene.set(s, id);
    const track = bgmTrack(id);
    if (!track) return;
    const asked = ctx.currentTime;
    void load(id).then((buf) => {
      if (!buf || g0 !== gen || scene !== s) return;
      begin(track, buf, asked + delay, g0);
    });
  };

  const setScene = (s: BgmScene | null) => {
    if (s === scene) return;
    scene = s;
    gen++;
    stopped = false;
    clearTimeout(timer);
    const swapping = !!voice && !voice.done;
    if (voice) {
      fade(voice, FADE_OUT);
      voice = null;
    }
    if (s) next(gen, swapping ? SWAP_DELAY : 0);
  };

  const stop = () => {
    scene = null;
    gen++;
    stopped = true;
    clearTimeout(timer);
    if (voice) {
      fade(voice, 0.5);
      voice = null;
    }
    cache.clear();
  };

  return { setScene, stop };
}
