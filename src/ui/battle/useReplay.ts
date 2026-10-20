/**
 * イベント再生層。view（最新の状態）が進むたびに、前回見たログ位置からの新しい行を演出に変えて順に再生する。
 * - 盤面は最新をそのまま描く。ここが出すのは重ねる演出（バナー・カード提示・浮かぶ数字・出現・消滅・HP バーの追従）
 * - どこかをタップ／クリックすると skip() で残りを一気に反映する
 * - 「動きを減らす」設定なら演出はせず、即座に反映する
 * - 再生が終わる（または演出がない）たびに onDone を呼ぶ。CPU 戦はこれを合図に次の手を打つ
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { battle } from '../../engine/index.ts';
import { useMediaQuery } from '../components/dialogUtil.ts';
import { buildEvents, findGhosts, type BattleEvent, type FxKey, type FxTone } from './events.ts';

type GameState = battle.GameState;
type PlayerId = battle.PlayerId;

export interface Float {
  id: number;
  text: string;
  tone: FxTone;
}

export interface Ghost {
  m: battle.Monster;
  index: number;
  dying: boolean;
}

export interface ReplayState {
  playing: boolean;
  banner: { text: string; tone: 'mine' | 'enemy' | 'neutral'; big: boolean } | null;
  reveal: { cardId: string; player: PlayerId } | null;
  floats: Record<FxKey, Float[]>;
  /** 対象に一時的に付けるクラス（is-hit / is-lunge / is-heal / is-status） */
  flash: Record<FxKey, string>;
  /** まだ出現の演出をしていないモンスター（見えない） */
  hidden: ReadonlySet<string>;
  /** 破壊されたが消える演出のために残すモンスター */
  ghosts: ReadonlyMap<string, Ghost>;
  /** HP バーの追従表示（演出中だけ。なければ実際の値） */
  hp: Partial<Record<PlayerId, number>>;
  /** 直近の出来事（1行） */
  ticker: string;
}

const EMPTY: ReplayState = {
  playing: false,
  banner: null,
  reveal: null,
  floats: {},
  flash: {},
  hidden: new Set(),
  ghosts: new Map(),
  hp: {},
  ticker: '',
};

/** 浮かぶ数字が見えている時間 */
const FLOAT_MS = 900;
/** これより多くの演出がたまったら速める（オンラインでまとめて届いたときなど） */
const MANY = 24;

export interface UseReplay extends ReplayState {
  skip: () => void;
}

