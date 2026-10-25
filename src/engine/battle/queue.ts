/** 解決キュー：積まれた処理を先頭から順に実行し、選択が要れば止まる */
import { BALANCE } from '../balance.ts';
import type { EffectDef } from '../define.ts';
import { effectModifiers } from '../points.ts';
import { getDrawback, getEffect, getModifier } from '../registry.ts';
import { describeDrawback, describeEffect, modeTexts } from '../text.ts';
import type { EffectInstance } from '../types.ts';
import { checkCondition } from './conditions.ts';
import { destroyMonster, keywordFlags } from './damage.ts';
import { cardName, checkGameEnd, enqueue, findMonster, log, monsterLabel, newUid, other, playRecord, sourceFields } from './core.ts';
import { executeFreePlay, finishCard } from './play.ts';
import { makeRuntime, resolveTargets, tribeAllies } from './runtime.ts';
import { endSaga, executePowerGone } from './powers.ts';
import { randInt } from './rng.ts';
import { retainOptions, runAutoAttacks, turnEndEffects, turnEndFinish } from './turn.ts';
import { bounce, createTokens, discardCard, discardChosen } from './zones.ts';
import { classifyCard } from '../classify.ts';
import { CONDITIONS, MODE_TIMINGS, REPEAT_CAPPED_TIMINGS } from '../options.ts';
import { NOISE_CARD_ID, type DelayedEffect, type GameState, type LogEvent, type SourceRef, type Step } from './types.ts';

/** 1回の行動で処理する上限（効果の無限ループを防ぐ） */
const MAX_STEPS = 5000;

export function runQueue(g: GameState): void {
  let count = 0;
  while (g.queue.length > 0 && !g.pending && g.phase !== 'ended') {
    if (++count > MAX_STEPS) {
      log(g, 0, '処理が多すぎるため打ち切りました', 'info');
      g.queue = [];
      break;
    }
    const step = g.queue.shift()!;
    g.qInsert = 0;
    executeStep(g, step);
  }
  g.qInsert = 0;
}

function executeStep(g: GameState, step: Step): void {
  switch (step.t) {
    case 'effect':
      return executeEffect(g, step);
    case 'drawback':
      return executeDrawback(g, step);
    case 'cardDone':
      return finishCard(g, step.player, step.card, step.protectKey, step.depth, step.from ?? 'hand', step.adventure === true, step.faceDown === true);
    case 'freePlay':
      return executeFreePlay(g, step);
    case 'returnToHand':
      return executeReturnToHand(g, step);
    case 'reboundDone':
      discardCard(g, step.card);
      log(g, step.depth, `反復を終えた「${cardName(g, step.card.cardId)}」は捨て札に置かれた`, 'info');
      return;
    case 'sagaEnd':
      return endSaga(g, step.player, step.powerUid, step.depth);
    case 'powerGone':
      return executePowerGone(g, step);
    case 'autoAttacks':
      return runAutoAttacks(g, step.player);
    case 'turnEndEffects':
      return turnEndEffects(g, step.player);
    case 'retain':
      return executeRetain(g, step);
    case 'discardChoice':
      return executeDiscardChoice(g, step);
    case 'exploitChoice':
      return executeExploitChoice(g, step);
    case 'turnEndFinish':
      return turnEndFinish(g, step.player, step.kept);
    // MTG 要素 △ バッチB
    case 'devourChoice':
      return executeDevourChoice(g, step);
    case 'villainChoice':
      return executeVillainChoice(g, step);
    case 'evokeEnd':
      return executeEvokeEnd(g, step);
  }
}

/**
 * 数値の倍数（X・相手モンスター1体につき・このターン使ったカード1枚につき）。付いていなければ null。
 * 掛けた値は効果の入力欄の上限まで（ダメージ系で回数のあるものは、値×回数が1枚のダメージの上限まで）
 */
