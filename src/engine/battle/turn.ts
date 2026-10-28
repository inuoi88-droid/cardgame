/** ターンの開始と終了（処理順は決定事項 #28） */
import { BALANCE } from '../balance.ts';
import { getDrawback, getKeyword } from '../registry.ts';
import { cardName, checkGameEnd, endGame, enqueue, log, monsterDormant, monsterLabel, other, playerRef, sourceFields, sourceOfMonster, isEnded, tagLog, turnLimits } from './core.ts';
import { autoAttackTarget, attacksPerTurn, cannotAttack, exerted, performAttack } from './combat.ts';
import { dealDamage, destroyMonster, heal } from './damage.ts';
import { lifespanOf } from './play.ts';
import { randInt } from './rng.ts';
import { makeRuntime } from './runtime.ts';
import { enqueueDelayed, enqueueMonsters, enqueuePowers, powerSource } from './triggers.ts';
import { advanceSagas, altWinOnTurnStart, chargePowers, checkAchievements } from './powers.ts';
import { spiritExtraDraw, tribeTurnEnd, tribeTurnStart } from './tribes.ts';
import { deckToDiscard, discardCard, drawCards, exileFromBoard, hatchEggs, returnBorrowed, vanish, warpAway } from './zones.ts';
import { tickSuspend } from './waiting.ts';
import { dayNightAtTurnEnd, planarTick } from './matchRules.ts';
import { ruleHooks } from './rules.ts';
import { FIELDS } from '../fields.ts';
import { LEADERS } from '../leaders.ts';
import { NOISE_CARD_ID } from './types.ts';
import type { GameState, PlayerId, Statuses } from './types.ts';

const B = BALANCE.battle;

/** そのプレイヤーの n ターン目の基本エナジー（成長表：決定事項 #69） */
export function energyForTurn(turnsTaken: number): number {
  let energy = 0;
  for (const step of B.energySchedule) if (turnsTaken >= step.fromTurn) energy = step.energy;
  return energy;
}

/** 毒・再生の減り方：残す割合を掛けて切り捨て（半減式：決定事項 #69） */
const decay = (value: number, keepRate: number): number => Math.max(0, Math.floor(value * keepRate));

function activate(s: Statuses): void {
  s.freezeActive = s.freezePending;
  s.freezePending = false;
  s.confuseActive = s.confusePending;
  s.confusePending = false;
}

