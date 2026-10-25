/**
 * 効果音を鳴らす本体（決定事項 #127）。効果音をオンにしてから動的 import で読む塊（ふつうの版では本体の JS に入らない）。
 * AudioContext と主音量（out）は sound/index.ts が操作の中で作って渡す（iPhone の解錠は操作の中でしかできないため）。
 *
 * - 音は鳴らすときに1つずつ読み、decodeAudioData で展開して使い回す（最初に鳴らしたあと、残りも少しずつ先に展開しておく）
 * - 初めての音で読み込みが遅れたら（maxLatencyOf より遅い）鳴らさない（演出とずれた音を後から鳴らさない）
 * - 同じ音は 60ms に1回・同時に6つまで・着弾は組で1回（mixer.ts）
 * - 画面が見えていない（document.hidden）ときは鳴らさない
 * - 早送り（hush）では鳴っている音を短く消し、遅らせて予約した音・読み込み中の音も捨てる
 */
import type { CueId, CueOpts } from '../battle/fx/cues.ts';
import { maxLatencyOf, priorityOf, SOUND_GROUP, SOUND_IDS, type SoundGroup, type SoundId } from './catalog.ts';
import { addVoice, admit, GroupOnce, HitGate, magnitudeGain, newMixState, removeVoice, throttle, type HitSize } from './mixer.ts';
import { routeCue } from './route.ts';
import { loadSfx } from './sfxSource.ts';

export interface PlayOpts {
  /** 音量に掛ける値 */
  gain?: number;
  /** 大きさ（magnitudeGain） */
  magnitude?: number;
  /** 遅らせる（ms） */
  delay?: number;
  /** 読み込みを待てる時間（ms。省略は音の分類から） */
  maxLatency?: number;
}

export interface Player {
  play(id: SoundId, opts?: PlayOpts): void;
  /** 演出の合図から（routeCue・着弾のまとめ・知らせの控えめ） */
  cue(cue: CueId, opts: CueOpts): void;
  hush(): void;
}

export interface PlayerEnv {
  ctx: AudioContext;
  out: AudioNode;
  /** 今鳴らしてよいか（コンテキストが動いている・解錠した直後） */
  canPlay: () => boolean;
}

/** 試験用の口：window.__sfxTrace があれば、実際に鳴らした音の ID を渡す（Playwright で確かめる。ふだんは無い） */
type Trace = (id: SoundId, info: { gain: number; delay: number }) => void;
const trace = (): Trace | undefined => (globalThis as { __sfxTrace?: Trace }).__sfxTrace;

/** 先に展開しておく順（よく鳴る分類から）。決着のジングル（長い・めったに鳴らない）は鳴らすときに読む */
const WARM_ORDER: SoundGroup[] = ['ui', 'card', 'turn', 'combat', 'magic', 'effect'];
/** 知らせ（notice）は、直前にほかの音が鳴り始めていたら鳴らさない（重ねると騒がしい） */
const NOTICE_QUIET_MS = 220;
/** 早送りで消すときのフェード（秒） */
const HUSH_FADE = 0.04;