function scaledEffect(g: GameState, step: Extract<Step, { t: 'effect' }>, def: EffectDef): { effect: EffectInstance; factor: number; why: string } | null {
  const scale = effectModifiers(step.effect).find((m) => m.scope === 'scale');
  if (!scale) return null;
  const me = step.src.controller;
  const cap = BALANCE.modifierParams.scaleCountCap;
  let factor = 0;
  let why = '';
  switch (scale.id) {
    case 'xEnergy':
      factor = step.protectKey ? (g.protect[step.protectKey]?.x ?? 0) : 0;
      why = `X＝${factor}`;
      break;
    case 'perEnemyMonster': {
      const count = g.players[other(me)].board.length;
      factor = Math.min(count, cap);
      why = `相手モンスター${count}体${count > cap ? `（最大${cap}）` : ''}`;
      break;
    }
    case 'perCardPlayed': {
      const count = g.active === me ? g.players[me].turn.cardsPlayed : 0;
      factor = Math.min(count, cap);
      why = g.active === me ? `このターン使ったカード${count}枚${count > cap ? `（最大${cap}）` : ''}` : '相手のターン';
      break;
    }
    case 'perDiscardMonster': {
      const dcap = BALANCE.modifierParams.discardCountCap;
      const count = g.players[me].discard.filter((c) => c.cardId !== NOISE_CARD_ID && g.cards[c.cardId]?.stats).length;
      factor = Math.min(count, dcap);
      why = `捨て札のモンスター${count}枚${count > dcap ? `（最大${dcap}）` : ''}`;
      break;
    }
    case 'perTribeAlly': {
      // 同じ種族の自分のモンスター（自分自身を含む。MTG 要素 ○ バッチC2）
      const count = tribeAllies(g, me, step.src.cardId).length;
      factor = Math.min(count, cap);
      why = `同じ種族の自分のモンスター${count}体${count > cap ? `（最大${cap}）` : ''}`;
      break;
    }
    case 'perExp': {
      // 経験1につき（MTG 要素 △ バッチA）
      const ecap = BALANCE.modifierParams.expCountCap;
      const count = g.players[me].exp ?? 0;
      factor = Math.min(count, ecap);
      why = `経験${count}${count > ecap ? `（最大${ecap}）` : ''}`;
      break;
    }
    case 'gamble': {
      // ばらつき（MTG 要素 △ バッチA）：決めた倍率を掛けて、量の刻みに切り捨てる（最低も刻み）
      const rate = step.gambleRate ?? 1;
      const unit = Math.max(1, Math.floor(BALANCE.modifierParams.gambleStep));
      const raw = (step.effect.value ?? 0) * rate;
      const max = def.value?.max ?? Infinity;
      const value = Math.min(max, Math.max(unit, Math.floor(raw / unit) * unit));
      return { effect: { ...step.effect, value }, factor: rate, why: 'ばらつき' };
    }
    default:
      return null;
  }
  const base = step.effect.value ?? 0;
  let max = def.value?.max ?? Infinity;
  if (def.isDamage && def.hits) max = Math.min(max, Math.floor(BALANCE.params.damagePerCardMax / Math.max(1, step.effect.hits ?? 1)));
  const value = Math.min(base * factor, max);
  return { effect: { ...step.effect, value }, factor, why };
}

/** 場を離れたモンスター（全体破壊でいっしょに消えたものなど）の、繰り返し誘発の効果は発動しない */
function sourceGone(g: GameState, step: Extract<Step, { t: 'effect' }>): boolean {
  return step.src.kind === 'monster' && REPEAT_CAPPED_TIMINGS.includes(step.timing) && !findMonster(g, step.src.uid);
}

/** 成長（MTG 要素 ○ バッチB）：使ったカードの個体の分だけ、ダメージ・連撃の数値を足した写し */
function grownStep(step: Extract<Step, { t: 'effect' }>, def: EffectDef): Extract<Step, { t: 'effect' }> {
  if (!step.grow || !def.isDamage) return step;
  return { ...step, effect: { ...step.effect, value: (step.effect.value ?? 0) + step.grow } };
}

/** 一撃離脱（MTG 要素 ○ バッチB）：攻撃したモンスターが場に残っていて封印されていなければ、持ち主の手札に戻す。トークンは残る */
function executeReturnToHand(g: GameState, step: Extract<Step, { t: 'returnToHand' }>): void {
  const m = findMonster(g, step.uid);
  if (!m || m.card.token || !keywordFlags(g, m).returnAfterAttack) return;
  log(g, step.depth, `一撃離脱：${monsterLabel(g, m)}は攻撃を終えて手札に戻る`, 'effect', undefined, { kind: 'keyword', keywordId: 'hitAndRun', player: m.controller, target: { kind: 'monster', uid: m.uid } });
  bounce(g, m.uid, step.depth + 1);
}