/** extra：追加ターン（MTG 要素 △ バッチC。相手の手番を飛ばして、もう一度自分のターン） */
export function startTurn(g: GameState, p: PlayerId, extra = false): void {
  const ps = g.players[p];
  g.turnIndex += 1;
  g.active = p;
  ps.turnsTaken += 1;
  g.protect = {};
  log(g, 0, `── ${ps.name}の${extra ? '追加' : ''}ターン（${ps.turnsTaken}ターン目）──`, 'turn', undefined, { kind: 'turnStart', player: p, ...(extra ? { extra: true } : {}) });
  // 次元（MTG 要素 △ バッチD）：通算 fields.planarEvery ターンごとに別のフィールドへ
  planarTick(g);

  // シールドと反撃が消える。凍結・混乱が発効する
  ps.shield = 0;
  ps.status.counter = 0;
  activate(ps.status);
  for (const m of ps.board) {
    activate(m.status);
    m.attacksUsed = 0;
    // 守護（MTG 要素 △ バッチA）は持ち主の次のターン開始時に消える
    if (m.guard && ps.turnsTaken >= m.guard.until) {
      delete m.guard;
      log(g, 1, `${monsterLabel(g, m)}の守護が消えた`, 'info');
    }
  }
  ps.turn = { cardsPlayed: 0, retain: 0, freezeTax: ps.status.freezeActive };
  if (ps.status.freezeActive) log(g, 1, `${ps.name}は凍結している：最初に使うカードのコスト+${B.freezeCostIncrease}`);

  // 特殊勝利（MTG 要素 △ バッチC）：ターン開始を迎えた数・場のモンスターの数
  altWinOnTurnStart(g, p);
  if (isEnded(g)) return;

  // 毒（シールド・無効化を貫通）。その後、半分（切り捨て）になる
  if (ps.status.poison > 0) {
    dealDamage(g, playerRef(p), ps.status.poison, { kind: 'poison', source: null, depth: 1 });
    ps.status.poison = decay(ps.status.poison, B.poisonKeepRate);
    if (isEnded(g)) return;
  }
  for (const m of [...ps.board]) {
    if (m.status.poison > 0) {
      const n = m.status.poison;
      m.status.poison = decay(m.status.poison, B.poisonKeepRate);
      dealDamage(g, { kind: 'monster', uid: m.uid }, n, { kind: 'poison', source: null, depth: 1 });
      if (isEnded(g)) return;
    }
  }

  // 呪縛（シールド・無効化を貫通。減らない：MTG 要素バッチ2）
  if ((ps.status.doom ?? 0) > 0) {
    dealDamage(g, playerRef(p), ps.status.doom!, { kind: 'doom', source: null, depth: 1 });
    if (isEnded(g)) return;
  }

  // 再生。その後、半分（切り捨て）になる
  if (ps.status.regen > 0) {
    heal(g, playerRef(p), ps.status.regen, 1, { status: 'regen' });
    ps.status.regen = decay(ps.status.regen, B.regenKeepRate);
  }
  // フィールド「聖域」（MTG 要素 △ バッチD）
  const hooks = ruleHooks(g, p);
  if (hooks.startHeal > 0 && ps.hp < ps.maxHp) {
    log(g, 1, `${FIELDS.sanctuary.icon}聖域：${ps.name}のHPが回復する`, 'info');
    heal(g, playerRef(p), hooks.startHeal, 1, { status: 'sanctuary' });
  }

  // 種族の揃い（決定事項 #143）：隊列（自分のHPが回復）・竜の息（相手プレイヤーにダメージ）
  tribeTurnStart(g, p);
  if (isEnded(g)) return;

  // 維持費・裏切りの経過（封印されても働く）、自己修復
  for (const m of [...ps.board]) {
    const def = g.cards[m.card.cardId];
    if (!def) continue;
    const rt = makeRuntime(g, sourceOfMonster(g, m), [], { depth: 1, attackCard: false });
    const src = sourceFields(g, sourceOfMonster(g, m));
    // 演出（決定事項 #126）：働いたデメリット・キーワードを、その行に付ける（行は増やさない）
    for (const d of def.drawbacks) {
      const at = g.log.length;
      getDrawback(d.id)?.battle.onBoardTurnStart?.(rt, d, m);
      tagLog(g, at, { kind: 'drawback', drawbackId: d.id, ...src });
    }
    if (checkGameEnd(g)) return;
    if (!m.sealed) {
      for (const k of def.keywords) {
        const at = g.log.length;
        getKeyword(k.id)?.battle.onTurnStart?.(rt, k, m);
        tagLog(g, at, { kind: 'keyword', keywordId: k.id, player: p, target: { kind: 'monster', uid: m.uid } });
      }
    }
  }
  // パワーのデメリット（累加維持費。MTG 要素 △ バッチA）
  for (const pw of [...ps.powers]) {
    const def = g.cards[pw.cardId];
    if (!def) continue;
    const rt = makeRuntime(g, powerSource(pw, p), [], { depth: 1, attackCard: false });
    for (const d of def.drawbacks) {
      const at = g.log.length;
      getDrawback(d.id)?.battle.onPowerTurnStart?.(rt, d, pw);
      tagLog(g, at, { kind: 'drawback', drawbackId: d.id, player: p, uid: pw.uid, cardId: pw.cardId });
    }
    if (checkGameEnd(g)) return;
  }

  // エナジー（持ち越さない：決定事項 #25）。ターン数で成長し、先攻の1ターン目は1少ない（決定事項 #69）。
  // 貯金で増える分も1ターンの増加の上限に数える（決定事項 #64）
  const scheduled = energyForTurn(ps.turnsTaken);
  const firstPenalty = p === g.first && ps.turnsTaken === 1 ? B.firstPlayerFirstTurnPenalty : 0;
  // 後攻の1ターン目の補正（既定は0。先攻後攻の差を測り直すための調整つまみ）
  const secondFirstTurn = p !== g.first && ps.turnsTaken === 1;
  const secondBonus = secondFirstTurn ? B.secondPlayerFirstTurnBonusEnergy : 0;
  // 最大エナジー増加（MTG 要素 ○ バッチB）：基本エナジーに足す（1ターンの増加の上限には数えない）
  const ramp = ps.energyBonus ?? 0;
  // リーダー「錬金術師」（MTG 要素 △ バッチD）：3・6・9…ターン目に+1（1ターンの増加の上限には数えない）
  const alchemy = hooks.extraEnergy;
  const base = scheduled - firstPenalty + secondBonus + ramp + alchemy;
  const limits = turnLimits(g, ps);
  const carried = ps.next.energy > 0 ? Math.min(ps.next.energy, B.maxEnergyGainPerTurn) : ps.next.energy;
  if (carried > 0) limits.energyGained += carried;
  ps.energy = Math.max(0, base + carried);
  const capNote = carried < ps.next.energy ? `、増加は+${B.maxEnergyGainPerTurn}まで` : '';
  const notes = [
    firstPenalty ? `先攻の1ターン目は−${firstPenalty}` : '',
    secondBonus ? `後攻の1ターン目は+${secondBonus}` : '',
    B.energySchedule.some((s) => s.fromTurn === ps.turnsTaken && s.fromTurn > 1) ? `このターンから基本${scheduled}` : '',
    ramp ? `最大エナジー増加で+${ramp}` : '',
    alchemy ? `${LEADERS.alchemist.name}で+${alchemy}` : '',
    carried ? `基本${base}${carried > 0 ? '+' : '−'}${Math.abs(carried)}${capNote}` : '',
  ].filter(Boolean);
  log(g, 1, `${ps.name}のエナジー：${ps.energy}${notes.length ? `（${notes.join('、')}）` : ''}`, 'info', undefined, {
    kind: 'energy',
    player: p,
    amount: ps.energy,
  });

  // ドロー（1ターン目は対戦開始時に配った手札を使う：決定事項 #47。後攻の1ターン目の追加ドローは調整つまみ、既定0）
  const extraDraw = secondFirstTurn ? B.secondPlayerFirstTurnExtraDraw : 0;
  // 王冠（MTG 要素 ○ バッチC2）：持っていれば1枚多く引く（1ターン目も。上限は1ターンに引ける枚数）
  const crownDraw = g.crown === p ? BALANCE.crown.extraDraw : 0;
  if (crownDraw > 0) log(g, 1, `👑${ps.name}は王冠を持っているので${crownDraw}枚多く引く`, 'info');
  // フィールド「大図書館」・リーダー「賢者」（MTG 要素 △ バッチD）：多く引く（1ターン目も。上限は1ターンに引ける枚数）
  const ruleDraw = hooks.extraDraw;
  if (ruleDraw > 0) {
    const why = [hooks.fieldDraw ? `${FIELDS.library.icon}${FIELDS.library.name}` : '', hooks.leaderDraw ? `${LEADERS.scholar.icon}${LEADERS.scholar.name}` : ''].filter(Boolean).join('・');
    log(g, 1, `${ps.name}は${why}で${ruleDraw}枚多く引く`, 'info');
  }
  // 種族の揃い「共鳴」（決定事項 #143）：多く引く（1ターン目も。上限は1ターンに引ける枚数）
  const spiritDraw = spiritExtraDraw(g, p);
  const drawCount = (ps.turnsTaken === 1 ? Math.max(0, ps.next.draw + extraDraw) : Math.max(0, B.drawPerTurn + ps.next.draw)) + crownDraw + ruleDraw + spiritDraw;
  ps.next = { draw: 0, energy: 0 };
  drawCards(g, p, drawCount, 1);
  if (isEnded(g)) return;

  // MTG 要素 △ バッチA：放射能 → 氷結 → 卵の孵化（引いた後・予約より前）
  radiation(g, p);
  if (isEnded(g)) return;
  iceHand(g, p);
  hatchEggs(g, p, 1);

  // 予約した効果（修飾「次のターンに」。MTG 要素 ○ バッチA）：引いた後・ターン開始時のパワーより前に、古い順
  const delayed = ps.delayed?.length ?? 0;
  if (delayed > 0) log(g, 1, `${ps.name}の予約していた効果が発動する（${delayed}件）`, 'info');
  enqueueDelayed(g, p);
  // 待機（MTG 要素 △ バッチC）：残りを1減らし、0なら無料で使う（予約の後・英雄譚の前）
  tickSuspend(g, p);

  // 英雄譚（MTG 要素 ○ バッチC2）：1章ずつ進む。蓄積「自分のターン開始時」
  advanceSagas(g, p);
  chargePowers(g, p, 'turnStart', 1);
  // 「自分のターン開始時」：パワー → 場のモンスター（左から）。その後、混乱・裏切りの自動攻撃
  enqueuePowers(g, p, 'turnStart', 1);
  enqueueMonsters(g, p, 'turnStart', 1);
  enqueue(g, { t: 'autoAttacks', player: p });
}

