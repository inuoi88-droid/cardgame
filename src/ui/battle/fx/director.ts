/**
 * 演出の本体（決定事項 #126）。対戦画面の上に重ねた1枚の層（.fx-layer）に、短命の要素を作って Web Animations で動かす。
 *
 * - 動かすのは transform と opacity だけ（合成スレッドで動く。レイアウトを揺らさない・box-shadow を動かさない）。
 * - 同時に生きている要素は MAX_NODES まで。超えそうなら粒（火花など）を省き、数字と輪だけ出す。
 * - 位置は [data-fx]（モンスター・パワー・プレイヤーの枠）と [data-fx-zone]（山札・手札・捨て札・エナジー）から、1回の出来事につき1回だけ読む。
 * - 控えめ（calm：アプリの設定・動きを減らす）は飛ぶもの・粒・揺れを出さず、その場で光って消えるだけ（opacity）。
 * - 合図（cues.ts の playCue）は演出ごとに1回。効果音（決定事項 #127）は sound/ が合図につなぐ。組・型・対象の数・遅れを添える。
 * React の状態（バナー・カードの提示・出現・消える途中のタイル・HP の追従）は useReplay.ts が持つ。ここは見た目の飾りだけ。
 */
import { UI_ICON_PATHS } from '../../icons/generated/uiIcons.ts';
import { peekIconPath } from '../../icons/load.ts';
import { isPathData } from '../../icons/ref.ts';
import type { battle } from '../../../engine/index.ts';
import type { BattleEvent, FxKey, Show } from '../events.ts';
import { hushCues, playCue, sizeOf, type CueId, type CueOpts } from './cues.ts';
import { ARCH_GI, type FxArch, type FxElement } from './registry.ts';
import { TRAVEL_MS, travels, type FxLevel } from './timeline.ts';

type PlayerId = battle.PlayerId;
interface Pt {
  x: number;
  y: number;
}
/** 層の左上からの箱（x・y は中心） */
interface Box extends Pt {
  w: number;
  h: number;
}

export interface FxEnv {
  me: PlayerId;
  /** パワーの uid などの持ち主（場にいないもの・札の無いものの代わりの位置に使う） */
  ownerOfKey: (key: FxKey) => PlayerId | null;
  /** プレイヤーの最大 HP（合図の大きさ） */
  playerHp: number;
}

/** 同時に生かしておく要素の上限（粒はこれを超えそうなら省く） */
export const MAX_NODES = 64;
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const EASE_IN = 'cubic-bezier(0.55, 0, 0.9, 0.4)';
const SPARKS: Record<'s' | 'm' | 'l', number> = { s: 0, m: 3, l: 5 };

