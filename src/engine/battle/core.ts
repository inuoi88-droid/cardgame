/** 対戦の小道具：参照・名前・ログ・決着 */
import { BALANCE } from '../balance.ts';
import { getKeyword } from '../registry.ts';
import type { CardDef, KeywordInstance } from '../types.ts';
import {
  NOISE_CARD_ID,
  type GameResult,
  type GameState,
  type LogEntry,
  type LogEvent,
  type Monster,
  type PlayerId,
  type PlayerState,
  type PlayRecord,
  type SourceRef,
  type Statuses,
  type Step,
  type TargetRef,
  type TurnLimits,
} from './types.ts';

/** このターンの上限の数え（安全装置）。新しいターンなら0から数え直す */
export function turnLimits(g: GameState, ps: PlayerState): TurnLimits {
  if (!ps.limits || ps.limits.turnIndex !== g.turnIndex) {
    ps.limits = { turnIndex: g.turnIndex, drawn: 0, energyGained: 0, noiseIn: 0 };
  }
  return ps.limits;
}

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

/** カードのキーワードのうち、失っていないもの（分身を使ったカードは分身を失う。MTG 要素 ○ バッチB）。封印は見ない */
export function cardKeywords(g: GameState, m: Monster): KeywordInstance[] {
  const all = g.cards[m.card.cardId]?.keywords ?? [];
  const lost = m.card.lostKeywords;
  return lost && lost.length > 0 ? all.filter((k) => !lost.includes(k.id)) : all;
}

/** 激励（MTG 要素 ○ バッチB）：同じ持ち主の他の（封印されていない）モンスターの激励の合計 */
export function auraAttack(g: GameState, m: Monster): number {
  let n = 0;
  for (const o of g.players[m.controller]?.board ?? []) {
    if (o.uid === m.uid || o.sealed) continue;
    for (const k of cardKeywords(g, o)) n += getKeyword(k.id)?.battle.auraAttack?.(k) ?? 0;
  }
  return n;
}

/** 実効攻撃力（攻撃力＋このターンだけの上乗せ＋激励＋容疑。容疑は MTG 要素 △ バッチA） */
export const effectiveAttack = (g: GameState, m: Monster): number =>
  m.attack + (m.tempAttack ?? 0) + auraAttack(g, m) + (m.suspected ? BALANCE.effects.suspect.attack : 0);

/**
 * 休眠（MTG 要素 △ バッチA）：起点 from（置いたときの持ち主の turnsTaken）からの、持ち主の turnsTaken の差が奇数なら休眠中
 * （持ち主のターンと、その次の相手のターン）。from が無ければ休眠しない
 */
export function dormantNow(g: GameState, p: PlayerId, from: number | undefined): boolean {
  if (from === undefined) return false;
  return (g.players[p].turnsTaken - from) % 2 === 1;
}

/** 休眠中のモンスターか */
export const monsterDormant = (g: GameState, m: Monster): boolean => dormantNow(g, m.controller, m.counters.dormantFrom);
export const monsterRef = (m: Monster): TargetRef => ({ kind: 'monster', uid: m.uid });

export function sourceOfPlayer(g: GameState, p: PlayerId): SourceRef {
  return { kind: 'system', uid: `player${p}`, cardId: '', name: g.players[p].name, controller: p };
}

export function sourceOfMonster(g: GameState, m: Monster): SourceRef {
  return {
    kind: 'monster',
    uid: m.uid,
    cardId: m.card.cardId,
    name: cardName(g, m.card.cardId),
    controller: m.controller,
    ...(m.card.token ? { token: true } : {}),
  };
}

export function log(
  g: GameState,
  depth: number,
  text: string,
  kind: LogEntry['kind'] = 'effect',
  priv?: PlayerId,
  ev?: LogEvent,
): void {
  const entry: LogEntry = { turn: g.turnIndex, depth, text, kind };
  if (priv !== undefined) entry.private = priv;
  if (ev) entry.ev = ev;
  g.log.push(entry);
}

/** カード1回の使用の記録（なければ作る） */
export function playRecord(g: GameState, key: string): PlayRecord {
  return (g.protect[key] ??= { poison: 0, burn: 0 });
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

/** このカード（uid）がもうどこかの場所（山札・手札・捨て札・除外・場・装備・予約）にあるか */
function cardPlaced(g: GameState, uid: string): boolean {
  return g.players.some(
    (ps) =>
      [ps.deck, ps.hand, ps.discard, ps.exile].some((z) => z.some((c) => c.uid === uid)) ||
      ps.board.some((m) => m.card.uid === uid || m.faceDown?.card?.uid === uid || (m.equipment ?? []).some((c) => c.uid === uid)) ||
      (ps.delayed ?? []).some((d) => d.rebound?.card.uid === uid) ||
      // 待機ゾーン（MTG 要素 △ バッチC）
      (ps.waiting ?? []).some((w) => w.card.uid === uid),
  );
}

export function endGame(g: GameState, winner: PlayerId | null, reason: GameResult['reason']): void {
  g.phase = 'ended';
  g.result = { winner, reason };
  // 処理の途中で決着したら、使っている途中のカードを捨て札に置いてから処理を打ち切る
  // 無料で使う途中・反復の2回目の途中のカード（MTG 要素 ○ バッチB）も。もうどこかの場所にあるカード（召喚時に破壊されたモンスターなど）は動かさない
  for (const step of [...g.queue, ...(g.pending ? [g.pending.step] : [])]) {
    if (step.t !== 'cardDone' && step.t !== 'freePlay' && step.t !== 'reboundDone') continue;
    const card = step.card;
    if (card.token || cardPlaced(g, card.uid)) continue;
    const owner = g.players[card.owner];
    if (card.copy === 'temp' || card.exileOnLeave) owner.exile.push(card);
    else owner.discard.push(card);
  }
  g.queue = [];
  g.pending = null;
  const why =
    reason === 'turnLimit'
      ? `${BALANCE.battle.maxTurns}ターンが経過した`
      : reason === 'concede'
        ? '降参した'
        : reason === 'timeout'
          ? '続けて時間切れになった'
          : reason === 'altWin'
            ? '特殊勝利を達成した'
            : 'HPが0になった';
  log(g, 0, winner === null ? `引き分け（${why}）` : `${g.players[winner].name}の勝ち（${why}）`, 'result', undefined, {
    kind: 'result',
    ...(winner === null ? {} : { player: winner }),
  });
}

/** キューの先頭（割り込み位置）に処理を入れる。入れた順に処理される */
export function enqueue(g: GameState, step: Step): void {
  g.queue.splice(g.qInsert, 0, step);
  g.qInsert += 1;
}

export function player(g: GameState, p: PlayerId): PlayerState {
  return g.players[p];
}