function executeEffect(g: GameState, original: Extract<Step, { t: 'effect' }>): void {
  const def = getEffect(original.effect.id);
  if (!def) return;
  // ばらつき（MTG 要素 △ バッチA）：倍率は最初に1回だけ決める（選択で止まって再開しても振り直さない）
  if (original.gambleRate === undefined && !original.picks && effectModifiers(original.effect).some((m) => m.id === 'gamble')) {
    const rates = BALANCE.modifierParams.gambleRates;
    original.gambleRate = rates[randInt(g, rates.length)]!;
  }
  const step = grownStep(original, def);
  const me = step.src.controller;
  /** 演出の出来事（決定事項 #126）：効果の見出しの行に付け、対象が決まったら targets を足す。選択で止まって再開したときは無い */
  let head: LogEvent | undefined;
  if (!step.picks) {
    if (sourceGone(g, step)) return;
    head = { kind: 'effect', effectId: def.id, ...sourceFields(g, step.src) };
    log(g, step.depth, `${step.src.name}：${describeEffect(step.effect, g.cards[step.src.cardId])}`, 'effect', undefined, head);
    const opts = { roll: { depth: step.depth + 1 }, src: step.src, ...(step.protectKey ? { protectKey: step.protectKey } : {}) };
    // 切除（MTG 要素 △ バッチB）：このカードの使用時・召喚時・捨て札から使ったときの効果は、条件を無視する
    const cleaved = step.effect.condition !== null && step.protectKey !== undefined && g.protect[step.protectKey]?.cleaved === true && MODE_TIMINGS.includes(step.timing);
    if (cleaved) log(g, step.depth + 1, `切除：条件「${CONDITIONS[step.effect.condition!].label}」を無視する`, 'info');
    if (step.effect.condition && !cleaved && !checkCondition(g, me, step.effect.condition, opts)) {
      log(g, step.depth + 1, `条件「${CONDITIONS[step.effect.condition].label}」を満たさないため発動しない`);
      return;
    }
    if (step.grow && def.isDamage) log(g, step.depth + 1, `成長：数値+${step.grow}`, 'info');
  }
  // 数値の倍数：効果ファイルには掛けたあとの値の写しを渡す
  const scaled = scaledEffect(g, step, def);
  if (scaled && !step.picks) {
    if (scaled.factor <= 0) {
      log(g, step.depth + 1, `${scaled.why}：数値が0のため不発`);
      return;
    }
    log(g, step.depth + 1, `${scaled.why}：数値 ${step.effect.value ?? 0}×${scaled.factor} → ${scaled.effect.value ?? 0}`);
  }
  if (scaled && scaled.factor <= 0) return;
  // 次のターンに（遅延）：条件と数値の倍数はいま決め、次の自分のターン開始時に発動させる（MTG 要素 ○ バッチA）
  if (!step.picks && effectModifiers(step.effect).some((m) => m.scope === 'delay')) {
    reserve(g, step, scaled?.effect ?? step.effect);
    return;
  }
  const effect = scaled?.effect ?? step.effect;
  const targets = resolveTargets(g, step.src, effect, step.timing, def.targetRule, step.chosen);
  const rt = makeRuntime(g, step.src, targets, {
    depth: step.depth + 1,
    attackCard: step.attackCard,
    ...(step.protectKey ? { protectKey: step.protectKey } : {}),
  });
  if (def.targetRule !== 'self' && def.targetRule !== 'enemyPlayer' && targets.length === 0 && !def.resolveWithoutTargets) {
    log(g, step.depth + 1, '対象がいないため何も起きない');
    return;
  }
  if (head) {
    head.targets = targets.map((t) => ({ ...t }));
    if (effect.value !== undefined) head.amount = effect.value;
  }
  let picks = step.picks;
  if (!picks && def.battle.choose) {
    const spec = def.battle.choose(rt, effect);
    if (spec) {
      if (spec.options.length === 0) {
        log(g, step.depth + 1, '選べるものがないため何も起きない');
        return;
      }
      if (spec.options.length === 1 && spec.min >= 1) {
        picks = [spec.options[0]!.id];
      } else {
        g.pending = { player: me, prompt: spec.prompt, options: spec.options, min: spec.min, max: spec.max, step: original };
        return;
      }
    }
  }
  // 効果1つを処理し終えてから勝敗を判定する（全体ダメージで両者が同時にHP0なら引き分け）
  g.holdEnd += 1;
  try {
    def.battle.resolve(rt, effect, picks);
    // お互い：相手にも同じ効果（使った人と相手を入れ替えて、もう一度。上限はそれぞれのプレイヤーで数える）
    if (effect.target === 'bothPlayers' && g.phase !== 'ended') {
      const swapped: SourceRef = { ...step.src, controller: other(me) };
      log(g, step.depth + 1, `${g.players[other(me)].name}にも同じ効果`);
      const targets2 = resolveTargets(g, swapped, effect, step.timing, def.targetRule, {});
      if (head) head.targets = [...(head.targets ?? []), ...targets2.map((t) => ({ ...t }))];
      const rt2 = makeRuntime(g, swapped, targets2, { depth: step.depth + 1, attackCard: false });
      def.battle.resolve(rt2, effect, undefined);
    }
    // 奮励（MTG 要素 △ バッチB）：「選んだ1体（相手）」の効果を、ランダムな別の相手モンスターにも（重複なし。いなければ減る）
    const strive = step.protectKey !== undefined ? (g.protect[step.protectKey]?.strive ?? 0) : 0;
    if (strive > 0 && effect.target === 'chosen' && STRIVE_RULES.includes(def.targetRule) && MODE_TIMINGS.includes(step.timing) && g.phase !== 'ended') {
      const chosenUid = step.chosen.enemy?.kind === 'monster' ? step.chosen.enemy.uid : undefined;
      const pool = g.players[other(me)].board.filter((m) => m.uid !== chosenUid);
      for (let i = 0; i < strive && pool.length > 0 && (g.phase as string) !== 'ended'; i++) {
        const [m] = pool.splice(randInt(g, pool.length), 1);
        log(g, step.depth + 1, `奮励：${monsterLabel(g, m!)}にも同じ効果`, 'effect', undefined, { kind: 'effect', effectId: def.id, ...sourceFields(g, step.src), targets: [{ kind: 'monster', uid: m!.uid }] });
        const rt2 = makeRuntime(g, step.src, [{ kind: 'monster', uid: m!.uid }], { depth: step.depth + 1, attackCard: false, ...(step.protectKey ? { protectKey: step.protectKey } : {}) });
        def.battle.resolve(rt2, effect, picks);
      }
    }
  } finally {
    g.holdEnd -= 1;
  }
  checkGameEnd(g);
}

