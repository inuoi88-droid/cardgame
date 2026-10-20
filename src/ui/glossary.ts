/**
 * 用語集：状態異常・持続効果・モンスターの状態の「名前」「短い説明」「アイコン」。
 * 対戦画面のポップオーバーとルールページが同じ文を使う。数字は balance.ts から読む。
 */
import { BALANCE, CONDITIONS, TIMINGS, listKeywords, listModifiers } from '../engine/index.ts';

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
  | 'doom'
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
  doom: {
    name: '呪縛',
    icon: '⏳',
    tone: 'bad',
    short: `自分のターン開始時に、呪縛の数だけダメージ（シールド・無効化を無視）。毒と違って減らない。浄化で消える。合計は${B.doomCap}まで`,
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
  deathtouch: '☣',
  firstStrike: '🏹',
  hexproof: '🔰',
  lifelink: '💞',
  bushido: '🎌',
  divineShield: '✴',
};

/** キーワードの用語（レジストリから作る。名前と説明はエンジンの定義そのもの） */
export const keywordGlossary: Record<string, GlossaryEntry> = Object.fromEntries(
  listKeywords().map((def) => {
    const inst = def.value ? { id: def.id, value: def.value.default } : { id: def.id };
    return [def.id, { name: def.name, short: def.describe(inst), icon: KEYWORD_ICON[def.id] ?? '◆', tone: 'info' as const }];
  }),
);

const MODIFIER_ICON: Record<string, string> = {
  pierce: '🗡',
  drain: '🩸',
  xEnergy: 'Ⓧ',
  perEnemyMonster: '👥',
  perCardPlayed: '🃏',
};

/** 効果のオプション（防御無視・吸収・X など。レジストリから作る） */
export const modifierGlossary: Record<string, GlossaryEntry> = Object.fromEntries(
  listModifiers().map((def) => [def.id, { name: def.name, short: def.summary, icon: MODIFIER_ICON[def.id] ?? '◇', tone: 'info' as const }]),
);

/** 発動タイミング（options.ts の説明そのもの）。ID は `timing:<id>` */
export const timingGlossary: Record<string, GlossaryEntry> = Object.fromEntries(
  Object.values(TIMINGS).map((t) => [`timing:${t.id}`, { name: t.label, short: t.description, icon: '⏱', tone: 'info' as const }]),
);

/** 条件（options.ts の説明そのもの）。ID は `condition:<id>` */
export const conditionGlossary: Record<string, GlossaryEntry> = Object.fromEntries(
  Object.values(CONDITIONS).map((c) => [`condition:${c.id}`, { name: c.label, short: c.description, icon: '❓', tone: 'info' as const }]),
);

