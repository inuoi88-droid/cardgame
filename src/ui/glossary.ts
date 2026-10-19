/**
 * 用語集：状態異常・持続効果・モンスターの状態の「名前」「短い説明」「アイコン」。
 * 対戦画面のポップオーバーとルールページが同じ文を使う。数字は balance.ts から読む。
 */
import { BALANCE, listKeywords } from '../engine/index.ts';

const B = BALANCE.battle;
const pct = (rate: number) => `${Math.round(rate * 100)}%`;

export interface GlossaryEntry {
  name: string;
  /** 1〜2文の説明（ポップオーバー用） */
  short: string;
  icon: string;
  /** 悪い状態か（表示の色分け用） */
  tone: 'bad' | 'good' | 'info';
}

/** 状態異常・持続効果の ID（battle.Statuses のキーと、モンスターの隠密・裏切り、モンスターの反撃） */
export type StatusId =
  | 'poison'
  | 'burn'
  | 'weak'
  | 'vulnerable'
  | 'bleed'
  | 'freeze'
  | 'confuse'
  | 'seal'
  | 'shield'
  | 'counter'
  | 'nullify'
  | 'regen'
  | 'strength'
  | 'focus'
  | 'stealth'
  | 'betrayal'
  | 'retaliation';

export const glossary: Record<StatusId, GlossaryEntry> = {
  poison: {
    name: '毒',
    icon: '☠',
    tone: 'bad',
    short: `自分のターン開始時に、毒の数だけダメージ（守備力・シールド・無効化を無視）。そのあと毒は半分（切り捨て）になる`,
  },
  burn: {
    name: 'やけど',
    icon: '🔥',
    tone: 'bad',
    short: `自分のターン終了時に${B.burnDamage}ダメージ（シールド・無効化を無視）。かかっている間は受ける回復が${pct(B.burnHealRate)}になる。残りターンの数だけ続く`,
  },
  weak: { name: '弱体', icon: '⬇', tone: 'bad', short: `与えるダメージが−${pct(B.weakRate)}（切り捨て）。自分のターン終了時に1ターン減る` },
  vulnerable: { name: '脆弱', icon: '💔', tone: 'bad', short: `受けるダメージが+${pct(B.vulnerableRate)}（切り捨て）。自分のターン終了時に1ターン減る` },
  bleed: {
    name: '出血',
    icon: '🩸',
    tone: 'bad',
    short: '攻撃やカードでダメージを受けるたび、出血の数だけ追加ダメージ（1枚のカード・1回の攻撃につき1回）。自分のターン終了時に半分になる',
  },
  freeze: {
    name: '凍結',
    icon: '❄',
    tone: 'bad',
    short: `次の自分のターン、モンスターは攻撃できない。プレイヤーは最初に使うカードのコストが+${B.freezeCostIncrease}`,
  },
  confuse: { name: '混乱', icon: '💫', tone: 'bad', short: '次の自分のターン開始時、敵味方を問わずランダムな相手を自動で攻撃する' },
  seal: { name: '封印', icon: '🔒', tone: 'bad', short: '効果とキーワードをすべて失う（デメリットは残る）。反撃はする' },
  shield: {
    name: 'シールド',
    icon: '🛡',
    tone: 'good',
    short: '受けるダメージを先に肩代わりする（毒・やけど・防御無視は通る）。次の自分のターン開始時に消える',
  },
  counter: {
    name: '反撃（状態）',
    icon: '↩',
    tone: 'good',
    short: '次の自分のターン開始時まで、攻撃やカードでダメージを受けたら、その相手に反撃の数だけダメージを返す（1枚のカード・1回の攻撃につき1回）',
  },
  nullify: { name: '無効化', icon: '✖', tone: 'good', short: '次に受けるダメージを0にする（回数ぶん）。毒・やけどは防げない' },
  regen: { name: '再生', icon: '✚', tone: 'good', short: '自分のターン開始時に、再生の数だけHPが回復。そのあと再生は半分（切り捨て）になる' },
  strength: {
    name: '筋力',
    icon: '💪',
    tone: 'good',
    short: `アタックのダメージに筋力の数を足す（1枚につき最初の1発だけ）。合計は${B.strengthCap}まで`,
  },
  focus: { name: '気合', icon: '✨', tone: 'good', short: 'このターンだけ、アタックのダメージに気合の数を足す（1枚につき最初の1発だけ）。ターン終了時に消える' },
  stealth: { name: '隠密', icon: '👤', tone: 'info', short: '相手の次のターン終了まで、相手の攻撃や効果の対象に選ばれない（全体効果は受ける）' },
  betrayal: { name: '裏切り', icon: '🗡', tone: 'bad', short: '持ち主を自動で攻撃する。自分では攻撃できない' },
  retaliation: {
    name: '反撃（モンスター）',
    icon: '⚔',
    tone: 'info',
    short: 'モンスターを攻撃すると、守備側がそのときの攻撃力ぶんを攻撃したモンスターに返す（同時に解決。プレイヤーへの攻撃では起きない）',
  },
};

export const STATUS_IDS = Object.keys(glossary) as StatusId[];

const KEYWORD_ICON: Record<string, string> = {
  haste: '⚡',
  taunt: '🛡',
  flying: '🕊',
  trample: '💥',
  doubleAttack: '⚔⚔',
  stealth: '👤',
  undying: '💀',
  selfRepair: '🔧',
};

/** キーワードの用語（レジストリから作る。名前と説明はエンジンの定義そのもの） */
export const keywordGlossary: Record<string, GlossaryEntry> = Object.fromEntries(
  listKeywords().map((def) => {
    const inst = def.value ? { id: def.id, value: def.value.default } : { id: def.id };
    return [def.id, { name: def.name, short: def.describe(inst), icon: KEYWORD_ICON[def.id] ?? '◆', tone: 'info' as const }];
  }),
);

/** 状態異常・キーワードどちらの ID でも引ける */
export function glossaryOf(id: string): GlossaryEntry | undefined {
  return (glossary as Record<string, GlossaryEntry>)[id] ?? keywordGlossary[id];
}
