/** カードの移動：ドロー、召喚、ノイズ、バウンス、奪取、コピー、蘇生、解除 */
import { BALANCE } from '../balance.ts';
import { getDrawback, getEffect } from '../registry.ts';
import { TIMINGS } from '../options.ts';
import { cardName, emptyStatuses, findMonster, isEnded, log, monsterLabel, newUid, turnLimits } from './core.ts';
import { keywordFlags } from './damage.ts';
import { pick, randInt, shuffle } from './rng.ts';
import { makeRuntime } from './runtime.ts';
import { enqueueCardTiming } from './triggers.ts';
import {
  NOISE_CARD_ID,
  type CardInst,
  type ChoiceOption,
  type Chosen,
  type GameState,
  type Monster,
  type PlayerId,
  type SourceRef,
} from './types.ts';

/** 山札が尽きたら捨て札をシャッフルして山札にする。引けた枚数を返す */
export function drawCards(g: GameState, p: PlayerId, count: number, depth: number): number {
  const ps = g.players[p];
  const drawn: CardInst[] = [];
  // 1ターンに引ける枚数の上限（対戦前の手札・マリガンは数えない）
  const limits = g.phase === 'main' ? turnLimits(g, ps) : null;
  const maxDraw = BALANCE.battle.maxDrawPerTurn;
  let capped = false;
  for (let i = 0; i < count; i++) {
    if (limits && limits.drawn >= maxDraw) {
      capped = true;
      break;
    }
    if (ps.deck.length === 0) {
      if (ps.discard.length === 0) break;
      ps.deck = ps.discard;
      ps.discard = [];
      shuffle(g, ps.deck);
      log(g, depth, `${ps.name}の山札が尽きたので、捨て札${ps.deck.length}枚をシャッフルして山札にした`, 'info');
    }
    const card = ps.deck.shift()!;
    ps.hand.push(card);
    drawn.push(card);
    if (limits) limits.drawn += 1;
  }
  if (capped) log(g, depth, `${ps.name}はこのターンもう引けない（1ターン${maxDraw}枚まで）`, 'info');
  if (drawn.length > 0) {
    log(g, depth, `${ps.name}はカードを${drawn.length}枚引いた`, 'info', undefined, { kind: 'draw', player: p, amount: drawn.length });
    log(g, depth, `引いたカード：${drawn.map((c) => cardName(g, c.cardId)).join('、')}`, 'info', p);
  } else if (count > 0) {
    log(g, depth, `${ps.name}は引けるカードがなかった`, 'info');
  }
  // 引いたときのデメリット（寄生：決定事項 #70 R7）。カード名は相手に見せない
  for (const card of drawn) {
    const def = g.cards[card.cardId];
    for (const d of def?.drawbacks ?? []) {
      const hook = getDrawback(d.id)?.battle.onDrawn;
      if (!hook) continue;
      if (isEnded(g)) return drawn.length;
      const src: SourceRef = { kind: 'card', uid: card.uid, cardId: card.cardId, name: def!.name, controller: p };
      log(g, depth, `${ps.name}が引いたカードのデメリット：${getDrawback(d.id)!.name}`, 'effect');
      hook(makeRuntime(g, src, [], { depth: depth + 1, attackCard: false }), d);
    }
  }
  return drawn.length;
}

/** モンスターを場に出す（召喚時の効果は呼び出し側で積む） */
export function placeMonster(g: GameState, p: PlayerId, card: CardInst, depth: number): Monster | undefined {
  const def = g.cards[card.cardId];
  if (!def?.stats) return undefined;
  const m: Monster = {
    uid: card.uid,
    card,
    owner: card.owner,
    controller: p,
    attack: def.stats.attack,
    hp: def.stats.hp,
    maxHp: def.stats.hp,
    defense: def.stats.defense,
    enteredTurn: g.turnIndex,
    attacksUsed: 0,
    sealed: false,
    undyingUsed: false,
    stealth: false,
    betraying: false,
    counters: {},
    status: emptyStatuses(),
  };
  m.stealth = keywordFlags(g, m).stealthOnSummon === true;
  g.players[p].board.push(m);
  log(g, depth, `${g.players[p].name}の場に「${def.name}」が出た（攻撃力${m.attack}・体力${m.hp}・守備力${m.defense}）`, 'effect', undefined, {
    kind: 'summon',
    player: p,
    cardId: card.cardId,
    uid: m.uid,
  });
  return m;
}

