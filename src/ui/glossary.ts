/**
 * 用語集：状態異常・持続効果・モンスターの状態の「名前」「短い説明」「アイコン」。
 * 対戦画面のポップオーバーとルールページが同じ文を使う。数字は balance.ts から読む。
 */
import { ACTIVE_FIELD_IDS, BALANCE, CONDITIONS, DISABLED_FIELD_IDS, FIELDS, LEADER_IDS, LEADERS, TIMINGS, TRIBE_IDS, TRIBE_LABEL, listAbilities, listKeywords, listModifiers } from '../engine/index.ts';

const B = BALANCE.battle;
const pct = (rate: number) => `${Math.round(rate * 100)}%`;

export interface GlossaryEntry {
  name: string;
  /** 1〜2文の説明（ポップオーバー用） */
  short: string;
  icon: string;
  /**
   * 画面に出すときの形（game-icons の名前。UiIcon で描く。決定事項 #111・UI2 の B）。
   * 絵文字の icon はルールページ・ログの文の中で使うので残す。無ければ icon の絵文字のまま
   */
  gi?: string;
  /** 悪い状態か（表示の色分け用） */
  tone: 'bad' | 'good' | 'info';
}

/** 状態異常・持続効果の ID（battle.Statuses のキーと、モンスターの隠密・裏切り、モンスターの反撃） */
export type StatusId =
  | 'poison'
  | 'doom'
  | 'rad'
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
    gi: 'poison-bottle',
    tone: 'bad',
    short: `自分のターン開始時に、毒の数だけダメージ（守備力・シールド・無効化を無視）。そのあと毒は半分（切り捨て）になる`,
  },
  doom: {
    name: '呪縛',
    icon: '⏳',
    gi: 'death-zone',
    tone: 'bad',
    short: `自分のターン開始時に、呪縛の数だけダメージ（シールド・無効化を無視）。毒と違って減らない。浄化で消える。合計は${B.doomCap}まで`,
  },
  rad: {
    name: '放射能',
    icon: '☢',
    gi: 'radioactive',
    tone: 'bad',
    short: `自分のターン開始時（引いた後）に、山札の上を放射能の数だけ捨て札に置き、モンスター以外1枚ごとに${B.radDamage}ダメージ（シールド・無効化を無視）。放射能はその枚数だけ減る。合計${B.radCap}まで。浄化で消える`,
  },
  burn: {
    name: 'やけど',
    icon: '🔥',
    gi: 'flame',
    tone: 'bad',
    short: `自分のターン終了時に${B.burnDamage}ダメージ（シールド・無効化を無視）。かかっている間は与えるダメージが${B.burnDamageRateLabel}（切り捨て。モンスターは攻撃・反撃、プレイヤーは自分の効果のダメージ）。残りターンの数だけ続く`,
  },
  weak: { name: '脱力', icon: '⬇', gi: 'shattered-sword', tone: 'bad', short: `与えるダメージが1発${B.exhaustCap}まで（モンスターは攻撃・反撃、プレイヤーは自分の効果のダメージ）。モンスターは攻撃するたび、プレイヤーはダメージのカードを使うたびに1つ減る` },
  vulnerable: { name: '脆弱', icon: '💔', gi: 'broken-heart', tone: 'bad', short: `受けるダメージが+${pct(B.vulnerableRate)}（切り捨て）。自分のターン終了時に1ターン減る` },
  bleed: {
    name: '出血',
    icon: '🩸',
    gi: 'bleeding-wound',
    tone: 'bad',
    short: '攻撃やカードでダメージを受けるたび、出血の数だけ追加ダメージ（1枚のカード・1回の攻撃につき1回）。自分のターン終了時に半分になる',
  },
  freeze: {
    name: '凍結',
    icon: '❄',
    gi: 'snowflake-1',
    tone: 'bad',
    short: `次の自分のターン、モンスターは攻撃できない。プレイヤーは最初に使うカードのコストが+${B.freezeCostIncrease}`,
  },
  confuse: { name: '混乱', icon: '💫', gi: 'knocked-out-stars', tone: 'bad', short: '次の自分のターン開始時、敵味方を問わずランダムな相手を自動で攻撃する' },
  seal: { name: '封印', icon: '🔒', gi: 'padlock', tone: 'bad', short: 'このターンだけ、効果とキーワードをすべて失う（デメリットは残る。ターン終了時に戻る）。反撃はする' },
  shield: {
    name: 'シールド',
    icon: '🛡',
    gi: 'energy-shield',
    tone: 'good',
    short: '受けるダメージを先に肩代わりする（毒・やけど・防御無視は通る）。次の自分のターン開始時に消える',
  },
  counter: {
    name: '反撃（状態）',
    icon: '↩',
    gi: 'return-arrow',
    tone: 'good',
    short: '次の自分のターン開始時まで、攻撃やカードでダメージを受けたら、その相手に反撃の数だけダメージを返す（1枚のカード・1回の攻撃につき1回）',
  },
  nullify: { name: '無効化', icon: '✖', gi: 'cancel', tone: 'good', short: '次に受けるダメージを0にする（回数ぶん）。毒・やけどは防げない' },
  regen: { name: '再生', icon: '✚', gi: 'regeneration', tone: 'good', short: '自分のターン開始時に、再生の数だけHPが回復。そのあと再生は半分（切り捨て）になる' },
  strength: {
    name: '筋力',
    icon: '💪',
    gi: 'muscle-up',
    tone: 'good',
    short: `アタックのダメージに筋力の数を足す（1枚につき最初の1発だけ）。合計は${B.strengthCap}まで`,
  },
  focus: { name: '気合', icon: '✨', gi: 'concentration-orb', tone: 'good', short: 'このターンだけ、アタックのダメージに気合の数を足す（1枚につき最初の1発だけ）。ターン終了時に消える' },
  stealth: { name: '隠密', icon: '👤', gi: 'hooded-figure', tone: 'info', short: '相手の次のターン終了まで、相手の攻撃や効果の対象に選ばれない（全体効果は受ける）' },
  betrayal: { name: '裏切り', icon: '🗡', gi: 'backstab', tone: 'bad', short: '持ち主を自動で攻撃する。自分では攻撃できない' },
  retaliation: {
    name: '反撃（モンスター）',
    icon: '⚔',
    gi: 'sword-clash',
    tone: 'info',
    short: 'モンスターを攻撃すると、守備側がそのときの攻撃力ぶんを攻撃したモンスターに返す（同時に解決。プレイヤーへの攻撃では起きない）',
  },
};

