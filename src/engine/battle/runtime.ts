/** 効果ファイルに渡す道具（EffectRuntime）と、対象の解決 */
import { BALANCE } from '../balance.ts';
import { TIMINGS, type TargetRule } from '../options.ts';
import type { EffectInstance, TimingId } from '../types.ts';
import { getKeyword } from '../registry.ts';
import { cardName, effectiveAttack, enqueue, findMonster, log, monsterLabel, other, playerRef, playRecord, targetExists, turnLimits } from './core.ts';
import { addStatus, cleanse, combatBonus, combatSourceOf, dealDamage, destroyMonster, heal } from './damage.ts';
import { pick } from './rng.ts';
import {
  addNoise,
  bounce,
  copyFromHand,
  createTokens,
  discardRandom,
  dispel,
  dispelOptions,
  drawCards,
  exileCard,
  reviveFromDiscard,
  scryMove,
  steal,
  takeFromDeck,
  takeFromDiscard,
} from './zones.ts';
import type { Chosen, EffectRuntime, GameState, PlayerId, SourceRef, TargetRef } from './types.ts';

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
        ...(opts.protectKey ? { playKey: opts.protectKey } : {}),
        depth,
      });
      if (o.drain && r.hpLost > 0) {
        const n = Math.floor(r.hpLost * BALANCE.battle.drainRate);
        log(g, depth + 1, `吸収：与えたダメージ${r.hpLost}の半分を回復`);
        heal(g, playerRef(me), n, depth + 1);
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
      log(g, depth, `${monsterLabel(g, m)}を封印した（効果とキーワードを失う）`);
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
      if (gain < amount) {
        log(g, depth, `${ps.name}はエナジーを${gain}得た（1ターン+${B.maxEnergyGainPerTurn}まで。エナジー${ps.energy}）`);
      } else {
        log(g, depth, `${ps.name}はエナジーを${gain}得た（エナジー${ps.energy}）`);
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
      if (parts.length > 0) log(g, depth, `${ps.name}の次のターン：${parts.join('、')}${note}`);
      else if (capped) log(g, depth, `${ps.name}はこれ以上妨害されない${note}`);
    },
    addDiscount(p, amount) {
      const ps = g.players[p];
      ps.discount += amount;
      log(g, depth, `${ps.name}が次に使うカードのコスト−${ps.discount}`);
    },
    addRetain(p, amount) {
      const ps = g.players[p];
      ps.turn.retain += amount;
      log(g, depth, `${ps.name}はこのターンの終了時に手札を${ps.turn.retain}枚残せる`);
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
      log(g, depth, `${monsterLabel(g, m)}の攻撃力 ${before}→${m.attack}`);
    },
    changeDefense(target, delta) {
      const m = monsterOf(target);
      if (!m) return;
      const before = m.defense;
      m.defense = Math.min(BALANCE.stats.defenseMax, Math.max(0, m.defense + delta));
      log(g, depth, `${monsterLabel(g, m)}の守備力 ${before}→${m.defense}`);
    },
    destroy(target) {
      const m = monsterOf(target);
      if (m) destroyMonster(g, m, depth);
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
      log(g, depth, `${monsterLabel(g, m)}：攻撃力 ${before.attack}→${m.attack}、体力 ${before.hp}→${Math.max(0, m.hp)}（最大${before.maxHp}→${Math.max(0, m.maxHp)}）`);
      // 体力が0以下になったら破壊（ダメージではないので守備力・聖盾・不屈は効かない）
      if (m.hp <= 0) {
        m.hp = 0;
        destroyMonster(g, m, depth + 1);
      }
    },
    addTempAttack(target, amount) {
      const m = monsterOf(target);
      if (!m) return;
      const before = effectiveAttack(m);
      m.tempAttack = (m.tempAttack ?? 0) + amount;
      log(g, depth, `${monsterLabel(g, m)}の攻撃力がこのターンだけ ${before}→${effectiveAttack(m)}`);
    },
    grantKeyword(target, keywordId) {
      const m = monsterOf(target);
      const kd = getKeyword(keywordId);
      if (!m || !kd) return;
      if (!(m.granted ?? []).includes(keywordId)) m.granted = [...(m.granted ?? []), keywordId];
      // 不屈・聖盾は与え直すと使えるようになる
      if (kd.battle.undying) m.undyingUsed = false;
      if (kd.battle.divineShield) m.shieldUsed = false;
      log(g, depth, `${monsterLabel(g, m)}に「${kd.name}」を与えた${m.sealed ? '（封印中は働かない）' : ''}`);
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
      log(g, depth, `${monsterLabel(g, m)}はもう一度攻撃できるようになった`);
    },
    fight(allyRef, enemyRef) {
      const a = monsterOf(allyRef);
      const e = monsterOf(enemyRef);
      if (!a || !e) return;
      // 先に両方の量（攻撃力＋一時強化＋武士道）と、弱体・接死・絆魂を決めてから、相手へ → 自分へ の順に与える
      const toEnemy = effectiveAttack(a) + combatBonus(g, a);
      const toAlly = effectiveAttack(e) + combatBonus(g, e);
      const aInfo = { weak: a.status.weak > 0, src: combatSourceOf(g, a), label: monsterLabel(g, a) };
      const eInfo = { weak: e.status.weak > 0, src: combatSourceOf(g, e), label: monsterLabel(g, e) };
      log(g, depth, `格闘：${aInfo.label}（${toEnemy}）と${eInfo.label}（${toAlly}）が戦う`);
      if (toEnemy > 0) {
        dealDamage(g, enemyRef, toEnemy, { kind: 'hit', source: allyRef, sourceWeak: aInfo.weak, combat: true, combatSource: aInfo.src, depth: depth + 1 });
      }
      if (toAlly > 0 && targetExists(g, allyRef)) {
        dealDamage(g, allyRef, toAlly, { kind: 'hit', source: enemyRef, sourceWeak: eInfo.weak, combat: true, combatSource: eInfo.src, depth: depth + 1 });
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
  };
}