/** 召喚：場に出して、召喚時のデメリットと効果を積む */
export function summon(g: GameState, p: PlayerId, card: CardInst, chosen: Chosen, depth: number, protectKey?: string): Monster | undefined {
  const m = placeMonster(g, p, card, depth);
  if (!m) return undefined;
  const def = g.cards[card.cardId]!;
  const src: SourceRef = { kind: 'monster', uid: m.uid, cardId: card.cardId, name: def.name, controller: p };
  enqueueCardTiming(g, src, def, 'summon', chosen, depth + 1, protectKey ? { protectKey } : {});
  return m;
}

/** ノイズを山札のランダムな位置に混ぜる */
export function addNoise(g: GameState, p: PlayerId, count: number, depth: number): void {
  const ps = g.players[p];
  for (let i = 0; i < count; i++) {
    const card: CardInst = { uid: newUid(g, 'n'), cardId: NOISE_CARD_ID, owner: p };
    ps.deck.splice(randInt(g, ps.deck.length + 1), 0, card);
  }
  log(g, depth, `${ps.name}の山札にノイズを${count}枚混ぜた`);
}

/** 手札をランダムに捨てる。手札がなければ、代わりに次のターンに引く枚数が1枚減る（決定事項 #70 R7） */
export function discardRandom(g: GameState, p: PlayerId, count: number, depth: number): void {
  const ps = g.players[p];
  for (let i = 0; i < count; i++) {
    const card = pick(g, ps.hand);
    if (!card) {
      const rest = count - i;
      ps.next.draw -= rest;
      log(g, depth, `${ps.name}の手札がないので、代わりに次のターンに引く枚数−${rest}`);
      return;
    }
    ps.hand.splice(ps.hand.indexOf(card), 1);
    discardCard(g, card);
    log(g, depth, `${ps.name}は手札の「${cardName(g, card.cardId)}」を捨てた`);
  }
}

/** 捨て札に置く（残らないコピーは除外）。元の持ち主の捨て札へ */
export function discardCard(g: GameState, card: CardInst): void {
  const owner = g.players[card.owner];
  if (card.copy === 'temp') owner.exile.push(card);
  else owner.discard.push(card);
}

export function removeFromBoard(g: GameState, m: Monster): void {
  const board = g.players[m.controller].board;
  const i = board.findIndex((x) => x.uid === m.uid);
  if (i >= 0) board.splice(i, 1);
}

export function bounce(g: GameState, uid: string, depth: number): void {
  const m = findMonster(g, uid);
  if (!m) return;
  const label = monsterLabel(g, m);
  removeFromBoard(g, m);
  g.players[m.card.owner].hand.push(m.card);
  log(g, depth, `${label}を持ち主（${g.players[m.card.owner].name}）の手札に戻した`);
}

export function steal(g: GameState, uid: string, to: PlayerId, depth: number): void {
  const m = findMonster(g, uid);
  if (!m || m.controller === to) return;
  const label = monsterLabel(g, m);
  removeFromBoard(g, m);
  m.controller = to;
  m.enteredTurn = g.turnIndex;
  m.attacksUsed = 0;
  m.stealth = false;
  g.players[to].board.push(m);
  log(g, depth, `${label}を奪って${g.players[to].name}の場に移した（次の自分のターンから攻撃できる）`);
}

export function takeFromDeck(g: GameState, p: PlayerId, cardUid: string, depth: number): void {
  const ps = g.players[p];
  const i = ps.deck.findIndex((c) => c.uid === cardUid);
  if (i < 0) return;
  const [card] = ps.deck.splice(i, 1);
  ps.hand.push(card!);
  shuffle(g, ps.deck);
  log(g, depth, `${ps.name}は山札からカードを1枚手札に加え、山札をシャッフルした`);
  log(g, depth, `手札に加えたカード：${cardName(g, card!.cardId)}`, 'info', p);
}

