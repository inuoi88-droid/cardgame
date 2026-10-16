/** 対戦の開始：デッキの検証、カードの準備、シャッフル、先攻後攻、最初の手札 */
import { BALANCE } from '../balance.ts';
import { analyzeDeck } from '../deck.ts';
import type { CardDef, Deck } from '../types.ts';
import { emptyStatuses, log, newUid } from './core.ts';
import { normalizeSeed, randInt, shuffle } from './rng.ts';
import { drawCards } from './zones.ts';
import type { CardInst, GameState, PlayerId, PlayerState } from './types.ts';

export interface PlayerSetup {
  name: string;
  deck: Deck;
  /** デッキが使うカードの定義 */
  cards: readonly CardDef[];
}

export interface GameConfig {
  seed: number;
  players: [PlayerSetup, PlayerSetup];
  /** 指定しなければランダム（決定事項 #45） */
  first?: PlayerId;
}

export type CreateResult = { ok: true; state: GameState } | { ok: false; error: string };

function newPlayer(name: string): PlayerState {
  return {
    name,
    hp: BALANCE.battle.playerHp,
    maxHp: BALANCE.battle.playerHp,
    shield: 0,
    energy: 0,
    deck: [],
    hand: [],
    discard: [],
    exile: [],
    board: [],
    powers: [],
    status: emptyStatuses(),
    next: { draw: 0, energy: 0 },
    turn: { cardsPlayed: 0, retain: 0, freezeTax: false },
    discount: 0,
    turnsTaken: 0,
    mulligan: { done: false, fullCount: 0 },
  };
}

export function createGame(config: GameConfig): CreateResult {
  const g: GameState = {
    v: 1,
    rng: normalizeSeed(config.seed),
    turnIndex: 0,
    phase: 'mulligan',
    active: 0,
    first: 0,
    players: [newPlayer(config.players[0].name), newPlayer(config.players[1].name)],
    cards: {},
    queue: [],
    qInsert: 0,
    holdEnd: 0,
    pending: null,
    protect: {},
    result: null,
    log: [],
    nextUid: 0,
  };

  for (const p of [0, 1] as const) {
    const setup = config.players[p];
    const byId = new Map(setup.cards.map((c) => [c.id, c]));
    const a = analyzeDeck(setup.deck, byId);
    if (!a.valid) return { ok: false, error: `${setup.name}のデッキが使えません：${a.violations[0]?.message ?? ''}` };
    const deck: CardInst[] = [];
    for (const entry of setup.deck.entries) {
      const def = byId.get(entry.cardId)!;
      // 両者のカードIDが重ならないよう、プレイヤーごとに分ける
      const key = `p${p}:${def.id}`;
      g.cards[key] = def;
      for (let i = 0; i < entry.count; i++) deck.push({ uid: newUid(g, 'c'), cardId: key, owner: p });
    }
    shuffle(g, deck);
    g.players[p].deck = deck;
  }

  g.first = config.first ?? (randInt(g, 2) as PlayerId);
  g.active = g.first;
  log(g, 0, `対戦開始。先攻は${g.players[g.first].name}`, 'info');
  for (const p of [0, 1] as const) drawCards(g, p, BALANCE.battle.drawPerTurn, 1);
  log(g, 0, 'マリガン：最初の手札を確認してください', 'info');
  return { ok: true, state: g };
}
