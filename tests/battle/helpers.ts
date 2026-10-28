// 対戦テスト用の道具：状態を直接いじって場面を作り、行動を適用して結果を見る
import { expect } from 'vitest';
import { BALANCE, battle, type CardDef, type Deck, type EffectInstance } from '../../src/engine/index.ts';
import { card } from '../helpers.ts';

type GameState = battle.GameState;
type PlayerId = battle.PlayerId;
type Action = battle.Action;
type TargetRef = battle.TargetRef;

/** 山札用の当たり障りのないカード（回復1＝量の最小の単位、コスト1。実際の倍率では20：決定事項 #146） */
export const FILLER = card({
  id: 'filler',
  name: '練習用の薬',
  effects: [{ id: 'heal', value: BALANCE.stats.minAmount, timing: 'play', target: 'self', condition: null }],
});

export const fx = (e: Partial<EffectInstance> & { id: string }): EffectInstance => ({
  timing: 'play',
  target: 'chosen',
  condition: null,
  ...e,
});

export function deckOf(defs: CardDef[]): Deck {
  return { v: 1, id: 'deck', name: 'テスト', entries: [{ cardId: defs[0]!.id, count: 30 }] };
}

/** 両者が手札を決めて、先攻（P0）の1ターン目が始まった状態 */
export function startGame(opts: { seed?: number; first?: PlayerId; mulligan?: boolean } = {}): GameState {
  const r = battle.createGame({
    seed: opts.seed ?? 1,
    first: opts.first ?? 0,
    players: [
      { name: 'P0', deck: deckOf([FILLER]), cards: [FILLER] },
      { name: 'P1', deck: deckOf([FILLER]), cards: [FILLER] },
    ],
  });
  if (!r.ok) throw new Error(r.error);
  if (opts.mulligan === false) return r.state;
  let g = act(r.state, { type: 'mulligan', player: 0, mode: 'keep' });
  g = act(g, { type: 'mulligan', player: 1, mode: 'keep' });
  return g;
}

let seq = 0;

/** カードを手札に入れる（定義も登録する）。カードの uid を返す */
export function giveCard(g: GameState, p: PlayerId, def: CardDef): string {
  const key = `p${p}:${def.id}`;
  g.cards[key] = def;
  const uid = `t${++seq}`;
  g.players[p].hand.push({ uid, cardId: key, owner: p });
  return uid;
}

/** モンスターを直接場に出す（このターンから攻撃できる状態） */
export function putMonster(g: GameState, p: PlayerId, def: CardDef, patch: Partial<battle.Monster> = {}): string {
  const key = `p${p}:${def.id}`;
  g.cards[key] = def;
  const uid = `m${++seq}`;
  g.players[p].board.push({
    uid,
    card: { uid, cardId: key, owner: p },
    owner: p,
    controller: p,
    attack: def.stats!.attack,
    hp: def.stats!.hp,
    maxHp: def.stats!.hp,
    defense: def.stats!.defense,
    enteredTurn: -1,
    attacksUsed: 0,
    sealed: false,
    undyingUsed: false,
    stealth: false,
    betraying: false,
    counters: {},
    status: emptyStatus(),
    ...patch,
  });
  return uid;
}

export function emptyStatus(): battle.Statuses {
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

export function act(g: GameState, a: Action): GameState {
  const r = battle.applyAction(g, a);
  if (!r.ok) throw new Error(`行動できませんでした：${r.error}（${JSON.stringify(a)}）`);
  return r.state;
}

export function actError(g: GameState, a: Action): string {
  const r = battle.applyAction(g, a);
  expect(r.ok).toBe(false);
  return r.ok ? '' : r.error;
}

export const P = (player: PlayerId): TargetRef => ({ kind: 'player', player });
export const M = (uid: string): TargetRef => ({ kind: 'monster', uid });

export function play(g: GameState, uid: string, chosen: battle.Chosen = {}, player?: PlayerId): GameState {
  return act(g, { type: 'playCard', player: player ?? g.active, cardUid: uid, chosen });
}

export function attack(g: GameState, uid: string, target: TargetRef): GameState {
  return act(g, { type: 'attack', player: g.active, attackerUid: uid, target });
}

export function endTurn(g: GameState): GameState {
  return act(g, { type: 'endTurn', player: g.active });
}

export function monster(g: GameState, uid: string): battle.Monster | undefined {
  return battle.findMonster(g, uid);
}

/** ログの本文だけ（確認用） */
export function logText(g: GameState): string {
  return g.log.map((e) => `${'  '.repeat(e.depth)}${e.text}`).join('\n');
}

/** たっぷりのエナジー */
export function rich(g: GameState, p: PlayerId = g.active, energy = 20): GameState {
  g.players[p].energy = energy;
  return g;
}