export function createPlayer(env: PlayerEnv): Player {
  const { ctx, out } = env;
  const mix = newMixState();
  const gate = new HitGate();
  const once = new GroupOnce();
  const buffers = new Map<SoundId, AudioBuffer>();
  const loading = new Map<SoundId, Promise<AudioBuffer | null>>();
  const failedAt = new Map<SoundId, number>();
  const nodes = new Map<number, { src: AudioBufferSourceNode; g: GainNode }>();
  let seq = 0;
  /** hush のたびに進める（読み込み中だった音を捨てる） */
  let gen = 0;
  let lastStart = -Infinity;
  let warmed = false;

  const decode = (data: ArrayBuffer): Promise<AudioBuffer> =>
    new Promise((resolve, reject) => {
      // 古い Safari はコールバックの形だけ。新しいものは Promise も返すので、その失敗は握りつぶす
      const p = ctx.decodeAudioData(data, resolve, reject) as Promise<AudioBuffer> | undefined;
      p?.catch?.(() => undefined);
    });

  const get = (id: SoundId): Promise<AudioBuffer | null> => {
    const b = buffers.get(id);
    if (b) return Promise.resolve(b);
    const l = loading.get(id);
    if (l) return l;
    const f = failedAt.get(id);
    if (f !== undefined && performance.now() - f < 10_000) return Promise.resolve(null);
    const p = loadSfx(id)
      .then((data) => (data ? decode(data) : null))
      .then((buf) => {
        if (buf) buffers.set(id, buf);
        return buf;
      })
      .catch(() => {
        failedAt.set(id, performance.now());
        return null;
      })
      .finally(() => loading.delete(id));
    loading.set(id, p);
    return p;
  };

  const stopVoice = (vid: number, fade: number) => {
    const n = nodes.get(vid);
    if (!n) return;
    nodes.delete(vid);
    removeVoice(mix, vid);
    try {
      const t = ctx.currentTime;
      n.g.gain.cancelScheduledValues(t);
      n.g.gain.setValueAtTime(n.g.gain.value, t);
      n.g.gain.linearRampToValueAtTime(0, t + fade);
      n.src.stop(t + fade + 0.01);
    } catch {
      // 止まっていれば何もしない
    }
  };

  const start = (id: SoundId, buf: AudioBuffer, gain: number, delayMs: number) => {
    const now = performance.now();
    const a = admit(mix, priorityOf(id), now);
    if (!a.play) return;
    if (a.steal !== null) stopVoice(a.steal, 0.03);
    try {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(g);
      g.connect(out);
      const vid = ++seq;
      nodes.set(vid, { src, g });
      addVoice(mix, { id: vid, cue: id, prio: priorityOf(id), until: now + delayMs + buf.duration * 1000 }, null);
      src.onended = () => {
        nodes.delete(vid);
        removeVoice(mix, vid);
        try {
          g.disconnect();
        } catch {
          // もう外れている
        }
      };
      src.start(ctx.currentTime + delayMs / 1000);
      lastStart = now;
      trace()?.(id, { gain, delay: delayMs });
    } catch {
      // 鳴らせなくても画面は止めない
    }
  };

  /** 残りの音を少しずつ先に展開しておく（最初に鳴らしたあと1回だけ） */
  const warm = () => {
    if (warmed) return;
    warmed = true;
    const order = SOUND_IDS.filter((id) => WARM_ORDER.includes(SOUND_GROUP[id])).sort((a, b) => WARM_ORDER.indexOf(SOUND_GROUP[a]) - WARM_ORDER.indexOf(SOUND_GROUP[b]));
    const next = () => {
      const id = order.shift();
      if (!id) return;
      void get(id).then(() => setTimeout(next, 30));
    };
    setTimeout(next, 200);
    setTimeout(next, 260);
  };

  const play = (id: SoundId, opts: PlayOpts = {}) => {
    if (typeof document !== 'undefined' && document.hidden) return;
    if (!env.canPlay()) return;
    const now = performance.now();
    if (!throttle(mix, id, now)) return;
    const gain = (opts.gain ?? 1) * magnitudeGain(opts.magnitude);
    const delay = Math.max(0, opts.delay ?? 0);
    const buf = buffers.get(id);
    if (buf) {
      start(id, buf, gain, delay);
      warm();
      return;
    }
    const g0 = gen;
    const limit = opts.maxLatency ?? maxLatencyOf(id);
    void get(id).then((b) => {
      const late = performance.now() - now;
      if (!b || g0 !== gen || late > limit || (typeof document !== 'undefined' && document.hidden)) return;
      start(id, b, gain, Math.max(0, delay - late));
      warm();
    });
  };

  const cue = (c: CueId, opts: CueOpts) => {
    const now = performance.now();
    if (c.startsWith('cast.')) gate.cast(opts.group, opts.count ?? 0);
    const r = routeCue(c, opts);
    if (!r) return;
    let sound = r.sound;
    if (c === 'player.hit') gate.player(now);
    else if (c.startsWith('hit.')) {
      const size = gate.hit(sound.slice(4) as HitSize, opts.group, now);
      if (!size) return;
      sound = `hit.${size}`;
    } else if (!c.startsWith('cast.') && c !== 'attack' && !once.pass(sound, opts.group, now)) return;
    if (c === 'notice' && now - lastStart < NOTICE_QUIET_MS) return;
    play(sound, { ...(r.gain !== undefined ? { gain: r.gain } : {}), ...(opts.magnitude !== undefined ? { magnitude: opts.magnitude } : {}), ...(opts.delay ? { delay: opts.delay } : {}) });
  };

  const hush = () => {
    gen++;
    for (const vid of [...nodes.keys()]) stopVoice(vid, HUSH_FADE);
    mix.voices = [];
    gate.reset();
    once.reset();
  };

  return { play, cue, hush };
}