/** 奮励で追加の対象を取る作用先（相手側の「選んだ1体」） */
const STRIVE_RULES: readonly string[] = ['enemyAny', 'enemyMonster', 'enemyMonsterOne'];

/** 貪食（MTG 要素 △ バッチB）：出たモンスターが、自分の他のモンスターを0〜max体生け贄にする。1体につき攻撃力と体力+amount */
function executeDevourChoice(g: GameState, step: Extract<Step, { t: 'devourChoice' }>): void {
  const ps = g.players[step.player];
  const self = findMonster(g, step.uid);
  if (!self || self.controller !== step.player) return;
  const others = ps.board.filter((m) => m.uid !== step.uid && (step.among === undefined || step.among.includes(m.uid)));
  if (step.picks) {
    const eaten = step.picks.map((uid) => others.find((m) => m.uid === uid)).filter((m): m is NonNullable<typeof m> => m !== undefined);
    if (eaten.length === 0) {
      log(g, step.depth, `貪食：${ps.name}は生け贄にしなかった`);
      return;
    }
    for (const m of eaten) {
      log(g, step.depth, `貪食：${monsterLabel(g, m)}を生け贄にした`);
      destroyMonster(g, m, step.depth + 1, true);
    }
    const me = findMonster(g, step.uid);
    if (!me) return;
    const n = step.amount * eaten.length;
    const before = { attack: me.attack, hp: me.hp };
    me.attack += n;
    me.hp += n;
    me.maxHp += n;
    log(g, step.depth, `貪食：${monsterLabel(g, me)}の攻撃力 ${before.attack}→${me.attack}、体力 ${before.hp}→${me.hp}`, 'effect', undefined, {
      kind: 'status',
      target: { kind: 'monster', uid: me.uid },
      status: 'devour',
      amount: n,
    });
    checkGameEnd(g);
    return;
  }
  if (others.length === 0) return;
  g.pending = {
    player: step.player,
    prompt: `貪食：「${cardName(g, self.card.cardId)}」に食べさせる自分のモンスターを${Math.min(step.max, others.length)}体まで選んでください（1体につき攻撃力・体力+${step.amount}。選ばなくてもよい）`,
    options: others.map((m) => ({ id: m.uid, label: cardName(g, m.card.cardId), cardId: m.card.cardId })),
    min: 0,
    max: Math.min(step.max, others.length),
    step,
  };
}

