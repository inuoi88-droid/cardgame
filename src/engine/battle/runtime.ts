/** 効果ファイルに渡す道具（EffectRuntime）と、対象の解決 */
import { BALANCE } from '../balance.ts';
import { TIMINGS, type TargetRule } from '../options.ts';
import type { EffectInstance, TimingId } from '../types.ts';
import { cardName, findMonster, log, monsterLabel, other, playerRef, targetExists } from './core.ts';
import { addStatus, cleanse, dealDamage, destroyMonster, heal } from './damage.ts';
import { pick } from './rng.ts';
import {
  addNoise,
  bounce,
  copyFromHand,
  discardRandom,
  dispel,
  dispelOptions,
  drawCards,
  reviveFromDiscard,
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
  }
}

export interface RuntimeOpts {
  depth: number;
  attackCard: boolean;
  protectKey?: string;
}

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
      const ps = g.players[me];
      const bonus = opts.attackCard ? ps.status.strength + ps.status.focus : 0;
      const r = dealDamage(g, target, amount, { kind: 'hit', source: origin(), bonus, pierce: o.pierce, depth });
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
      log(g, depth, `${g.players[p].name}はシールド${amount}を得た（合計${g.players[p].shield}）`);
    },
    gainEnergy(p, amount) {
      const ps = g.players[p];
      ps.energy += amount;
      log(g, depth, `${ps.name}はエナジーを${amount}得た（エナジー${ps.energy}）`);
    },
    addNextTurn(p, delta) {
      const ps = g.players[p];
      if (delta.draw) ps.next.draw += delta.draw;
      if (delta.energy) ps.next.energy += delta.energy;
      const parts = [
        delta.draw ? `引く枚数${delta.draw > 0 ? '+' : '−'}${Math.abs(delta.draw)}` : '',
        delta.energy ? `エナジー${delta.energy > 0 ? '+' : '−'}${Math.abs(delta.energy)}` : '',
      ].filter(Boolean);
      log(g, depth, `${ps.name}の次のターン：${parts.join('、')}`);
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
      addNoise(g, p, count, depth);
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
  };
}
