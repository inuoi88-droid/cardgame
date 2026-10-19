/** 進行中の対戦の保存（localStorage）。再読み込みしても続きから再開できる */
import { ai, battle, type CardDef, type Deck } from '../../engine/index.ts';

const KEY = 'cardgame.v1.battle';

export const HUMAN: battle.PlayerId = 0;
export const CPU: battle.PlayerId = 1;

export interface BattleSession {
  /** 2：インフレ倍率の導入後（決定事項 #65）。それより前の対戦の途中データは読まない */
  v: 2;
  state: battle.GameState;
  /** 同じ組み合わせでもう一度遊ぶための情報。cpuLevel は CPU の強さ（無い古い保存データは「ふつう」：決定事項 #82） */
  setup: { myDeckName: string; cpuDeckName: string; myDeck: Deck; myCards: CardDef[]; cpuDeck: Deck; cpuCards: CardDef[]; cpuLevel?: ai.CpuLevel };
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
  const r = battle.createGame({
    seed,
    players: [
      { name: 'あなた', deck: setup.myDeck, cards: setup.myCards },
      { name: `CPU（${setup.cpuDeckName}）`, deck: setup.cpuDeck, cards: setup.cpuCards },
    ],
  });
  if (!r.ok) return r;
  const session: BattleSession = { v: 2, state: r.state, setup };
  saveSession(session);
  return { ok: true, session };
}

const PREFS_KEY = 'cardgame.v1.battleSetup';

/** 準備画面で前回選んだもの（自分のデッキの候補キー、CPU のデッキ、CPU の強さ） */
export interface SetupPrefs {
  mine: string;
  cpu: string;
  level: ai.CpuLevel;
}

export function loadSetupPrefs(): SetupPrefs | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<SetupPrefs>;
    if (typeof p?.mine !== 'string' || typeof p?.cpu !== 'string') return null;
    return { mine: p.mine, cpu: p.cpu, level: ai.isCpuLevel(p.level) ? p.level : 'normal' };
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
