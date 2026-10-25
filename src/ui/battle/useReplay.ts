/**
 * イベント再生層。view（最新の状態）が進むたびに、前回見たログ位置からの新しい行を演出に変えて順に再生する。
 * - 盤面は最新をそのまま描く。ここが持つのは重ねる React の状態（バナー・カードの提示・出現・消える途中のタイル・HP の追従・ティッカー）。
 *   弾・着弾・浮かぶ数字などの飾りは演出の層（fx/director.ts）に1件ずつ渡す（決定事項 #126）
 * - 出来事の間は fx/timeline.ts が組ごとに詰める（効果と着弾は重ねる）
 * - どこかをタップ／クリックすると skip() で残りを一気に反映する
 * - 「動きを減らす」・演出「控えめ」は level 'calm'（飛ぶもの・粒・揺れなし。短い光と数字だけ）
 * - 再生が終わる（または演出がない）たびに onDone を呼ぶ。CPU 戦はこれを合図に次の手を打つ
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type MutableRefObject } from 'react';
import { battle } from '../../engine/index.ts';
import { buildEvents, findGhosts, type BattleEvent, type FxKey, type Show } from './events.ts';
import type { FxDirector } from './fx/director.ts';
import { planTimeline, type FxLevel } from './fx/timeline.ts';

type GameState = battle.GameState;
type PlayerId = battle.PlayerId;

export interface Ghost {
  m: battle.Monster;
  index: number;
  dying: boolean;
}

export interface Banner {
  text: string;
  tone: 'mine' | 'enemy' | 'neutral';
  big: boolean;
  gi?: string;
}

export type RevealState = { id: number; cardId: string; player: PlayerId; show: Extract<Show, { t: 'reveal' }>; ms: number };

/**
 * 重ねる表示（見出し・カードの提示・ティッカー）。1件ごとに変わるので、盤面（BattleBoard）を描き直さないよう
 * 小さな部品だけが読む別の入れ物に置く（useOverlay。決定事項 #126：重い相手のターンでもカクつかないように）
 */
export interface OverlayState {
  banner: Banner | null;
  /** 相手が使ったカードの提示（id は出来事の番号。ms はこの提示の長さ） */
  reveal: RevealState | null;
  /** 直近の出来事（1行） */
  ticker: string;
}

export class OverlayStore {
  private s: OverlayState = { banner: null, reveal: null, ticker: '' };
  private ls = new Set<() => void>();
  get = (): OverlayState => this.s;
  subscribe = (f: () => void): (() => void) => {
    this.ls.add(f);
    return () => this.ls.delete(f);
  };
  set(patch: Partial<OverlayState>): void {
    const n = { ...this.s, ...patch };
    if (n.banner === this.s.banner && n.reveal === this.s.reveal && n.ticker === this.s.ticker) return;
    this.s = n;
    for (const f of this.ls) f();
  }
}

