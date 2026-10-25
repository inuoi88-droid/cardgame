/**
 * 効果音の窓口（決定事項 #127）。本体の JS に入るのはここと settings.ts・uiClass.ts だけで、鳴らす本体（player.ts）と
 * 音のファイルは効果音をオンにしてから読む。既定はオフ（ユーザーの決定）。
 *
 * - initSound()：main.tsx から1回。演出の合図（battle/fx/cues.ts）をつなぎ、document のクリックを1か所で受けて画面の操作の音を鳴らす
 * - sfx(id)：画面から直接鳴らす（カードを使った・ターン終了・マリガン・ドラフトで取った・決着・招待・エラーなど）。
 *   直接鳴らした音があると、同じ操作のクリックの音（ui.click など）は鳴らさない（二重にしない）
 * - 解錠：ブラウザは操作の中でしか音を出せない。オンにしたとき（その操作の中）と、オンのまま開いたあとの最初の操作で
 *   AudioContext を作って resume し、1サンプルの無音を鳴らす（iPhone の Safari が音を出せるようになる）
 * - iPhone・iPad：navigator.audioSession.type を 'ambient' にする（対応している Safari 16.4 以降）。ほかのアプリの音楽を止めずに混ぜて鳴らし、
 *   消音スイッチ（マナーモード）がオンなら鳴らない（Web Audio のもともとの扱いと同じ）。'playback' にすると消音スイッチを無視して
 *   鳴り、聞いている音楽も止まるので使わない
 * - 画面が見えていない間は鳴らさない（AudioContext を止め、戻ったら動かし直す）。Web Audio が無い・作れない端末では何もしない（エラーを出さない）
 * - BGM（決定事項 #128）：効果音とは別のオン・オフと音量（settings.ts の cardgame.v1.bgm）。同じ AudioContext に BGM の音量（musicOut）を
 *   つなぎ、流す本体（music.ts）は BGM をオンにしてから読む。場面は bgmScene.ts（画面と、対戦・ドラフトの盤面が決める）
 */
import { setCueHandler, type CueId, type CueOpts } from '../battle/fx/cues.ts';
import type { SoundId } from './catalog.ts';
import { getBgmScene, subscribeBgmScene } from './bgmScene.ts';
import type { Music } from './music.ts';
import type { Player, PlayOpts } from './player.ts';
import {
  getMusicPref,
  getSoundPref,
  MUSIC_PREF_KEY,
  reloadMusicPref,
  reloadSoundPref,
  SOUND_PREF_KEY,
  subscribeMusicPref,
  subscribeSoundPref,
  volumeGain,
} from './settings.ts';
import { classifyUi, type UiTarget } from './uiClass.ts';

export interface SfxOpts extends PlayOpts {
  /** 自分がカードを使った：このあと演出の card.play が来ても鳴らさない（同じ音を2回にしない） */
  claim?: boolean;
  /** 鳴らす本体の読み込み中なら、読み終わってから鳴らす（オンにしたときの確認の音） */
  wait?: boolean;
}

/** 自分が使ったカードの演出（card.play）を待つ時間（オンラインは返事が来てから演出が始まる） */
const CLAIM_MS = 4000;
/** 直接鳴らした音のこれだけ前・あとのクリックは音を付けない */
const EXPLICIT_WINDOW_MS = 250;
/** 解錠（resume）を頼んでから、まだ動いていなくても鳴らしてよい時間 */
const RESUME_GRACE_MS = 1000;

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let player: Player | null = null;
let playerLoad: Promise<typeof import('./player.ts')> | null = null;
let musicOut: GainNode | null = null;
let music: Music | null = null;
let musicLoad: Promise<typeof import('./music.ts')> | null = null;
let unavailable = false;
let resumeAt = -Infinity;
let lastExplicit = -Infinity;
let quietUntil = -Infinity;
let claimAt = -Infinity;
let waiting: { id: SoundId; opts: PlayOpts; at: number } | null = null;
let armed = false;
let installed = false;

const now = () => performance.now();
const isOn = () => getSoundPref().on && !unavailable;
const musicOn = () => getMusicPref().on && !unavailable;
/** 効果音か BGM のどちらかがオン（AudioContext が要る） */
const audioWanted = () => (getSoundPref().on || getMusicPref().on) && !unavailable;

function audioCtor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

