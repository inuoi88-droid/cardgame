/** 進行中の対戦の保存（localStorage）。再読み込みしても続きから再開できる */
import { ai, battle, isPlanarMode, normalizeRules, toLeaderId, type CardDef, type Deck, type MatchRules, type PlanarMode } from '../../engine/index.ts';
import { isLeaderChoice, resolveLeader, type LeaderChoice } from './matchOptions.ts';

const KEY = 'cardgame.v1.battle';

export const HUMAN: battle.PlayerId = 0;
export const CPU: battle.PlayerId = 1;

export interface BattleSession {
  /** 2：インフレ倍率の導入後（決定事項 #65）。それより前の対戦の途中データは読まない */
  v: 2;
  state: battle.GameState;
  /** 対戦ごとの ID（対戦した相手の記録を1対戦1件にする。決定事項 #122。無い古い保存データもある） */
  gameId?: string;
  /**
   * 同じ組み合わせでもう一度遊ぶための情報。cpuLevel は CPU の強さ（無い古い保存データは「ふつう」：決定事項 #82）。
   * MTG 要素 △ バッチD：リーダー（CPU は「おまかせ」なら対戦ごとに決め直す）と対戦のルール。無い古い保存データは「なし」
   */
  setup: {
    myDeckName: string;
    cpuDeckName: string;
    myDeck: Deck;
    myCards: CardDef[];
    cpuDeck: Deck;
    cpuCards: CardDef[];
    cpuLevel?: ai.CpuLevel;
    myLeader?: LeaderChoice;
    cpuLeader?: LeaderChoice;
    rules?: MatchRules;
    /**
     * 場から交互に取るドラフトのあとの対戦（決定事項 #119）。first は先攻の指定（無ければランダム。ドラフトの1戦目はランダム：決定事項 #125）。
     * 「同じデッキでもう一度」は前の対戦で負けた人（引き分けなら前の後攻）が先攻（オンラインの再戦と同じ）
     */
    draft?: boolean;
    first?: battle.PlayerId;
  };
}

/** ドラフトのあとの「同じデッキでもう一度」の先攻：前の対戦で負けた人、引き分けなら前の後攻 */
export function rematchFirst(prev: battle.GameState): battle.PlayerId {
  return prev.result && prev.result.winner !== null ? battle.other(prev.result.winner) : battle.other(prev.first);
}

/** 対戦の CPU の強さ（保存データに無ければ「ふつう」） */
export function sessionLevel(s: BattleSession): ai.CpuLevel {
  return ai.isCpuLevel(s.setup.cpuLevel) ? s.setup.cpuLevel : 'normal';
}

export function loadSession(): BattleSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as BattleSession;
    return s && s.v === 2 && s.state?.v === 1 ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(s: BattleSession): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 保存できなくても対戦は続けられる
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 何もしない
  }
}

export function startSession(setup: BattleSession['setup']): { ok: true; session: BattleSession } | { ok: false; error: string } {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const rules = normalizeRules(setup.rules);
  const r = battle.createGame({
    seed,
    players: [
      { name: 'あなた', deck: setup.myDeck, cards: setup.myCards, leader: resolveLeader(isLeaderChoice(setup.myLeader) ? setup.myLeader : undefined) },
      { name: `CPU（${setup.cpuDeckName}）`, deck: setup.cpuDeck, cards: setup.cpuCards, leader: resolveLeader(isLeaderChoice(setup.cpuLeader) ? setup.cpuLeader : undefined) },
    ],
    ...(rules ? { rules } : {}),
    ...(setup.first === 0 || setup.first === 1 ? { first: setup.first } : {}),
  });
  if (!r.ok) return r;
  const session: BattleSession = { v: 2, state: r.state, setup, gameId: `cpu-${seed.toString(36)}-${Date.now().toString(36)}` };
  saveSession(session);
  return { ok: true, session };
}

const PREFS_KEY = 'cardgame.v1.battleSetup';

/** 準備画面で前回選んだもの（自分のデッキの候補キー、CPU のデッキ、CPU の強さ、リーダー・次元・昼と夜） */
export interface SetupPrefs {
  mine: string;
  cpu: string;
  level: ai.CpuLevel;
  myLeader: LeaderChoice;
  cpuLeader: LeaderChoice;
  field: PlanarMode;
  dayNight: boolean;
}

export function loadSetupPrefs(): SetupPrefs | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<SetupPrefs>;
    if (typeof p?.mine !== 'string' || typeof p?.cpu !== 'string') return null;
    return {
      mine: p.mine,
      cpu: p.cpu,
      level: ai.isCpuLevel(p.level) ? p.level : 'normal',
      myLeader: isLeaderChoice(p.myLeader) ? p.myLeader : 'none',
      cpuLeader: isLeaderChoice(p.cpuLeader) ? p.cpuLeader : 'none',
      field: isPlanarMode(p.field) ? p.field : 'off',
      dayNight: p.dayNight === true,
    };
  } catch {
    return null;
  }
}

export function saveSetupPrefs(p: SetupPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // 覚えられなくても困らない
  }
}

/** 対戦中のリーダーの表示用（無い古い状態は none） */
export const leaderOf = (ps: battle.PlayerState) => toLeaderId(ps.leader);