/** 重ねる表示を読む（読む部品だけが描き直される） */
export function useOverlay(store: OverlayStore): OverlayState {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export interface ReplayState {
  playing: boolean;
  /** 対象に一時的に付けるクラス（出現の is-appear だけ） */
  flash: Record<FxKey, string>;
  /** まだ出現の演出をしていないモンスター（見えない） */
  hidden: ReadonlySet<string>;
  /** 破壊されたが消える演出のために残すモンスター */
  ghosts: ReadonlyMap<string, Ghost>;
  /** HP バーの追従表示（演出中だけ。なければ実際の値） */
  hp: Partial<Record<PlayerId, number>>;
}

const EMPTY: ReplayState = {
  playing: false,
  flash: {},
  hidden: new Set(),
  ghosts: new Map(),
  hp: {},
};

/** 消える途中のタイルを残す時間 */
const GHOST_MS = 520;
/** 出現の光を付けておく時間 */
const APPEAR_MS = 420;
/** これより多くの演出がたまったら速める（オンラインでまとめて届いたときなど） */
const MANY = 40;
/**
 * 遅い端末で1件ごとの処理の時間が積もらないよう、次の出来事は「予定の時刻」に合わせて始める。
 * 遅れは次の間で取り戻すが、間はこの割合より縮めない（見出し・カードの提示は縮めない）
 */
const CATCH_UP_FLOOR = 0.6;

/** 次の出来事までの待ち（予定の時刻 due に合わせる）と、次の予定の時刻 */
export function nextDelay(due: number, ms: number, now: number, floor: number): { delay: number; due: number } {
  const min = Math.round(ms * floor);
  const delay = Math.max(min, Math.round(due + ms - now));
  return { delay, due: Math.max(due + ms, now + min) };
}

export interface UseReplay extends ReplayState {
  skip: () => void;
  /** 見出し・カードの提示・ティッカー（useOverlay で読む） */
  overlay: OverlayStore;
}

export interface ReplayOpts {
  /** 演出の層（無ければ React の状態だけ） */
  fx?: MutableRefObject<FxDirector | null>;
  level?: FxLevel;
}

export function useReplay(view: GameState, me: PlayerId, onDone?: () => void, opts: ReplayOpts = {}): UseReplay {
  const [st, setSt] = useState<ReplayState>(EMPTY);
  const overlay = useRef(new OverlayStore()).current;
  const level = opts.level ?? 'full';
  const fx = opts.fx;
  const queue = useRef<BattleEvent[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sideTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const seen = useRef(view.log.length);
  const prev = useRef(view);
  const seq = useRef(0);
  const speed = useRef(1);
  /** 今の出来事を始める予定だった時刻（null は「今から」） */
  const dueAt = useRef<number | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  /** 演出の見出しにカード名を出すための最新の状態 */
  const viewRef = useRef(view);
  viewRef.current = view;

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    dueAt.current = null;
  };
  const later = (ms: number, f: () => void) => {
    const t = setTimeout(() => {
      sideTimers.current.delete(t);
      f();
    }, ms);
    sideTimers.current.add(t);
  };

  const finish = useCallback(() => {
    clearTimer();
    queue.current = [];
    overlay.set({ banner: null, reveal: null });
    setSt((s) => ({ ...EMPTY, ghosts: s.ghosts, flash: s.flash }));
    doneRef.current?.();
  }, [overlay]);

  /** 1件の演出の恒久的な変化（出現・消滅・HP）だけを反映する（早送り用）。変わらなければ同じものを返す */
  const applyInstant = (e: BattleEvent, s: ReplayState): ReplayState => {
    const n: ReplayState = { ...s };
    switch (e.show.t) {
      case 'summon': {
        const hidden = new Set(s.hidden);
        hidden.delete(e.show.uid);
        n.hidden = hidden;
        break;
      }
      case 'destroy': {
        const ghosts = new Map(s.ghosts);
        ghosts.delete(e.show.uid);
        n.ghosts = ghosts;
        break;
      }
      case 'zone':
        if (e.show.uid) {
          const ghosts = new Map(s.ghosts);
          ghosts.delete(e.show.uid);
          n.ghosts = ghosts;
        }
        break;
      case 'float':
        if (e.show.hpAfter !== undefined && /^p[01]$/.test(e.show.key)) n.hp = { ...s.hp, [Number(e.show.key[1]) as PlayerId]: e.show.hpAfter };
        else return s;
        break;
      default:
        return s;
    }
    return n;
  };

  /** 消える途中のタイルを、決めた時間のあとに片付ける */
  const dropGhostLater = (uid: string) =>
    later(GHOST_MS, () =>
      setSt((s) => {
        if (!s.ghosts.has(uid)) return s;
        const ghosts = new Map(s.ghosts);
        ghosts.delete(uid);
        return { ...s, ghosts };
      }),
    );

  const step = useCallback(() => {
    const e = queue.current.shift();
    if (!e) {
      finish();
      return;
    }
    const ms = Math.max(40, Math.round(e.ms * speed.current));
    // 重ねる表示（見出し・カードの提示・ティッカー）は小さな入れ物へ。盤面の状態は変わるときだけ
    const o: Partial<OverlayState> = { banner: null, reveal: null, ticker: e.text };
    switch (e.show.t) {
      case 'turn': {
        const mine = e.show.player === me;
        // 追加ターン（MTG 要素 △ バッチC）は見出しで分かるように
        const extra = e.show.extra ? '追加ターン！' : '';
        o.banner = {
          text: mine ? `${extra || 'あなたのターン'}${e.show.turn ? `（${e.show.turn}）` : ''}` : `${extra ? `相手の${extra}` : '相手のターン'}${e.show.turn ? `（${e.show.turn}）` : ''}`,
          tone: mine ? 'mine' : 'enemy',
          big: true,
        };
        break;
      }
      case 'reveal':
        o.reveal = { id: e.id, cardId: e.show.cardId, player: e.show.player, show: e.show, ms };
        break;
      case 'notice':
        o.banner = { text: e.show.text, tone: e.show.tone, big: false, ...(e.show.gi ? { gi: e.show.gi } : {}) };
        break;
      case 'activate':
        // 起動（MTG 要素 ○ バッチC1）：見出しを出す（光は演出の層）
        o.banner = { text: `起動：${viewRef.current.cards[e.show.cardId]?.name ?? ''}`, tone: e.show.player === me ? 'mine' : 'enemy', big: false, ...(e.show.gi ? { gi: e.show.gi } : {}) };
        break;
      default:
        break;
    }
    // 位置を読む演出の層を先に（このあとの DOM の変更で、配置の計算をやり直させないように）
    fx?.current?.play(e);
    overlay.set(o);
    const show = e.show;
    if (show.t === 'summon') {
      setSt((s) => {
        const hidden = new Set(s.hidden);
        hidden.delete(show.uid);
        return { ...s, playing: true, hidden, flash: { ...s.flash, [show.uid]: 'is-appear' } };
      });
    } else if ((show.t === 'destroy' || show.t === 'zone') && show.uid) {
      const uid = show.uid;
      setSt((s) => {
        const g = s.ghosts.get(uid);
        if (!g) return s;
        const ghosts = new Map(s.ghosts);
        ghosts.set(uid, { ...g, dying: true });
        return { ...s, ghosts };
      });
    } else if (show.t === 'float' && show.hpAfter !== undefined) {
      setSt((s) => applyInstant(e, s));
    }
    if (show.t === 'summon') {
      const uid = show.uid;
      later(APPEAR_MS, () =>
        setSt((s) => {
          if (!(uid in s.flash)) return s;
          const flash = { ...s.flash };
          delete flash[uid];
          return { ...s, flash };
        }),
      );
    }
    if ((show.t === 'destroy' || show.t === 'zone') && show.uid) dropGhostLater(show.uid);
    const now = performance.now();
    const next = nextDelay(dueAt.current ?? now, ms, now, o.banner || o.reveal ? 1 : CATCH_UP_FLOOR);
    dueAt.current = next.due;
    timer.current = setTimeout(() => {
      timer.current = null;
      step();
    }, next.delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finish, me, fx, overlay]);

  const skip = useCallback(() => {
    if (!timer.current && queue.current.length === 0) return;
    clearTimer();
    sideTimers.current.forEach((t) => clearTimeout(t));
    sideTimers.current.clear();
    fx?.current?.clear();
    const rest = queue.current;
    queue.current = [];
    const last = rest[rest.length - 1];
    overlay.set({ banner: null, reveal: null, ...(last ? { ticker: last.text } : {}) });
    setSt({ ...EMPTY, hp: {} });
    doneRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx, overlay]);

  // view が進んだら、新しい行を演出にして積む。描く前に（出現前のタイルを隠し、HP を前の値にしてから）始める
  useLayoutEffect(() => {
    if (view === prev.current) return;
    const old = prev.current;
    prev.current = view;
    const restarted = view.log.length < seen.current || (view.phase === 'mulligan' && old.phase !== 'mulligan');
    if (restarted) {
      seen.current = view.log.length;
      clearTimer();
      sideTimers.current.forEach((t) => clearTimeout(t));
      sideTimers.current.clear();
      fx?.current?.clear();
      queue.current = [];
      overlay.set({ banner: null, reveal: null, ticker: '' });
      setSt(EMPTY);
      doneRef.current?.();
      return;
    }
    const entries = view.log.slice(seen.current);
    seen.current = view.log.length;
    const events = planTimeline(buildEvents(entries, view, me, seq.current + 1), level);
    seq.current += events.length + 1;
    if (events.length === 0) {
      if (!timer.current) doneRef.current?.();
      return;
    }
    const ghosts = findGhosts(old, view, events);
    const summons = events.flatMap((e) => (e.show.t === 'summon' && battle.findMonster(view, e.show.uid) ? [e.show.uid] : []));
    const touchesHp = events.some((e) => e.show.t === 'float' && e.show.hpAfter !== undefined && /^p[01]$/.test(e.show.key));
    setSt((s) => {
      const hidden = new Set(s.hidden);
      for (const u of summons) hidden.add(u);
      const gm = new Map(s.ghosts);
      for (const g of ghosts) gm.set(g.m.uid, { ...g, dying: false });
      const hp = { ...s.hp };
      if (touchesHp) {
        for (const p of [0, 1] as const) if (hp[p] === undefined) hp[p] = old.players[p].hp;
      }
      return { ...s, playing: true, hidden, ghosts: gm, hp };
    });
    queue.current.push(...events);
    speed.current = queue.current.length > MANY ? 0.5 : 1;
    // 最初の1件は次の処理で（盤面の描き直しと同じ1コマに演出の準備まで詰め込まない）
    if (!timer.current)
      timer.current = setTimeout(() => {
        timer.current = null;
        step();
      }, 0);
  }, [view, me, level, step, skip, fx]);

  useEffect(() => {
    const side = sideTimers.current;
    return () => {
      clearTimer();
      side.forEach((t) => clearTimeout(t));
    };
  }, []);

  return { ...st, skip, overlay };
}