/**
 * 放射能（MTG 要素 △ バッチA）：山札の上を放射能の枚数だけ捨て札に置き（切り直さない）、モンスター以外1枚ごとにダメージ
 * （シールド・無効化を無視）。放射能はその枚数だけ減る
 */
function radiation(g: GameState, p: PlayerId): void {
  const ps = g.players[p];
  const rad = ps.status.rad ?? 0;
  if (rad <= 0) return;
  const top = ps.deck.slice(0, rad);
  if (top.length === 0) {
    log(g, 1, `${ps.name}の放射能${rad}：山札がないので何も起きない`, 'info');
    return;
  }
  const hits = top.filter((c) => c.cardId === NOISE_CARD_ID || !g.cards[c.cardId]?.stats).length;
  log(g, 1, `${ps.name}の放射能${rad}：山札の上${top.length}枚を捨て札へ（モンスター以外${hits}枚）`, 'effect', undefined, { kind: 'status', player: p, status: 'rad', amount: rad });
  deckToDiscard(g, p, top.map((c) => c.uid), '放射能', 2);
  ps.status.rad = rad - hits;
  if (hits > 0) dealDamage(g, playerRef(p), B.radDamage * hits, { kind: 'rad', source: null, depth: 2 });
}

/** 氷結（MTG 要素 △ バッチA）：手札（ノイズを除く）からランダムに氷結の枚数だけ凍らせる（このターンは使えない） */
function iceHand(g: GameState, p: PlayerId): void {
  const ps = g.players[p];
  const n = ps.ice ?? 0;
  if (n <= 0) return;
  ps.ice = 0;
  const pool = ps.hand.filter((c) => c.cardId !== NOISE_CARD_ID && c.iced !== g.turnIndex);
  const frozen = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const [c] = pool.splice(randInt(g, pool.length), 1);
    c!.iced = g.turnIndex;
    frozen.push(c!);
  }
  if (frozen.length === 0) return;
  log(g, 1, `${ps.name}の手札${frozen.length}枚が凍った（このターンは使えない）`, 'effect', undefined, { kind: 'status', player: p, status: 'ice', amount: frozen.length });
  log(g, 1, `凍ったカード：${frozen.map((c) => cardName(g, c.cardId)).join('、')}`, 'info', p);
}

