/**
 * 章や数えを持つパワー（MTG 要素 ○ バッチC2）：英雄譚（第1章→第2章→第3章）と蓄積カウンター。
 * どちらも状態は PowerInst（chapter・charge）に持ち、公開情報。
 */
import { BALANCE } from '../balance.ts';
import { CHAPTER_TIMINGS, chapterOf, chargeSpec, type ChargeEvent } from '../options.ts';
import type { CardDef } from '../types.ts';
import { enqueue, log, newUid } from './core.ts';
import { powerDormant, powerSource } from './triggers.ts';
import type { GameState, PlayerId, PowerInst, Step } from './types.ts';

/** 英雄譚の最後の章（カードの章の効果の最大の番号。英雄譚でなければ0） */
export function lastChapter(def: CardDef | undefined): number {
  let n = 0;
  for (const e of def?.effects ?? []) n = Math.max(n, chapterOf(e.timing));
  return n;
}

/** この章の効果を積む（解除された効果は出ない）。最後の章なら、そのあとに英雄譚を終える処理を積む */
function enqueueChapter(g: GameState, p: PlayerId, power: PowerInst, chapter: number, depth: number): void {
  const def = g.cards[power.cardId];
  const last = lastChapter(def);
  const timing = CHAPTER_TIMINGS[chapter - 1]!;
  log(g, depth, `英雄譚『${power.name}』：第${chapter}章${last > 0 ? `（全${last}章）` : ''}`, 'effect', undefined, {
    kind: 'saga',
    player: p,
    cardId: power.cardId,
    uid: power.uid,
    amount: chapter,
  });
  const src = powerSource(power, p);
  const protectKey = newUid(g, 'pk');
  for (const x of power.effects) {
    if (x.removed || x.effect.timing !== timing) continue;
    enqueue(g, { t: 'effect', src, effect: x.effect, timing, chosen: {}, attackCard: false, protectKey, depth: depth + 1 });
  }
  if (chapter >= last) enqueue(g, { t: 'sagaEnd', player: p, powerUid: power.uid, depth });
}

/** 英雄譚を置いたとき：第1章 */
export function startSaga(g: GameState, p: PlayerId, power: PowerInst, depth: number): void {
  if (lastChapter(g.cards[power.cardId]) === 0) return;
  power.chapter = 1;
  enqueueChapter(g, p, power, 1, depth);
}

/** 持ち主のターン開始時：英雄譚を1章進める（使った順）。休眠中（MTG 要素 △ バッチA）は進まない */
export function advanceSagas(g: GameState, p: PlayerId): void {
  for (const power of g.players[p].powers) {
    if (power.chapter === undefined || powerDormant(g, p, power)) continue;
    const last = lastChapter(g.cards[power.cardId]);
    if (power.chapter >= last) continue;
    power.chapter += 1;
    enqueueChapter(g, p, power, power.chapter, 1);
  }
}

/** まだ最後の章まで進んでいない英雄譚（効果「章を進める」の候補。MTG 要素 △ バッチA） */
export function advanceableSagas(g: GameState, p: PlayerId): PowerInst[] {
  return g.players[p].powers.filter((pw) => pw.chapter !== undefined && pw.chapter < lastChapter(g.cards[pw.cardId]));
}

/** 英雄譚1つを次の章に進めて、その章の効果を積む（効果「章を進める」。最後の章なら英雄譚を終える処理も） */
export function advanceOne(g: GameState, p: PlayerId, powerUid: string, depth: number): void {
  const power = g.players[p].powers.find((x) => x.uid === powerUid);
  if (!power || power.chapter === undefined) return;
  const last = lastChapter(g.cards[power.cardId]);
  if (power.chapter >= last) return;
  power.chapter += 1;
  enqueueChapter(g, p, power, power.chapter, depth);
}

/** パワーを誘発なしで取り除く（罠・プラン。MTG 要素 △ バッチA）。もう無ければ何もしない */
export function executePowerGone(g: GameState, step: Extract<Step, { t: 'powerGone' }>): void {
  const ps = g.players[step.player];
  const power = ps.powers.find((x) => x.uid === step.powerUid);
  if (!power) return;
  ps.powers = ps.powers.filter((x) => x !== power);
  const why = step.why === 'trap' ? `罠『${power.name}』が発動して消えた` : `プラン『${power.name}』が果たされて消えた`;
  log(g, step.depth, why, 'effect', undefined, { kind: 'destroy', player: step.player, cardId: power.cardId, uid: power.uid });
}

/** 英雄譚を終える：最後の章を解決し終えたらパワーを消す（誘発なし）。もう無ければ何もしない */
export function endSaga(g: GameState, p: PlayerId, powerUid: string, depth: number): void {
  const ps = g.players[p];
  const power = ps.powers.find((x) => x.uid === powerUid);
  if (!power) return;
  ps.powers = ps.powers.filter((x) => x !== power);
  log(g, depth, `英雄譚『${power.name}』は終わった`, 'effect', undefined, { kind: 'destroy', player: p, cardId: power.cardId, uid: power.uid });
}

/**
 * 蓄積カウンター：出来事 event のたびに、その出来事でたまる自分のパワーに1つ足す（1つにつき1ターン maxRepeatTriggersPerTurn 回まで）。
 * 必要数に達したら「蓄積がたまったとき」の効果を積み、0に戻す。excludeUid はいま置いたパワー（「カードを使うたび」で自分は数えない）
 */
export function chargePowers(g: GameState, p: PlayerId, event: ChargeEvent, depth: number, excludeUid?: string): void {
  if (g.phase !== 'main') return;
  const max = BALANCE.battle.maxRepeatTriggersPerTurn;
  for (const power of g.players[p].powers) {
    if (power.uid === excludeUid || powerDormant(g, p, power)) continue;
    const def = g.cards[power.cardId];
    const a = (def?.abilities ?? []).find((x) => x.id === 'charge');
    if (!a) continue;
    const spec = chargeSpec([a]);
    if (spec.event !== event) continue;
    const t = power.chargeTicks && power.chargeTicks.turnIndex === g.turnIndex ? { ...power.chargeTicks } : { turnIndex: g.turnIndex, count: 0 };
    if (t.count >= max) continue;
    t.count += 1;
    power.chargeTicks = t;
    const now = (power.charge ?? 0) + 1;
    if (now < spec.need) {
      power.charge = now;
      log(g, depth, `『${power.name}』の蓄積：${now}/${spec.need}`, 'info', undefined, { kind: 'charge', player: p, uid: power.uid, cardId: power.cardId, amount: now });
      continue;
    }
    power.charge = 0;
    log(g, depth, `『${power.name}』の蓄積が${spec.need}たまった`, 'effect', undefined, { kind: 'charge', player: p, uid: power.uid, cardId: power.cardId, amount: spec.need });
    const src = powerSource(power, p);
    const protectKey = newUid(g, 'pk');
    for (const x of power.effects) {
      if (x.removed || x.effect.timing !== 'charged') continue;
      enqueue(g, { t: 'effect', src, effect: x.effect, timing: 'charged', chosen: {}, attackCard: false, protectKey, depth: depth + 1 });
    }
    // プラン（1回きり。MTG 要素 △ バッチA）：効果を出したらパワーは消える
    if (spec.once) enqueue(g, { t: 'powerGone', player: p, powerUid: power.uid, depth, why: 'plan' });
  }
}