export function useReplay(view: GameState, me: PlayerId, onDone?: () => void): UseReplay {
  const [st, setSt] = useState<ReplayState>(EMPTY);
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)');
  const queue = useRef<BattleEvent[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const floatTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const seen = useRef(view.log.length);
  const prev = useRef(view);
  const seq = useRef(0);
  const speed = useRef(1);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  /** 演出の見出しにカード名を出すための最新の状態 */
  const viewRef = useRef(view);
  viewRef.current = view;

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const finish = useCallback(() => {
    clearTimer();
    queue.current = [];
    setSt((s) => ({ ...EMPTY, ticker: s.ticker }));
    doneRef.current?.();
  }, []);

  /** 1件の演出が終わったあとに残さないもの（バナー・提示・点滅）を消し、恒久的な変化（出現・消滅）を確定する */
  const applyInstant = (e: BattleEvent, s: ReplayState): ReplayState => {
    const n: ReplayState = { ...s, ticker: e.text };
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
      case 'float':
        if (e.show.hpAfter !== undefined && /^p[01]$/.test(e.show.key)) n.hp = { ...s.hp, [Number(e.show.key[1]) as PlayerId]: e.show.hpAfter };
        break;
      default:
        break;
    }
    return n;
  };

  const step = useCallback(() => {
    const e = queue.current.shift();
    if (!e) {
      finish();
      return;
    }
    const ms = Math.max(60, Math.round(e.ms * speed.current));
    setSt((s) => {
      const n: ReplayState = { ...s, playing: true, banner: null, reveal: null, flash: {} };
      switch (e.show.t) {
        case 'turn': {
          const mine = e.show.player === me;
          // 追加ターン（MTG 要素 △ バッチC）は見出しで分かるように
          const extra = e.show.extra ? '追加ターン！' : '';
          n.banner = {
            text: mine ? `${extra || 'あなたのターン'}${e.show.turn ? `（${e.show.turn}）` : ''}` : `${extra ? `相手の${extra}` : '相手のターン'}${e.show.turn ? `（${e.show.turn}）` : ''}`,
            tone: mine ? 'mine' : 'enemy',
            big: true,
          };
          n.ticker = e.text;
          break;
        }
        case 'reveal':
          n.reveal = { cardId: e.show.cardId, player: e.show.player };
          n.ticker = e.text;
          break;
        case 'played':
          n.ticker = e.text;
          break;
        case 'notice':
          n.banner = { text: e.show.text, tone: e.show.tone, big: false };
          if (e.show.key) n.flash = { [e.show.key]: 'is-activate' };
          n.ticker = e.text;
          break;
        case 'float': {
          const key = e.show.key;
          const id = ++seq.current;
          const list = [...(s.floats[key] ?? []), { id, text: e.show.text, tone: e.show.tone }];
          n.floats = { ...s.floats, [key]: list };
          n.flash = { [key]: `is-${e.show.flash}` };
          const t = setTimeout(() => {
            floatTimers.current.delete(t);
            setSt((x) => ({ ...x, floats: { ...x.floats, [key]: (x.floats[key] ?? []).filter((f) => f.id !== id) } }));
          }, FLOAT_MS);
          floatTimers.current.add(t);
          Object.assign(n, applyInstant(e, n));
          break;
        }
        case 'summon': {
          const hidden = new Set(s.hidden);
          hidden.delete(e.show.uid);
          n.hidden = hidden;
          n.flash = { [e.show.uid]: 'is-appear' };
          n.ticker = e.text;
          break;
        }
        case 'destroy': {
          const g = s.ghosts.get(e.show.uid);
          if (g) {
            const ghosts = new Map(s.ghosts);
            ghosts.set(e.show.uid, { ...g, dying: true });
            n.ghosts = ghosts;
          }
          n.ticker = e.text;
          break;
        }
        case 'attack':
          n.flash = { [e.show.source]: 'is-lunge', [e.show.target]: 'is-hit' };
          n.ticker = e.text;
          break;
        case 'activate':
          // 起動（MTG 要素 ○ バッチC1）：起動したものを光らせ、見出しを出す
          n.flash = { [e.show.key]: 'is-activate' };
          n.banner = { text: `⚡ 起動：${viewRef.current.cards[e.show.cardId]?.name ?? ''}`, tone: e.show.player === me ? 'mine' : 'enemy', big: false };
          n.ticker = e.text;
          break;
        case 'tick':
          n.ticker = e.text;
          break;
      }
      return n;
    });
    const destroyedUid = e.show.t === 'destroy' ? e.show.uid : null;
    timer.current = setTimeout(() => {
      timer.current = null;
      if (destroyedUid !== null) {
        setSt((s) => {
          const ghosts = new Map(s.ghosts);
          ghosts.delete(destroyedUid);
          return { ...s, ghosts };
        });
      }
      step();
    }, ms);
  }, [finish, me]);

  const skip = useCallback(() => {
    if (!timer.current && queue.current.length === 0) return;
    clearTimer();
    const rest = queue.current;
    queue.current = [];
    setSt((s) => {
      let n = s;
      for (const e of rest) n = applyInstant(e, n);
      return { ...EMPTY, ticker: n.ticker };
    });
    doneRef.current?.();
  }, []);

  // view が進んだら、新しい行を演出にして積む
  useEffect(() => {
    if (view === prev.current) return;
    const old = prev.current;
    prev.current = view;
    const restarted = view.log.length < seen.current || (view.phase === 'mulligan' && old.phase !== 'mulligan');
    if (restarted) {
      seen.current = view.log.length;
      clearTimer();
      queue.current = [];
      setSt(EMPTY);
      doneRef.current?.();
      return;
    }
    const entries = view.log.slice(seen.current);
    seen.current = view.log.length;
    const events = buildEvents(entries, view, me, seq.current + 1);
    seq.current += events.length + 1;
    if (events.length === 0) {
      if (!timer.current) doneRef.current?.();
      return;
    }
    if (reduce) {
      setSt((s) => ({ ...s, ticker: events[events.length - 1]!.text }));
      doneRef.current?.();
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
    speed.current = queue.current.length > MANY ? 0.45 : queue.current.length > 10 ? 0.75 : 1;
    if (!timer.current) step();
  }, [view, me, reduce, step, skip]);

  useEffect(() => {
    const floats = floatTimers.current;
    return () => {
      clearTimer();
      floats.forEach((t) => clearTimeout(t));
    };
  }, []);

  return { ...st, skip };
}