/** 混乱・裏切りの自動攻撃 */
export function runAutoAttacks(g: GameState, p: PlayerId): void {
  for (const m of [...g.players[p].board]) {
    if (!(m.status.confuseActive || m.betraying)) continue;
    if (m.status.freezeActive) continue;
    // 休眠中・卵は自動でも攻撃しない（MTG 要素 △ バッチA）
    if (monsterDormant(g, m) || m.card.token?.egg || m.siege) continue;
    // 防衛・消耗のモンスターは自動でも攻撃しない
    if (cannotAttack(g, m) || exerted(g, m)) continue;
    const times = attacksPerTurn(g, m) - m.attacksUsed;
    for (let i = 0; i < times; i++) {
      const alive = g.players[p].board.find((x) => x.uid === m.uid);
      if (!alive || isEnded(g)) return;
      const target = autoAttackTarget(g, alive, (n) => randInt(g, n));
      if (!target) break;
      performAttack(g, alive, target, 1, alive.betraying ? '（裏切り）' : '（混乱で対象はランダム）');
    }
  }
}

/** ターン終了：「自分のターン終了時」の効果を積み、続きの処理へ */
export function beginEndTurn(g: GameState, p: PlayerId): void {
  log(g, 0, `${g.players[p].name}はターンを終了した`, 'action', undefined, { kind: 'turnEnd', player: p });
  // 達成（MTG 要素 △ バッチC：事件・進化）の判定は、ターン終了時の効果の前
  checkAchievements(g, p);
  enqueuePowers(g, p, 'turnEnd', 1);
  enqueueMonsters(g, p, 'turnEnd', 1);
  enqueue(g, { t: 'turnEndEffects', player: p });
}

