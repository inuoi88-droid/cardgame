/** ターンの開始と終了（処理順は決定事項 #28） */
import { BALANCE } from '../balance.ts';
import { getDrawback, getKeyword } from '../registry.ts';
import { checkGameEnd, endGame, enqueue, log, monsterLabel, other, playerRef, sourceOfMonster, isEnded, turnLimits } from './core.ts';
import { autoAttackTarget, attacksPerTurn, performAttack } from './combat.ts';
import { dealDamage, heal } from './damage.ts';
import { randInt } from './rng.ts';
import { makeRuntime } from './runtime.ts';
import { enqueueMonsters, enqueuePowers } from './triggers.ts';
import { discardCard, drawCards } from './zones.ts';
import type { GameState, PlayerId, Statuses } from './types.ts';

const B = BALANCE.battle;

function activate(s: Statuses): void {
  s.freezeActive = s.freezePending;
  s.freezePending = false;
  s.confuseActive = s.confusePending;
  s.confusePending = false;
}

export function startTurn(g: GameState, p: PlayerId): void {
  const ps = g.players[p];
  g.turnIndex += 1;
  g.active = p;
  ps.turnsTaken += 1;
  g.protect = {};
  log(g, 0, `── ${ps.name}のターン（${ps.turnsTaken}ターン目）──`, 'turn');

  // シールドと反撃が消える。凍結・混乱が発効する
  ps.shield = 0;
  ps.status.counter = 0;
  activate(ps.status);
  for (const m of ps.board) {
    activate(m.status);
    m.attacksUsed = 0;
  }
  ps.turn = { cardsPlayed: 0, retain: 0, freezeTax: ps.status.freezeActive };
  if (ps.status.freezeActive) log(g, 1, `${ps.name}は凍結している：最初に使うカードのコスト+${B.freezeCostIncrease}`);

  // 毒（シールド・無効化を貫通）
  if (ps.status.poison > 0) {
    dealDamage(g, playerRef(p), ps.status.poison, { kind: 'poison', source: null, depth: 1 });
    ps.status.poison = Math.max(0, ps.status.poison - B.poisonDecay);
    if (isEnded(g)) return;
  }
  for (const m of [...ps.board]) {
    if (m.status.poison > 0) {
      const n = m.status.poison;
      m.status.poison = Math.max(0, m.status.poison - B.poisonDecay);
      dealDamage(g, { kind: 'monster', uid: m.uid }, n, { kind: 'poison', source: null, depth: 1 });
      if (isEnded(g)) return;
    }
  }

  // 再生
  if (ps.status.regen > 0) {
    heal(g, playerRef(p), ps.status.regen, 1);
    ps.status.regen = Math.max(0, ps.status.regen - B.regenDecay);
  }

  // 維持費・裏切りの経過（封印されても働く）、自己修復
  for (const m of [...ps.board]) {
    const def = g.cards[m.card.cardId];
    if (!def) continue;
    const rt = makeRuntime(g, sourceOfMonster(g, m), [], { depth: 1, attackCard: false });
    for (const d of def.drawbacks) getDrawback(d.id)?.battle.onBoardTurnStart?.(rt, d, m);
    if (checkGameEnd(g)) return;
    if (!m.sealed) {
      for (const k of def.keywords) getKeyword(k.id)?.battle.onTurnStart?.(rt, k, m);
    }
  }

  // エナジー（持ち越さない：決定事項 #25）。貯金で増える分も1ターンの増加の上限に数える（決定事項 #64）
  const base = p === g.first && ps.turnsTaken === 1 ? B.firstPlayerFirstTurnEnergy : B.energyPerTurn;
  const limits = turnLimits(g, ps);
  const carried = ps.next.energy > 0 ? Math.min(ps.next.energy, B.maxEnergyGainPerTurn) : ps.next.energy;
  if (carried > 0) limits.energyGained += carried;
  ps.energy = Math.max(0, base + carried);
  const capNote = carried < ps.next.energy ? `、増加は+${B.maxEnergyGainPerTurn}まで` : '';
  log(
    g,
    1,
    `${ps.name}のエナジー：${ps.energy}${carried ? `（基本${base}${carried > 0 ? '+' : '−'}${Math.abs(carried)}${capNote}）` : ''}`,
    'info',
  );

  // ドロー（1ターン目は対戦開始時に配った手札を使う：決定事項 #47）
  const drawCount = ps.turnsTaken === 1 ? Math.max(0, ps.next.draw) : Math.max(0, B.drawPerTurn + ps.next.draw);
  ps.next = { draw: 0, energy: 0 };
  drawCards(g, p, drawCount, 1);

  // 「自分のターン開始時」：パワー → 場のモンスター（左から）。その後、混乱・裏切りの自動攻撃
  enqueuePowers(g, p, 'turnStart', 1);
  enqueueMonsters(g, p, 'turnStart', 1);
  enqueue(g, { t: 'autoAttacks', player: p });
}

