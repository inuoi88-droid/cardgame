/** 今できる行動の一覧（UI・CPU・サーバーの検証で共用） */
import { BALANCE } from '../balance.ts';
import { CONDITIONS, isMonsterOnlyRule } from '../options.ts';
import { getEffect } from '../registry.ts';
import type { CardDef } from '../types.ts';
import { attackBlockReason, attackTargets } from './combat.ts';
import { checkCondition } from './conditions.ts';
import { other } from './core.ts';
import { cardTargetableTaunts } from './damage.ts';
import { nextFullMulliganSize } from './mulligan.ts';
import { allyCandidates, chosenRules, drawbackBlock, effectiveCost, enemyCandidates, leavesPower, validatePlay } from './play.ts';
import { NOISE_CARD_ID, type Action, type CardInst, type GameState, type PlayerId, type TargetRef } from './types.ts';

export interface PlayInfo {
  card: CardInst;
  cost: number;
  /** 使えない理由（使えるなら null） */
  blocked: string | null;
  enemyTargets: TargetRef[];
  allyTargets: string[];
  /**
   * 使えるが、今使っても発動しない効果があるときの注意（条件未達、対象なし、全体効果で場が空）。
   * 使用時・召喚時の効果だけを見る。空なら注意なし
   */
  warnings: string[];
  /** 相手の挑発のせいで「選んだ1体」が挑発モンスターに限られているか（決定事項 #83） */
  tauntLimited: boolean;
}

export const WARN_NO_TARGET = '対象がいません';
export const WARN_NO_ENEMY_MONSTER = '相手の場にモンスターがいません';
export const WARN_NO_MONSTER = '場にモンスターがいません';
const WARN_POWER_CAP_HEAD = 'パワーが';
/** 対象選びの案内（確認ダイアログは出さない） */
export const NOTE_TAUNT_LIMITED = '挑発がいるので、挑発のモンスターしか選べません';

/** パワーの上限の注意（「発動しない」ではなく「古いパワーが消える」注意）か */
export function isPowerCapWarning(w: string): boolean {
  return w.startsWith(WARN_POWER_CAP_HEAD);
}

/** 今使っても発動しない効果の注意（使用時・召喚時の効果が対象） */
export function playWarnings(g: GameState, p: PlayerId, def: CardDef, allyTargets: string[]): string[] {
  const timing = def.stats ? 'summon' : 'play';
  const isMonsterCard = def.stats !== null;
  const oppMonsters = g.players[other(p)].board.length;
  const myMonsters = g.players[p].board.length + (isMonsterCard ? 1 : 0);
  const out: string[] = [];
  const add = (s: string) => {
    if (!out.includes(s)) out.push(s);
  };
  const powers = g.players[p].powers;
  if (powers.length >= BALANCE.battle.maxPowers && leavesPower(def)) {
    add(`${WARN_POWER_CAP_HEAD}${BALANCE.battle.maxPowers}つあるので『${powers[0]!.name}』が消えます`);
  }
  for (const e of def.effects) {
    if (e.timing !== timing) continue;
    const ed = getEffect(e.id);
    if (!ed) continue;
    if (e.condition && !checkCondition(g, p, e.condition)) add(`条件を満たしていません：${CONDITIONS[e.condition].label}`);
    const rule = ed.targetRule;
    const monsterOnly = isMonsterOnlyRule(rule);
    if (rule === 'fight') {
      // 格闘：自分のモンスターと相手モンスターの両方が要る
      const enemies = e.target === 'chosen' ? enemyCandidates(g, p, [rule]).length : oppMonsters;
      const allies = e.target === 'chosen' ? allyTargets.length : myMonsters;
      if (enemies === 0 || allies === 0) add(WARN_NO_TARGET);
      continue;
    }
    switch (e.target) {
      case 'chosen':
        if (rule === 'allyMonsterOne') {
          if (allyTargets.length === 0) add(WARN_NO_TARGET);
        } else if (enemyCandidates(g, p, [rule]).length === 0) {
          add(WARN_NO_TARGET);
        }
        break;
      case 'random':
        if (rule === 'allyMonsterOne' ? myMonsters === 0 : monsterOnly && oppMonsters === 0) add(WARN_NO_TARGET);
        break;
      case 'enemyMonsters':
        if (oppMonsters === 0) add(WARN_NO_ENEMY_MONSTER);
        break;
      case 'everyone':
        if (monsterOnly && oppMonsters === 0 && myMonsters === 0) add(WARN_NO_MONSTER);
        break;
      case 'board':
        if (oppMonsters === 0 && myMonsters === 0) add(WARN_NO_MONSTER);
        break;
      case 'allyMonsters':
        if (myMonsters === 0) add(WARN_NO_TARGET);
        break;
      default:
        break;
    }
  }
  return out;
}