/** この端末で効果音を鳴らせるか（Web Audio がある） */
export function soundSupported(): boolean {
  return !!audioCtor() && !unavailable;
}

/** iPhone・iPad（Safari 16.4 以降）：ほかの音と混ぜ、消音スイッチに従う */
function setAudioSession(): void {
  try {
    const s = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (s && s.type !== 'ambient') s.type = 'ambient';
  } catch {
    // 対応していない
  }
}

const canPlay = (): boolean => !!ctx && (ctx.state === 'running' || (ctx.state === 'suspended' && now() - resumeAt < RESUME_GRACE_MS));

function loadPlayer(): void {
  playerLoad ??= import('./player.ts');
  if (player || !ctx || !out) return;
  const c = ctx;
  const o = out;
  void playerLoad
    .then((m) => {
      if (player || ctx !== c) return;
      player = m.createPlayer({ ctx: c, out: o, canPlay });
      const w = waiting;
      waiting = null;
      if (w && now() - w.at < 3000 && isOn()) player.play(w.id, w.opts);
    })
    .catch(() => {
      // 読めなければ（通信の切断など）次の操作でもう一度
      playerLoad = null;
    });
}

/** いま操作の中か（分からないブラウザは「操作の中」とみなす）。操作の外で作る・動かすとブラウザが警告を出すので待つ */
function activeGesture(): boolean {
  const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  return !ua || ua.isActive;
}

function loadMusic(): void {
  musicLoad ??= import('./music.ts');
  if (music || !ctx || !musicOut) return;
  const c = ctx;
  const o = musicOut;
  void musicLoad
    .then((m) => {
      if (music || ctx !== c) return;
      music = m.createMusic({ ctx: c, out: o });
      if (musicOn()) music.setScene(getBgmScene());
    })
    .catch(() => {
      musicLoad = null;
    });
}

/** 操作（タップ・クリック・キー）の中で呼ぶ：AudioContext を作って動かす（iPhone の解錠） */
function unlock(): void {
  if (!audioWanted()) return;
  if ((!ctx || ctx.state !== 'running') && !activeGesture()) {
    arm();
    return;
  }
  let created = false;
  if (!ctx) {
    const AC = audioCtor();
    if (!AC) {
      unavailable = true;
      return;
    }
    try {
      setAudioSession();
      ctx = new AC({ latencyHint: 'interactive' });
      out = ctx.createGain();
      out.gain.value = volumeGain(getSoundPref().volume);
      out.connect(ctx.destination);
      musicOut = ctx.createGain();
      musicOut.gain.value = volumeGain(getMusicPref().volume);
      musicOut.connect(ctx.destination);
      ctx.onstatechange = () => {
        if (ctx?.state === 'running') disarm();
        else if (audioWanted() && ctx?.state !== 'closed') arm();
      };
      created = true;
    } catch {
      unavailable = true;
      ctx = null;
      out = null;
      musicOut = null;
      return;
    }
  }
  const running = ctx.state === 'running';
  if (!running || created) {
    resumeAt = now();
    try {
      if (!running) void ctx.resume().catch(() => undefined);
      // 1サンプルの無音（iPhone の Safari は、操作の中で何か鳴らすと解錠される）
      const b = ctx.createBuffer(1, 1, ctx.sampleRate);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
    } catch {
      // 鳴らせなくても止めない
    }
  }
  if (running) disarm();
  if (isOn()) loadPlayer();
  if (musicOn()) loadMusic();
}

const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'] as const;
const onGesture = () => unlock();

function arm(): void {
  if (armed || typeof window === 'undefined') return;
  armed = true;
  for (const t of GESTURES) window.addEventListener(t, onGesture, { capture: true, passive: true });
}

function disarm(): void {
  if (!armed) return;
  armed = false;
  for (const t of GESTURES) window.removeEventListener(t, onGesture, { capture: true });
}

/** 画面から直接鳴らす（オフなら何もしない） */
export function sfx(id: SoundId, opts: SfxOpts = {}): void {
  if (!isOn()) return;
  const t = now();
  lastExplicit = t;
  if (opts.claim) claimAt = t;
  const play: PlayOpts = { ...opts };
  delete (play as SfxOpts).claim;
  delete (play as SfxOpts).wait;
  if (player) player.play(id, play);
  else if (opts.wait) waiting = { id, opts: play, at: t };
}

