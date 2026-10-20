/**
 * 章や数えを持つパワー（MTG 要素 ○ バッチC2）：英雄譚（第1章→第2章→第3章）と蓄積カウンター。
 * どちらも状態は PowerInst（chapter・charge）に持ち、公開情報。
 */
import { BALANCE } from '../balance.ts';
import { CHAPTER_TIMINGS, CONDITIONS, chapterOf, chargeSpec, type ChargeEvent } from '../options.ts';
import { getAbility } from '../registry.ts';
import type { AltWinGoal } from '../define.ts';
import type { AbilityInstance, CardDef } from '../types.ts';
import { checkCondition } from './conditions.ts';
import { endGame, enqueue, log, monsterLabel, newUid, sourceOfMonster } from './core.ts';
import { enqueueCardTiming, powerDormant, powerSource } from './triggers.ts';
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
  const why =
    step.why === 'trap' ? `罠『${power.name}』が発動して消えた` : step.why === 'loyalty' ? `『${power.name}』は忠誠が0になって消えた` : `プラン『${power.name}』が果たされて消えた`;
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

// ---------------------------------------------------------------- MTG 要素 △ バッチC：紋章・特殊勝利・達成・忠誠

/** 紋章のカードか */
export function isEmblemCard(def: CardDef | undefined): boolean {
  return (def?.abilities ?? []).some((a) => getAbility(a.id)?.battle.emblem === true);
}

/** 紋章がもう上限まであるか */
export function emblemFull(g: GameState, p: PlayerId): boolean {
  return (g.players[p].emblems ?? []).length >= BALANCE.battle.maxEmblems;
}

/** 特殊勝利の目標（特殊勝利のカードでなければ undefined） */
export function altWinGoalOf(def: CardDef | undefined): AltWinGoal | undefined {
  for (const a of def?.abilities ?? []) {
    const goal = getAbility(a.id)?.battle.altWin?.(a);
    if (goal) return goal;
  }
  return undefined;
}

/** 特殊勝利の目標の数（カードの枚数・ターンの数・モンスターの数） */
export const altWinTarget = (goal: AltWinGoal): number => BALANCE.abilities.altWin.goals[goal];

/** p の特殊勝利のパワー（目標つき） */
function altWinPowers(g: GameState, p: PlayerId): { power: PowerInst; goal: AltWinGoal }[] {
  return g.players[p].powers.flatMap((power) => {
    const goal = altWinGoalOf(g.cards[power.cardId]);
    return goal ? [{ power, goal }] : [];
  });
}

/** 特殊勝利の判定：目標に届いていて、通算ターンが battle.altWinEarliestTurn 以上なら勝つ。勝ったら true */
export function checkAltWin(g: GameState, p: PlayerId, depth: number): boolean {
  if (g.phase !== 'main') return false;
  for (const { power, goal } of altWinPowers(g, p)) {
    if ((power.progress ?? 0) < altWinTarget(goal)) continue;
    if (g.turnIndex < BALANCE.battle.altWinEarliestTurn) {
      log(g, depth, `『${power.name}』は目標に届いたが、通算${BALANCE.battle.altWinEarliestTurn}ターン目より前なので、まだ勝てない`, 'info');
      continue;
    }
    log(g, depth, `特殊勝利：${g.players[p].name}は『${power.name}』の目標を達成した`, 'effect', undefined, { kind: 'altWin', player: p, uid: power.uid, cardId: power.cardId, amount: power.progress ?? 0 });
    endGame(g, p, 'altWin');
    return true;
  }
  return false;
}

/** 進みを変えてログを出す */
function setProgress(g: GameState, p: PlayerId, power: PowerInst, goal: AltWinGoal, value: number, depth: number): void {
  power.progress = value;
  log(g, depth, `『${power.name}』の特殊勝利：${value}/${altWinTarget(goal)}`, 'info', undefined, { kind: 'altWin', player: p, uid: power.uid, cardId: power.cardId, amount: value });
}

/** カードを使い終えたとき：目標「カードを使う」の進み+1（いま置いたパワー自身は数えない）。勝ったら終わる */
export function altWinOnCardPlayed(g: GameState, p: PlayerId, depth: number, excludeUid?: string): void {
  for (const { power, goal } of altWinPowers(g, p)) {
    if (goal !== 'cards' || power.uid === excludeUid) continue;
    setProgress(g, p, power, goal, (power.progress ?? 0) + 1, depth);
  }
  checkAltWin(g, p, depth);
}