/** 手札のカードを使うときの情報（コスト、対象の候補、使えない理由、発動しない効果の注意） */
export function playInfo(g: GameState, p: PlayerId, card: CardInst): PlayInfo {
  const def = g.cards[card.cardId];
  if (card.cardId === NOISE_CARD_ID || !def) {
    return { card, cost: BALANCE.battle.noiseRemoveCost, blocked: 'ノイズ', enemyTargets: [], allyTargets: [], warnings: [], tauntLimited: false };
  }
  const rules = chosenRules(def);
  const enemyTargets = enemyCandidates(g, p, rules.enemy);
  const allyTargets = rules.ally ? allyCandidates(g, p, card) : [];
  const cost = effectiveCost(g, p, card);
  let blocked: string | null = null;
  if (g.phase !== 'main' || g.active !== p || g.pending) blocked = '今は使えません';
  else if (cost > g.players[p].energy) blocked = 'エナジーが足りません';
  else blocked = drawbackBlock(g, p, card);
  const tauntLimited = enemyTargets.length > 0 && cardTargetableTaunts(g, other(p)).length > 0;
  return { card, cost, blocked, enemyTargets, allyTargets, warnings: playWarnings(g, p, def, allyTargets), tauntLimited };
}

export function legalActions(g: GameState, p: PlayerId): Action[] {
  if (g.phase === 'ended') return [];
  const ps = g.players[p];
  if (g.phase === 'mulligan') {
    if (ps.mulligan.done) return [];
    const out: Action[] = [{ type: 'mulligan', player: p, mode: 'keep' }];
    if (nextFullMulliganSize(g, p) >= BALANCE.battle.mulliganMinHand) out.push({ type: 'mulligan', player: p, mode: 'all' });
    return out;
  }
  if (g.pending) {
    if (g.pending.player !== p) return [];
    const out: Action[] = [];
    if (g.pending.min === 0) out.push({ type: 'choose', player: p, picks: [] });
    for (const o of g.pending.options) out.push({ type: 'choose', player: p, picks: [o.id] });
    return out;
  }
  if (g.active !== p) return [];
  const out: Action[] = [];
  for (const card of ps.hand) {
    if (card.cardId === NOISE_CARD_ID) {
      if (ps.energy >= BALANCE.battle.noiseRemoveCost) out.push({ type: 'removeNoise', player: p, cardUid: card.uid });
      continue;
    }
    const info = playInfo(g, p, card);
    if (info.blocked) continue;
    const enemies: (TargetRef | undefined)[] = info.enemyTargets.length ? info.enemyTargets : [undefined];
    const allies: (string | undefined)[] = info.allyTargets.length ? info.allyTargets : [undefined];
    for (const enemy of enemies) {
      for (const ally of allies) {
        const chosen = { ...(enemy ? { enemy } : {}), ...(ally ? { ally } : {}) };
        if (validatePlay(g, p, card.uid, chosen) === null) out.push({ type: 'playCard', player: p, cardUid: card.uid, chosen });
      }
    }
  }
  for (const m of ps.board) {
    if (attackBlockReason(g, m)) continue;
    for (const target of attackTargets(g, m)) out.push({ type: 'attack', player: p, attackerUid: m.uid, target });
  }
  out.push({ type: 'endTurn', player: p });
  return out;
}
