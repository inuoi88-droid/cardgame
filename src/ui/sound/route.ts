/**
 * 演出の合図（battle/fx/cues.ts の CueId）→ 効果音（決定事項 #127）。純粋な関数（tests/sound.test.ts）。
 * 対応はユーザーが聞いて選んだときの表（sfx/manifest.json の fxCueMap）どおり。画面の操作の音は uiClass.ts。
 */
import type { CueId, CueOpts } from '../battle/fx/cues.ts';
import type { FxArch } from '../battle/fx/registry.ts';
import type { SoundId } from './catalog.ts';

export interface Routed {
  sound: SoundId;
  /** 音量に掛ける値（1 が基本） */
  gain?: number;
}

const SPELL: Record<string, SoundId> = {
  fire: 'spell.fire',
  poison: 'spell.poison',
  ice: 'spell.ice',
  holy: 'spell.holy',
  shadow: 'spell.dark',
  blood: 'spell.blood',
  arcane: 'spell.arcane',
};

const HIT: Record<string, SoundId> = { s: 'hit.small', m: 'hit.medium', l: 'hit.heavy' };

/**
 * 効果を放った（cast）ときに音を出さない型：着弾（回復・守り・強化・出現・カードの移動・エナジー・盤面の色）が
 * すぐ自分の音を鳴らすので、放つ音と着弾の音が重ならないように着弾だけにする
 */
export const SILENT_CAST_ARCHS: ReadonlySet<FxArch> = new Set<FxArch>(['heal', 'ward', 'buff', 'summon', 'draw', 'discard', 'energy', 'tint']);

/** 物理の効果：斬る・砕く（打撃）は攻撃の振り、そのほか（壁・罠・鎖など）は大地 */
const PHYSICAL_SWING: ReadonlySet<FxArch> = new Set<FxArch>(['bolt', 'shatter', 'rune']);

/** 演出の合図 → 効果音（鳴らさないなら null）。hit.* は鳴らす前に mixer.ts の HitGate でまとめる */
export function routeCue(cue: CueId, opts: CueOpts): Routed | null {
  if (cue.startsWith('cast.')) {
    if (opts.arch && SILENT_CAST_ARCHS.has(opts.arch)) return null;
    const el = cue.slice(5);
    if (el === 'physical') return { sound: !opts.arch || PHYSICAL_SWING.has(opts.arch) ? 'attack.swing' : 'spell.earth' };
    const s = SPELL[el];
    return s ? { sound: s } : null;
  }
  if (cue.startsWith('hit.')) {
    const s = HIT[cue.slice(cue.lastIndexOf('.') + 1)];
    return s ? { sound: s } : null;
  }
  switch (cue) {
    case 'turn.mine':
      return { sound: 'turn.mine' };
    case 'turn.enemy':
      return { sound: 'turn.enemy' };
    case 'card.reveal':
      return { sound: 'card.play.enemy' };
    case 'card.play':
      return { sound: 'card.play' };
    case 'card.fly':
      return { sound: 'card.fly' };
    case 'target.lock':
      return { sound: 'target.lock', gain: 0.8 };
    case 'heal':
      return { sound: 'heal' };
    case 'ward':
      // シールド・守護は盾、聖盾は聖
      return { sound: opts.variant === 'divine' ? 'spell.holy' : 'shield.gain' };
    case 'ward.break':
      return { sound: 'ward.break' };
    case 'buff':
      if (opts.variant === 'divine') return { sound: 'spell.holy' };
      if (opts.variant === 'keyword') return { sound: 'keyword.grant' };
      if (opts.arch === 'ward') return { sound: 'shield.gain' };
      if (opts.arch === 'heal') return { sound: 'heal' };
      return { sound: 'buff' };
    case 'debuff':
      if (opts.arch === 'move') return { sound: 'card.fly' };
      if (opts.arch === 'bind') return { sound: 'bind' };
      if (!opts.arch || opts.arch === 'debuff' || opts.arch === 'shatter' || opts.arch === 'bolt') return { sound: 'debuff' };
      // そのほかの状態（形が光るだけのもの）は汎用の付与
      return { sound: 'status.apply' };
    case 'bind':
      return { sound: 'bind' };
    case 'summon':
      return { sound: 'summon' };
    case 'token':
      return { sound: 'token.create' };
    case 'destroy':
      return { sound: 'destroy' };
    case 'draw':
      return { sound: 'card.draw' };
    case 'discard':
      return { sound: 'card.discard' };
    case 'mill':
      return { sound: 'card.mill' };
    case 'energy':
      return { sound: 'energy.gain' };
    case 'field':
      return { sound: 'field' };
    case 'move':
      return { sound: 'card.fly' };
    case 'rune':
      return { sound: 'status.apply' };
    case 'attack':
      return { sound: 'attack.swing' };
    case 'retaliate':
      return { sound: 'retaliate' };
    case 'player.hit':
      return { sound: 'hit.player' };
    case 'block':
      return { sound: 'shield.block' };
    case 'notice':
      // 中央の短い知らせは控えめに（ほかの音と重なるなら鳴らさない：player.ts）
      return { sound: 'ui.confirm', gain: 0.55 };
    case 'recap':
      return { sound: 'ui.tab' };
    default:
      return null;
  }
}
