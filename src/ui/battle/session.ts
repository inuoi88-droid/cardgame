/** 進行中の対戦の保存（localStorage）。再読み込みしても続きから再開できる */
import { battle, type CardDef, type Deck } from '../../engine/index.ts';

const KEY = 'cardgame.v1.battle';

export const HUMAN: battle.PlayerId = 0;
export const CPU: battle.PlayerId = 1;

export interface BattleSession {
  v: 1;
  state: battle.GameState;
  /** 同じ組み合わせでもう一度遊ぶための情報 */
  setup: { myDeckName: string; cpuDeckName: string; myDeck: Deck; myCards: CardDef[]; cpuDeck: Deck; cpuCards: CardDef[] };
}

export function loadSession(): BattleSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as BattleSession;
    return s && s.v === 1 && s.state?.v === 1 ? s : null;
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
  const session: BattleSession = { v: 1, state: r.state, setup };
  saveSession(session);
  return { ok: true, session };
}
