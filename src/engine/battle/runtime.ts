/** 効果ファイルに渡す道具（EffectRuntime）と、対象の解決 */
import { BALANCE } from '../balance.ts';
import { TIMINGS, type TargetRule } from '../options.ts';
import type { EffectInstance, TimingId } from '../types.ts';
import { getKeyword } from '../registry.ts';
import { cardName, checkGameEnd, effectiveAttack, enqueue, findMonster, log, monsterLabel, newUid, other, playerRef, playRecord, targetExists, traitTribe, turnLimits } from './core.ts';
import { TRIBE_TRAITS } from '../tribes.ts';
import { addStatus, cleanse, combatBonus, combatSourceOf, dealDamage, destroyMonster, heal, outgoingOf, setCrown } from './damage.ts';
import { attacksPerTurn } from './combat.ts';
import { pick, randInt } from './rng.ts';
import {
  addNoise,
  amass,
  borrow,
  bounce,
  copyFromHand,
  createToken,
  createTokens,
  deckToBottom,
  deckToDiscard,
  deckToExile,
  discardRandom,
  dispel,
  dispelOptions,
  drawCards,
  drawSpecific,
  exileCard,
  reviveFromDiscard,
  scryMove,
  seekFromDeck,
  steal,
  takeFromDeck,
  takeFromDiscard,
  placeFaceDown,
  placeMonster,
  siegeDef,
} from './zones.ts';
import { NOISE_CARD_ID, SIEGE_CARD_ID, type Chosen, type EffectRuntime, type GameState, type Monster, type PlayerId, type SourceRef, type TargetRef } from './types.ts';
import { advanceOne } from './powers.ts';
import { setField as setFieldState } from './matchRules.ts';

/**
 * 出どころのカード（cardId）と同じ種族の、p の場のモンスター（MTG 要素 ○ バッチC2）。カードに種族が無ければ空。
 * トークン（小鬼・軍団）は種族なし、複写トークンは元のカードの種族
 */
export function tribeAllies(g: GameState, p: PlayerId, cardId: string): Monster[] {
  const tribe = g.cards[cardId]?.tribe;
  if (!tribe) return [];
  return g.players[p].board.filter((m) => g.cards[m.card.cardId]?.tribe === tribe);
}

/** 効果の対象を、解決する時点の盤面から決める */
export function resolveTargets(
  g: GameState,
  src: SourceRef,
  effect: EffectInstance,
  timing: TimingId,
  rule: TargetRule,
  chosen: Chosen,
): TargetRef[] {
  const me = src.controller;
  const opp = other(me);
  const mons = (p: PlayerId): TargetRef[] => g.players[p].board.map((m) => ({ kind: 'monster', uid: m.uid }));
  const monsterOnly = rule === 'enemyMonster' || rule === 'enemyMonsterOne';
  switch (effect.target) {
    case 'self':
      return [playerRef(me)];
    case 'enemyPlayer':
      return [playerRef(opp)];
    case 'board':
      return [...mons(g.active), ...mons(other(g.active))];
    case 'chosen': {
      if (TIMINGS[timing]?.chosen === 'none') return [];
      if (rule === 'fight') {
        // 格闘：選んだ自分のモンスターと相手モンスターの組（どちらかがいなければ不発）
        const ally = chosen.ally ? findMonster(g, chosen.ally) : undefined;
        const t = chosen.enemy;
        const enemy = t?.kind === 'monster' ? findMonster(g, t.uid) : undefined;
        return ally && ally.controller === me && enemy && enemy.controller === opp
          ? [
              { kind: 'monster', uid: ally.uid },
              { kind: 'monster', uid: enemy.uid },
            ]
          : [];
      }
      if (rule === 'allyMonsterOne') {
        const m = chosen.ally ? findMonster(g, chosen.ally) : undefined;
        return m && m.controller === me ? [{ kind: 'monster', uid: m.uid }] : [];
      }
      const t = chosen.enemy;
      if (!t || !targetExists(g, t)) return [];
      if (monsterOnly && t.kind !== 'monster') return [];
      return [t];
    }
    case 'random': {
      if (rule === 'fight') {
        const mine = mons(me);
        const theirs = mons(opp);
        if (mine.length === 0 || theirs.length === 0) return [];
        return [pick(g, mine)!, pick(g, theirs)!];
      }
      const pool: TargetRef[] =
        rule === 'allyMonsterOne' ? mons(me) : monsterOnly ? mons(opp) : [playerRef(opp), ...mons(opp)];
      const t = pick(g, pool);
      return t ? [t] : [];
    }
    case 'enemyMonsters':
      return mons(opp);
    case 'enemyAll':
      return [playerRef(opp), ...mons(opp)];
    case 'everyone':
      return monsterOnly ? [...mons(opp), ...mons(me)] : [playerRef(opp), ...mons(opp), playerRef(me), ...mons(me)];
    case 'thisMonster': {
      // 効果を持つモンスター自身。場にいなければ不発
      const m = src.kind === 'monster' ? findMonster(g, src.uid) : undefined;
      return m && m.controller === me ? [{ kind: 'monster', uid: m.uid }] : [];
    }
    case 'allyMonsters':
      return mons(me);
    // ---- MTG 要素 ○ バッチA
    case 'otherAllies':
      // 効果を持つモンスター以外の自分のモンスター（左から）
      return g.players[me].board.filter((m) => !(src.kind === 'monster' && m.uid === src.uid)).map((m) => ({ kind: 'monster', uid: m.uid }));
    case 'weakestAlly': {
      // 体力（今の値）がいちばん低い自分のモンスター（同じなら左）
      let best: { uid: string; hp: number } | null = null;
      for (const m of g.players[me].board) if (!best || m.hp < best.hp) best = { uid: m.uid, hp: m.hp };
      return best ? [{ kind: 'monster', uid: best.uid }] : [];
    }
    case 'bothPlayers':
      // 使った人の分。相手の分は queue.ts が入れ替えてもう一度解決する
      return [playerRef(me)];
    case 'tribeAllies':
      // 同じ種族の自分のモンスター（自分自身を含む。MTG 要素 ○ バッチC2）
      return tribeAllies(g, me, src.cardId).map((m) => ({ kind: 'monster', uid: m.uid }));
    case 'attacker': {
      // 攻撃してきた相手のモンスター（MTG 要素 △ バッチA）。場を離れていれば不発
      const m = chosen.trigger ? findMonster(g, chosen.trigger) : undefined;
      return m && m.controller !== me ? [{ kind: 'monster', uid: m.uid }] : [];
    }
  }
}