export const STATUS_IDS = Object.keys(glossary) as StatusId[];

const KEYWORD_ICON: Record<string, string> = {
  haste: '⚡',
  rush: '🦏',
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
  // MTG 要素 ○ バッチB
  hitAndRun: '↩',
  inspire: '📯',
  ward: '🔮',
  onslaught: '🐗',
  menace: '😠',
  doubleTeam: '👯',
  // MTG 要素 △ バッチA
  reach: '🏹',
  skulk: '🐾',
  // MTG 要素 △ バッチB
  enlist: '📣',
};

/** キーワードの形（game-icons。画面の札で絵文字の代わりに描く。1つの形は1つの意味だけ：tests/battleIcons.test.ts） */
export const KEYWORD_GI: Record<string, string> = {
  haste: 'sprint',
  rush: 'rhinoceros-horn',
  taunt: 'checked-shield',
  flying: 'feathered-wing',
  trample: 'stomp',
  doubleAttack: 'sword-array',
  stealth: 'hooded-figure',
  undying: 'ankh',
  selfRepair: 'wrench',
  deathtouch: 'death-skull',
  firstStrike: 'fast-arrow',
  hexproof: 'aura',
  lifelink: 'heart-wings',
  bushido: 'katana',
  divineShield: 'bolt-shield',
  hitAndRun: 'boomerang',
  inspire: 'trumpet-flag',
  ward: 'magic-shield',
  onslaught: 'charging-bull',
  menace: 'angry-eyes',
  doubleTeam: 'two-shadows',
  reach: 'bow-arrow',
  skulk: 'paw-print',
  enlist: 'megaphone',
};

/** キーワードの用語（レジストリから作る。名前と説明はエンジンの定義そのもの） */
export const keywordGlossary: Record<string, GlossaryEntry> = Object.fromEntries(
  listKeywords().map((def) => {
    const inst = def.value ? { id: def.id, value: def.value.default } : { id: def.id };
    return [def.id, { name: def.name, short: def.describe(inst), icon: KEYWORD_ICON[def.id] ?? '◆', gi: KEYWORD_GI[def.id], tone: 'info' as const }];
  }),
);

const MODIFIER_ICON: Record<string, string> = {
  pierce: '🗡',
  drain: '🩸',
  xEnergy: 'Ⓧ',
  perEnemyMonster: '👥',
  perCardPlayed: '🃏',
  perDiscardMonster: '🪦',
  perTribeAlly: '🐾',
  // MTG 要素 △ バッチA
  witherDmg: '🥀',
  perExp: '🎖',
  gamble: '🎲',
};

