/** 対戦の小道具：参照・名前・ログ・決着 */
import { BALANCE } from '../balance.ts';
import type { CardDef } from '../types.ts';
import {
  NOISE_CARD_ID,
  type GameState,
  type LogEntry,
  type Monster,
  type PlayerId,
  type PlayerState,
  type SourceRef,
  type Statuses,
  type Step,
  type TargetRef,
} from './types.ts';

export const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

export function emptyStatuses(): Statuses {
  return {
    poison: 0,
    burn: 0,
    weak: 0,
    vulnerable: 0,
    bleed: 0,
    freezePending: false,
    freezeActive: false,
    confusePending: false,
    confuseActive: false,
    counter: 0,
    nullify: 0,
    regen: 0,
    strength: 0,
    focus: 0,
  };
}

export function newUid(g: GameState, prefix: string): string {
  g.nextUid += 1;
  return `${prefix}${g.nextUid}`;
}

export function cardDef(g: GameState, cardId: string): CardDef | undefined {
  return g.cards[cardId];
}

export function cardName(g: GameState, cardId: string): string {
  if (cardId === NOISE_CARD_ID) return 'ノイズ';
  return g.cards[cardId]?.name ?? '？';
}

export function findMonster(g: GameState, uid: string): Monster | undefined {
  for (const p of g.players) {
    const m = p.board.find((x) => x.uid === uid);
    if (m) return m;
  }
  return undefined;
}

export function allMonsters(g: GameState): Monster[] {
  return [...g.players[0].board, ...g.players[1].board];
}

/** 手番側から順に並べた全モンスター */
export function monstersInOrder(g: GameState): Monster[] {
  return [...g.players[g.active].board, ...g.players[other(g.active)].board];
}

export function targetExists(g: GameState, t: TargetRef): boolean {
  return t.kind === 'player' || findMonster(g, t.uid) !== undefined;
}

export function sameTarget(a: TargetRef, b: TargetRef): boolean {
  return a.kind === 'player' ? b.kind === 'player' && a.player === b.player : b.kind === 'monster' && a.uid === b.uid;
}

export function monsterLabel(g: GameState, m: Monster): string {
  return `${g.players[m.controller].name}の「${cardName(g, m.card.cardId)}」`;
}

export function targetLabel(g: GameState, t: TargetRef): string {
  if (t.kind === 'player') return g.players[t.player].name;
  const m = findMonster(g, t.uid);
  return m ? monsterLabel(g, m) : '（いなくなったモンスター）';
}

export function statusOf(g: GameState, t: TargetRef): Statuses | undefined {
  return t.kind === 'player' ? g.players[t.player].status : findMonster(g, t.uid)?.status;
}

export const playerRef = (p: PlayerId): TargetRef => ({ kind: 'player', player: p });
export const monsterRef = (m: Monster): TargetRef => ({ kind: 'monster', uid: m.uid });

export function sourceOfPlayer(g: GameState, p: PlayerId): SourceRef {
  return { kind: 'system', uid: `player${p}`, cardId: '', name: g.players[p].name, controller: p };
}

export function sourceOfMonster(g: GameState, m: Monster): SourceRef {
  return { kind: 'monster', uid: m.uid, cardId: m.card.cardId, name: cardName(g, m.card.cardId), controller: m.controller };
}

export function log(g: GameState, depth: number, text: string, kind: LogEntry['kind'] = 'effect', priv?: PlayerId): void {
  const entry: LogEntry = { turn: g.turnIndex, depth, text, kind };
  if (priv !== undefined) entry.private = priv;
  g.log.push(entry);
}

export function isEnded(g: GameState): boolean {
  return g.phase === 'ended';
}

/** HP が0以下のプレイヤーがいれば決着させる（両方なら引き分け） */
export function checkGameEnd(g: GameState): boolean {
  if (g.phase === 'ended') return true;
  if (g.holdEnd > 0) return false;
  const dead = g.players.map((p) => p.hp <= 0);
  if (!dead[0] && !dead[1]) return false;
  const winner: PlayerId | null = dead[0] && dead[1] ? null : dead[0] ? 1 : 0;
  endGame(g, winner, 'hp');
  return true;
}

export function endGame(g: GameState, winner: PlayerId | null, reason: 'hp' | 'turnLimit' | 'concede'): void {
  g.phase = 'ended';
  g.result = { winner, reason };
  g.queue = [];
  g.pending = null;
  const why =
    reason === 'turnLimit'
      ? `${BALANCE.battle.maxTurns}ターンが経過した`
      : reason === 'concede'
        ? '降参した'
        : 'HPが0になった';
  log(g, 0, winner === null ? `引き分け（${why}）` : `${g.players[winner].name}の勝ち（${why}）`, 'result');
}

/** キューの先頭（割り込み位置）に処理を入れる。入れた順に処理される */
export function enqueue(g: GameState, step: Step): void {
  g.queue.splice(g.qInsert, 0, step);
  g.qInsert += 1;
}

export function player(g: GameState, p: PlayerId): PlayerState {
  return g.players[p];
}
