/** カードの使用とノイズの除外 */
import { BALANCE } from '../balance.ts';
import { classifyCard } from '../classify.ts';
import { TIMINGS, isPowerTiming, type TargetRule } from '../options.ts';
import { getDrawback, getEffect } from '../registry.ts';
import type { CardDef } from '../types.ts';
import { enqueue, log, newUid, other, playerRef, playRecord } from './core.ts';
import { enqueueCardTiming, enqueueMonsters, enqueuePowers } from './triggers.ts';
import { cardTargetable, cardTargetableTaunts } from './damage.ts';
import { discardCard, summon } from './zones.ts';
import { NOISE_CARD_ID, type CardInst, type Chosen, type GameState, type PlayerId, type PowerInst, type TargetRef } from './types.ts';

/** 実際に払うコスト（凍結の+1、軽減の−） */
export function effectiveCost(g: GameState, p: PlayerId, card: CardInst): number {
  const def = g.cards[card.cardId];
  if (!def) return 0;
  const ps = g.players[p];
  const tax = ps.turn.freezeTax ? BALANCE.battle.freezeCostIncrease : 0;
  return Math.max(0, def.cost + tax - ps.discount * BALANCE.battle.discountAmount);
}

/** 使用時・召喚時の「選んだ1体」が必要な効果の作用先 */
export function chosenRules(def: CardDef): { enemy: TargetRule[]; ally: boolean } {
  const timing = def.stats ? 'summon' : 'play';
  const enemy: TargetRule[] = [];
  let ally = false;
  for (const e of def.effects) {
    if (e.timing !== timing || e.target !== 'chosen' || TIMINGS[timing].chosen !== 'manual') continue;
    const rule = getEffect(e.id)?.targetRule;
    if (rule === 'allyMonsterOne') ally = true;
    else if (rule === 'fight') {
      // 格闘：自分のモンスターと相手モンスターの両方を選ぶ
      ally = true;
      enemy.push(rule);
    } else if (rule) enemy.push(rule);
  }
  return { enemy, ally };
}

/**
 * 相手側の「選んだ1体」の候補（隠密・呪禁は選べない）。
 * 相手に選べる挑発モンスターがいる間は、その挑発モンスターしか選べない（相手プレイヤーも選べない：決定事項 #83）。
 * 呪禁の挑発は数えない（呪禁の挑発しかいなければ、呪禁でないモンスターとプレイヤーから自由に選べる）
 */
export function enemyCandidates(g: GameState, p: PlayerId, rules: TargetRule[]): TargetRef[] {
  if (rules.length === 0) return [];
  const opp = other(p);
  const taunts = cardTargetableTaunts(g, opp);
  if (taunts.length > 0) return taunts.map((m): TargetRef => ({ kind: 'monster', uid: m.uid }));
  const monsters = g.players[opp].board.filter((m) => cardTargetable(g, m)).map((m): TargetRef => ({ kind: 'monster', uid: m.uid }));
  const allowPlayer = rules.some((r) => r === 'enemyAny');
  return [...(allowPlayer ? [playerRef(opp)] : []), ...monsters];
}

/** 自分のモンスターの「選んだ1体」の候補（モンスターカードなら自分自身も選べる） */
export function allyCandidates(g: GameState, p: PlayerId, card: CardInst): string[] {
  const def = g.cards[card.cardId];
  return [...g.players[p].board.map((m) => m.uid), ...(def?.stats ? [card.uid] : [])];
}

const sameRef = (a: TargetRef, b: TargetRef) =>
  a.kind === 'player' ? b.kind === 'player' && a.player === b.player : b.kind === 'monster' && a.uid === b.uid;

export function validatePlay(g: GameState, p: PlayerId, cardUid: string, chosen: Chosen | undefined): string | null {
  const ps = g.players[p];
  const card = ps.hand.find((c) => c.uid === cardUid);
  if (!card) return 'そのカードは手札にありません';
  if (card.cardId === NOISE_CARD_ID) return 'ノイズは使えません（コストを払って除外はできます）';
  const def = g.cards[card.cardId];
  if (!def) return 'カードの定義が見つかりません';
  const cost = effectiveCost(g, p, card);
  if (cost > ps.energy) return `エナジーが足りません（必要${cost}、残り${ps.energy}）`;
  const reason = drawbackBlock(g, p, card);
  if (reason) return reason;
  const rules = chosenRules(def);
  const enemies = enemyCandidates(g, p, rules.enemy);
  if (enemies.length > 0) {
    if (!chosen?.enemy) return '対象を選んでください';
    if (!enemies.some((t) => sameRef(t, chosen.enemy!))) return 'その対象は選べません';
  } else if (chosen?.enemy) {
    return '対象は選べません';
  }
  const allies = rules.ally ? allyCandidates(g, p, card) : [];
  if (allies.length > 0) {
    if (!chosen?.ally) return '自分のモンスターを選んでください';
    if (!allies.includes(chosen.ally)) return 'そのモンスターは選べません';
  } else if (chosen?.ally) {
    return '自分のモンスターは選べません';
  }
  return null;
}