const ABILITY_ICON: Record<string, string> = {
  shuffleBack: '🔄',
  buyback: '↩',
  rebound: '🔁',
  grow: '🌱',
  // MTG 要素 ○ バッチC1
  flashback: '⚱',
  jumpStart: '🦘',
  escape: '🏃',
  activate: '⚡',
  cycling: '♻',
  channel: '🌀',
  affinity: '🧲',
  costCut: '✂',
  kicker: '🦶',
  // MTG 要素 ○ バッチC2
  entwine: '🔗',
  charge: '🔋',
  // MTG 要素 △ バッチA
  trap: '🪤',
  // MTG 要素 △ バッチB
  spree: '🎯',
  tiered: '📶',
  cleave: '✂',
  strive: '💪',
  squad: '👥',
  prototype: '🔧',
  evoke: '🌬',
  overload: '🌩',
  unleash: '⛓',
  emerge: '🐛',
  casualty: '🩸',
  bargain: '🤝',
  devour: '🍖',
  convoke: '📢',
  delve: '⛏',
  lifePay: '❤',
  pitch: '♠',
  villain: '⚖',
  retrace: '📜',
  harmonize: '🎶',
  mayhem: '🌪',
  unearth: '🧟',
  renew: '🏺',
  dredge: '🪣',
  embalm: '⚱',
  forecast: '🔮',
  // MTG 要素 △ バッチC
  foretell: '🂠',
  plot: '🗓',
  suspend: '⏳',
  warp: '🌀',
  adventure: '📗',
  quest: '🔍',
  evolve: '🦋',
  levelUp: '⬆',
  loyalty: '💠',
  disguise: '🎭',
  altWin: '🏆',
  emblem: '🔰',
};

