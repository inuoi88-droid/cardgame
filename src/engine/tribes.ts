/**
 * 種族の特徴の名前と説明（決定事項 #143）。数値は balance.ts の `tribes` から読む。
 * 得意・苦手のポイントは points.ts（`tribeLeaning`）、対戦での働きは battle/core.ts（揃い・耐性・霊体）・battle/tribes.ts（出来事）
 */
import { BALANCE } from './balance.ts';
import { getEffect, getKeyword } from './registry.ts';
import { TRIBE_IDS, TRIBE_LABEL, type TribeId } from './types.ts';

const T = BALANCE.tribes;

const STATUS_NAME: Record<string, string> = { burn: 'やけど', freeze: '凍結', poison: '毒', bleed: '出血' };

export interface TribeFeature {
  name: string;
  text: string;
}

/** 常時の特性（その種族のモンスターがみな持つ。封印・休眠中は働かない） */
export const TRIBE_TRAITS: Record<TribeId, TribeFeature> = {
  beast: { name: '狩猟本能', text: `攻撃で相手のモンスターを破壊するたび、攻撃力+${T.beast.trait.attackPerKill}（場にいる間に+${T.beast.trait.maxBonus}まで）` },
  dragon: { name: '竜鱗', text: `${T.dragon.trait.immune.map((k) => STATUS_NAME[k]).join('・')}にならない` },
  undead: { name: '腐食', text: `攻撃・反撃でダメージを与えた相手のモンスターに毒${T.undead.trait.poisonOnHit}` },
  machine: { name: '鋼の体', text: `${T.machine.trait.immune.map((k) => STATUS_NAME[k]).join('・')}にならない` },
  spirit: { name: '霊体', text: '場に出てから次の自分のターンが始まるまで、相手のカードに選ばれない' },
  human: { name: '研鑽', text: `攻撃力アップ・鍛錬・装備で上がる攻撃力が、さらに+${T.human.trait.growBonus}` },
};

/** 揃えたときのボーナス（自分の場にその種族が setSize 体以上いる間） */
export const TRIBE_SETS: Record<TribeId, TribeFeature> = {
  beast: { name: '群れ', text: `自分の獣の攻撃力+${T.beast.set.attack}` },
  dragon: { name: '竜の息', text: `自分のターン開始時、相手プレイヤーに${T.dragon.set.breath}ダメージ` },
  undead: { name: '怨嗟', text: `自分の不死が破壊されるたび、相手プレイヤーに${T.undead.set.onDeath}ダメージ` },
  machine: { name: '連結', text: `自分の機械の守備力+${T.machine.set.defense}` },
  spirit: { name: '共鳴', text: `自分のターン開始時、カードを${T.spirit.set.draw}枚多く引く` },
  human: { name: '隊列', text: `自分のターン開始時、自分のプレイヤーのHPが${T.human.set.heal}回復` },
};

/** 得意・苦手の ID の名前（キーワード・効果・ステータス） */
export function leanName(id: string): string {
  if (id === 'stat:defense') return '守備力';
  return getKeyword(id)?.name ?? getEffect(id)?.name ?? id;
}

export interface TribeSummary {
  id: TribeId;
  label: string;
  favored: string[];
  unfavored: string[];
  trait: TribeFeature;
  set: TribeFeature;
}

/** 種族ごとのまとめ（ルールのページ・エディターの説明） */
export function tribeSummary(id: TribeId): TribeSummary {
  return {
    id,
    label: TRIBE_LABEL[id],
    favored: T[id].favored.map(leanName),
    unfavored: T[id].unfavored.map(leanName),
    trait: TRIBE_TRAITS[id],
    set: TRIBE_SETS[id],
  };
}

export const TRIBE_SUMMARIES: readonly TribeSummary[] = TRIBE_IDS.map(tribeSummary);