const T = (x: number, y: number, s = 1, r = 0) => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${r.toFixed(1)}deg) scale(${s})`;

/** game-icons の形（同梱か読み込み済み。無ければ代わりの形）を SVG の文字列に */
export function glyphSvg(name: string | undefined, fallback: string): string {
  const pick = (n: string | undefined): string | null => {
    if (!n) return null;
    const bundled = (UI_ICON_PATHS as Record<string, string>)[n];
    if (bundled) return bundled;
    const loaded = peekIconPath(n);
    return isPathData(loaded) ? loaded : null;
  };
  const d = pick(name) ?? pick(fallback);
  return d ? `<svg viewBox="0 0 512 512" aria-hidden="true" focusable="false"><path d="${d}"/></svg>` : '';
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class FxDirector {
  level: FxLevel = 'full';
  private live = new Set<HTMLElement>();
  private anims = new Set<Animation>();
  /** 見せたカードが最後にいた位置（続く効果の出どころ） */
  private cardAt: Partial<Record<PlayerId, Pt>> = {};
  /** 同じ所に続けて出る数字をずらす */
  private recent = new Map<FxKey, number[]>();
  /** 直近の着弾の時刻（全体効果で一度にたくさん当たるときは、3つ目からは粒を省く） */
  private impacts: number[] = [];
  private o: DOMRect | null = null;
  /**
   * 位置の読み置き（読むたびに配置の計算をやり直させないように）。盤面が描き直されたら invalidate()、
   * そうでなくても少し経ったら読み直す（スクロール・画面の向き）
   */
  private rects = new Map<HTMLElement, Box | null>();
  private rectsAt = 0;
  /** いま演じている出来事の組（合図に添える） */
  private group: number | undefined;

  constructor(
    private root: HTMLElement,
    private layer: HTMLElement,
    private env: () => FxEnv,
  ) {}

  /** すべて止めて消す（早送り・対戦の終わり） */
  clear(): void {
    for (const a of [...this.anims]) a.cancel();
    for (const n of [...this.live]) n.remove();
    this.anims.clear();
    this.live.clear();
    this.recent.clear();
    this.impacts = [];
    this.cardAt = {};
    hushCues();
  }

  /** 粒を出してよいか（直近 200ms の着弾が2つまで） */
  private busy(): boolean {
    const now = performance.now();
    this.impacts = this.impacts.filter((t) => now - t < 200);
    this.impacts.push(now);
    return this.impacts.length > 2;
  }

  /** 盤面が描き直された（タイルが出た・消えた）：位置を読み直す */
  invalidate(): void {
    this.rects.clear();
    this.o = null;
  }

  get calm(): boolean {
    return this.level === 'calm';
  }

  /** いま生きている要素の数（測定・テスト用） */
  get nodeCount(): number {
    return this.live.size;
  }

  // ------------------------------------------------------------ 位置

  private sideOf(p: PlayerId): 'me' | 'opp' {
    return p === this.env().me ? 'me' : 'opp';
  }
  private panel(p: PlayerId): HTMLElement | null {
    return this.root.querySelector<HTMLElement>(`[data-fx="${this.sideOf(p)}"]`);
  }
  private zone(p: PlayerId, z: 'deck' | 'hand' | 'discard' | 'energy' | 'powers' | 'hp'): HTMLElement | null {
    if (z === 'hand' && p === this.env().me) {
      const h = this.root.querySelector<HTMLElement>('[data-fx="hand:me"]');
      if (h && this.boxOfEl(h)) return h;
    }
    const pn = this.panel(p);
    const el = pn?.querySelector<HTMLElement>(`[data-fx-zone="${z}"]`) ?? null;
    return el && this.boxOfEl(el) ? el : pn;
  }
  private elOf(key: FxKey): HTMLElement | null {
    if (key === 'p0' || key === 'p1') return this.panel(Number(key[1]) as PlayerId);
    if (key.startsWith('card:')) return null;
    const el = this.root.querySelector<HTMLElement>(`[data-fx="${CSS.escape(key)}"]`);
    if (el && this.boxOfEl(el)) return el;
    // 場のタイルがスクロールで隠れているだけなら出さない。札の無いパワー（スマホ）は持ち主の「パワー」の数の所へ
    if (el?.closest('.board')) return null;
    const owner = this.env().ownerOfKey(key);
    return owner === null ? null : this.zone(owner, 'powers');
  }
  /** 層の左上からの箱。場の中のタイルで、場のスクロールで見えていないものは null（ほかのタイルの上に出さない） */
  private boxOfEl(el: HTMLElement | null): Box | null {
    if (!el) return null;
    const now = performance.now();
    if (now - this.rectsAt > 250) {
      this.rects.clear();
      this.o = null;
      this.rectsAt = now;
    }
    if (this.rects.has(el)) return this.rects.get(el)!;
    const b = this.measure(el);
    this.rects.set(el, b);
    return b;
  }
  private measure(el: HTMLElement): Box | null {
    const o = this.origin();
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    let x = r.left + r.width / 2 - o.left;
    let y = r.top + r.height / 2 - o.top;
    const board = el.closest<HTMLElement>('.board');
    if (board && board !== el) {
      // 場がスクロールして見えていないタイルには出さない（ほかのタイルの上に重ねない）
      const b = board.getBoundingClientRect();
      if (y < b.top - o.top - 4 || y > b.bottom - o.top + 4 || x < b.left - o.left - 4 || x > b.right - o.left + 4) return null;
    }
    return { x, y, w: r.width, h: r.height };
  }
  private box(key: FxKey): Box | null {
    if (key.startsWith('card:')) {
      const p = Number(key.slice(5)) as PlayerId;
      const at = this.cardAt[p];
      if (at) return { ...at, w: 60, h: 80 };
      return this.boxOfEl(this.zone(p, 'hand'));
    }
    return this.boxOfEl(this.elOf(key));
  }
  private origin(): DOMRect {
    return (this.o ??= this.root.getBoundingClientRect());
  }

  // ------------------------------------------------------------ 要素

  private room(n: number): boolean {
    return this.live.size + n <= MAX_NODES;
  }
  private node(cls: string, w: number, h: number, html = ''): HTMLElement {
    const n = document.createElement('div');
    n.className = `fx-n ${cls}`;
    n.style.width = `${w}px`;
    n.style.height = `${h}px`;
    if (html) n.innerHTML = html;
    this.layer.appendChild(n);
    this.live.add(n);
    return n;
  }
  private kill(n: HTMLElement): void {
    n.remove();
    this.live.delete(n);
  }
  /** 要素を動かす（終わったら消す）。位置は frames の transform に含める（左上が 0,0） */
  private run(n: HTMLElement, frames: Keyframe[], opts: KeyframeAnimationOptions & { keep?: boolean } = {}): Animation {
    const { keep, ...o } = opts;
    // 3つ以上の区切りがあるものは全体を等速にし、緩急は区間ごとに付ける（全体に緩急を付けると「留まる」区間が縮むため）
    const multi = frames.length > 2;
    const segEase = typeof o.easing === 'string' ? o.easing : EASE;
    const fs = multi ? frames.map((f) => (f.easing ? f : { ...f, easing: segEase })) : frames;
    const a = n.animate(fs, { fill: 'both', ...o, easing: multi ? 'linear' : (o.easing ?? EASE) });
    this.anims.add(a);
    a.onfinish = () => {
      this.anims.delete(a);
      if (!keep) this.kill(n);
    };
    a.oncancel = () => this.anims.delete(a);
    return a;
  }
  /** ページの要素（タイル・ハート）そのものを動かす（終わったら元どおり） */
  private nudge(el: HTMLElement | null, frames: Keyframe[], duration: number): void {
    if (!el || this.calm) return;
    const a = el.animate(frames, { duration, easing: 'ease-out' });
    this.anims.add(a);
    a.onfinish = a.oncancel = () => this.anims.delete(a);
  }
  private cue(cue: CueId, mine: boolean, magnitude?: number, extra: Omit<CueOpts, 'mine' | 'magnitude'> = {}): void {
    playCue(cue, { mine, ...(magnitude !== undefined ? { magnitude } : {}), ...(this.group !== undefined ? { group: this.group } : {}), ...extra });
  }

  // ------------------------------------------------------------ 部品

  /** 浮かぶ文字（形＋数字） */
  private floatText(at: Box, key: FxKey, text: string, tone: string, gi: string | undefined): void {
    const now = performance.now();
    const list = (this.recent.get(key) ?? []).filter((t) => now - t < 650);
    const slot = list.length;
    list.push(now);
    this.recent.set(key, list);
    const html = `<span class="fx-f__in">${gi ? glyphSvg(gi, ARCH_GI.rune) : ''}<b>${esc(text)}</b></span>`;
    const n = this.node(`fx-f fx-f--${tone}`, 0, 0, html);
    const x = at.x;
    const y = at.y - Math.min(at.h * 0.18, 16) - slot * 20;
    if (this.calm) {
      this.run(n, [{ transform: T(x, y), opacity: 0 }, { transform: T(x, y), opacity: 1, offset: 0.15 }, { transform: T(x, y), opacity: 1, offset: 0.75 }, { transform: T(x, y), opacity: 0 }], { duration: 800 });
      return;
    }
    this.run(
      n,
      [
        { transform: T(x, y + 8, 0.7), opacity: 0 },
        { transform: T(x, y, 1.12), opacity: 1, offset: 0.15 },
        { transform: T(x, y - 6, 1), opacity: 1, offset: 0.7 },
        { transform: T(x, y - 30, 1), opacity: 0 },
      ],
      { duration: 900 },
    );
  }

  /** 中心から広がる輪（＋火花） */
  private burst(at: Box, el: FxElement, size: 's' | 'm' | 'l', delay = 0): void {
    const d = Math.max(36, Math.min(96, Math.min(at.w, at.h) * (size === 'l' ? 1.05 : size === 'm' ? 0.85 : 0.7)));
    const ring = this.node(`fx-ring fx-el--${el}`, d, d);
    if (this.calm) {
      this.run(ring, [{ transform: T(at.x - d / 2, at.y - d / 2, 1), opacity: 0 }, { transform: T(at.x - d / 2, at.y - d / 2, 1), opacity: 0.85, offset: 0.25 }, { transform: T(at.x - d / 2, at.y - d / 2, 1), opacity: 0 }], { duration: 420, delay });
      return;
    }
    this.run(ring, [{ transform: T(at.x - d / 2, at.y - d / 2, 0.25), opacity: 1 }, { transform: T(at.x - d / 2, at.y - d / 2, 1.35), opacity: 0 }], { duration: 380, delay });
    if (size === 's' || this.busy()) return;
    const core = this.node(`fx-core fx-el--${el}`, d * 0.7, d * 0.7);
    this.run(core, [{ transform: T(at.x - d * 0.35, at.y - d * 0.35, 0.4), opacity: 0.95 }, { transform: T(at.x - d * 0.35, at.y - d * 0.35, 1.1), opacity: 0 }], { duration: 260, delay });
    const n = SPARKS[size];
    if (!this.room(n + 4)) return;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (size === 'l' ? 0.2 : 0.5);
      const r = d * (0.55 + (i % 2) * 0.25);
      const s = this.node(`fx-spark fx-el--${el}`, 6, 6);
      this.run(s, [{ transform: T(at.x - 3, at.y - 3, 1), opacity: 1 }, { transform: T(at.x - 3 + Math.cos(a) * r, at.y - 3 + Math.sin(a) * r, 0.4), opacity: 0 }], { duration: 340, delay, easing: 'ease-out' });
    }
  }

  /** 揺れ（タイル・ハート） */
  private shake(el: HTMLElement | null, strength = 5): void {
    this.nudge(
      el,
      [
        { transform: 'translateX(0)' },
        { transform: `translateX(${-strength}px)` },
        { transform: `translateX(${strength}px)` },
        { transform: `translateX(${-strength * 0.6}px)` },
        { transform: `translateX(${strength * 0.6}px)` },
        { transform: 'translateX(0)' },
      ],
      320,
    );
  }

  /** 弾（頭と尾）が from から to へ飛ぶ */
  private bolt(from: Pt, to: Pt, el: FxElement, delay = 0): void {
    if (this.calm) return;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    const len = 42;
    const n = this.node(`fx-bolt fx-el--${el}`, len, 14, '<i class="fx-bolt__tail"></i><i class="fx-bolt__head"></i>');
    // 頭が先（右端）。向きは進む向きに回す
    const at = (p: Pt, s: number) => T(p.x - len + 7, p.y - 7, s, ang);
    this.run(n, [{ transform: at(from, 0.6), opacity: 0 }, { transform: at(from, 1), opacity: 1, offset: 0.12 }, { transform: at(to, 1), opacity: 1, offset: 0.92 }, { transform: at(to, 0.8), opacity: 0 }], {
      duration: TRAVEL_MS + 20,
      delay,
      easing: EASE_IN,
    });
  }

  /** 全体：対象の並び全体を1回だけ掃く帯 */
  private sweep(boxes: Box[], el: FxElement, fromLeft: boolean): void {
    if (this.calm || boxes.length === 0) return;
    const left = Math.min(...boxes.map((b) => b.x - b.w / 2));
    const right = Math.max(...boxes.map((b) => b.x + b.w / 2));
    const top = Math.min(...boxes.map((b) => b.y - b.h / 2));
    const bottom = Math.max(...boxes.map((b) => b.y + b.h / 2));
    const w = Math.max(60, right - left);
    const h = Math.max(40, bottom - top);
    const band = Math.min(120, w * 0.45);
    const n = this.node(`fx-sweep fx-el--${el}`, band, h + 16);
    const x0 = fromLeft ? left - band : right;
    const x1 = fromLeft ? right : left - band;
    this.run(n, [{ transform: T(x0, top - 8), opacity: 0 }, { transform: T(x0 + (x1 - x0) * 0.2, top - 8), opacity: 0.95, offset: 0.2 }, { transform: T(x1, top - 8), opacity: 0 }], { duration: TRAVEL_MS + 40, easing: 'ease-in-out' });
  }

  /** 形のバッジ（何の効果か）を出どころに一瞬出す */
  private badge(at: Box, gi: string, arch: FxArch, el: FxElement, side: 'me' | 'opp'): void {
    const d = 34;
    const n = this.node(`fx-badge fx-el--${el} fx-side--${side}`, d, d, glyphSvg(gi, ARCH_GI[arch]));
    const x = at.x - d / 2;
    const y = at.y - d / 2 - Math.min(at.h * 0.35, 30);
    if (this.calm) {
      this.run(n, [{ transform: T(x, y), opacity: 0 }, { transform: T(x, y), opacity: 1, offset: 0.2 }, { transform: T(x, y), opacity: 1, offset: 0.7 }, { transform: T(x, y), opacity: 0 }], { duration: 560 });
      return;
    }
    this.run(n, [{ transform: T(x, y + 6, 0.5), opacity: 0 }, { transform: T(x, y, 1.12), opacity: 1, offset: 0.2 }, { transform: T(x, y - 4, 1), opacity: 1, offset: 0.7 }, { transform: T(x, y - 10, 0.9), opacity: 0 }], { duration: 620 });
  }

  /** 型ごとの着弾の飾り（回復の光・守りの輪・山形・鎖・円陣・砕け） */
  private archAt(at: Box, arch: FxArch, el: FxElement, blocked = false): void {
    const side = Math.max(34, Math.min(84, Math.min(at.w, at.h) * 0.9));
    switch (arch) {
      case 'heal': {
        const ring = this.node(`fx-glow fx-el--${el}`, side, side);
        this.run(ring, [{ transform: T(at.x - side / 2, at.y - side / 2, 0.6), opacity: 0 }, { transform: T(at.x - side / 2, at.y - side / 2, 1), opacity: 0.8, offset: 0.35 }, { transform: T(at.x - side / 2, at.y - side / 2, 1.15), opacity: 0 }], { duration: 560 });
        if (this.calm || !this.room(6) || this.busy()) return;
        for (let i = 0; i < 3; i++) {
          const s = this.node(`fx-mote fx-el--${el}`, 7, 7);
          const x = at.x - 3.5 + (i - 1) * side * 0.24;
          const y = at.y + side * 0.25;
          this.run(s, [{ transform: T(x, y, 0.6), opacity: 0 }, { transform: T(x, y - 10, 1), opacity: 1, offset: 0.3 }, { transform: T(x + (i % 2 ? 4 : -4), y - side * 0.7, 0.5), opacity: 0 }], { duration: 640, delay: i * 50 });
        }
        return;
      }
      case 'ward': {
        const d = side * 1.08;
        const ring = this.node(`fx-ward fx-el--${el}`, d, d);
        const at0 = T(at.x - d / 2, at.y - d / 2, 1.25);
        const at1 = T(at.x - d / 2, at.y - d / 2, 1);
        if (blocked) {
          this.run(ring, [{ transform: at1, opacity: 1 }, { transform: at1, opacity: 1, offset: 0.35 }, { transform: this.calm ? at1 : T(at.x - d / 2, at.y - d / 2, 1.4), opacity: 0 }], { duration: 520 });
          this.cue('ward.break', false);
          return;
        }
        this.run(ring, [{ transform: this.calm ? at1 : at0, opacity: 0 }, { transform: at1, opacity: 1, offset: 0.3 }, { transform: at1, opacity: 0.9, offset: 0.75 }, { transform: at1, opacity: 0 }], { duration: 640 });
        return;
      }
      case 'buff':
      case 'debuff': {
        const up = arch === 'buff';
        const n = this.calm || this.busy() ? 1 : 2;
        if (!this.room(n)) return;
        for (let i = 0; i < n; i++) {
          const c = this.node(`fx-chev fx-chev--${up ? 'up' : 'down'} fx-el--${el}`, 22, 12, '<svg viewBox="0 0 24 13" aria-hidden="true"><path d="M2 11.5 L12 2.5 L22 11.5"/></svg>');
          const x = at.x - 11;
          const y0 = at.y + (up ? 12 : -22) - i * (up ? 0 : 0);
          const dy = up ? -26 : 22;
          if (this.calm) {
            this.run(c, [{ transform: T(x, at.y - 6), opacity: 0 }, { transform: T(x, at.y - 6), opacity: 1, offset: 0.3 }, { transform: T(x, at.y - 6), opacity: 0 }], { duration: 520 });
          } else {
            this.run(c, [{ transform: T(x, y0), opacity: 0 }, { transform: T(x, y0 + dy * 0.4), opacity: 1, offset: 0.35 }, { transform: T(x, y0 + dy), opacity: 0 }], { duration: 520, delay: i * 80 });
          }
        }
        return;
      }
      case 'bind': {
        const w = side * 1.1;
        for (const r of this.calm ? [0] : [28, -28]) {
          const bar = this.node(`fx-chain fx-el--${el}`, w, 6);
          const base = (s: number) => `${T(at.x - w / 2, at.y - 3, 1, r)} scaleX(${s})`;
          this.run(bar, [{ transform: base(this.calm ? 1 : 0.2), opacity: 0 }, { transform: base(1), opacity: 1, offset: 0.3 }, { transform: base(1), opacity: 0.9, offset: 0.75 }, { transform: base(1), opacity: 0 }], { duration: 640 });
        }
        return;
      }
      case 'summon':
      case 'move': {
        const d = side * 1.15;
        const rune = this.node(`fx-rune fx-el--${el}`, d, d, '<i></i>');
        if (this.calm) {
          this.run(rune, [{ transform: T(at.x - d / 2, at.y - d / 2), opacity: 0 }, { transform: T(at.x - d / 2, at.y - d / 2), opacity: 0.9, offset: 0.3 }, { transform: T(at.x - d / 2, at.y - d / 2), opacity: 0 }], { duration: 560 });
          return;
        }
        this.run(rune, [{ transform: T(at.x - d / 2, at.y - d / 2, 0.55, 0), opacity: 0 }, { transform: T(at.x - d / 2, at.y - d / 2, 1.05, 50), opacity: 1, offset: 0.45 }, { transform: T(at.x - d / 2, at.y - d / 2, 1.15, 80), opacity: 0 }], { duration: 620 });
        return;
      }
      case 'shatter': {
        const flash = this.node(`fx-core fx-el--${el}`, side, side);
        this.run(flash, [{ transform: T(at.x - side / 2, at.y - side / 2, 0.5), opacity: 0.9 }, { transform: T(at.x - side / 2, at.y - side / 2, 1.2), opacity: 0 }], { duration: 320 });
        if (this.calm || !this.room(5) || this.busy()) return;
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + 0.4;
          const s = this.node(`fx-shard fx-el--${el}`, 10, 12);
          const dist = side * 0.6;
          this.run(
            s,
            [
              { transform: T(at.x - 5, at.y - 6, 1, i * 40), opacity: 1 },
              { transform: T(at.x - 5 + Math.cos(a) * dist, at.y - 6 + Math.sin(a) * dist * 0.7 + 18, 0.6, i * 40 + 160), opacity: 0 },
            ],
            { duration: 480, easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)' },
          );
        }
        return;
      }
      default:
        return;
    }
  }

  /** カードの裏（引く・捨てる） */
  private cardBack(from: Pt, to: Pt, delay: number, face: 'back' | 'face' = 'back'): void {
    const w = 22;
    const h = 30;
    const n = this.node(`fx-cardback fx-cardback--${face}`, w, h);
    if (this.calm) {
      this.run(n, [{ transform: T(to.x - w / 2, to.y - h / 2), opacity: 0 }, { transform: T(to.x - w / 2, to.y - h / 2), opacity: 0.9, offset: 0.3 }, { transform: T(to.x - w / 2, to.y - h / 2), opacity: 0 }], { duration: 420, delay });
      return;
    }
    const mid = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 24 };
    this.run(
      n,
      [
        { transform: T(from.x - w / 2, from.y - h / 2, 0.8, -8), opacity: 0 },
        { transform: T(mid.x - w / 2, mid.y - h / 2, 1.05, 4), opacity: 1, offset: 0.45 },
        { transform: T(to.x - w / 2, to.y - h / 2, 0.85, 0), opacity: 0.95, offset: 0.9 },
        { transform: T(to.x - w / 2, to.y - h / 2, 0.7, 0), opacity: 0 },
      ],
      { duration: 420, delay },
    );
  }

  /** 照準（輪と4本の刻み）。lines の from があれば、そこから線を引く */
  private aim(targets: Box[], side: 'me' | 'opp', from: Pt | null, delay: number, hold: number): void {
    // 多いときは照準を小さく、線は最初の3つだけ（場が照準で埋まらないように）
    const many = targets.length > 3;
    targets.slice(0, 8).forEach((t, i) => {
      const d = Math.max(30, Math.min(many ? 54 : 84, Math.min(t.w, t.h) * (many ? 0.62 : 0.82)));
      const r = this.node(`fx-reticle fx-side--${side}`, d, d, '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="15"/><path d="M20 1v7M20 32v7M1 20h7M32 20h7"/></svg>');
      const p = T(t.x - d / 2, t.y - d / 2, 1);
      this.run(
        r,
        [
          { transform: this.calm ? p : T(t.x - d / 2, t.y - d / 2, 1.5, -30), opacity: 0 },
          { transform: p, opacity: 1, offset: 0.25 },
          { transform: p, opacity: 1, offset: 0.8 },
          { transform: p, opacity: 0 },
        ],
        { duration: hold, delay },
      );
      if (!from || this.calm || i >= 3) return;
      const dx = t.x - from.x;
      const dy = t.y - from.y;
      const len = Math.hypot(dx, dy);
      if (len < 24) return;
      const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
      const line = this.node(`fx-aimline fx-side--${side}`, len, 2);
      const at = (s: number) => `translate(${from.x.toFixed(1)}px, ${from.y.toFixed(1)}px) rotate(${ang.toFixed(1)}deg) scaleX(${s})`;
      this.run(line, [{ transform: at(0), opacity: 0.9 }, { transform: at(1), opacity: 0.9, offset: 0.35 }, { transform: at(1), opacity: 0.75, offset: 0.8 }, { transform: at(1), opacity: 0 }], { duration: hold, delay });
    });
    if (targets.length > 0) this.cue('target.lock', side === 'me', undefined, delay > 0 ? { delay } : {});
  }

  /** 自分の側の縁が赤く光る（あなたがダメージを受けた） */
  private vignette(): void {
    const o = this.origin();
    const h = Math.round(o.height * 0.32);
    const n = this.node('fx-vignette', o.width, h);
    this.run(n, [{ transform: T(0, o.height - h), opacity: 0 }, { transform: T(0, o.height - h), opacity: 0.85, offset: 0.25 }, { transform: T(0, o.height - h), opacity: 0 }], { duration: this.calm ? 420 : 560 });
  }

  // ------------------------------------------------------------ 出来事

  /** 1件の出来事の演出（useReplay の step から） */
  play(e: BattleEvent): void {
    const me = this.env().me;
    this.group = e.group;
    this.show(e.show, e.player === me, me, e);
    this.group = undefined;
  }

  private show(s: Show, mine: boolean, me: PlayerId, e: BattleEvent): void {
    switch (s.t) {
      case 'turn':
        this.cue(s.player === me ? 'turn.mine' : 'turn.enemy', s.player === me);
        this.cardAt = {};
        return;
      case 'reveal':
        this.cue('card.reveal', false);
        return;
      case 'played': {
        this.cue('card.play', true);
        const hand = this.boxOfEl(this.zone(s.player, 'hand'));
        if (hand) this.cardAt[s.player] = { x: hand.x, y: hand.y - hand.h * 0.2 };
        const targets = s.aim.map((k) => this.box(k)).filter((b): b is Box => b !== null);
        this.aim(targets, 'me', null, 0, this.calm ? 380 : 460);
        return;
      }
      case 'cast':
        return this.cast(s, mine, e);
      case 'float':
        return this.impact(s, me);
      case 'summon': {
        const at = this.box(s.uid);
        if (at) this.archAt(at, 'summon', s.token ? 'physical' : 'holy');
        this.cue(s.token ? 'token' : 'summon', mine);
        return;
      }
      case 'destroy': {
        const at = this.box(s.uid);
        if (at) this.archAt(at, 'shatter', s.power ? 'arcane' : 'shadow');
        this.cue('destroy', mine);
        return;
      }
      case 'attack': {
        const src = this.box(s.source);
        const dst = this.box(s.target);
        const el = this.elOf(s.source);
        if (src && dst && !this.calm) {
          const dx = dst.x - src.x;
          const dy = dst.y - src.y;
          const len = Math.hypot(dx, dy) || 1;
          const reach = Math.min(44, len * 0.35);
          this.nudge(
            el,
            [
              { transform: 'translate(0, 0) scale(1)' },
              { transform: `translate(${((dx / len) * reach).toFixed(1)}px, ${((dy / len) * reach).toFixed(1)}px) scale(1.06)`, offset: 0.45 },
              { transform: 'translate(0, 0) scale(1)' },
            ],
            340,
          );
        }
        if (dst) this.slash(dst, e.player === me ? 'me' : 'opp', 170);
        this.cue('attack', mine);
        return;
      }
      case 'activate': {
        const at = this.box(s.key);
        if (at) {
          this.archAt(at, 'ward', 'arcane');
          if (s.gi) this.badge(at, s.gi, 'rune', 'arcane', s.player === me ? 'me' : 'opp');
        }
        this.cue('rune', s.player === me);
        return;
      }
      case 'notice': {
        if (s.key) {
          const at = this.box(s.key);
          if (at) this.archAt(at, 'ward', 'holy');
        }
        this.cue('notice', s.tone === 'mine');
        return;
      }
      case 'zone':
        return this.zoneMove(s, me);
      case 'energy': {
        const at = this.boxOfEl(this.zone(s.player, 'energy'));
        if (!at) return;
        const d = Math.max(30, Math.min(56, at.h * 1.4));
        const ring = this.node('fx-pulse fx-el--arcane', d, d);
        const p = (sc: number) => T(at.x - d / 2, at.y - d / 2, sc);
        this.run(ring, [{ transform: p(this.calm ? 1 : 0.7), opacity: 0.9 }, { transform: p(this.calm ? 1 : 1.6), opacity: 0 }], { duration: s.n > 0 ? 480 : 360 });
        if (s.n > 0) {
          this.floatText(at, `energy:${s.player}`, `+${s.n}`, 'energy', 'crystal-growth');
          this.cue('energy', s.player === me);
        }
        return;
      }
      case 'tint': {
        const boards = [...this.root.querySelectorAll<HTMLElement>('.battle__board')].map((b) => this.boxOfEl(b)).filter((b): b is Box => b !== null);
        if (boards.length === 0) return;
        const left = Math.min(...boards.map((b) => b.x - b.w / 2));
        const top = Math.min(...boards.map((b) => b.y - b.h / 2));
        const right = Math.max(...boards.map((b) => b.x + b.w / 2));
        const bottom = Math.max(...boards.map((b) => b.y + b.h / 2));
        const n = this.node(`fx-tint fx-tint--${s.what}`, right - left, bottom - top);
        this.run(n, [{ transform: T(left, top), opacity: 0 }, { transform: T(left, top), opacity: 1, offset: 0.35 }, { transform: T(left, top), opacity: 0 }], { duration: 760 });
        const chip = this.box(s.key);
        if (chip) this.archAt(chip, 'ward', 'holy');
        this.cue('field', e.player === me);
        return;
      }
      case 'tick':
        return;
    }
  }

  /** 斬撃（攻撃・反撃） */
  private slash(at: Box, side: 'me' | 'opp', delay: number): void {
    const w = Math.max(40, Math.min(90, at.w * 0.9));
    const n = this.node(`fx-slash fx-side--${side}`, w, 5);
    const base = (s: number) => `${T(at.x - w / 2, at.y - 2.5, 1, -32)} scaleX(${s})`;
    if (this.calm) {
      this.run(n, [{ transform: base(1), opacity: 0 }, { transform: base(1), opacity: 0.9, offset: 0.3 }, { transform: base(1), opacity: 0 }], { duration: 320, delay });
      return;
    }
    this.run(n, [{ transform: base(0.1), opacity: 1 }, { transform: base(1), opacity: 1, offset: 0.45 }, { transform: base(1.08), opacity: 0 }], { duration: 260, delay });
  }

  private cast(s: Extract<Show, { t: 'cast' }>, mine: boolean, e: BattleEvent): void {
    const side = s.player === this.env().me ? 'me' : 'opp';
    const src = s.src ? this.box(s.src) : null;
    const targets = s.targets.map((k) => ({ k, b: this.box(k) })).filter((x): x is { k: FxKey; b: Box } => x.b !== null && x.k !== s.src);
    if (src) this.badge(src, s.gi, s.arch, s.el, side);
    else if (targets[0]) this.badge(targets[0].b, s.gi, s.arch, s.el, side);
    this.cue(`cast.${s.el}`, mine, undefined, { arch: s.arch, count: targets.length });
    if (!travels(e) || !src) {
      // 飛ばない型：出どころか対象でその場の飾り（召喚・その他）
      if (s.arch === 'summon' && src && targets.length === 0) this.archAt(src, 'summon', s.el);
      return;
    }
    const boxes = targets.map((t) => t.b);
    if (this.calm) {
      for (const b of boxes.slice(0, 6)) this.burst(b, s.el, 's');
      return;
    }
    if (boxes.length >= 3) {
      // 全体：1回の掃き（出どころの側から）
      const cx = boxes.reduce((n, b) => n + b.x, 0) / boxes.length;
      this.sweep(boxes, s.el, src.x <= cx);
      return;
    }
    boxes.forEach((b, i) => this.bolt(src, b, s.el, i * 40));
  }

  private impact(s: Extract<Show, { t: 'float' }>, me: PlayerId): void {
    const at = this.box(s.key);
    if (!at) return;
    const el = s.el ?? (s.tone === 'heal' ? 'holy' : s.tone === 'poison' ? 'poison' : s.tone === 'burn' ? 'fire' : 'physical');
    const isPlayer = s.key === 'p0' || s.key === 'p1';
    const target = isPlayer ? this.zone(Number(s.key[1]) as PlayerId, 'hp') : this.elOf(s.key);
    // 位置は先に読む（このあと要素を足すと、読むたびに計算のやり直しになる）
    const spot = isPlayer && target ? (this.boxOfEl(target) ?? at) : at;
    const mineKey = s.key === `p${me}`;
    if (s.flash === 'hit') {
      const amount = s.amount ?? 0;
      const size = sizeOf(amount, this.env().playerHp);
      if (amount > 0) {
        if (s.tone === 'retaliate') this.slash(at, mineKey || this.env().ownerOfKey(s.key) === me ? 'opp' : 'me', 0);
        this.burst(spot, el, size);
        this.shake(target, isPlayer ? 4 : 5);
        if (s.guard) {
          // シールドが全部受け止めた（HP は減っていない）
          this.cue('block', mineKey);
        } else {
          if (mineKey) {
            this.vignette();
            this.cue('player.hit', false, amount / this.env().playerHp);
          }
          this.cue(s.tone === 'retaliate' ? 'retaliate' : `hit.${el}.${size}`, !mineKey, amount / this.env().playerHp);
        }
      } else {
        // 0 ダメージ（無効化などで防いだ）
        this.cue('block', mineKey);
      }
    } else if (s.flash === 'heal') {
      const arch: FxArch = s.arch ?? (s.tone === 'shield' ? 'ward' : 'heal');
      this.archAt(spot, arch, el, s.blocked === true);
      if (!s.blocked) this.cue(arch === 'ward' ? 'ward' : 'heal', true, undefined, { arch });
    } else {
      const arch = s.arch ?? (s.tone === 'good' ? 'buff' : 'debuff');
      this.archAt(at, arch, el);
      const variant = s.keyword === 'divineShield' ? 'divine' : s.keyword ? 'keyword' : undefined;
      this.cue(arch === 'buff' || arch === 'heal' || arch === 'ward' ? 'buff' : arch === 'bind' ? 'bind' : 'debuff', s.tone === 'good', undefined, { arch, ...(variant ? { variant } : {}) });
    }
    this.floatText(spot, s.key, s.text, s.tone, s.gi);
  }

  private zoneMove(s: Extract<Show, { t: 'zone' }>, me: PlayerId): void {
    const p = s.player;
    const n = Math.min(3, Math.max(1, s.n));
    const pt = (el: HTMLElement | null) => this.boxOfEl(el);
    switch (s.move) {
      case 'draw':
      case 'toHand': {
        const from = pt(this.zone(p, s.move === 'draw' ? 'deck' : 'discard'));
        const to = pt(this.zone(p, 'hand'));
        if (from && to) for (let i = 0; i < n; i++) this.cardBack(from, to, i * 70);
        this.cue('draw', p === me);
        return;
      }
      case 'discard':
      case 'mill':
      case 'exile': {
        const from = s.uid ? this.box(s.uid) : pt(this.zone(p, s.move === 'mill' ? 'deck' : 'hand'));
        const to = pt(this.zone(p, 'discard'));
        if (from && to) for (let i = 0; i < n; i++) this.cardBack(from, to, i * 70, 'face');
        this.cue(s.move === 'mill' ? 'mill' : 'discard', p === me);
        return;
      }
      case 'noise': {
        const to = pt(this.zone(p, 'deck'));
        const from = pt(this.panel(p === 0 ? 1 : 0));
        if (from && to) for (let i = 0; i < n; i++) this.cardBack(from, to, i * 70);
        this.cue('discard', p !== me);
        return;
      }
      case 'bounce': {
        const from = s.uid ? this.box(s.uid) : null;
        const to = pt(this.zone(p, 'hand'));
        if (from && to) this.cardBack(from, to, 0, 'face');
        if (from) this.archAt(from, 'move', 'arcane');
        this.cue('move', p === me);
        return;
      }
      case 'steal': {
        const at = s.uid ? this.box(s.uid) : null;
        if (at) this.archAt(at, 'move', 'shadow');
        this.cue('move', p === me);
        return;
      }
    }
  }

  /**
   * 相手が使ったカードの提示（React が描いた .fx-reveal の中の .fx-reveal__fly を動かす）：
   * 手札から飛んで来る → 対象に照準と線 → 対象の方へ縮みながら飛んで消える。消えた位置が続く効果の出どころ
   */
  revealCard(container: HTMLElement, s: Extract<Show, { t: 'reveal' }>, total: number): void {
    // カードの提示が入ったばかり（配置が変わった）なので読み直す
    this.invalidate();
    const fly = container.querySelector<HTMLElement>('.fx-reveal__fly');
    if (!fly) return;
    const side = this.sideOf(s.player);
    const o = this.origin();
    const r = fly.getBoundingClientRect();
    const center = { x: r.left + r.width / 2 - o.left, y: r.top + r.height / 2 - o.top };
    const hand = this.boxOfEl(this.zone(s.player, 'hand'));
    const targets = s.aim.map((k) => this.box(k)).filter((b): b is Box => b !== null);
    // 飛んでいく先：モンスターなら出る場所、ほかは最初の対象
    const goal = (s.land ? this.box(s.land) : null) ?? targets[0] ?? null;
    const inMs = this.calm ? 150 : 200;
    const outMs = this.calm ? 150 : 210;
    const hold = Math.max(200, total - inMs - outMs);
    const reach = s.land ? 1 : 0.7;
    const end = goal ? { x: center.x + (goal.x - center.x) * reach, y: center.y + (goal.y - center.y) * reach } : center;
    this.cardAt[s.player] = end;
    const from = hand ?? { x: center.x, y: 0 };
    const frames: Keyframe[] = this.calm
      ? [
          { transform: 'none', opacity: 0 },
          { transform: 'none', opacity: 1, offset: inMs / total },
          { transform: 'none', opacity: 1, offset: (inMs + hold) / total },
          { transform: 'none', opacity: 0 },
        ]
      : [
          // 区間ごとの緩急（全体は等速）：飛んで来る＝減速、留まる、対象へ＝加速
          { transform: `translate(${(from.x - center.x).toFixed(1)}px, ${(from.y - center.y).toFixed(1)}px) scale(0.22) rotate(-6deg)`, opacity: 0.5, easing: EASE },
          { transform: 'translate(0px, 0px) scale(1.04) rotate(0deg)', opacity: 1, offset: (inMs * 0.8) / total },
          { transform: 'translate(0px, 0px) scale(1) rotate(0deg)', opacity: 1, offset: inMs / total },
          { transform: 'translate(0px, 0px) scale(1) rotate(0deg)', opacity: 1, offset: (inMs + hold) / total, easing: EASE_IN },
          { transform: `translate(${(end.x - center.x).toFixed(1)}px, ${(end.y - center.y).toFixed(1)}px) scale(0.18) rotate(0deg)`, opacity: 0 },
        ];
    const a = fly.animate(frames, { duration: total, fill: 'both', easing: 'linear' });
    this.anims.add(a);
    a.onfinish = a.oncancel = () => this.anims.delete(a);
    // 暗い幕：最初の半分の間に出て、対象へ飛ぶ間に消える
    const back = container.animate([{ opacity: 0 }, { opacity: 1, offset: (inMs * 0.5) / total }, { opacity: 1, offset: (inMs + hold) / total }, { opacity: 0 }], { duration: total, fill: 'both', easing: 'linear' });
    this.anims.add(back);
    back.onfinish = back.oncancel = () => this.anims.delete(back);
    this.aim(targets, side, center, inMs, hold + outMs);
    if (!this.calm) this.cue('card.fly', side === 'me', undefined, { delay: inMs + hold });
  }
}