/** カードの能力（MTG 要素 ○ バッチB。レジストリから作る） */
export const abilityGlossary: Record<string, GlossaryEntry> = Object.fromEntries(
  listAbilities().map((def) => [`ability:${def.id}`, { name: def.name, short: def.summary, icon: ABILITY_ICON[def.id] ?? '✦', tone: 'info' as const }]),
);

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
    icon: B.tokenIcon, gi: 'pawn',
    tone: 'info',
    short: `効果で出る${B.tokenName}。ふつうのモンスターと同じく戦うが、場を離れると（破壊・手札に戻る）どこにも行かずに消える。1人${B.maxTokens}体まで`,
  },
  tempAttack: {
    name: '一時強化',
    icon: '⤴',
    gi: 'upgrade',
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
    gi: 'sands-of-time',
    tone: 'bad',
    short: '持ち主のターン終了時に1ずつ減り、0になると場から消える（モンスターは破壊、パワーは消える）。出たターンも数える',
  },
  repeatCap: {
    name: '繰り返し誘発の上限',
    icon: '🔁',
    tone: 'info',
    short: `「自分のモンスターが出るたび」「自分の他のモンスターが破壊されるたび」「パワー・スキルを使うたび」「自分のカードの対象になるたび」「コスト${BALANCE.timingParams.bigCardCost}以上のカードを使うたび」「ダメージを受けたとき」は、1つのカードにつき1ターン${B.maxRepeatTriggersPerTurn}回まで`,
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
    icon: '😮‍💨', gi: 'tired-eye',
    tone: 'bad',
    short: '消耗のモンスターが攻撃すると、次の持ち主のターンは攻撃できない（自動攻撃もしない。反撃はする）',
  },
  drawn: {
    name: '引いたとき',
    icon: '✋',
    tone: 'info',
    short: 'タイミング「引いたとき」の効果は、対戦中に山札から引いたときに発動する（配った手札・マリガンでは出ない）。カードは手札に残る。効果が出ると、引いたカードが相手にも分かる',
  },
  // ---- MTG 要素 ○ バッチB
  equip: {
    name: '装備',
    icon: '🗡', gi: 'sword-hilt',
    tone: 'good',
    short: '装備のカードは、使い終えると選んだモンスターに付く（攻撃力の上乗せはそのまま）。モンスターが場を離れると、カードは持ち主の手札に戻る',
  },
  borrow: {
    name: '借用',
    icon: '🤲', gi: 'puppet',
    tone: 'info',
    short: '借りたモンスターはすぐ攻撃できる。借りた側のターン終了時に残りが1減り、0で元の持ち主の場に戻る（召喚酔いなし。ダメージ・強化はそのまま）',
  },
  bounty: { name: '懸賞', icon: '💰', gi: 'wanted-reward', tone: 'info', short: '懸賞の掛かったモンスターが破壊されると、掛けたプレイヤーがカードを引く（バウンスなど破壊でなく場を離れたら消える）' },
  quash: {
    name: '封殺',
    icon: '🚫',
    gi: 'cancel',
    tone: 'bad',
    short: '次に使う指定の種類のカード1枚が無効になる（コストは払い、何も起きない）。期限は次の自分のターンの終わりまで。浄化で消える',
  },
  boon: { name: '恩恵', icon: '🎁', tone: 'good', short: '次に使うアタックの最初の1発のダメージ+N（回数ぶん）。浄化・解除では消えない' },
  ramp: { name: '最大エナジー増加', icon: '🔋', tone: 'good', short: `以後ずっと、自分のターン開始時のエナジーが増える（1人${B.rampCap}回まで）` },
  army: {
    name: B.armyName,
    icon: B.armyIcon, gi: 'spartan-helmet',
    tone: 'info',
    short: `動員で出るトークン。いなければ攻撃力0・体力0で出てから強くなる。1人${B.maxArmy}体まで（トークンの上限${B.maxTokens}に数える）。居住・複写召喚では写せない`,
  },
  copyToken: {
    name: '複写トークン',
    icon: '🪞', gi: 'mirror-mirror',
    tone: 'info',
    short: '新生・複写召喚・居住で出るコピー。元のカードの効果・キーワード・デメリットを持ち、召喚時の効果も出る（新生・複写召喚はトークンからは出ない）。場を離れると消える',
  },
  tempToken: { name: '応召', icon: '⌛', gi: 'hunting-horn', tone: 'info', short: '疾走つきで出て、持ち主のターン終了時に消える（破壊ではない）' },
  freePlay: {
    name: '無料で使う（続唱）',
    icon: '🎲',
    tone: 'info',
    short: `山札からめくったカードをコストを払わずに使う（X は0）。「選んだ1体」は相手側 → 自分側の順に選ぶ。デメリットで使えなければ手札に入る。無料で使う連鎖は${B.maxFreePlayDepth}段まで`,
  },
  conjure: { name: '創出', icon: '✨', tone: 'info', short: '効果で作られた使い切りのカード（コスト0）。使うかターン終了で除外される' },
  abilities: {
    name: 'カードの能力',
    icon: '✦',
    tone: 'info',
    short: `循環・再利用・反復・成長・捨て札から使う・起動・サイクリング・魂力・親和・条件付き軽減・キッカーなど、カード1枚に付く性質（1枚に${BALANCE.card.maxAbilities}つまで）。使い終えたカードの行き先は、装備 → 捨て札から使った（除外）→ 反復 → 再利用 → 循環 → 廃棄 → 捨て札 の順に決まる`,
  },
  // ---- MTG 要素 ○ バッチC1
  playFromDiscard: {
    name: '捨て札から使う',
    icon: '⚱',
    tone: 'info',
    short:
      'フラッシュバック・再活・脱出のカードは、自分のターンに捨て札から使える（使った枚数に数え、封殺にも掛かる）。フラッシュバック・再活は使ったら除外（モンスターなら場を離れるとき除外）、脱出は捨て札に戻る。「捨て札から使ったとき」の効果があれば、使用時・召喚時の効果の代わりにそれが出る。山札が尽きて捨て札を混ぜると山札に戻る',
  },
  activated: {
    name: '起動',
    icon: '⚡',
    tone: 'info',
    short: '起動のモンスター・パワーは、自分のターンにエナジーを払って「起動」の効果を使える（1つにつき1ターン1回。召喚したターンも使える）。カードを使ったことには数えない（「カードを使うたび」・封殺に関係しない）。封印されたモンスターは起動できない',
  },
  handAbility: {
    name: 'サイクリング・魂力',
    icon: '♻',
    tone: 'info',
    short: `手札のサイクリングのカードは、エナジー${BALANCE.abilities.cycling.cost}で捨てて1枚引ける。魂力のカードは、エナジーを払って捨て、「魂力」の効果を使える（本体と二者択一）。どちらもカードを使ったことには数えない。対戦画面では捨て札の山へドラッグ`,
  },
  dynamicCost: {
    name: '動的コスト',
    icon: '🧲',
    tone: 'info',
    short: `コストは状況で変わる：印刷コスト → 親和・条件付き軽減（親和は${BALANCE.abilities.affinity.minCost}まで、条件付き軽減は${BALANCE.abilities.costCut.minCost}まで）→ 凍結の+${B.freezeCostIncrease}・軽減効果 → キッカー・フラッシュバック・護法の追加。手札のコストの数字は今の実コスト（下がれば緑、上がれば赤）`,
  },
  kicker: {
    name: 'キッカー',
    icon: '🦶',
    tone: 'info',
    short: '使うときにエナジーを追加で払ってもよい。払えば条件「キッカーを払っていれば」の効果も出る（払えるときだけ、使ったあとに聞かれる）',
  },
  // ---- MTG 要素 ○ バッチC2
  modes: {
    name: 'モード選択',
    icon: '🔀',
    tone: 'info',
    short: `「次のうち1つを選ぶ」のカードは、使うときにモード（A・B・C）を1つ選び、「いつも」の効果とそのモードの効果だけが出る（分割カード・製造・暴動）。対戦画面では場に落とすとモードの選択が出る。無料で使う（続唱）ときも対象より先にモードを選ぶ。反復・予約は同じモードでもう一度。選ぶ場面のない召喚（蘇生・複写トークン）はモードA。ポイントは「いつも」＋いちばん高いモード＋他のモード×${BALANCE.modal.otherRate}`,
  },
  entwine: {
    name: '双呪',
    icon: '🔗',
    tone: 'info',
    short: 'モード選択のカードで、エナジーを追加で払うと、すべてのモードを A→B→C の順に実行する（モードの選択シートの「すべて」）',
  },
  tribe: {
    name: '種族',
    icon: '🐾',
    tone: 'info',
    short: `カードに付く種類（${TRIBE_IDS.map((t) => TRIBE_LABEL[t]).join('・')}）。条件「同じ種族の自分のモンスターがいる」・修飾「同じ種族1体につき」・対象「同じ種族の自分のモンスター全体」・サーチ／抽出の「同じ種族」が参照する。モンスターは種族ごとに得意（ポイントが安い）・苦手（高い）・特性・揃えたとき（場に${BALANCE.tribes.setSize}体以上）のボーナスがある（ルールの「種族の特徴」）。小鬼・軍団のトークンは種族なし、複写トークンは元のカードの種族`,
  },
  tribeAllies: { name: '同じ種族の自分のモンスター全体', icon: '🐾', tone: 'info', short: 'このカードと同じ種族の、自分の場のモンスターすべて（効果を持つモンスター自身も含む。ロード）' },
  speed: {
    name: '速度',
    icon: '🏁',
    gi: 'checkered-flag',
    tone: 'good',
    short: `「エンジン始動」で速度${BALANCE.speed.start}から始まり、自分のターンに相手のHPを減らすと1ターン1回+1（最大${BALANCE.speed.max}。下がらない・浄化でも消えない）。最大なら条件「速度が最大」が満たされる`,
  },
  crown: {
    name: '王冠',
    icon: '👑',
    gi: 'crown',
    tone: 'good',
    short: `王冠は1つだけ。持っていると自分のターン開始時に${BALANCE.crown.extraDraw}枚多く引く。相手のモンスターの攻撃（貫通の余りを含む）でHPが減ると、王冠はそのモンスターの持ち主に移る（効果のダメージでは移らない）`,
  },
  saga: {
    name: '英雄譚',
    icon: '📖',
    tone: 'info',
    short: `章（第1章〜第3章）の効果のあるカード。使うとパワーとして残って第1章が出て、次の自分のターン開始時から1章ずつ進み、最後の章のあと消える。パワーの上限（${B.maxPowers}つ）に数え、古いものとして消えたらそこで終わる`,
  },
  charge: {
    name: '蓄積',
    icon: '🔋',
    tone: 'info',
    short: `蓄積のパワーは、決まった出来事のたびにカウンターが1つたまり（1ターン${B.maxRepeatTriggersPerTurn}つまで）、必要数たまると「蓄積がたまったとき」の効果が出て0に戻る`,
  },
  // ---- MTG 要素 △ バッチA
  plan: {
    name: 'プラン',
    icon: '📜',
    tone: 'info',
    short: '蓄積の「プラン（1回きり）」のパワーは、必要数たまったら「蓄積がたまったとき」の効果を出して消える（悪役の陰謀）',
  },
  trap: {
    name: '罠',
    icon: '🪤',
    tone: 'info',
    short: '能力「罠」のパワーは、「相手のモンスターが攻撃するたび」「自分の他のモンスターが破壊されるたび」の効果が初めて出たら、そのあと消える（相手のターンに働く。インスタントの代わり）',
  },
  attacker: {
    name: '攻撃してきたモンスター',
    icon: '🎯',
    tone: 'info',
    short: '「相手のモンスターが攻撃するたび」で、攻撃してきた相手のモンスター（攻撃のあとに解決。もう場にいなければ不発。呪禁・護法・挑発に関係しない）',
  },
  discarded: {
    name: '捨てられたとき',
    icon: '🗑',
    tone: 'info',
    short: 'タイミング「捨てられたとき」の効果は、効果やコスト（手札整理・ランダムに捨てる・再活の支払い・サイクリング・魂力）で手札から捨てられたときに出る。ターン終了時に手札を捨てるときは出ない',
  },
  finality: { name: '消滅の印', icon: '⚰', gi: 'tombstone', tone: 'bad', short: '消滅の印のモンスターは、破壊されると捨て札ではなく除外される（蘇生・回収できない）。場を離れると印も消える' },
  suspected: {
    name: '容疑',
    icon: '🕵', gi: 'spy',
    tone: 'info',
    short: `容疑のモンスターは攻撃力+${BALANCE.effects.suspect.attack}、挑発を失い、攻撃されても反撃しない。攻撃したときは相手の反撃を受けない（場を離れるまで。封印されても残る）`,
  },
  indestructible: {
    name: '不壊',
    icon: '🛡', gi: 'diamond-hard',
    tone: 'good',
    short: '次の持ち主のターン開始まで、体力が1未満にならず、破壊の効果（接死・処刑・全体破壊・腐乱など）も効かない。生け贄・衰弱で体力0・寿命・バウンスは効く（守護の不壊は削除。前に作ったカードにだけ残る）',
  },
  protection: { name: '加護', icon: '✨', gi: 'angel-wings', tone: 'good', short: '次の持ち主のターン開始まで、すべてのダメージを受けず、相手のカードの「選んだ1体」に選ばれない（ランダム・全体の効果は当たるがダメージは0）' },
  egg: {
    name: B.eggName,
    icon: B.eggIcon, gi: 'egg-clutch',
    tone: 'info',
    short: `培養で出る卵（トークン。攻撃力0）。攻撃できない（反撃はする）。${B.eggHatchTurns}回目の自分のターン開始時に孵化し、攻撃力が上がって${B.tokenName}になる`,
  },
  tempGranted: { name: '賛助のキーワード', icon: '🤝', tone: 'good', short: '賛助でこのターンだけ与えられたキーワード。ターン終了時に消える（封印中は働かない）' },
  dormant: { name: '休眠', icon: '💤', gi: 'night-sleep', tone: 'bad', short: '休眠のモンスター・パワーは1ターンおきに休む。休眠中は攻撃できず、場にいる間のタイミングの効果・起動が出ない（召喚時・破壊されたとき・反撃は普通どおり）' },
  cumulativeUpkeep: { name: '累加維持費', icon: '⏫', gi: 'coins-pile', tone: 'bad', short: '持ち主のターン開始時に「場にあるターン数×N」のダメージを受ける（毎ターン1ずつ増える）' },
  withered: { name: '萎縮', icon: '🥀', gi: 'dead-wood', tone: 'bad', short: '萎縮のダメージで、減った体力のぶん最大体力も減った（修理・回復で戻らない）' },
  spawn: { name: '落とし子', icon: '⚡', gi: 'tentacle-strike', tone: 'info', short: '落とし子のトークンが破壊されると、持ち主のエナジー+1（自分のターンならこのターン、相手のターンなら次のターン）' },
  exp: { name: '経験', icon: '🎖', tone: 'good', short: `試合中ずっと残る数（最大${B.expCap}）。修飾「経験1につき」の数値が大きくなる（最大${BALANCE.modifierParams.expCountCap}）` },
  ice: {
    name: '氷結',
    icon: '🧊',
    tone: 'bad',
    short: `次の自分のターン開始時（引いた後）に、手札（ノイズ以外）からランダムにこの枚数が凍り、そのターンは使えない（サイクリング・魂力も不可。1ターンに${B.iceCap}枚まで。浄化で消える）`,
  },
  perpetual: { name: '永久強化', icon: '♾', gi: 'infinity', tone: 'good', short: 'この試合のあいだ、このカードの攻撃力と体力が上がっている（山札・捨て札・除外を巡っても残る）' },
  // ---- MTG 要素 △ バッチB
  payment: {
    name: '支払いのシート',
    icon: '💳',
    tone: 'info',
    short:
      'カードの能力に追加の支払い（放題・切除・奮励・分隊・キッカー）、代わりの使い方（試作・想起・超過・解鎖）、差し出すもの（現出・犠牲・協約）、払い方（召集・探査・代替コスト・血の支払い）があるカードは、場に落とすと支払いのシートが出る。何も選ばずに使うこともできる。合計のコストはシートに出る',
  },
  prototype: { name: '試作版', icon: '🔧', gi: 'gear-hammer', tone: 'info', short: '能力「試作」で安く出したモンスター。攻撃力・体力が半分（キーワード・効果はそのまま）。場を離れたら元に戻る' },
  unleashed: { name: '解鎖', icon: '⛓', gi: 'unlocking', tone: 'info', short: '能力「解鎖」で攻撃力を上げて出したモンスター。攻撃されても反撃しない（自分から攻撃したときの相手の反撃は受ける）' },
  unearthed: { name: '一時蘇生', icon: '🧟', gi: 'raise-zombie', tone: 'bad', short: '能力「一時蘇生」で捨て札から出したモンスター。疾走を持ち、持ち主のターン終了時に除外される（場を離れても除外）' },
  villain: {
    name: '最悪の二択',
    icon: '⚖',
    tone: 'info',
    short: '能力「最悪の二択」のカードは、使った人が対象を選んだあと、相手が A か B のどちらのモードにするかを選ぶ（オンラインで相手が時間切れなら最初の選択肢）',
  },
  discardAbility: {
    name: '捨て札のカードの能力',
    icon: '🏺',
    tone: 'info',
    short: `相続（エナジーを払って除外し「相続」の効果）・発掘（山札の上 N 枚を捨て札に置いて手札に戻す。1ターン${B.maxDredgePerTurn}回）・不朽（除外してコピーのトークン）は、自分の捨て札の一覧のボタンか、カードを盤面へドラッグして使う。カードを使ったことには数えない`,
  },
  forecast: { name: '予見', icon: '🔮', tone: 'info', short: '能力「予見」は、手札のカードを自分の捨て札の山に落とすか詳細のボタンで、見せて効果を使う。カードは手札に残る（1ターン1回）' },  // ---- MTG 要素 △ バッチC
  waiting: {
    name: '待機ゾーン',
    icon: '⏳',
    tone: 'info',
    short: `手札から「待機させた」カード（予顕・計画・待機）と、ワープ・出来事のあとのカードを置く場所（1人${B.maxWaiting}枚まで）。置いたターンより後の自分のターンに、そこから使う（待機は残りが0になると自動で無料で使われる）。予顕のカードは相手には裏向き。手札のカードを自分の待機ゾーン（⏳）へドラッグするか、詳細のボタンで待機させる`,
  },
  achieve: {
    name: '達成（事件・進化）',
    icon: '🔍', gi: 'laurels',
    tone: 'good',
    short: '能力「事件」（パワー）・「進化」（モンスター）は、持ち主のターン終了時に達成条件を満たしていれば達成する（1回きり・相手にも見える）。以後「達成していれば」の効果が働き、「達成したとき」の効果が出る',
  },
  level: {
    name: 'Lv',
    icon: '⬆', gi: 'level-three',
    tone: 'good',
    short: `能力「Lvアップ」のカードは、自分のターンにエナジーを払って Lv を1上げる（Lv${B.maxLevel}まで・1ターン1回）。カードの「Lv」のボタンか、⬆ をドラッグして使う`,
  },
  loyalty: {
    name: '忠誠',
    icon: '💠',
    tone: 'info',
    short: `能力「忠誠」のパワーは、自分のターンに1回「+1」か「−K」の効果を使う（忠誠は最大${B.loyaltyMax}）。忠誠が0になると消える。相手のモンスターの攻撃で持ち主のHPが減ると忠誠−1`,
  },
  faceDown: {
    name: '裏向きのモンスター',
    icon: B.faceDownIcon, gi: 'domino-mask',
    tone: 'info',
    short: `変装・予示で裏向きに出たモンスター。名前・効果・キーワードがなく、攻撃力${B.faceDownStats}・体力${B.faceDownStats}・護法${B.faceDownWard}（変装）。正体は持ち主にだけ見える。自分のターンにエナジーを払って表にでき（「表になったとき」の効果）、受けていたダメージは残る。場を離れると正体が公開される`,
  },
  extraTurn: {
    name: '追加ターン',
    icon: '🔁',
    tone: 'good',
    short: '効果「追加ターン」を使ったプレイヤーは、このターンが終わったあと、もう一度自分のターンを行う（1試合1回。追加ターンで追加ターンは得られない）',
  },
  altWin: {
    name: '特殊勝利',
    icon: '🏆',
    tone: 'good',
    short: `能力「特殊勝利」のパワーは、目標（カードを使った数・自分のターン数・場のモンスターの数）を達成すると、その時点で勝つ（通算${B.altWinEarliestTurn}ターン目より前は勝たない）。進み具合は相手にも見える。解除するとパワーごと消える`,
  },
  emblem: {
    name: '紋章',
    icon: '🔰',
    tone: 'good',
    short: `能力「紋章」のパワーは、場のパワーではなく紋章になる。パワーの上限に数えず、解除・差し出しの対象にならない（1人${B.maxEmblems}つまで）`,
  },
  heist: {
    name: '強奪',
    icon: '🦝',
    tone: 'info',
    short: '効果「強奪」で相手の山札から写し取ったカード。使い切り（使うかターン終了で除外）で、コストは自分が払う',
  },
  siege: {
    name: B.siegeName,
    icon: B.siegeIcon, gi: 'castle',
    tone: 'info',
    short: `効果「砦を築く」で相手の場に置かれる${B.siegeName}（攻撃力0。攻撃も反撃もせず、挑発もない）。破壊されると、築いた側の「砦を落としたとき」の効果が出る。バウンス・奪取では報酬なしで消える`,
  },
  // ---- MTG 要素 △ バッチD
  leader: {
    name: 'リーダー',
    icon: '👑',
    tone: 'info',
    short: `対戦の開始時に選ぶ、対戦のあいだずっと効く小さな効果（カードのポイントとは関係ない）。${LEADER_IDS.filter((id) => id !== 'none')
      .map((id) => `${LEADERS[id].icon}${LEADERS[id].name}：${LEADERS[id].description}`)
      .join('／')}`,
  },
  field: {
    name: 'フィールド',
    icon: '🗺',
    tone: 'info',
    short: `両者に効く場の効果（場に1つ）。対戦のオプション「次元」で開始時にランダムに決まり（「移り変わる」なら通算${BALANCE.fields.planarEvery}ターンごとに別のものへ）、効果「フィールド」で置き換えられる。${ACTIVE_FIELD_IDS.map((id) => `${FIELDS[id].icon}${FIELDS[id].name}：${FIELDS[id].description}`).join('／')}${DISABLED_FIELD_IDS.length > 0 ? `（${DISABLED_FIELD_IDS.map((id) => FIELDS[id].name).join('・')}は見送り中）` : ''}`,
  },
  fatigue: {
    name: '疲労',
    icon: '📭',
    tone: 'bad',
    short: `山札も捨て札も無くて引けないときは、引けなかった1枚ごとに疲労のダメージを受ける。その試合で n 枚目なら n×${B.fatigueStep}（${B.fatigueStep}・${B.fatigueStep * 2}・${B.fatigueStep * 3}…と増える）。毒と同じく守備力・シールド・無効化を無視し、誰が与えたダメージにも数えない。捨て札が残っていれば、いつもどおり混ぜて山札にするので起きない`,
  },
  dayNight: {
    name: '昼と夜',
    icon: '☀',
    tone: 'info',
    short: `両者共通の昼／夜。昼のターンに手番の人がカードを${BALANCE.dayNight.toNight === 0 ? '1枚も使わない' : `${BALANCE.dayNight.toNight}枚以下しか使わない`}と夜に、夜のターンに${BALANCE.dayNight.toDay}枚以上使うと昼になる（ターンの終わりに判定）。対戦のオプションなら昼で始まり、そうでなければ「昼なら／夜なら」のカードが初めて使われた・場に出たときに昼で始まる`,
  },
  draft: {
    name: 'ドラフト戦',
    icon: '🎴',
    tone: 'info',
    short: `表向きの場（${BALANCE.draft.field}枚）から2人で交互に1枚ずつ取り（取るたびに山から補充し、長く残っている${BALANCE.draft.refresh}枚も入れ替わる）、1回で${BALANCE.draft.copies}枚ずつ・${BALANCE.draft.takes}回ずつで${BALANCE.draft.takes * BALANCE.draft.copies}枚のデッキを作って、そのまま戦う。オンラインは公式カードだけ、CPU 戦は「${BALANCE.draft.offer}枚から1枚（ひとりで）」も選べる`,
  },
  manaCurve: { name: 'コスト分布', icon: '📊', tone: 'info', short: 'デッキのコストごとの枚数（モンスター／それ以外）と平均コスト。軽いカードが少ないと序盤に動けないターンが出やすい' },
};