/** デメリットのせいで使えない理由（生け贄にするモンスターがいない など）。使えるなら null */
export function drawbackBlock(g: GameState, p: PlayerId, card: CardInst): string | null {
  for (const d of g.cards[card.cardId]?.drawbacks ?? []) {
    const reason = getDrawback(d.id)?.battle.canPlay?.(g, p, card) ?? null;
    if (reason) return reason;
  }
  return null;
}

/** カードのデメリットの寿命（あれば最短のもの） */
export function lifespanOf(def: CardDef | undefined): number | undefined {
  let life: number | undefined;
  for (const d of def?.drawbacks ?? []) {
    const n = getDrawback(d.id)?.battle.lifespan?.(d);
    if (n !== undefined) life = life === undefined ? n : Math.min(life, n);
  }
  return life;
}

export function playCard(g: GameState, p: PlayerId, cardUid: string, chosen: Chosen): void {
  const ps = g.players[p];
  const index = ps.hand.findIndex((c) => c.uid === cardUid);
  const card = ps.hand[index]!;
  const def = g.cards[card.cardId]!;
  const cost = effectiveCost(g, p, card);
  const before = ps.energy;
  ps.energy -= cost;
  const notes: string[] = [];
  if (ps.turn.freezeTax) notes.push('凍結で+1');
  if (ps.discount > 0) notes.push(`軽減で−${ps.discount}`);
  ps.turn.freezeTax = false;
  ps.discount = 0;
  ps.turn.cardsPlayed += 1;
  ps.hand.splice(index, 1);
  log(
    g,
    0,
    `${ps.name}は「${def.name}」を使った（コスト${cost}${notes.length ? `：${notes.join('、')}` : ''}、エナジー ${before}→${ps.energy}）`,
    'action',
    undefined,
    { kind: 'play', player: p, cardId: card.cardId, uid: card.uid },
  );

  const protectKey = newUid(g, 'pk');
  // X（全力）：使用時・召喚時の効果に X があれば、残りのエナジーをすべて使う（このカードの X の効果はすべて同じ X）
  if (usesX(def)) {
    const x = ps.energy;
    ps.energy = 0;
    playRecord(g, protectKey).x = x;
    log(g, 1, `X＝${x}（エナジーをすべて使った）`, 'info', undefined, { kind: 'energy', player: p, amount: 0 });
  }
  // 自分のカードの対象になるたび（英雄的。MTG 要素 ○ バッチA）：選んだ自分のモンスターの効果を、カードの効果より先に積む
  if (chosen.ally && chosenRules(def).ally && ps.board.some((m) => m.uid === chosen.ally)) {
    enqueueMonsters(g, p, 'targeted', 1, { onlyUid: chosen.ally });
  }
  if (def.stats) {
    summon(g, p, card, chosen, 1, protectKey);
  } else {
    const type = classifyCard(def);
    const attackCard = type === 'attack' || type === 'powerAttack';
    // 筋力・気合は使った時点の値を記録し、このカードの最初の1発にだけ乗せる（このカード自身が付けた分は乗らない：決定事項 #70 R3）
    if (attackCard) playRecord(g, protectKey).bonus = ps.status.strength + ps.status.focus;
    const src = { kind: 'card' as const, uid: card.uid, cardId: card.cardId, name: def.name, controller: p };
    enqueueCardTiming(g, src, def, 'play', chosen, 1, { attackCard, protectKey });
  }
  enqueue(g, { t: 'cardDone', player: p, card, protectKey, depth: 1 });
}

/** 使用時・召喚時の効果に X（全力）があるか */
export function usesX(def: CardDef): boolean {
  const timing = def.stats ? 'summon' : 'play';
  return def.effects.some((e) => e.timing === timing && (e.mods ?? []).includes('xEnergy') && getEffect(e.id)?.scalable === true);
}

/** このカードを使うと場にパワーが残るか（パワー用タイミングの効果かデメリットがある、パワー・パワー攻撃のカード） */
export function leavesPower(def: CardDef): boolean {
  if (def.stats) return false;
  const type = classifyCard(def);
  if (type !== 'power' && type !== 'powerAttack') return false;
  return def.effects.some((e) => isPowerTiming(e.timing, 'spell')) || def.drawbacks.some((d) => isPowerTiming(d.timing, 'spell'));
}

