/**
 * 効果音の台帳（決定事項 #127）。ユーザーが聞いて選んだ 52 の音。ファイルは sfx/<ID>.mp3（モノラルの MP3・分類ごとに音量をそろえてある。
 * 出典と加工は sfx/manifest.json と docs/CREDITS.md。どれも CC0）。純粋なデータ（DOM を触らない）。
 *
 * 新しい音を足すとき：sfx/<ID>.mp3 を置き、ここに1行（分類 group）。演出の合図から鳴らすなら route.ts の routeCue にも1行
 * （tests/sound.test.ts がファイルの有無と、演出の合図がすべて実在の音につながることを確かめる）。
 */

/** 分類（音量はこの単位でそろえてある）。優先度と、読み込みの遅れをどこまで待つかもこの単位 */
export type SoundGroup = 'ui' | 'card' | 'turn' | 'combat' | 'magic' | 'effect' | 'result';

export const SOUND_GROUP = {
  'ui.click': 'ui',
  'ui.confirm': 'ui',
  'ui.cancel': 'ui',
  'ui.error': 'ui',
  'ui.toggle': 'ui',
  'ui.tab': 'ui',
  'card.draw': 'card',
  'card.shuffle': 'card',
  'card.hover': 'card',
  'card.play': 'card',
  'card.play.enemy': 'card',
  'card.discard': 'card',
  'card.mill': 'card',
  'card.fly': 'card',
  'turn.mine': 'turn',
  'turn.enemy': 'turn',
  'turn.end': 'turn',
  'energy.gain': 'turn',
  field: 'turn',
  'attack.swing': 'combat',
  'hit.small': 'combat',
  'hit.medium': 'combat',
  'hit.heavy': 'combat',
  'hit.player': 'combat',
  'target.lock': 'combat',
  retaliate: 'combat',
  'shield.block': 'combat',
  'ward.break': 'combat',
  destroy: 'combat',
  summon: 'combat',
  'spell.fire': 'magic',
  'spell.ice': 'magic',
  'spell.poison': 'magic',
  'spell.dark': 'magic',
  'spell.blood': 'magic',
  'spell.holy': 'magic',
  'spell.arcane': 'magic',
  'spell.earth': 'magic',
  heal: 'effect',
  'shield.gain': 'effect',
  buff: 'effect',
  debuff: 'effect',
  'status.apply': 'effect',
  bind: 'effect',
  'token.create': 'effect',
  'keyword.grant': 'effect',
  'draft.pick': 'effect',
  'invite.notify': 'effect',
  mulligan: 'effect',
  victory: 'result',
  defeat: 'result',
  'draw-game': 'result',
} as const satisfies Record<string, SoundGroup>;

export type SoundId = keyof typeof SOUND_GROUP;

export const SOUND_IDS = Object.keys(SOUND_GROUP) as SoundId[];

export const isSoundId = (s: unknown): s is SoundId => typeof s === 'string' && Object.prototype.hasOwnProperty.call(SOUND_GROUP, s);

/**
 * 声が足りないとき（同時に鳴らせる数を超えたとき）に残す順。大きいほど大事：決着 > ターン・招待 > 戦闘 > 魔法・効果 > カード > 画面の操作
 */
const GROUP_PRIORITY: Readonly<Record<SoundGroup, number>> = { result: 6, turn: 5, combat: 4, magic: 3, effect: 3, card: 2, ui: 1 };

export function priorityOf(id: SoundId): number {
  if (id === 'invite.notify') return 5;
  if (id === 'hit.player') return 5;
  return GROUP_PRIORITY[SOUND_GROUP[id]];
}

/**
 * 頼んでから鳴るまでに待てる時間（ms）。初めて鳴らす音は読み込みと展開が要るので、これより遅れたら鳴らさない
 * （演出とずれた音を後から鳴らさない）。決着・招待は少し遅れても鳴らす
 */
export function maxLatencyOf(id: SoundId): number {
  const g = SOUND_GROUP[id];
  if (g === 'result' || id === 'invite.notify') return 2500;
  if (g === 'turn') return 600;
  return 250;
}