/** 混乱・裏切りの自動攻撃 */
export function runAutoAttacks(g: GameState, p: PlayerId): void {
  for (const m of [...g.players[p].board]) {
    if (!(m.status.confuseActive || m.betraying)) continue;
    if (m.status.freezeActive) continue;
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
  log(g, 0, `${g.players[p].name}はターンを終了した`, 'action');
  enqueuePowers(g, p, 'turnEnd', 1);
  enqueueMonsters(g, p, 'turnEnd', 1);
  enqueue(g, { t: 'turnEndEffects', player: p });
}

function tickEnd(s: Statuses): void {
  s.bleed = Math.floor(s.bleed / 2);
  s.weak = Math.max(0, s.weak - 1);
  s.vulnerable = Math.max(0, s.vulnerable - 1);
  s.freezeActive = false;
  s.confuseActive = false;
}

export function turnEndEffects(g: GameState, p: PlayerId): void {
  const ps = g.players[p];
  // 寄生（手札にある間）
  for (const card of [...ps.hand]) {
    const def = g.cards[card.cardId];
    for (const d of def?.drawbacks ?? []) {
      const hook = getDrawback(d.id)?.battle.onHandTurnEnd;
      if (!hook) continue;
      const src = { kind: 'card' as const, uid: card.uid, cardId: card.cardId, name: def!.name, controller: p };
      log(g, 1, `手札の「${def!.name}」のデメリット`, 'effect');
      hook(makeRuntime(g, src, [], { depth: 2, attackCard: false }), d);
      if (isEnded(g)) return;
    }
  }
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
  // 出血が半分、弱体・脆弱の残りターン、凍結・混乱が切れる
  tickEnd(ps.status);
  for (const m of ps.board) tickEnd(m.status);

  enqueue(g, { t: 'retain', player: p });
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
  if (discarded.length > 0) log(g, 1, `${ps.name}は手札${discarded.length}枚を捨て札にした${kept.length ? `（${kept.length}枚を保持）` : ''}`, 'info');
  ps.status.focus = 0;
  ps.turn.freezeTax = false;

  // 隠密：召喚してから相手の次のターン終了まで
  for (const m of g.players[other(p)].board) {
    if (m.stealth) {
      m.stealth = false;
      log(g, 1, `${monsterLabel(g, m)}の隠密が切れた`, 'info');
    }
  }

  // 30ターン経過で引き分け（各プレイヤー30ターン：決定事項 #26）
  if (g.players.every((x) => x.turnsTaken >= B.maxTurns)) {
    endGame(g, null, 'turnLimit');
    return;
  }
  startTurn(g, other(p));
}

export function concede(g: GameState, p: PlayerId, reason?: 'timeout'): void {
  log(g, 0, reason === 'timeout' ? `${g.players[p].name}は続けて時間切れになった` : `${g.players[p].name}は降参した`, 'action');
  endGame(g, other(p), reason ?? 'concede');
}

