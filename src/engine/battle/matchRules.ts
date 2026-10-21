/**
 * 対戦のオプション（MTG 要素 △ バッチD）：フィールドの置き換え・次元の移り変わり・昼と夜の始まりと切り替え。
 * 効き目そのもの（攻撃力・ドロー・コストなど）は rules.ts の ruleHooks。
 */
import { BALANCE } from '../balance.ts';
import { ACTIVE_FIELD_IDS, FIELDS, type FieldId } from '../fields.ts';
import type { CardDef } from '../types.ts';
import { log } from './core.ts';
import { randInt } from './rng.ts';
import type { GameState, PlayerId } from './types.ts';

/** フィールドを置く（同じフィールドなら何もしない）。by は効果「フィールド」で置いた人（次元なら null） */
export function setField(g: GameState, id: FieldId, by: PlayerId | null, depth: number): void {
  if (g.field?.id === id) {
    if (by !== null) log(g, depth, `フィールドはもう「${FIELDS[id].name}」なので変わらない`, 'info');
    return;
  }
  g.field = { id, by, since: g.turnIndex };
  const f = FIELDS[id];
  const who = by === null ? '次元' : g.players[by].name;
  log(g, depth, `${f.icon}フィールドが「${f.name}」になった（${who}）：${f.description}`, 'effect', undefined, {
    kind: 'field',
    status: id,
    ...(by !== null ? { player: by } : {}),
  });
}

/** 次元：今と違うフィールドをランダムに選ぶ（シード乱数）。見送り中のフィールド（闘技場。決定事項 #102）は選ばない */
function randomField(g: GameState, except: FieldId | null): FieldId {
  const pool = ACTIVE_FIELD_IDS.filter((id) => id !== except);
  return pool[randInt(g, pool.length)]!;
}

/** 対戦の開始時：次元（random・planar）ならフィールドを1つ、昼と夜のオプションなら昼で始める */
export function setupMatchRules(g: GameState): void {
  const rules = g.rules;
  if (rules?.field === 'random' || rules?.field === 'planar') setField(g, randomField(g, null), null, 0);
  if (rules?.dayNight) setDayNight(g, 'day', 0, '対戦のオプション');
}

/** 次の次元の切り替えの通算ターン（planar でなければ null） */
export function nextPlanarTurn(g: GameState): number | null {
  if (g.rules?.field !== 'planar') return null;
  const every = BALANCE.fields.planarEvery;
  // 通算 1+every・1+2×every… ターン目の開始時に切り替わる
  const t = Math.max(g.turnIndex, 1);
  return 1 + (Math.floor((t - 1) / every) + 1) * every;
}

/** ターン開始時（turnIndex を進めた直後）：次元が移り変わる */
export function planarTick(g: GameState): void {
  if (g.rules?.field !== 'planar') return;
  const every = BALANCE.fields.planarEvery;
  if (g.turnIndex <= 1 || (g.turnIndex - 1) % every !== 0) return;
  setField(g, randomField(g, g.field?.id ?? null), null, 1);
}

export function setDayNight(g: GameState, to: 'day' | 'night', depth: number, why: string): void {
  if (g.dayNight === to) return;
  const started = g.dayNight === undefined;
  g.dayNight = to;
  const label = to === 'day' ? '☀昼' : '🌙夜';
  log(g, depth, started ? `昼と夜が始まった：${label}（${why}）` : `${label}になった（${why}）`, 'effect', undefined, { kind: 'dayNight', status: to });
}

/** 「昼なら」「夜なら」の条件を持つカードか */
export function usesDayNight(def: CardDef | undefined): boolean {
  return (def?.effects ?? []).some((e) => e.condition === 'isDay' || e.condition === 'isNight');
}

/** 昼と夜がまだ始まっていなければ、「昼なら／夜なら」のカードが場に出た・使われたときに昼で始める */
export function startDayNightFor(g: GameState, def: CardDef | undefined, depth: number): void {
  if (g.dayNight !== undefined || !usesDayNight(def)) return;
  setDayNight(g, 'day', depth, `「${def!.name}」`);
}

/** ターン終了時（turnEndFinish）：昼に手番の人が toNight 枚以下しか使わなければ夜、夜に toDay 枚以上使えば昼 */
export function dayNightAtTurnEnd(g: GameState, p: PlayerId): void {
  if (g.dayNight === undefined) return;
  const played = g.players[p].turn.cardsPlayed;
  const D = BALANCE.dayNight;
  if (g.dayNight === 'day' && played <= D.toNight) setDayNight(g, 'night', 1, played === 0 ? `${g.players[p].name}がこのターンにカードを使わなかった` : `${g.players[p].name}がこのターンにカードを${played}枚しか使わなかった`);
  else if (g.dayNight === 'night' && played >= D.toDay) setDayNight(g, 'day', 1, `${g.players[p].name}がこのターンにカードを${played}枚使った`);
}