/** 対戦のしくみの用語（ログの出来事・対象の名前など） */
export const mechanicGlossary: Record<string, GlossaryEntry> = {
  coin: { name: 'コイン投げ', icon: '🪙', tone: 'info', short: '条件「コインを投げて表なら」の効果は、出るたびにコインを投げ、表（50%）のときだけ発動する' },
  thisMonster: { name: 'このモンスター', icon: '🎯', tone: 'info', short: '効果を持つモンスター自身。場にいなければ不発' },
  allyMonsters: { name: '自分のモンスター全体', icon: '👥', tone: 'info', short: '自分の場のモンスターすべて（効果を持つモンスター自身も含む）' },
  triggerAlly: { name: '出たモンスター', icon: '✨', tone: 'info', short: '「自分のモンスターが出るたび」で、いま場に出た自分のモンスター' },
  token: {
    name: 'トークン',
    icon: B.tokenIcon,
    tone: 'info',
    short: `効果で出る${B.tokenName}。ふつうのモンスターと同じく戦うが、場を離れると（破壊・手札に戻る）どこにも行かずに消える。1人${B.maxTokens}体まで`,
  },
  tempAttack: {
    name: '一時強化',
    icon: '⤴',
    tone: 'good',
    short: 'このターンだけ攻撃力が上がっている（攻撃・反撃・格闘に乗る）。ターン終了時に消える',
  },
  granted: {
    name: '付与されたキーワード',
    icon: '➕',
    tone: 'info',
    short: '効果で与えられたキーワード。場にいる間ずっと働く（封印中は働かない）。場を離れると消える',
  },
  fight: {
    name: '格闘',
    icon: '🤼',
    tone: 'info',
    short: '自分のモンスターと相手モンスターが、互いに攻撃力（一時強化・武士道を含む）ぶんのダメージを与え合う。反撃・「攻撃するたび」は起きない。接死・絆魂は働く',
  },
  lifespan: {
    name: '寿命',
    icon: '⌛',
    tone: 'bad',
    short: '持ち主のターン終了時に1ずつ減り、0になると場から消える（モンスターは破壊、パワーは消える）。出たターンも数える',
  },
  repeatCap: {
    name: '繰り返し誘発の上限',
    icon: '🔁',
    tone: 'info',
    short: `「自分のモンスターが出るたび」「自分の他のモンスターが破壊されるたび」「パワー・スキルを使うたび」「自分のカードの対象になるたび」「コスト${BALANCE.timingParams.bigCardCost}以上のカードを使うたび」は、1つのカードにつき1ターン${B.maxRepeatTriggersPerTurn}回まで`,
  },
  // ---- MTG 要素 ○ バッチA
  otherAllies: { name: '自分の他のモンスター全体', icon: '👬', tone: 'info', short: '効果を持つモンスター以外の、自分の場のモンスターすべて（モンスターのカードだけ）' },
  weakestAlly: { name: 'いちばん体力の低い自分のモンスター', icon: '🩹', tone: 'info', short: '効果が出る時点で体力（今の値）がいちばん低い自分のモンスター1体（同じなら左）。いなければ不発' },
  bothPlayers: {
    name: 'お互い',
    icon: '🤝',
    tone: 'info',
    short: '自分と相手の両方に同じ効果（ドロー・回復など。相手にも得があるぶん安い）。先に自分、次に相手。1ターンの上限はそれぞれで数える',
  },
  delayed: {
    name: '予約（次のターンに）',
    icon: '⏳',
    tone: 'info',
    short: `修飾「次のターンに」の効果は、使ったときに条件と数値を決めて予約し、次の自分のターン開始時（引いた後・ターン開始時の効果より前）に古い順に発動する。対象がいなくなっていれば不発。1人${B.maxDelayedPerPlayer}件まで。予約は相手にも見える`,
  },
  clash: {
    name: '激突',
    icon: '⚔',
    tone: 'info',
    short: '条件「激突して勝てば」の効果は、出るたびにお互いの山札の一番上のカードを公開してコストを比べ、自分の方が大きければ発動する（同じなら負け、山札がなければコスト−1）。めくったカードは山札の一番上に残る',
  },
  exploit: {
    name: '濫用',
    icon: '🩸',
    tone: 'info',
    short: '条件「自分のモンスター1体を生け贄にしたなら」のカードは、使ったとき（召喚時）に自分のモンスター1体を選んで破壊してよい（選ばなくてもよい。召喚時は出たモンスター自身も選べる）。破壊したら、その条件の効果が発動する',
  },
  exert: {
    name: '消耗',
    icon: '😮‍💨',
    tone: 'bad',
    short: '消耗のモンスターが攻撃すると、次の持ち主のターンは攻撃できない（自動攻撃もしない。反撃はする）',
  },
  drawn: {
    name: '引いたとき',
    icon: '✋',
    tone: 'info',
    short: 'タイミング「引いたとき」の効果は、対戦中に山札から引いたときに発動する（配った手札・マリガンでは出ない）。カードは手札に残る。効果が出ると、引いたカードが相手にも分かる',
  },
};

/** 状態異常・キーワード・オプション・しくみ・タイミング（timing:…）・条件（condition:…）のどの ID でも引ける */
export function glossaryOf(id: string): GlossaryEntry | undefined {
  return (
    (glossary as Record<string, GlossaryEntry>)[id] ??
    keywordGlossary[id] ??
    modifierGlossary[id] ??
    mechanicGlossary[id] ??
    timingGlossary[id] ??
    conditionGlossary[id]
  );
}