export function takeFromDiscard(g: GameState, p: PlayerId, cardUid: string, depth: number): void {
  const ps = g.players[p];
  const i = ps.discard.findIndex((c) => c.uid === cardUid);
  if (i < 0) return;
  const [card] = ps.discard.splice(i, 1);
  ps.hand.push(card!);
  log(g, depth, `${ps.name}は捨て札から「${cardName(g, card!.cardId)}」を手札に加えた`);
}

export function copyFromHand(g: GameState, p: PlayerId, cardUid: string, keep: boolean, depth: number): void {
  const ps = g.players[p];
  const original = ps.hand.find((c) => c.uid === cardUid);
  if (!original) return;
  const copy: CardInst = { uid: newUid(g, 'c'), cardId: original.cardId, owner: p, copy: keep ? 'keep' : 'temp' };
  ps.hand.push(copy);
  log(g, depth, `${ps.name}は手札のカード1枚のコピーを手札に加えた（${keep ? 'この試合のデッキに残る' : '使うかターン終了で除外'}）`);
  log(g, depth, `コピーしたカード：${cardName(g, original.cardId)}`, 'info', p);
}

/** 蘇生：捨て札のモンスターを召喚扱いで場に出す（「選んだ1体」は選ぶ場面がないので不発） */
export function reviveFromDiscard(g: GameState, p: PlayerId, cardUid: string, depth: number): void {
  const ps = g.players[p];
  const i = ps.discard.findIndex((c) => c.uid === cardUid);
  if (i < 0) return;
  const [card] = ps.discard.splice(i, 1);
  log(g, depth, `${ps.name}は捨て札から「${cardName(g, card!.cardId)}」を蘇生した`);
  summon(g, p, card!, {}, depth);
}

// ---------------------------------------------------------------- 解除（決定事項 #41）

/** 解除で選べる効果：筋力（合計）と、パワーの持続効果（種類＋タイミングごと） */
export function dispelOptions(g: GameState, p: PlayerId): ChoiceOption[] {
  const ps = g.players[p];
  const out: ChoiceOption[] = [];
  if (ps.status.strength > 0) out.push({ id: 'strength', label: `筋力（合計${ps.status.strength}）` });
  const groups = new Map<string, number>();
  for (const power of ps.powers) {
    for (const x of power.effects) {
      if (x.removed) continue;
      const key = `${x.effect.id}:${x.effect.timing}`;
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
  }
  for (const [key, count] of groups) {
    const [id, timing] = key.split(':') as [string, keyof typeof TIMINGS];
    const name = getEffect(id)?.name ?? id;
    out.push({ id: `power:${key}`, label: `${TIMINGS[timing]?.label ?? timing}の${name}（${count}つ）` });
  }
  return out;
}

export function dispel(g: GameState, p: PlayerId, key: string, depth: number): void {
  const ps = g.players[p];
  if (key === 'strength') {
    log(g, depth, `${ps.name}の筋力${ps.status.strength}をすべて消した`);
    ps.status.strength = 0;
    return;
  }
  const [, id, timing] = key.split(':');
  let count = 0;
  for (const power of ps.powers) {
    for (const x of power.effects) {
      if (!x.removed && x.effect.id === id && x.effect.timing === timing) {
        x.removed = true;
        count++;
      }
    }
  }
  ps.powers = ps.powers.filter((pw) => pw.effects.some((x) => !x.removed) || pw.drawbacks.length > 0);
  const name = getEffect(id ?? '')?.name ?? id;
  log(g, depth, `${ps.name}の持続効果「${name}」を${count}つ消した`);
}

/** 新しい対戦用カード（ID の付け直しは setup で済ませる） */
export function newCardInst(g: GameState, cardId: string, owner: PlayerId): CardInst {
  return { uid: newUid(g, 'c'), cardId, owner };
}