/** 最悪の二択（MTG 要素 △ バッチB）：相手がモードを選び、そのモードの効果を積む */
function executeVillainChoice(g: GameState, step: Extract<Step, { t: 'villainChoice' }>): void {
  const def = g.cards[step.src.cardId];
  if (!def) return;
  const texts = modeTexts(def, step.timing);
  if (texts.length === 0) return;
  if (!step.picks) {
    g.pending = {
      player: step.player,
      prompt: `最悪の二択：${g.players[step.user].name}の「${def.name}」のどちらかを選んでください（選んだ方の効果があなたに向けて出ます）`,
      options: texts.map((m) => ({ id: String(m.mode), label: `${m.label}：${m.text}` })),
      min: 1,
      max: 1,
      step,
    };
    return;
  }
  const mode = Number(step.picks[0]);
  const chosenText = texts.find((m) => m.mode === mode) ?? texts[0]!;
  playRecord(g, step.protectKey).mode = chosenText.mode;
  log(g, step.depth, `最悪の二択：${g.players[step.player].name}はモード${chosenText.label}を選んだ`, 'effect', undefined, {
    kind: 'status',
    player: step.player,
    cardId: step.src.cardId,
    status: 'villain',
    amount: chosenText.mode,
  });
  for (const effect of def.effects.filter((e) => e.timing === step.timing && e.mode === chosenText.mode)) {
    enqueue(g, {
      t: 'effect',
      src: step.src,
      effect,
      timing: step.timing,
      chosen: step.chosen,
      attackCard: step.attackCard,
      protectKey: step.protectKey,
      depth: step.depth,
      ...(step.grow ? { grow: step.grow } : {}),
    });
  }
}

/** 想起（MTG 要素 △ バッチB）：召喚時の効果のあと、そのモンスターが場にいれば破壊する（不壊でも止まらない＝生け贄と同じ） */
function executeEvokeEnd(g: GameState, step: Extract<Step, { t: 'evokeEnd' }>): void {
  const m = findMonster(g, step.uid);
  if (!m) return;
  log(g, step.depth, `想起：${monsterLabel(g, m)}は破壊される`);
  destroyMonster(g, m, step.depth + 1, true);
  checkGameEnd(g);
}

/** 効果を予約する（次の自分のターン開始時に発動）。予約は1人 battle.maxDelayedPerPlayer 件まで */
function reserve(g: GameState, step: Extract<Step, { t: 'effect' }>, effect: EffectInstance): void {
  const me = step.src.controller;
  const ps = g.players[me];
  const max = BALANCE.battle.maxDelayedPerPlayer;
  const list = ps.delayed ?? [];
  if (list.length >= max) {
    log(g, step.depth + 1, `予約は${max}件までなので、この効果は予約できない`);
    return;
  }
  // 遅延・数値の倍数（値は確定済み）・条件（判定済み）を外した写し
  const mods = (effect.mods ?? []).filter((m) => {
    const scope = getModifier(m)?.scope;
    return scope !== 'delay' && scope !== 'scale';
  });
  const copy: EffectInstance = { ...effect, condition: null };
  if (mods.length > 0) copy.mods = mods;
  else delete copy.mods;
  const entry: DelayedEffect = {
    id: newUid(g, 'dl'),
    src: step.src,
    effect: copy,
    timing: step.timing,
    chosen: step.chosen,
    label: `${step.src.name}：${describeEffect(copy)}`,
  };
  ps.delayed = [...list, entry];
  log(g, step.depth + 1, `予約：次のターン開始時に「${describeEffect(copy).replace(/。$/, '')}」`, 'effect', undefined, {
    kind: 'status',
    player: me,
    status: 'delayed',
    amount: ps.delayed.length,
  });
}

/** 濫用：自分のモンスター1体を生け贄にしてよい（選ばなくてもよい）。場にいなければ選ばずに終わる */
function executeExploitChoice(g: GameState, step: Extract<Step, { t: 'exploitChoice' }>): void {
  const ps = g.players[step.player];
  if (step.picks) {
    const uid = step.picks[0];
    const m = uid ? findMonster(g, uid) : undefined;
    if (!m || m.controller !== step.player) {
      log(g, step.depth, `${ps.name}は生け贄にしなかった`);
      return;
    }
    log(g, step.depth, `濫用：${monsterLabel(g, m)}を生け贄にした`);
    playRecord(g, step.protectKey).exploited = true;
    // 生け贄は不壊でも止まらない（MTG 要素 △ バッチA）
    destroyMonster(g, m, step.depth + 1, true);
    checkGameEnd(g);
    return;
  }
  if (ps.board.length === 0) return;
  g.pending = {
    player: step.player,
    prompt: '濫用：生け贄にする自分のモンスターを選んでください（選ばなくてもよい）',
    options: ps.board.map((m) => ({ id: m.uid, label: cardName(g, m.card.cardId), cardId: m.card.cardId })),
    min: 0,
    max: 1,
    step,
  };
}