/** 鳴っている音・これから鳴る音を止める（演出の早送り）。直後のクリックの音も付けない */
export function hushSfx(): void {
  waiting = null;
  quietUntil = now() + EXPLICIT_WINDOW_MS;
  player?.hush();
}

/** しばらく画面の操作の音を付けない（ドラッグを離した直後のクリックなど） */
export function quietUi(ms: number): void {
  quietUntil = Math.max(quietUntil, now() + ms);
}

function onCue(cue: CueId, opts: CueOpts): void {
  if (!player || !isOn()) return;
  if (cue === 'card.play' && now() - claimAt < CLAIM_MS) {
    // 自分で使ったときに鳴らした（sfx の claim）
    claimAt = -Infinity;
    return;
  }
  player.cue(cue, opts);
}

const INTERACTIVE = 'button, a[href], summary, input, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"], [role="menuitem"], [role="option"]';

function describe(el: Element): UiTarget {
  const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24);
  return {
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute('role'),
    type: el instanceof HTMLInputElement ? el.type : null,
    className: typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className : '',
    label,
    sfx: el.closest('[data-sfx]')?.getAttribute('data-sfx') ?? null,
    pressed: el.hasAttribute('aria-pressed'),
    board: el.hasAttribute('data-fx'),
    inGroup: !!el.closest('[role="radiogroup"], [role="tablist"]'),
  };
}

/** クリック（捕まえる段階で受ける）：押したものを読み、画面の処理が終わってから（直接の音が無ければ）鳴らす */
function onClick(e: MouseEvent): void {
  if (!isOn()) return;
  const at = now();
  const el = e.target instanceof Element ? e.target.closest(INTERACTIVE) : null;
  if (!el) return;
  const t = describe(el);
  setTimeout(() => {
    if (lastExplicit > at - EXPLICIT_WINDOW_MS || at < quietUntil) return;
    const id = classifyUi(t);
    if (id) player?.play(id);
  }, 0);
}

/** 効果音も BGM もオフなら、操作を待つのをやめて AudioContext を止める */
function idleIfUnwanted(): void {
  if (audioWanted()) return;
  disarm();
  if (ctx && ctx.state === 'running') void ctx.suspend().catch(() => undefined);
}

function setGain(node: GainNode | null, value: number): void {
  if (!node || !ctx) return;
  try {
    node.gain.setTargetAtTime(value, ctx.currentTime, 0.02);
  } catch {
    node.gain.value = value;
  }
}

function applySoundPref(): void {
  const p = getSoundPref();
  if (!p.on) {
    waiting = null;
    player?.hush();
    idleIfUnwanted();
    return;
  }
  setGain(out, volumeGain(p.volume));
  playerLoad ??= import('./player.ts');
  // オンにしたのが操作の中ならここで解錠できる。そうでなければ次の操作で
  unlock();
  if (!ctx || ctx.state !== 'running') arm();
}

function applyMusicPref(): void {
  const p = getMusicPref();
  if (!p.on) {
    music?.stop();
    idleIfUnwanted();
    return;
  }
  setGain(musicOut, volumeGain(p.volume));
  musicLoad ??= import('./music.ts');
  unlock();
  if (!ctx || ctx.state !== 'running') arm();
  music?.setScene(getBgmScene());
}

/** main.tsx から1回 */
export function initSound(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  setCueHandler(onCue, hushSfx);
  window.addEventListener('click', onClick, true);
  window.addEventListener('storage', (e) => {
    if (e.key === SOUND_PREF_KEY) reloadSoundPref();
    else if (e.key === MUSIC_PREF_KEY) reloadMusicPref();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      player?.hush();
      // 見えていない間は止める（BGM は止まったところから続く）
      if (ctx && ctx.state === 'running') void ctx.suspend().catch(() => undefined);
      return;
    }
    // 戻ってきたら動かし直す（iPhone は次の操作で）
    if (ctx && ctx.state !== 'running' && audioWanted()) {
      resumeAt = now();
      void ctx.resume().catch(() => undefined);
      arm();
    }
  });
  subscribeSoundPref(applySoundPref);
  subscribeMusicPref(applyMusicPref);
  subscribeBgmScene(() => {
    if (musicOn()) music?.setScene(getBgmScene());
  });
  if (getSoundPref().on) playerLoad ??= import('./player.ts');
  if (getMusicPref().on) musicLoad ??= import('./music.ts');
  if (audioWanted()) arm();
}