/** 自分のターン開始時：目標「ターン開始を迎える」は+1、「モンスターがそろう」は場の数。勝ったら終わる */
export function altWinOnTurnStart(g: GameState, p: PlayerId): void {
  for (const { power, goal } of altWinPowers(g, p)) {
    if (goal === 'turns') setProgress(g, p, power, goal, (power.progress ?? 0) + 1, 1);
    if (goal === 'board') setProgress(g, p, power, goal, g.players[p].board.length, 1);
  }
  checkAltWin(g, p, 1);
}

/** 解除で選べる特殊勝利のパワー（選ばれたらパワーごと消える） */
export function altWinDispelOptions(g: GameState, p: PlayerId): { id: string; label: string; cardId: string }[] {
  return altWinPowers(g, p).map(({ power, goal }) => ({
    id: `altwin:${power.uid}`,
    label: `特殊勝利『${power.name}』（${power.progress ?? 0}/${altWinTarget(goal)}）`,
    cardId: power.cardId,
  }));
}

/** カードの達成の能力（事件・進化）と条件 */
export function achieveOf(def: CardDef | undefined): { a: AbilityInstance; kind: 'quest' | 'evolve'; amount: number } | undefined {
  for (const a of def?.abilities ?? []) {
    const ach = getAbility(a.id)?.battle.achieve;
    if (ach) return { a, kind: ach.kind, amount: ach.amount?.(a) ?? 0 };
  }
  return undefined;
}

/**
 * 持ち主のターン終了時（ターン終了時の効果の前）：達成の判定。事件のパワー（休眠中は判定しない）と進化のモンスター（封印中・裏向きは判定しない）が、
 * 条件を満たしていれば達成（1回きり）。進化は攻撃力・体力+N。「達成したとき」の効果を積む
 */
export function checkAchievements(g: GameState, p: PlayerId): void {
  const ps = g.players[p];
  for (const power of ps.powers) {
    const x = achieveOf(g.cards[power.cardId]);
    if (!x || x.kind !== 'quest' || power.achieved || !x.a.condition || powerDormant(g, p, power)) continue;
    if (!checkCondition(g, p, x.a.condition, { src: powerSource(power, p) })) continue;
    power.achieved = true;
    log(g, 1, `事件『${power.name}』を解明した（${CONDITIONS[x.a.condition].label}）`, 'effect', undefined, { kind: 'achieve', player: p, uid: power.uid, cardId: power.cardId });
    const src = powerSource(power, p);
    const protectKey = newUid(g, 'pk');
    for (const e of power.effects) {
      if (e.removed || e.effect.timing !== 'achievedNow') continue;
      enqueue(g, { t: 'effect', src, effect: e.effect, timing: 'achievedNow', chosen: {}, attackCard: false, protectKey, depth: 2 });
    }
  }
  for (const m of [...ps.board]) {
    if (m.achieved || m.sealed || m.faceDown) continue;
    const def = g.cards[m.card.cardId];
    const x = achieveOf(def);
    if (!def || !x || x.kind !== 'evolve' || !x.a.condition) continue;
    const src = sourceOfMonster(g, m);
    if (!checkCondition(g, p, x.a.condition, { src })) continue;
    m.achieved = true;
    const before = { attack: m.attack, hp: m.hp };
    m.attack += x.amount;
    m.maxHp += x.amount;
    m.hp += x.amount;
    log(g, 1, `${monsterLabel(g, m)}は進化した（${CONDITIONS[x.a.condition].label}）：攻撃力 ${before.attack}→${m.attack}、体力 ${before.hp}→${m.hp}`, 'effect', undefined, {
      kind: 'achieve',
      player: p,
      uid: m.uid,
      cardId: m.card.cardId,
      amount: x.amount,
    });
    enqueueCardTiming(g, src, def, 'achievedNow', {}, 2, {});
  }
}

/** 忠誠：相手のモンスターの攻撃（貫通の余りを含む）で victim の HP が減ったら、victim の忠誠のパワーすべての忠誠−1（0で消える） */
export function loyaltyHit(g: GameState, victim: PlayerId, depth: number): void {
  const ps = g.players[victim];
  for (const power of [...ps.powers]) {
    if (power.loyalty === undefined) continue;
    power.loyalty -= 1;
    log(g, depth, `『${power.name}』の忠誠−1（攻撃を受けた）：忠誠${power.loyalty}`, 'info', undefined, { kind: 'loyalty', player: victim, uid: power.uid, cardId: power.cardId, amount: power.loyalty });
    if (power.loyalty <= 0) {
      ps.powers = ps.powers.filter((x) => x !== power);
      log(g, depth, `『${power.name}』は忠誠が0になって消えた`, 'effect', undefined, { kind: 'destroy', player: victim, cardId: power.cardId, uid: power.uid });
    }
  }
}