/** 状態異常・キーワード・オプション・しくみ・タイミング（timing:…）・条件（condition:…）のどの ID でも引ける */
export function glossaryOf(id: string): GlossaryEntry | undefined {
  return (
    (glossary as Record<string, GlossaryEntry>)[id] ??
    keywordGlossary[id] ??
    modifierGlossary[id] ??
    mechanicGlossary[id] ??
    abilityGlossary[id] ??
    timingGlossary[id] ??
    conditionGlossary[id]
  );
}

/** MTG の仕組みのうち、今の要素の組み合わせで作れるもの（MTG 要素 △ バッチD。ルールページの対応表）。template はエディターのテンプレートの ID */
export const MTG_GUIDE: readonly { mtg: string; how: string; template?: string }[] = [
  { mtg: '同族', how: 'カードの種族（スキル・アタックにも付けられる）と、条件「同じ種族の自分のモンスターがいる」・対象「同じ種族の自分のモンスター全体」' },
  { mtg: '地図', how: '効果「探検」（山札の一番上を公開し、モンスターなら手札、違えば捨て札に置いて自分のモンスターを強くする）' },
  { mtg: '装備（付け替え）', how: '効果「装備」（モンスターが場を離れると、装備したカードは手札に戻る）' },
  { mtg: 'タイプ・サイクリング', how: '能力「魂力」（エナジー1）＋効果「サーチ」（探す種類）', template: 'typecycling' },
  { mtg: '補強', how: '能力「魂力」＋効果「鍛錬」（選んだ自分のモンスター1体）', template: 'reinforce' },
  { mtg: '融合・分割カード', how: 'モード選択（モード A・B）＋能力「双呪」', template: 'fuse' },
  { mtg: '～との共闘', how: '効果「サーチ」「抽出」の「同じ種族」' },
  { mtg: '降霊', how: '能力「フラッシュバック」＋タイミング「捨て札から使ったとき」' },
  { mtg: '増分', how: 'タイミング「コスト3以上のカードを使うたび」＋効果「攻撃力アップ」（このモンスター）' },
  { mtg: '闘魂を行う', how: 'テンプレート「製造」（鍛錬かトークン生成をモードで選ぶ）', template: 'fabricate' },
  { mtg: '湧血', how: '能力「魂力」＋効果「一時強化」（選んだ自分のモンスター1体）', template: 'bloodrush' },
  { mtg: '変成', how: '能力「魂力」＋効果「サーチ」（このカードと同じコスト）', template: 'transmute' },
];