function tickEnd(s: Statuses): void {
  s.bleed = Math.floor(s.bleed / 2);
  s.vulnerable = Math.max(0, s.vulnerable - 1);
  s.freezeActive = false;
  s.confuseActive = false;
}

export function turnEndEffects(g: GameState, p: PlayerId): void {
  const ps = g.players[p];
  // やけど（シールド・無効化を貫通）
  if (ps.status.burn > 0) {
    dealDamage(g, playerRef(p), B.burnDamage, { kind: 'burn', source: null, depth: 1 });
    ps.status.burn -= 1;
    if (isEnded(g)) return;
  }
  for (const m of [...ps.board]) {
    if (m.status.burn > 0) {
      m.status.burn -= 1;
      dealDamage(g, { kind: 'monster', uid: m.uid }, B.burnDamage, { kind: 'burn', source: null, depth: 1 });
      if (isEnded(g)) return;
    }
  }
  // 種族の特性（決定事項 #143）：竜鱗・鋼の体
  tribeTurnEnd(g, p);
  // 出血が半分、脆弱の残りターン、凍結・混乱が切れる（脱力は使うまで減らない：決定事項 #138）
  tickEnd(ps.status);
  for (const m of ps.board) tickEnd(m.status);

  boardTurnEnd(g, p);
  if (isEnded(g)) return;

  enqueue(g, { t: 'retain', player: p });
}

/**
 * 持ち主のターン終了時のデメリット（MTG 要素バッチ2）：腐乱（攻撃したターンなら破壊）、寿命（1減り、0で場から消える）。
 * 破壊されたときの効果は、このあとの手札の処理より先に解決する
 */
function boardTurnEnd(g: GameState, p: PlayerId): void {
  const ps = g.players[p];
  // 応召の一時トークンは持ち主のターン終了時に消える（破壊ではない）。借用は期限を数え、0 で元の持ち主の場へ（MTG 要素 ○ バッチB）
  for (const m of [...ps.board]) {
    if (!ps.board.includes(m)) continue;
    if (m.card.token?.temp) {
      vanish(g, m, 1, `${monsterLabel(g, m)}は去った（応召・ターン終了時に消える）`);
      continue;
    }
    // 一時蘇生（MTG 要素 △ バッチB）：持ち主のターン終了時に除外（破壊ではない）
    if (m.unearthed) {
      exileFromBoard(g, m, 1, `${monsterLabel(g, m)}は除外された（一時蘇生）`);
      continue;
    }
    // ワープ（MTG 要素 △ バッチC）：持ち主のターン終了時に待機ゾーンへ（破壊ではない）
    if (m.warped) {
      warpAway(g, m, 1);
      continue;
    }
    if (m.counters.borrowLeft !== undefined) {
      m.counters.borrowLeft -= 1;
      if (m.counters.borrowLeft <= 0) returnBorrowed(g, m, 1);
      else log(g, 1, `${monsterLabel(g, m)}の借用：あと${m.counters.borrowLeft}ターン`, 'info');
    }
  }
  for (const m of [...ps.board]) {
    if (!ps.board.includes(m)) continue;
    const def = g.cards[m.card.cardId];
    if (!def) continue;
    const rt = makeRuntime(g, sourceOfMonster(g, m), [], { depth: 1, attackCard: false });
    const src = sourceFields(g, sourceOfMonster(g, m));
    for (const d of def.drawbacks) {
      if (!ps.board.includes(m)) break;
      const at = g.log.length;
      getDrawback(d.id)?.battle.onBoardTurnEnd?.(rt, d, m);
      tagLog(g, at, { kind: 'drawback', drawbackId: d.id, ...src });
    }
    if (!ps.board.includes(m)) continue;
    const life = lifespanOf(def);
    if (life === undefined) continue;
    m.counters.life = (m.counters.life ?? life) - 1;
    if (m.counters.life <= 0) {
      log(g, 1, `${monsterLabel(g, m)}の寿命が尽きた`, 'effect', undefined, { kind: 'drawback', drawbackId: 'lifespan', ...sourceFields(g, sourceOfMonster(g, m)) });
      // 寿命は不壊でも止まらない（MTG 要素 △ バッチA）
      destroyMonster(g, m, 2, true);
    } else {
      log(g, 1, `${monsterLabel(g, m)}の寿命：あと${m.counters.life}ターン`, 'info');
    }
    if (isEnded(g)) return;
  }
  // パワーの寿命（消えるときに効果は発動しない）
  for (const pw of [...ps.powers]) {
    if (pw.life === undefined) continue;
    pw.life -= 1;
    if (pw.life <= 0) {
      ps.powers = ps.powers.filter((x) => x !== pw);
      log(g, 1, `パワー『${pw.name}』の寿命が尽きて消えた`, 'effect', undefined, { kind: 'destroy', player: p, cardId: pw.cardId, uid: pw.uid });
    } else {
      log(g, 1, `パワー『${pw.name}』の寿命：あと${pw.life}ターン`, 'info');
    }
  }
}