export interface RuntimeOpts {
  depth: number;
  attackCard: boolean;
  protectKey?: string;
}

const B = BALANCE.battle;

export function makeRuntime(g: GameState, src: SourceRef, targets: TargetRef[], opts: RuntimeOpts): EffectRuntime {
  const me = src.controller;
  const depth = opts.depth;
  /** ダメージの出どころ：場にいるモンスターならそのモンスター、それ以外は持ち主のプレイヤー */
  const origin = (): TargetRef => (src.kind === 'monster' && findMonster(g, src.uid) ? { kind: 'monster', uid: src.uid } : playerRef(me));
  const monsterOf = (t: TargetRef) => (t.kind === 'monster' ? findMonster(g, t.uid) : undefined);

  return {
    g,
    controller: me,
    opponent: other(me),
    targets,
    src,
    hit(target, amount, o = {}) {
      // 筋力・気合：使った時点の値（play.ts で記録）を、そのカードの最初の1発にだけ乗せる（決定事項 #70 R3）
      let bonus = 0;
      if (opts.attackCard) {
        const ps = g.players[me];
        const rec = opts.protectKey ? playRecord(g, opts.protectKey) : undefined;
        if (!rec) bonus = ps.status.strength + ps.status.focus;
        else if (!rec.bonusUsed) {
          rec.bonusUsed = true;
          bonus = rec.bonus ?? ps.status.strength + ps.status.focus;
        }
      }
      const r = dealDamage(g, target, amount, {
        kind: 'hit',
        source: origin(),
        bonus,
        pierce: o.pierce,
        ...(o.wither ? { wither: true } : {}),
        ...(opts.protectKey ? { playKey: opts.protectKey } : {}),
        depth,
      });
      if (o.drain && r.hpLost > 0) {
        const n = Math.floor(r.hpLost * BALANCE.battle.drainRate);
        log(g, depth + 1, `吸収：与えたダメージ${r.hpLost}の半分を回復`);
        heal(g, playerRef(me), n, depth + 1, { status: 'drain' });
      }
    },
    selfDamage(amount) {
      dealDamage(g, playerRef(me), amount, { kind: 'self', source: null, depth });
    },
    heal(target, amount) {
      heal(g, target, amount, depth);
    },
    addStatus(target, key, amount) {
      addStatus(g, target, key, amount, depth);
    },
    setSealed(target) {
      const m = monsterOf(target);
      if (!m) return;
      m.sealed = true;
      m.stealth = false;
      log(g, depth, `${monsterLabel(g, m)}を封印した（効果とキーワードを失う）`, 'effect', undefined, { kind: 'stat', target, status: 'seal' });
    },
    gainShield(p, amount) {
      g.players[p].shield += amount;
      log(g, depth, `${g.players[p].name}はシールド${amount}を得た（合計${g.players[p].shield}）`, 'effect', undefined, {
        kind: 'shield',
        player: p,
        target: playerRef(p),
        amount,
      });
    },
    gainEnergy(p, amount) {
      const ps = g.players[p];
      // 1ターンに増やせるエナジーの上限（安全装置）
      const limits = turnLimits(g, ps);
      const gain = Math.max(0, Math.min(amount, B.maxEnergyGainPerTurn - limits.energyGained));
      limits.energyGained += gain;
      ps.energy += gain;
      const ev = { kind: 'energy' as const, player: p, status: 'gain', amount: gain };
      if (gain < amount) {
        log(g, depth, `${ps.name}はエナジーを${gain}得た（1ターン+${B.maxEnergyGainPerTurn}まで。エナジー${ps.energy}）`, 'effect', undefined, ev);
      } else {
        log(g, depth, `${ps.name}はエナジーを${gain}得た（エナジー${ps.energy}）`, 'effect', undefined, ev);
      }
    },
    addNextTurn(p, delta) {
      const ps = g.players[p];
      let { draw = 0, energy = 0 } = delta;
      // 相手の妨害で減らせる量には上限がある（重ねてもロックにならないように）
      let capped = false;
      if (p !== me && energy < 0) {
        const room = Math.max(0, B.maxEnergyJamPerTurn - (ps.next.jamEnergy ?? 0));
        if (-energy > room) capped = true;
        energy = -Math.min(-energy, room);
        ps.next.jamEnergy = (ps.next.jamEnergy ?? 0) - energy;
      }
      if (p !== me && draw < 0) {
        const room = Math.max(0, B.maxDrawJamPerTurn - (ps.next.jamDraw ?? 0));
        if (-draw > room) capped = true;
        draw = -Math.min(-draw, room);
        ps.next.jamDraw = (ps.next.jamDraw ?? 0) - draw;
      }
      if (draw) ps.next.draw += draw;
      if (energy) ps.next.energy += energy;
      const parts = [
        draw ? `引く枚数${draw > 0 ? '+' : '−'}${Math.abs(draw)}` : '',
        energy ? `エナジー${energy > 0 ? '+' : '−'}${Math.abs(energy)}` : '',
      ].filter(Boolean);
      const note = capped ? `（妨害は1ターンにエナジー−${B.maxEnergyJamPerTurn}・引く枚数−${B.maxDrawJamPerTurn}まで）` : '';
      if (parts.length > 0) log(g, depth, `${ps.name}の次のターン：${parts.join('、')}${note}`, 'effect', undefined, { kind: 'status', target: playerRef(p), status: draw + energy < 0 ? 'jam' : 'nextTurn', amount: draw + energy });
      else if (capped) log(g, depth, `${ps.name}はこれ以上妨害されない${note}`);
    },
    addDiscount(p, amount) {
      const ps = g.players[p];
      // 軽減はエナジーを得るのと同じなので、1ターンに増やせるエナジーの上限に合わせて数える
      // （一撃離脱・循環で出し直すたびに軽減を得ると、1ターンに何度でも無料で使えた：報告 #17・#18）
      const limits = turnLimits(g, ps);
      const gain = Math.max(0, Math.min(amount, B.maxEnergyGainPerTurn - limits.energyGained));
      if (gain <= 0) {
        log(g, depth, `${ps.name}はこのターンこれ以上軽減を得られない（エナジーの増加と合わせて1ターン+${B.maxEnergyGainPerTurn}まで）`, 'info');
        return;
      }
      limits.energyGained += gain;
      ps.discount += gain;
      log(g, depth, `${ps.name}が次に使うカードのコスト−${ps.discount}`, 'effect', undefined, { kind: 'status', target: playerRef(p), status: 'discount', amount: gain });
    },
    addRetain(p, amount) {
      const ps = g.players[p];
      ps.turn.retain += amount;
      log(g, depth, `${ps.name}はこのターンの終了時に手札を${ps.turn.retain}枚残せる`, 'effect', undefined, { kind: 'status', target: playerRef(p), status: 'retain', amount });
    },
    draw(p, count) {
      drawCards(g, p, count, depth);
    },
    addNoise(p, count) {
      // 相手の山札に入れるノイズは、1ターンに受け取る枚数に上限がある（自分のデメリットの汚染は制限しない）
      let n = count;
      if (p !== me) {
        const limits = turnLimits(g, g.players[p]);
        n = Math.max(0, Math.min(count, B.maxNoiseReceivedPerTurn - limits.noiseIn));
        limits.noiseIn += n;
        if (n < count) log(g, depth, `ノイズは1ターンに${B.maxNoiseReceivedPerTurn}枚までしか入らない`);
      }
      if (n > 0) addNoise(g, p, n, depth);
    },
    discardRandom(p, count) {
      discardRandom(g, p, count, depth);
    },
    cleanse(p) {
      cleanse(g, p, opts.protectKey ? g.protect[opts.protectKey] : undefined, depth);
    },
    changeAttack(target, delta) {
      const m = monsterOf(target);
      if (!m) return;
      const before = m.attack;
      m.attack = Math.max(0, m.attack + delta);
      log(g, depth, `${monsterLabel(g, m)}の攻撃力 ${before}→${m.attack}`, 'effect', undefined, { kind: 'stat', target, delta: { attack: m.attack - before } });
    },
    growBonus(target) {
      const m = monsterOf(target);
      if (!m || traitTribe(g, m) !== 'human') return 0;
      const n = BALANCE.tribes.human.trait.growBonus;
      log(g, depth, `${TRIBE_TRAITS.human.name}：${monsterLabel(g, m)}はさらに攻撃力+${n}`, 'effect', undefined, { kind: 'tribe', tribe: 'human', status: 'trait', target });
      return n;
    },
    changeDefense(target, delta) {
      const m = monsterOf(target);
      if (!m) return;
      const before = m.defense;
      m.defense = Math.min(BALANCE.stats.defenseMax, Math.max(0, m.defense + delta));
      log(g, depth, `${monsterLabel(g, m)}の守備力 ${before}→${m.defense}`, 'effect', undefined, { kind: 'stat', target, delta: { defense: m.defense - before } });
    },
    destroy(target, force) {
      const m = monsterOf(target);
      if (m) destroyMonster(g, m, depth, force === true);
    },
    bounce(target) {
      if (target.kind === 'monster') bounce(g, target.uid, depth);
    },
    steal(target) {
      if (target.kind === 'monster') steal(g, target.uid, me, depth);
    },
    monster: monsterOf,
    player: (p) => g.players[p],
    cardDef: (cardId) => g.cards[cardId],
    cardName: (cardId) => cardName(g, cardId),
    takeFromDeck(p, uid) {
      takeFromDeck(g, p, uid, depth);
    },
    takeFromDiscard(p, uid) {
      takeFromDiscard(g, p, uid, depth);
    },
    copyFromHand(p, uid, keep) {
      copyFromHand(g, p, uid, keep, depth);
    },
    reviveFromDiscard(p, uid) {
      reviveFromDiscard(g, p, uid, depth);
    },
    dispelOptions: (p) => dispelOptions(g, p),
    dispel(p, key) {
      dispel(g, p, key, depth);
    },
    log(text) {
      log(g, depth, text);
    },
    // ---- MTG 要素バッチ2
    changeStats(target, dAttack, dHp) {
      const m = monsterOf(target);
      if (!m) return;
      const before = { attack: m.attack, hp: m.hp, maxHp: m.maxHp };
      m.attack = Math.max(0, m.attack + dAttack);
      m.maxHp += dHp;
      m.hp = Math.min(m.maxHp, m.hp + dHp);
      log(g, depth, `${monsterLabel(g, m)}：攻撃力 ${before.attack}→${m.attack}、体力 ${before.hp}→${Math.max(0, m.hp)}（最大${before.maxHp}→${Math.max(0, m.maxHp)}）`, 'effect', undefined, {
        kind: 'stat',
        target,
        delta: { attack: m.attack - before.attack, hp: Math.max(0, m.hp) - before.hp },
      });
      // 体力が0以下になったら破壊（ダメージではないので守備力・聖盾・不屈は効かない）
      if (m.hp <= 0) {
        m.hp = 0;
        // 衰弱・枯朽で体力0は、不壊でも止まらない（MTG 要素 △ バッチA）
        destroyMonster(g, m, depth + 1, true);
      }
    },
    addTempAttack(target, amount) {
      const m = monsterOf(target);
      if (!m) return;
      const before = effectiveAttack(g, m);
      // 1体につき合計 tempAttackCap まで（報告 #19）
      const capped = (m.tempAttack ?? 0) + amount > B.tempAttackCap;
      m.tempAttack = Math.min(B.tempAttackCap, (m.tempAttack ?? 0) + amount);
      const note = capped ? `（一時強化は1体+${B.tempAttackCap}まで）` : '';
      log(g, depth, `${monsterLabel(g, m)}の攻撃力がこのターンだけ ${before}→${effectiveAttack(g, m)}${note}`, 'effect', undefined, { kind: 'stat', target, status: 'temp', delta: { attack: effectiveAttack(g, m) - before } });
    },
    grantKeyword(target, keywordId) {
      const m = monsterOf(target);
      const kd = getKeyword(keywordId);
      if (!m || !kd) return;
      if (!(m.granted ?? []).includes(keywordId)) m.granted = [...(m.granted ?? []), keywordId];
      // 不屈・聖盾は与え直すと使えるようになる
      if (kd.battle.undying) m.undyingUsed = false;
      if (kd.battle.divineShield) m.shieldUsed = false;
      log(g, depth, `${monsterLabel(g, m)}に「${kd.name}」を与えた${m.sealed ? '（封印中は働かない）' : ''}`, 'effect', undefined, { kind: 'stat', target, keywordId });
    },
    ready(target) {
      const m = monsterOf(target);
      if (!m) return;
      if (m.counters.readyTurn === g.turnIndex) {
        log(g, depth, `${monsterLabel(g, m)}はこのターンもう再行動した（1体につき1ターン1回）`);
        return;
      }
      m.counters.readyTurn = g.turnIndex;
      m.attacksUsed = 0;
      log(g, depth, `${monsterLabel(g, m)}はもう一度攻撃できるようになった`, 'effect', undefined, { kind: 'stat', target, status: 'ready' });
    },
    fight(allyRef, enemyRef) {
      const a = monsterOf(allyRef);
      const e = monsterOf(enemyRef);
      if (!a || !e) return;
      // 先に両方の量（攻撃力＋一時強化＋武士道）と、やけど・脱力・接死・絆魂を決めてから、相手へ → 自分へ の順に与える
      const toEnemy = effectiveAttack(g, a) + combatBonus(g, a);
      const toAlly = effectiveAttack(g, e) + combatBonus(g, e);
      const aInfo = { outgoing: outgoingOf(g, allyRef, true), src: combatSourceOf(g, a), label: monsterLabel(g, a) };
      const eInfo = { outgoing: outgoingOf(g, enemyRef, true), src: combatSourceOf(g, e), label: monsterLabel(g, e) };
      log(g, depth, `格闘：${aInfo.label}（${toEnemy}）と${eInfo.label}（${toAlly}）が戦う`, 'effect', undefined, { kind: 'attack', source: allyRef, target: enemyRef, status: 'fight' });
      if (toEnemy > 0) {
        dealDamage(g, enemyRef, toEnemy, { kind: 'hit', source: allyRef, outgoing: aInfo.outgoing, combat: true, combatSource: aInfo.src, depth: depth + 1 });
      }
      if (toAlly > 0 && targetExists(g, allyRef)) {
        dealDamage(g, allyRef, toAlly, { kind: 'hit', source: enemyRef, outgoing: eInfo.outgoing, combat: true, combatSource: eInfo.src, depth: depth + 1 });
      }
    },
    createTokens(p, attack, hp, count) {
      createTokens(g, p, attack, hp, count, depth);
    },
    chooseDiscard(p, count) {
      enqueue(g, { t: 'discardChoice', player: p, count, depth });
    },
    exileCard(p, uid) {
      exileCard(g, p, uid, depth);
    },
    scryMove(p, uids, toDiscard) {
      scryMove(g, p, uids, toDiscard, depth);
    },
    // ---- MTG 要素 ○ バッチB
    randInt(n) {
      return randInt(g, n);
    },
    chooseDiscardThen(p, count, then) {
      enqueue(g, { t: 'discardChoice', player: p, count, depth, then });
    },
    equipTo(target) {
      // 装備はカードから使ったときだけ（使い終えたときに、そのモンスターに付く）
      if (src.kind !== 'card' || !opts.protectKey || target.kind !== 'monster') return;
      playRecord(g, opts.protectKey).equipTo = target.uid;
    },
    borrow(target, turns) {
      if (target.kind === 'monster') borrow(g, target.uid, me, turns, depth);
    },
    addBounty(target, p, draw) {
      const m = monsterOf(target);
      if (!m) return;
      m.bounty = [...(m.bounty ?? []), { player: p, draw }];
      log(g, depth, `${monsterLabel(g, m)}に懸賞を掛けた（破壊されたら${g.players[p].name}がカードを${draw}枚引く）`, 'effect', undefined, {
        kind: 'status',
        target,
        status: 'bounty',
        amount: draw,
      });
    },
    takePopulateSlot(p) {
      const limits = turnLimits(g, g.players[p]);
      if ((limits.populated ?? 0) >= B.maxPopulatesPerTurn) {
        log(g, depth, `居住は1ターンに${B.maxPopulatesPerTurn}回までなので、コピーは出ない`);
        return false;
      }
      limits.populated = (limits.populated ?? 0) + 1;
      return true;
    },
    createToken(p, cardId, token) {
      return createToken(g, p, cardId, token, depth);
    },
    amass(p, n) {
      amass(g, p, n, depth);
    },
    exhaustForEnergy(target) {
      const m = monsterOf(target);
      if (!m) return false;
      const max = attacksPerTurn(g, m);
      if (m.attacksUsed >= max) {
        log(g, depth, `${monsterLabel(g, m)}はこのターンもう攻撃できないので、動力化できない`);
        return false;
      }
      m.attacksUsed = max;
      log(g, depth, `${monsterLabel(g, m)}はこのターン攻撃できなくなった（動力化）`, 'effect', undefined, { kind: 'stat', target, status: 'exhaust' });
      return true;
    },
    infight(p) {
      const board = [...g.players[p].board];
      if (board.length < 2) {
        log(g, depth, '相手のモンスターが2体以上いないので、同士討ちは起きない');
        return;
      }
      // 先にすべての組と量（攻撃力＋一時強化＋激励＋武士道）・やけど・脱力・接死・絆魂を決めてから、左から順に与える（同時）
      const plan = board.map((m) => {
        const others = board.filter((o) => o.uid !== m.uid);
        const target = others[randInt(g, others.length)]!;
        return {
          source: { kind: 'monster' as const, uid: m.uid },
          target: { kind: 'monster' as const, uid: target.uid },
          amount: effectiveAttack(g, m) + combatBonus(g, m),
          outgoing: outgoingOf(g, { kind: 'monster', uid: m.uid }, true),
          combatSource: combatSourceOf(g, m),
          label: `${monsterLabel(g, m)}→${monsterLabel(g, target)}`,
        };
      });
      for (const x of plan) {
        if (x.amount <= 0 || !targetExists(g, x.target)) continue;
        log(g, depth, `同士討ち：${x.label}`, 'effect', undefined, { kind: 'attack', source: x.source, target: x.target, status: 'infight' });
        dealDamage(g, x.target, x.amount, { kind: 'hit', source: x.source, outgoing: x.outgoing, combat: true, combatSource: x.combatSource, depth: depth + 1 });
      }
    },
    deckToDiscard(p, uids, why) {
      deckToDiscard(g, p, uids, why, depth);
    },
    deckToBottom(p, uids) {
      deckToBottom(g, p, uids, depth);
    },
    drawSpecific(p, uid) {
      return drawSpecific(g, p, uid, depth);
    },
    seekFromDeck(p, uid) {
      seekFromDeck(g, p, uid, depth);
    },
    freePlayFromDeck(p, uid) {
      const ps = g.players[p];
      const i = ps.deck.findIndex((c) => c.uid === uid);
      if (i < 0) return;
      const [card] = ps.deck.splice(i, 1);
      // 無料で使う連鎖の段：このカードが無料で使われたものなら、その次の段
      const parent = opts.protectKey ? g.protect[opts.protectKey]?.freeDepth : undefined;
      const freeDepth = (parent ?? 0) + 1;
      if (freeDepth > B.maxFreePlayDepth) {
        ps.hand.push(card!);
        log(g, depth, `無料で使う連鎖は${B.maxFreePlayDepth}段までなので、「${cardName(g, card!.cardId)}」は手札に加えた`);
        return;
      }
      enqueue(g, { t: 'freePlay', player: p, card: card!, depth, freeDepth });
    },
    setField(id) {
      setFieldState(g, id, me, depth);
    },
    addQuash(p, kind) {
      const ps = g.players[p];
      // 相手の次のターンの終わりまで（相手のターン中なら、相手のその次のターンまで）
      const until = g.active === p ? g.turnIndex + 2 : g.turnIndex + 1;
      ps.quash = { kind, until };
      log(g, depth, `${ps.name}に封殺：次に使う${QUASH_LABEL[kind] ?? 'カード'}1枚を無効にする`, 'effect', undefined, {
        kind: 'status',
        target: playerRef(p),
        status: 'quash',
        amount: 1,
      });
    },
    addBoon(p, amount, uses) {
      const s = g.players[p].status;
      s.boon = (s.boon ?? 0) + amount;
      s.boonUses = Math.max(s.boonUses ?? 0, uses);
      log(g, depth, `${g.players[p].name}に恩恵：次のアタック${s.boonUses}回、最初の1発のダメージ+${s.boon}`, 'effect', undefined, {
        kind: 'status',
        target: playerRef(p),
        status: 'boon',
        amount,
      });
    },
    ramp(p) {
      const ps = g.players[p];
      const now = ps.energyBonus ?? 0;
      if (now >= B.rampCap) {
        log(g, depth, `${ps.name}の最大エナジーはもう増やせない（${B.rampCap}回まで）`);
        return false;
      }
      ps.energyBonus = now + 1;
      log(g, depth, `${ps.name}は以後ずっと、ターン開始時のエナジー+${ps.energyBonus}`, 'effect', undefined, { kind: 'energy', player: p, amount: ps.energy, status: 'ramp' });
      return true;
    },
    conjure(p, def, count) {
      g.cards[def.id] ??= def;
      const ps = g.players[p];
      for (let i = 0; i < count; i++) ps.hand.push({ uid: newUid(g, 'cj'), cardId: def.id, owner: p, copy: 'temp' });
      log(g, depth, `${ps.name}は手札に「${def.name}」（コスト${def.cost}・使い切り）を${count}枚加えた`, 'effect', undefined, { kind: 'zone', player: p, status: 'toHand', amount: count });
    },
    // ---- MTG 要素 ○ バッチC2
    startEngine(p) {
      const ps = g.players[p];
      if ((ps.speed ?? 0) > 0) {
        log(g, depth, `${ps.name}のエンジンはもう動いている（速度${ps.speed}）`);
        return;
      }
      ps.speed = BALANCE.speed.start;
      log(g, depth, `${ps.name}はエンジン始動：速度${ps.speed}`, 'effect', undefined, { kind: 'speed', player: p, amount: ps.speed });
    },
    takeCrown(p) {
      if (g.crown === p) {
        log(g, depth, `${g.players[p].name}はもう王冠を持っている`);
        return;
      }
      setCrown(g, p, depth, 'take');
    },
    // ---- MTG 要素 △ バッチA
    addExp(p, n) {
      const ps = g.players[p];
      const now = ps.exp ?? 0;
      const gain = Math.max(0, Math.min(n, B.expCap - now));
      ps.exp = now + gain;
      log(g, depth, `${ps.name}は経験+${gain}${gain < n ? `（上限${B.expCap}）` : ''}：経験${ps.exp}`, 'effect', undefined, { kind: 'status', target: playerRef(p), status: 'exp', amount: gain });
    },
    addIce(p, n) {
      const ps = g.players[p];
      const now = ps.ice ?? 0;
      const gain = Math.max(0, Math.min(n, B.iceCap - now));
      ps.ice = now + gain;
      log(g, depth, `${ps.name}に氷結${gain}${gain < n ? `（上限${B.iceCap}）` : ''}：次のターン、手札${ps.ice}枚が凍る`, 'effect', undefined, { kind: 'status', target: playerRef(p), status: 'ice', amount: gain });
    },
    advanceSaga(p, uid) {
      advanceOne(g, p, uid, depth);
    },
    deckToExile(p, uids, why) {
      deckToExile(g, p, uids, why, depth);
    },
    markMonster(target, mark) {
      const m = monsterOf(target);
      if (!m) return;
      const label = monsterLabel(g, m);
      switch (mark) {
        case 'finality':
          m.finality = true;
          log(g, depth, `${label}に消滅の印を付けた（破壊されたら除外される）`, 'effect', undefined, { kind: 'status', target, status: 'finality', amount: 1 });
          return;
        case 'suspected':
          m.suspected = true;
          log(g, depth, `${label}に容疑をかけた（攻撃力+${BALANCE.effects.suspect.attack}・挑発を失う・反撃しない）`, 'effect', undefined, { kind: 'status', target, status: 'suspected', amount: 1 });
          return;
        default: {
          m.guard = { kind: mark, until: g.players[m.controller].turnsTaken + 1 };
          const what = mark === 'indestructible' ? '不壊' : '加護';
          log(g, depth, `${label}に守護（${what}）：次の持ち主のターン開始まで`, 'effect', undefined, { kind: 'status', target, status: mark, amount: 1 });
        }
      }
    },
    tempGrant(target, ids) {
      const m = monsterOf(target);
      if (!m || ids.length === 0) return;
      m.tempGranted = [...new Set([...(m.tempGranted ?? []), ...ids])];
      const names = ids.map((id) => getKeyword(id)?.name ?? id).join('・');
      log(g, depth, `${monsterLabel(g, m)}はこのターンだけ「${names}」を得た${m.sealed ? '（封印中は働かない）' : ''}`, 'effect', undefined, { kind: 'stat', target, status: 'temp', keywordId: ids[0] });
    },
    perpetual(p, uid, n) {
      const ps = g.players[p];
      const card = ps.hand.find((c) => c.uid === uid);
      if (!card) return;
      const cap = BALANCE.effects.perpetual.cardCap;
      const now = card.perm ?? { attack: 0, hp: 0 };
      const next = { attack: Math.min(cap, now.attack + n), hp: Math.min(cap, now.hp + n) };
      card.perm = next;
      log(g, depth, `${ps.name}は手札のモンスターカード1枚を永久強化した（攻撃力+${next.attack}・体力+${next.hp}${next.attack < now.attack + n ? `、1枚につき+${cap}まで` : ''}）`, 'effect', undefined, {
        kind: 'stat',
        player: p,
        status: 'perpetual',
      });
      log(g, depth, `永久強化したカード：${cardName(g, card.cardId)}`, 'info', p);
    },
    deckToBottomQuiet(p, uids) {
      deckToBottom(g, p, uids, depth, (n) => `${g.players[p].name}の山札の上から${n}枚を山札の下に置いた`);
    },
    // ---- MTG 要素 △ バッチC
    manifest(p) {
      const ps = g.players[p];
      const top = ps.deck[0];
      if (!top) {
        log(g, depth, `${ps.name}の山札が無いので、予示できない`);
        return;
      }
      ps.deck.shift();
      const def = top.cardId === NOISE_CARD_ID ? undefined : g.cards[top.cardId];
      log(g, depth, `${ps.name}は山札の一番上を裏向きで場に出した（予示）`, 'effect', undefined, { kind: 'status', player: p, status: 'manifest' });
      placeFaceDown(g, p, top, 'manifest', def?.stats ? def.cost : null, depth);
    },
    extraTurn() {
      const ps = g.players[me];
      if (isCopy()) {
        log(g, depth, '追加ターンは、無料で使ったときや写しでは得られない');
        return false;
      }
      if (ps.extraTurnUsed) {
        log(g, depth, `${ps.name}はこの試合でもう追加ターンを得た（1試合1回）`);
        return false;
      }
      ps.extraTurnUsed = true;
      ps.extraTurnPending = true;
      log(g, depth, `${ps.name}はこのターンのあと、追加のターンを得る`, 'effect', undefined, { kind: 'status', player: me, status: 'extraTurn' });
      return true;
    },
    swapHp() {
      const ps = g.players[me];
      const op = g.players[other(me)];
      if (isCopy()) {
        log(g, depth, 'HP交換は、無料で使ったときや写しでは起きない');
        return false;
      }
      if (ps.swapUsed) {
        log(g, depth, `${ps.name}はこの試合でもうHP交換をした（1試合1回）`);
        return false;
      }
      ps.swapUsed = true;
      const mine = ps.hp;
      const theirs = op.hp;
      ps.hp = Math.min(theirs, mine + Math.floor(ps.maxHp * BALANCE.effects.swapHp.gainCapRate), ps.maxHp);
      op.hp = Math.min(mine, op.maxHp);
      log(g, depth, `HP交換：${ps.name} ${mine}→${ps.hp}、${op.name} ${theirs}→${op.hp}`, 'effect', undefined, { kind: 'status', player: me, status: 'swapHp', amount: ps.hp });
      checkGameEnd(g);
      return true;
    },
    heistCopy(from, uid) {
      const card = g.players[from].deck.find((c) => c.uid === uid);
      if (!card) return;
      const ps = g.players[me];
      ps.hand.push({ uid: newUid(g, 'hs'), cardId: card.cardId, owner: me, copy: 'temp', heisted: true });
      log(g, depth, `${ps.name}は相手の山札のカード1枚のコピーを手札に加えた（強奪。使い切り）`, 'effect', undefined, { kind: 'status', player: me, status: 'heist' });
      log(g, depth, `強奪したカード：「${cardName(g, card.cardId)}」`, 'info', me);
    },
    buildSiege(hp) {
      const opp = other(me);
      const max = B.maxSieges;
      const mine = [...g.players[0].board, ...g.players[1].board].filter((m) => m.siege?.player === me).length;
      if (mine >= max) {
        log(g, depth, `砦は1人${max}つまでなので、築けない`);
        return;
      }
      g.cards[SIEGE_CARD_ID] ??= siegeDef();
      const card = { uid: newUid(g, 'sg'), cardId: SIEGE_CARD_ID, owner: opp, token: { attack: 0, hp, siege: true } };
      const m = placeMonster(g, opp, card, depth);
      if (m) m.siege = { player: me, cardId: src.cardId };
    },
  };

  /** 写し（反復の2回目）・無料で使ったとき（続唱・待機）か。追加ターン・HP交換は出ない */
  function isCopy(): boolean {
    const rec = opts.protectKey ? g.protect[opts.protectKey] : undefined;
    return src.kind !== 'card' || rec?.copied === true || rec?.freeDepth !== undefined;
  }
}

/** 封殺の種類の呼び方 */
const QUASH_LABEL: Record<string, string> = { any: 'カード', attack: 'アタック', skill: 'スキル', monster: 'モンスター', power: 'パワー' };