/**
 * パワーを場に置く。すでに上限（BALANCE.battle.maxPowers）なら、先にいちばん古いパワーを消す（決定事項 #80）。
 * 消えたパワーのカードは使ったときに除外済みなので、パワーが場から消えるだけ（誘発なし）
 */
export function addPower(g: GameState, p: PlayerId, power: PowerInst, depth: number): void {
  const ps = g.players[p];
  const max = BALANCE.battle.maxPowers;
  while (ps.powers.length >= max) {
    const old = ps.powers.shift()!;
    log(g, depth, `パワーは${max}つまで：『${old.name}』が消えた`, 'effect', undefined, {
      kind: 'destroy',
      player: p,
      cardId: old.cardId,
      uid: old.uid,
    });
  }
  ps.powers.push(power);
}

/** カードの処理が終わったあと：捨て札・除外・パワーとして残す、そして「カードを使うたび」 */
export function finishCard(g: GameState, p: PlayerId, card: CardInst, protectKey: string, depth: number): void {
  const ps = g.players[p];
  const def = g.cards[card.cardId];
  delete g.protect[protectKey];
  let newPower: PowerInst | undefined;
  if (def && !def.stats) {
    const type = classifyCard(def);
    if (type === 'power' || type === 'powerAttack') {
      newPower = {
        uid: newUid(g, 'pw'),
        cardId: card.cardId,
        name: def.name,
        effects: def.effects.filter((e) => isPowerTiming(e.timing, 'spell')).map((effect) => ({ effect, removed: false })),
        drawbacks: def.drawbacks.filter((d) => isPowerTiming(d.timing, 'spell')),
      };
      if (newPower.effects.length > 0 || newPower.drawbacks.length > 0) {
        const life = lifespanOf(def);
        if (life !== undefined) newPower.life = life;
        addPower(g, p, newPower, depth);
        log(g, depth, `「${def.name}」はパワーとして場に残り、カードは除外された${life !== undefined ? `（寿命${life}）` : ''}`);
      } else {
        log(g, depth, `「${def.name}」は除外された`);
      }
      ps.exile.push(card);
    } else if (def.drawbacks.some((d) => getDrawback(d.id)?.battle.exhaust)) {
      // 廃棄：捨て札ではなく除外へ
      g.players[card.owner].exile.push(card);
      log(g, depth, `廃棄：「${def.name}」は除外された`);
    } else {
      discardCard(g, card);
    }
  }
  enqueuePowers(g, p, 'cardPlayed', depth, { excludeUid: newPower?.uid });
  // 自分がパワー／スキルを使うたび：パワー（いま置いたものを除く）→ 場のモンスター（左から）
  const type = def ? classifyCard(def) : null;
  const timing = type === 'power' || type === 'powerAttack' ? 'powerPlayed' : type === 'skill' ? 'skillPlayed' : null;
  if (timing) {
    enqueuePowers(g, p, timing, depth, { excludeUid: newPower?.uid });
    enqueueMonsters(g, p, timing, depth);
  }
  // コスト3以上のカードを使うたび（演目。MTG 要素 ○ バッチA）：印刷コストで判定。いま置いたパワー・いま出たモンスター自身は除く
  if (def && def.cost >= BALANCE.timingParams.bigCardCost) {
    enqueuePowers(g, p, 'bigCardPlayed', depth, { excludeUid: newPower?.uid });
    enqueueMonsters(g, p, 'bigCardPlayed', depth, def.stats ? { excludeUid: card.uid } : {});
  }
}

/** ノイズの除外（カードを使ったことには数えない：決定事項 #45） */
export function validateRemoveNoise(g: GameState, p: PlayerId, cardUid: string): string | null {
  const ps = g.players[p];
  const card = ps.hand.find((c) => c.uid === cardUid);
  if (!card || card.cardId !== NOISE_CARD_ID) return 'そのノイズは手札にありません';
  if (ps.energy < BALANCE.battle.noiseRemoveCost) return 'エナジーが足りません';
  return null;
}

export function removeNoise(g: GameState, p: PlayerId, cardUid: string): void {
  const ps = g.players[p];
  const i = ps.hand.findIndex((c) => c.uid === cardUid);
  const [card] = ps.hand.splice(i, 1);
  ps.energy -= BALANCE.battle.noiseRemoveCost;
  ps.exile.push(card!);
  log(g, 0, `${ps.name}はエナジー${BALANCE.battle.noiseRemoveCost}を払ってノイズを除外した`, 'action');
}