/** 保持で残せる手札（残らないコピーは除く） */
export function retainOptions(g: GameState, p: PlayerId) {
  return g.players[p].hand.filter((c) => c.copy !== 'temp');
}

export function turnEndFinish(g: GameState, p: PlayerId, kept: string[]): void {
  const ps = g.players[p];
  const keep = new Set(kept);
  const discarded = ps.hand.filter((c) => !keep.has(c.uid));
  ps.hand = ps.hand.filter((c) => keep.has(c.uid));
  for (const card of discarded) discardCard(g, card);
  if (discarded.length > 0) {
    log(g, 1, `${ps.name}は手札${discarded.length}枚を捨て札にした${kept.length ? `（${kept.length}枚を保持）` : ''}`, 'info', undefined, {
      kind: 'discard',
      player: p,
      amount: discarded.length,
    });
  }
  ps.status.focus = 0;
  ps.turn.freezeTax = false;
  // 封殺（MTG 要素 ○ バッチB）：期限のターンが終わったら消える
  if (ps.quash && ps.quash.until <= g.turnIndex) {
    delete ps.quash;
    log(g, 1, `${ps.name}の封殺の期限が切れた`, 'info');
  }
  // このターンの記録を残す（条件「前の相手のターンに相手がカードを3枚以上使った」。MTG 要素 ○ バッチA）
  ps.lastTurn = { cardsPlayed: ps.turn.cardsPlayed };
  // 一時強化と、賛助でこのターンだけ与えたキーワード（MTG 要素 △ バッチA）はターンの終わりに消える（両者のモンスター）。
  // 封印もこのターンだけ（決定事項 #146）
  for (const pl of g.players) {
    for (const m of pl.board) {
      if (m.tempAttack) delete m.tempAttack;
      if (m.tempGranted) delete m.tempGranted;
      if (m.sealed) {
        m.sealed = false;
        log(g, 1, `${monsterLabel(g, m)}の封印が解けた`, 'info');
      }
    }
  }

  // 隠密：召喚してから相手の次のターン終了まで
  for (const m of g.players[other(p)].board) {
    if (m.stealth) {
      m.stealth = false;
      log(g, 1, `${monsterLabel(g, m)}の隠密が切れた`, 'info');
    }
  }

  // 昼と夜（MTG 要素 △ バッチD）：このターンに使ったカードの枚数で切り替わる
  dayNightAtTurnEnd(g, p);

  // 30ターン経過で引き分け（各プレイヤー30ターン：決定事項 #26。追加ターンも1ターンに数えるので、通算ターンで数える：MTG 要素 △ バッチC）
  if (g.turnIndex >= B.maxTurns * 2) {
    endGame(g, null, 'turnLimit');
    return;
  }
  // 追加ターン（MTG 要素 △ バッチC）：相手の手番を飛ばして、もう一度自分のターン
  if (ps.extraTurnPending) {
    delete ps.extraTurnPending;
    log(g, 0, `${ps.name}は追加のターンを得た`, 'info', undefined, { kind: 'status', player: p, status: 'extraTurn' });
    startTurn(g, p, true);
    return;
  }
  startTurn(g, other(p));
}

export function concede(g: GameState, p: PlayerId, reason?: 'timeout'): void {
  log(g, 0, reason === 'timeout' ? `${g.players[p].name}は続けて時間切れになった` : `${g.players[p].name}は降参した`, 'action');
  endGame(g, other(p), reason ?? 'concede');
}