function executeDrawback(g: GameState, step: Extract<Step, { t: 'drawback' }>): void {
  const def = getDrawback(step.drawback.id);
  if (!def?.battle.resolve) return;
  const me = step.src.controller;
  const s = g.players[me].status;
  const before = { poison: s.poison, burn: s.burn };
  if (!step.picks) log(g, step.depth, `${step.src.name}のデメリット：${describeDrawback(step.drawback)}`, 'effect', undefined, { kind: 'drawback', drawbackId: step.drawback.id, ...sourceFields(g, step.src) });
  const rt = makeRuntime(g, step.src, [], { depth: step.depth + 1, attackCard: false });
  // 選択が要るデメリット（生け贄）
  let picks = step.picks;
  if (!picks && def.battle.choose) {
    const spec = def.battle.choose(rt, step.drawback);
    if (spec) {
      if (spec.options.length === 0) {
        log(g, step.depth + 1, '選べるものがないため何も起きない');
        return;
      }
      if (spec.options.length === 1 && spec.min >= 1) {
        picks = [spec.options[0]!.id];
      } else {
        g.pending = { player: me, prompt: spec.prompt, options: spec.options, min: spec.min, max: spec.max, step };
        return;
      }
    }
  }
  def.battle.resolve(rt, step.drawback, picks);
  // このデメリットで付いた毒・やけどは、同じカードの浄化では消えない（決定事項 #34）
  if (step.protectKey) {
    const rec = playRecord(g, step.protectKey);
    rec.poison += Math.max(0, s.poison - before.poison);
    rec.burn += Math.max(0, s.burn - before.burn);
  }
}

/** 手札を選んで捨てる（手札整理）。手札が足りなければあるだけ */
function executeDiscardChoice(g: GameState, step: Extract<Step, { t: 'discardChoice' }>): void {
  const ps = g.players[step.player];
  const n = Math.min(step.count, ps.hand.length);
  const done = (uids: string[]) => {
    const cards = uids.map((uid) => ps.hand.find((c) => c.uid === uid)).filter((c) => c !== undefined);
    discardChosen(g, step.player, uids, step.depth);
    // 徴募（MTG 要素 ○ バッチB）：捨てたのがスキルなら小鬼を出す
    if (step.then === 'recruit') {
      const skill = cards.some((c) => {
        const def = g.cards[c.cardId];
        return def !== undefined && c.cardId !== NOISE_CARD_ID && classifyCard(def) === 'skill';
      });
      const stat = BALANCE.effects.recruit.stat;
      if (skill) createTokens(g, step.player, stat, stat, 1, step.depth);
      else log(g, step.depth, '捨てたのはスキルではないので、小鬼は出ない');
    }
  };
  if (step.picks) {
    done(step.picks.slice(0, n));
    return;
  }
  if (n === 0) {
    log(g, step.depth, `${ps.name}は捨てる手札がない`);
    return;
  }
  if (n === ps.hand.length) {
    done(ps.hand.map((c) => c.uid));
    return;
  }
  g.pending = {
    player: step.player,
    prompt: `手札から捨てるカードを${n}枚選んでください`,
    options: ps.hand.map((c) => ({ id: c.uid, label: g.cards[c.cardId]?.name ?? 'ノイズ', cardId: c.cardId })),
    min: n,
    max: n,
    step,
  };
}

function executeRetain(g: GameState, step: Extract<Step, { t: 'retain' }>): void {
  const ps = g.players[step.player];
  const max = Math.min(ps.turn.retain, retainOptions(g, step.player).length);
  if (step.picks || max === 0) {
    const allowed = new Set(retainOptions(g, step.player).map((c) => c.uid));
    const kept = (step.picks ?? []).filter((uid) => allowed.has(uid)).slice(0, max);
    enqueue(g, { t: 'turnEndFinish', player: step.player, kept });
    return;
  }
  g.pending = {
    player: step.player,
    prompt: `手札から残すカードを${max}枚まで選んでください（保持）`,
    options: retainOptions(g, step.player).map((c) => ({ id: c.uid, label: g.cards[c.cardId]?.name ?? 'ノイズ', cardId: c.cardId })),
    min: 0,
    max,
    step,
  };
}
