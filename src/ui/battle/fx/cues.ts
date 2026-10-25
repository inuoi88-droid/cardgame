/**
 * 演出の合図（cue）。音はまだ付けない（決定事項 #126：音はユーザーと別に決める）が、
 * 演出のひとつひとつに安定した ID を付けて、ここ1か所の playCue を通す。あとで音を付けるときは setCueHandler に関数を渡すだけで、
 * 呼び出し側（director.ts）は変えなくてよい。
 *
 * ID の形：
 * - 種類だけ：'heal'・'summon'・'destroy'・'draw' など
 * - 属性つき：'cast.<属性>'（効果を放った）・'hit.<属性>.<s|m|l>'（当たった。大きさはダメージの量）
 * - 側つき：'turn.mine'・'turn.enemy'
 * 一覧（CUES）は説明つき。足したら docs/SPEC.md の決定事項 #126 の一覧にも書く（tests/battle/fx.test.ts が見比べる。表の中の | は全角の ｜）。
 */
import type { FxElement } from './registry.ts';

export const FX_ELEMENTS = ['fire', 'poison', 'ice', 'holy', 'shadow', 'blood', 'arcane', 'physical'] as const satisfies readonly FxElement[];
export type FxSize = 's' | 'm' | 'l';

type ElementCue<P extends string> = `${P}.${FxElement}`;
type HitCue = `hit.${FxElement}.${FxSize}`;

export type CueId =
  | 'turn.mine'
  | 'turn.enemy'
  | 'card.reveal'
  | 'card.play'
  | 'card.fly'
  | 'target.lock'
  | ElementCue<'cast'>
  | HitCue
  | 'heal'
  | 'ward'
  | 'ward.break'
  | 'buff'
  | 'debuff'
  | 'bind'
  | 'summon'
  | 'token'
  | 'destroy'
  | 'draw'
  | 'discard'
  | 'mill'
  | 'energy'
  | 'field'
  | 'move'
  | 'rune'
  | 'attack'
  | 'retaliate'
  | 'player.hit'
  | 'notice'
  | 'recap';

/** 合図の一覧と意味（音を付けるときの台帳。属性・大きさつきのものは代表の形で書く） */
export const CUES: Record<string, string> = {
  'turn.mine': 'あなたのターンが始まった（見出し・サファイア）',
  'turn.enemy': '相手のターンが始まった（見出し・深紅）',
  'card.reveal': '相手がカードを使った：カードが手札から飛んで見える',
  'card.play': '自分がカードを使った',
  'card.fly': '見せたカードが対象へ飛ぶ',
  'target.lock': '対象に照準が付く',
  'cast.<属性>': '効果を放った（属性は fire・poison・ice・holy・shadow・blood・arcane・physical）',
  'hit.<属性>.<s|m|l>': 'ダメージが当たった（大きさ s・m・l はプレイヤーの最大HPに対する量）',
  heal: '回復・再生・浄化',
  ward: '守りの輪（シールド・聖盾・守護・無効化）',
  'ward.break': '聖盾・加護がダメージを防いで割れた',
  buff: '強化（攻撃力・筋力・キーワードを得た）',
  debuff: '弱体（弱体・脆弱・衰弱などの状態異常）',
  bind: '封じる（封印・凍結・呪縛・封殺）',
  summon: 'モンスターが場に出た',
  token: 'トークンが出た',
  destroy: 'モンスター・パワーが破壊された／消えた',
  draw: 'カードを引いた・手札に加えた',
  discard: '手札を捨てた・除外した',
  mill: '山札から捨て札へ置いた',
  energy: 'エナジーを得た',
  field: 'フィールド・昼と夜が変わった',
  move: 'モンスターが手札・相手の場へ移った',
  rune: 'そのほかの効果（形が光るだけ）',
  attack: 'モンスターの攻撃（踏み込みと斬撃）',
  retaliate: '攻撃されたモンスターの反撃',
  'player.hit': 'あなたのHPが減った（画面の下の縁が赤く光る）',
  notice: '中央の短い知らせ',
  recap: '相手のターンのまとめを出した',
};

/** 合図に添える情報：自分の行動か（側の色）・大きさ（0〜1。ダメージなどの量の目安） */
export interface CueOpts {
  mine: boolean;
  magnitude?: number;
}

export type CueHandler = (cue: CueId, opts: CueOpts) => void;

let handler: CueHandler | null = null;

/** 音などをつなぐ口（今は何もつながっていない）。null で外す */
export function setCueHandler(h: CueHandler | null): void {
  handler = h;
}

/** 演出の合図。今は何もしない（音を付けるときの入口） */
export function playCue(cue: CueId, opts: CueOpts): void {
  handler?.(cue, opts);
}

/** ダメージの大きさ（プレイヤーの最大HPに対する割合で s・m・l） */
export function sizeOf(amount: number, playerHp: number): FxSize {
  const r = playerHp > 0 ? amount / playerHp : 0;
  return r < 0.025 ? 's' : r < 0.05 ? 'm' : 'l';
}
