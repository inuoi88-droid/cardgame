/** 対戦の状態・行動・ログの型。状態はすべて JSON にできる形にする（保存・サーバー配信・テストのため）。 */
import type { CardDef, DrawbackInstance, EffectInstance, TimingId } from '../types.ts';
import type { FieldId, MatchRules } from '../fields.ts';
import type { LeaderId } from '../leaders.ts';

export type PlayerId = 0 | 1;

/** 効果や攻撃の対象 */
export type TargetRef = { kind: 'player'; player: PlayerId } | { kind: 'monster'; uid: string };

/** 状態異常と持続効果。プレイヤーとモンスターで同じ形を使う（使わない項目は0のまま） */
export interface Statuses {
  poison: number;
  /** やけどの残りターン */
  burn: number;
  /** 脱力の数（id は weak のまま。決定事項 #137）：与えるダメージの1発が上限まで。モンスターは攻撃するたび、プレイヤーはダメージの効果のカードを使うたびに1つ減る */
  weak: number;
  /** 脆弱の残りターン */
  vulnerable: number;
  bleed: number;
  /** 凍結：付与された（次の自分のターンに発効） */
  freezePending: boolean;
  /** 凍結：このターン発効中 */
  freezeActive: boolean;
  /** 混乱（モンスター）：付与された */
  confusePending: boolean;
  /** 混乱（モンスター）：このターン発効中 */
  confuseActive: boolean;
  /** 反撃（プレイヤー）：返すダメージの合計 */
  counter: number;
  /** 無効化（プレイヤー）：残り回数 */
  nullify: number;
  /** 再生（プレイヤー） */
  regen: number;
  /** 筋力（プレイヤー） */
  strength: number;
  /** 気合（プレイヤー、このターンだけ） */
  focus: number;
  /** 呪縛（プレイヤー。MTG 要素バッチ2）：自分のターン開始時にこの数だけダメージ。減らない。無ければ0 */
  doom?: number;
  /** 恩恵（プレイヤー。MTG 要素 ○ バッチB）：次に使うアタック boonUses 回、最初の1発のダメージ+boon。無ければ0 */
  boon?: number;
  boonUses?: number;
  /**
   * 放射能（プレイヤー。MTG 要素 △ バッチA）：自分のターン開始時（引いた後）に山札の上をこの枚数だけ捨て札に置き、
   * モンスター以外1枚ごとにダメージ。その枚数だけ減る。無ければ0
   */
  rad?: number;
}

/**
 * トークンの強さと種類（MTG 要素バッチ2・○ バッチB）。
 * copy：複写トークン（cardId は元のカード。効果・キーワード・デメリットはカードの定義から）。temp：応召（持ち主のターン終了時に消える）
 */
export interface TokenSpec {
  attack: number;
  hp: number;
  /** 守備力（省略は0） */
  defense?: number;
  copy?: boolean;
  temp?: boolean;
  /** 卵（MTG 要素 △ バッチA：培養）：持ち主の turnsTaken が hatchAt 以上になったターン開始時に孵化し、攻撃力+attack の小鬼になる。攻撃できない */
  egg?: { hatchAt: number; attack: number };
  /** 落とし子（MTG 要素 △ バッチA）：破壊されると持ち主（今の持ち主）のエナジー+1 */
  spawn?: boolean;
  /** 砦（MTG 要素 △ バッチC）：攻撃も反撃もしない。相手のトークンの上限に数えない */
  siege?: boolean;
}

/** 対戦中のカード1枚 */
export interface CardInst {
  uid: string;
  /** GameState.cards のキー。ノイズは NOISE_CARD_ID */
  cardId: string;
  /** 元の持ち主（デッキの持ち主） */
  owner: PlayerId;
  /** 複製で作られたコピー。temp は使うかターン終了で除外、keep はこの試合のデッキに残る */
  copy?: 'temp' | 'keep';
  /**
   * トークン（MTG 要素バッチ2）の強さ。トークンかどうかはこの項目があるかで決まる（cardId は TOKEN_CARD_ID・ARMY_CARD_ID、
   * 複写トークンなら元のカード）。場を離れるとどこにも行かずに消える（捨て札・除外・手札に入らない）
   */
  token?: TokenSpec;
  /** 失ったキーワード（分身を使ったカード。キーワードとして働かない。MTG 要素 ○ バッチB） */
  lostKeywords?: string[];
  /** 成長で増えたダメージ・連撃の数値（この個体だけ） */
  grow?: number;
  /** 再利用で手札に戻った通算ターン（1ターン1回） */
  buybackTurn?: number;
  /** 循環で山札に戻った通算ターン（1ターン1回。2回目は捨て札へ：決定事項 #133） */
  shuffleTurn?: number;
  /**
   * 捨て札から使った（フラッシュバック・再活。MTG 要素 ○ バッチC1）：使い終えたら除外、モンスターなら場を離れるとき除外
   * （捨て札・手札へ行く代わりに除外へ。装備していたら外れるとき除外）
   */
  exileOnLeave?: boolean;
  // ---- MTG 要素 △ バッチA
  /** 氷結：この通算ターンの間は使えない（手札。サイクリング・魂力も不可） */
  iced?: number;
  /** 永久強化：この個体の攻撃力・体力の上乗せ（どこに移っても残る。場に出たとき印刷のステータスに足す） */
  perm?: { attack: number; hp: number };
  /** 手札から捨てられた通算ターン（捨てられたとき） */
  discardedTurn?: number;
  // ---- MTG 要素 △ バッチB
  /** 回顧で捨て札から使った通算ターン（同じカードは1ターン1回） */
  retraceTurn?: number;
  /** 予見を使った通算ターン（1ターン1回） */
  forecastTurn?: number;
  // ---- MTG 要素 △ バッチC
  /** 強奪で相手の山札からコピーしたカード（使い切り。手札の札の表示用） */
  heisted?: boolean;
}

export const NOISE_CARD_ID = '__noise__';
/** トークンのカード定義のキー（GameState.cards。最初のトークンを出すときに登録する） */
export const TOKEN_CARD_ID = '__token__';
/** 動員の「軍団」トークンのカード定義のキー（MTG 要素 ○ バッチB） */
export const ARMY_CARD_ID = '__army__';
/** 創出で作るカード定義のキーの前置き（`__conjure__:<種類>:<N>`） */
export const CONJURE_PREFIX = '__conjure__:';
/** 培養の「卵」トークンのカード定義のキー（MTG 要素 △ バッチA。孵化すると TOKEN_CARD_ID に変わる） */
export const EGG_CARD_ID = '__egg__';
/**
 * 裏向きのモンスター（MTG 要素 △ バッチC：変装・予示）のカード定義のキー。裏向きの間、Monster.card はこのキーの代わりのカードで、
 * 本当のカードは Monster.faceDown.card（持ち主だけに見える）。変装は護法つきの定義
 */
export const FACE_DOWN_CARD_ID = '__facedown__';
export const FACE_DOWN_WARD_CARD_ID = '__facedown_ward__';
/** 砦（MTG 要素 △ バッチC）のカード定義のキー */
export const SIEGE_CARD_ID = '__siege__';

/** 裏向きのモンスターの状態（MTG 要素 △ バッチC）。revealCost が null なら表にできない（予示したモンスター以外のカード） */
export interface FaceDownState {
  kind: 'disguise' | 'manifest';
  revealCost: number | null;
  /** 本当のカード（相手の viewFor では消える） */
  card?: CardInst;
}

export interface Monster {
  uid: string;
  card: CardInst;
  owner: PlayerId;
  /** 今の持ち主（奪取で変わる） */
  controller: PlayerId;
  attack: number;
  hp: number;
  maxHp: number;
  defense: number;
  /** 場に出た通算ターン（このターンに出たモンスターは攻撃できない） */
  enteredTurn: number;
  attacksUsed: number;
  sealed: boolean;
  undyingUsed: boolean;
  /** 隠密で攻撃対象にならない間 true */
  stealth: boolean;
  /** 裏切りが始まった */
  betraying: boolean;
  /**
   * デメリットなどが使う数え（裏切りまでの経過ターンなど）。
   * `rt:<タイミング>:turn`・`rt:<タイミング>:count` は繰り返し誘発の回数（1ターンの上限の安全装置）
   */
  counters: Record<string, number>;
  status: Statuses;
  /** このターンだけの攻撃力の上乗せ（一時強化。無ければ0。実効攻撃力は core.ts の effectiveAttack）。各ターン終了時に消える */
  tempAttack?: number;
  /** 効果で与えられたキーワードの ID（キーワード付与。場を離れると消える。封印中は働かない） */
  granted?: string[];
  /** 聖盾を使った（キーワード付与で聖盾を与え直すと未使用に戻る） */
  shieldUsed?: boolean;
  // ---- MTG 要素 ○ バッチB（公開情報）
  /** 装備しているカード（モンスターが場を離れると、カードの持ち主の手札に戻る） */
  equipment?: CardInst[];
  /** 懸賞：破壊されたら player がカードを draw 枚引く */
  bounty?: { player: PlayerId; draw: number }[];
  // ---- MTG 要素 △ バッチA（公開情報）
  /** 消滅の印：破壊されたら捨て札ではなく除外へ */
  finality?: boolean;
  /** 容疑：攻撃力+、挑発を失い、反撃しない。攻撃したときは反撃を受けない */
  suspected?: boolean;
  /** 守護：until（持ち主の turnsTaken）のターン開始時まで、不壊（体力が1未満にならず破壊されない）か加護（ダメージを受けず、相手のカードに選ばれない） */
  guard?: { kind: 'indestructible' | 'protection'; until: number };
  /** 賛助でこのターンだけ与えられたキーワード（ターン終了時に消える。封印中は働かない） */
  tempGranted?: string[];
  // ---- MTG 要素 △ バッチB（公開情報）
  /** 試作版で出た（攻撃力・体力が半分。場を離れたら元に戻る） */
  prototype?: boolean;
  /** 解鎖して出た（攻撃力+N。攻撃されても反撃しない） */
  unleashed?: boolean;
  /** 一時蘇生で出た（速攻。持ち主のターン終了時に除外される） */
  unearthed?: boolean;
  // ---- MTG 要素 △ バッチC（公開情報。faceDown.card だけは持ち主にだけ見える）
  /** 裏向き（変装・予示） */
  faceDown?: FaceDownState;
  /** 進化した（達成。1回きり） */
  achieved?: boolean;
  /** ワープで出た（持ち主のターン終了時に待機ゾーンへ） */
  warped?: boolean;
  /** 砦：築いた人と、報酬のカード（GameState.cards のキー） */
  siege?: { player: PlayerId; cardId: string };
}

/** 場に残っているパワー */
export interface PowerInst {
  uid: string;
  cardId: string;
  name: string;
  /** パワー用タイミングの効果（解除されたものは removed） */
  effects: { effect: EffectInstance; removed: boolean }[];
  /** パワー用タイミングのデメリット（解除できない） */
  drawbacks: DrawbackInstance[];
  /** 「カードを使うたび」が発動した回数（通算ターンごと。安全装置） */
  triggers?: { turnIndex: number; count: number };
  /** 「出るたび」「破壊されるたび」「パワー・スキルを使うたび」が発動した回数（タイミングごと・通算ターンごと。安全装置） */
  repeats?: Partial<Record<TimingId, { turnIndex: number; count: number }>>;
  /** 寿命（デメリット）の残り：持ち主のターン終了時に1減り、0で消える。無ければ寿命なし */
  life?: number;
  /** 起動（MTG 要素 ○ バッチC1）した通算ターン（1ターン1回。モンスターは counters.activatedTurn） */
  activatedTurn?: number;
  // ---- MTG 要素 ○ バッチC2（公開情報）
  /** 英雄譚：いま出た章（1〜3）。英雄譚でなければ無し */
  chapter?: number;
  /** 蓄積カウンターの数（蓄積の能力のあるパワー。無ければ0） */
  charge?: number;
  /** 蓄積がたまった回数（通算ターンごと。1ターン battle.maxRepeatTriggersPerTurn 回まで） */
  chargeTicks?: { turnIndex: number; count: number };
  // ---- MTG 要素 △ バッチA（公開情報）
  /** 累加維持費：場にあるターン数（持ち主のターン開始時に+1） */
  age?: number;
  /** 休眠：置いたときの持ち主の turnsTaken（差が奇数のターンは休眠中） */
  dormantFrom?: number;
  // ---- MTG 要素 △ バッチC（公開情報）
  /** 事件を解明した（達成。1回きり） */
  achieved?: boolean;
  /** Lv（Lvアップ。無ければ1）と、上げた通算ターン（1ターン1回） */
  level?: number;
  levelTurn?: number;
  /** 忠誠（能力「忠誠」のパワー）と、+1／−K を使った通算ターン（両方で1ターン1回） */
  loyalty?: number;
  loyaltyTurn?: number;
  /** 特殊勝利の進み（カードを使った数・ターン開始の数・場のモンスターの数） */
  progress?: number;
}

/** 1ターンの上限を数える（安全装置：決定事項 #64）。turnIndex が変わったら数え直す */
export interface TurnLimits {
  turnIndex: number;
  drawn: number;
  energyGained: number;
  noiseIn: number;
}

export interface PlayerState {
  name: string;
  hp: number;
  maxHp: number;
  shield: number;
  energy: number;
  deck: CardInst[];
  hand: CardInst[];
  discard: CardInst[];
  exile: CardInst[];
  board: Monster[];
  powers: PowerInst[];
  status: Statuses;
  /** 次の自分のターンへの持ち越し（貯金・反動・妨害・施し）。jam* は相手の妨害で減らされた量（上限あり） */
  next: { draw: number; energy: number; jamDraw?: number; jamEnergy?: number };
  /** 1ターンの上限の数え（無ければ0から） */
  limits?: TurnLimits;
  /**
   * このターンの記録（自分のターンの開始時に作り直す）。省略可能な項目は無ければ 0 / false。
   * enemyDamaged：相手プレイヤーのHPを減らした / allyAttacks：自分のモンスターが攻撃した回数 /
   * summoned：自分の場にモンスターを出した数 / monstersDestroyed：このターンに破壊されたモンスターの数（敵味方とも）
   */
  turn: {
    cardsPlayed: number;
    retain: number;
    freezeTax: boolean;
    enemyDamaged?: boolean;
    allyAttacks?: number;
    summoned?: number;
    monstersDestroyed?: number;
    /** 相手プレイヤーのHPを減らした合計（MTG 要素 ○ バッチA。条件「このターン相手に合計6以上のダメージを与えた」） */
    enemyDamageTotal?: number;
    /** 自分のHPが1以上回復した（条件「このターン自分が回復した」） */
    healed?: boolean;
    /** 速度がこのターンもう上がった（MTG 要素 ○ バッチC2。1ターン1回） */
    speedUp?: boolean;
    /** このターンに使ったカードの種類（MTG 要素 △ バッチA：条件「このターン3種類以上のカードを使った」。monster・attack・skill・power） */
    typesPlayed?: string[];
    /** 代替コスト・発掘を使った回数（MTG 要素 △ バッチB。1ターン battle.maxPitchPerTurn / maxDredgePerTurn 回まで） */
    pitched?: number;
    dredged?: number;
  };
  /** 最後に終えた自分のターンの記録（ターン終了時に写す。条件「前の相手のターンに相手がカードを3枚以上使った」）。無ければ記録なし */
  lastTurn?: { cardsPlayed: number };
  /** 予約された効果（修飾「次のターンに」）。次の自分のターン開始時（引いた後）に古い順に発動する。無ければ空 */
  delayed?: DelayedEffect[];
  /** 封殺（MTG 要素 ○ バッチB）：次に使う kind のカード1枚を無効にする（g.turnIndex が until 以下の間）。公開情報 */
  quash?: { kind: string; until: number };
  /** 最大エナジー増加（MTG 要素 ○ バッチB）：ターン開始時のエナジーに足す */
  energyBonus?: number;
  /** 速度ゲージ（MTG 要素 ○ バッチC2）。無ければ0＝ゲージ無し。公開情報 */
  speed?: number;
  /** 経験（MTG 要素 △ バッチA）：試合中ずっと残る数。修飾「経験1につき」が見る。無ければ0。公開情報 */
  exp?: number;
  /** 氷結（MTG 要素 △ バッチA）：次の自分のターン開始時（引いた後）に、手札からこの枚数が凍る。無ければ0。公開情報 */
  ice?: number;
  // ---- MTG 要素 △ バッチC（どれも公開情報。待機ゾーンの hidden のカードだけは相手の viewFor で隠す）
  /** 待機ゾーン（予顕・計画・待機・ワープ・出来事）。1人 battle.maxWaiting 枚まで */
  waiting?: WaitingCard[];
  /** 紋章（能力「紋章」のパワー。パワーの上限に数えず、解除されない）。1人 battle.maxEmblems まで */
  emblems?: PowerInst[];
  /** 追加ターンを得た（1試合1回）／このターンのあとに追加のターンがある */
  extraTurnUsed?: boolean;
  extraTurnPending?: boolean;
  /** HP交換を使った（1試合1回） */
  swapUsed?: boolean;
  /** リーダー（MTG 要素 △ バッチD。対戦の開始時に選ぶ。無ければ none。公開情報） */
  leader?: LeaderId;
  /**
   * 疲労（決定事項 #102）：この試合で、山札も捨て札も無くて引けなかった枚数の合計。次の1枚は (fatigue+1)×battle.fatigueStep のダメージ。
   * 無ければ0（古い保存）。公開情報
   */
  fatigue?: number;
  /**
   * CPU の仮の実行用に山札・捨て札を外したプレイヤー（ai/sim.ts の leanView が相手に付ける）。外したカードは本当はあるので、引けなくても疲労にしない。
   * 本当の対戦の状態には付かない
   */
  noFatigue?: boolean;
  /** 次に使うカードのコスト軽減（使うまで残る） */
  discount: number;
  /** 自分のターンを迎えた回数 */
  turnsTaken: number;
  mulligan: { done: boolean; fullCount: number };
}

/** 待機ゾーンに置く理由（MTG 要素 △ バッチC） */
export type WaitingKind = 'foretell' | 'plot' | 'suspend' | 'warp' | 'adventure';
/** 手札から待機させる行動（setAside）の種類 */
export type SetAsideKind = 'foretell' | 'plot' | 'suspend';
export const SET_ASIDE_KINDS = ['foretell', 'plot', 'suspend'] as const satisfies readonly SetAsideKind[];

/** 待機ゾーンのカード（MTG 要素 △ バッチC） */
export interface WaitingCard {
  card: CardInst;
  kind: WaitingKind;
  /** 置いた通算ターン（このターンより後の自分のターンから使える） */
  since: number;
  /** 待機の残りターン（持ち主のターン開始時に1減り、0で無料で使われる） */
  time?: number;
  /** 予顕：裏向き（相手には見えない） */
  hidden?: boolean;
}

/** 予約された効果（修飾「次のターンに」。MTG 要素 ○ バッチA）。公開情報 */
export interface DelayedEffect {
  id: string;
  src: SourceRef;
  /** 遅延を外し、条件を外し、数値の倍数を予約した時点の値で確定した写し */
  effect: EffectInstance;
  timing: TimingId;
  chosen: Chosen;
  /** 表示用（カード名と効果テキスト） */
  label: string;
  /**
   * 反復（MTG 要素 ○ バッチB）：このカードの使用時の効果をまとめてもう一度発動し、そのあとカードを捨て札へ。
   * effect は先頭の効果（表示・評価用）
   */
  rebound?: { card: CardInst; effects: EffectInstance[] };
}

/** 効果や攻撃の出どころ */
export interface SourceRef {
  kind: 'card' | 'monster' | 'power' | 'system';
  uid: string;
  cardId: string;
  name: string;
  controller: PlayerId;
  /** 出どころがトークン（複写トークンを含む）。新生・複写召喚は解決しない（MTG 要素 ○ バッチB） */
  token?: boolean;
}

/** 「選んだ1体」の対象（相手側1つ・自分のモンスター1つ） */
export interface Chosen {
  enemy?: TargetRef;
  ally?: string;
  /** 攻撃してきた相手のモンスター（「相手のモンスターが攻撃するたび」の対象「攻撃してきたモンスター」。MTG 要素 △ バッチA）。行動では送れない */
  trigger?: string;
}

/** 解決待ちの処理。キューの先頭から順に処理し、途中で選択が要れば止まる */
export type Step =
  | {
      t: 'effect';
      src: SourceRef;
      effect: EffectInstance;
      timing: TimingId;
      chosen: Chosen;
      /** アタック・パワーアタックの使用時（筋力・気合が乗る） */
      attackCard: boolean;
      /** 同じカードのデメリットで付いた毒・やけどを浄化から守るためのキー */
      protectKey?: string;
      depth: number;
      picks?: string[];
      /** 成長（MTG 要素 ○ バッチB）：ダメージ・連撃の数値に足す量（使ったカードの個体の値） */
      grow?: number;
      /** ばらつき（MTG 要素 △ バッチA）：決めた倍率（選択で止まって再開したときに振り直さない） */
      gambleRate?: number;
    }
  | { t: 'drawback'; src: SourceRef; drawback: DrawbackInstance; protectKey?: string; depth: number; picks?: string[] }
  /** 手札を count 枚選んで捨てる（手札整理）。then が recruit なら、捨てたのがスキルのときトークンを出す（徴募） */
  | { t: 'discardChoice'; player: PlayerId; count: number; depth: number; picks?: string[]; then?: 'recruit' }
  /** 濫用：自分のモンスター1体を生け贄にしてよい（選んだら PlayRecord.exploited。MTG 要素 ○ バッチA） */
  | { t: 'exploitChoice'; player: PlayerId; protectKey: string; depth: number; picks?: string[] }
  /** from：手札から使った（省略）か、無料で使った（続唱）か、捨て札から使った（MTG 要素 ○ バッチC1）か。反復は手札から使ったときだけ */
  | {
      t: 'cardDone';
      player: PlayerId;
      card: CardInst;
      protectKey: string;
      depth: number;
      from?: PlayFrom;
      /** 出来事（MTG 要素 △ バッチC）として使った：使い終えたら待機ゾーンへ */
      adventure?: boolean;
      /** 裏向き（変装）で出した：コストを見せない（「コスト3以上のカードを使うたび」は変装のコストで判定） */
      faceDown?: boolean;
    }
  /**
   * 無料で使う（続唱。MTG 要素 ○ バッチB）。「選んだ1体」が要れば、相手側 → 自分側の順に選ぶ（stage）。
   * freeDepth は無料で使う連鎖の段（battle.maxFreePlayDepth まで）
   */
  | {
      t: 'freePlay';
      player: PlayerId;
      card: CardInst;
      depth: number;
      freeDepth: number;
      /** 待機（MTG 要素 △ バッチC）で使われた：モンスターは速攻を持つ */
      suspend?: boolean;
      chosen?: Chosen;
      /** モード選択のカード（MTG 要素 ○ バッチC2）は、対象より先にモードを選ぶ（stage 'mode'） */
      stage?: 'mode' | 'enemy' | 'ally';
      mode?: number;
      picks?: string[];
    }
  /** 一撃離脱：攻撃したモンスターを持ち主の手札に戻す */
  | { t: 'returnToHand'; uid: string; depth: number }
  /** 反復の2回目が終わったカードを捨て札に置く */
  | { t: 'reboundDone'; card: CardInst; depth: number }
  /** 英雄譚（MTG 要素 ○ バッチC2）：最後の章を解決し終えたら、パワーを消す（誘発なし） */
  | { t: 'sagaEnd'; player: PlayerId; powerUid: string; depth: number }
  /** パワーを誘発なしで取り除く（MTG 要素 △ バッチA：罠・プラン） */
  | { t: 'powerGone'; player: PlayerId; powerUid: string; depth: number; why: 'trap' | 'plan' | 'loyalty' }
  // ---- MTG 要素 △ バッチB
  /** 貪食：出たモンスター（uid）が、自分の他のモンスターを0〜max体生け贄にする（1体につき攻撃力・体力+amount）。among は出たときに場にいたもの */
  | { t: 'devourChoice'; player: PlayerId; uid: string; amount: number; max: number; depth: number; picks?: string[]; among?: string[] }
  /**
   * 最悪の二択：相手（player）がモードを選び、そのモードの効果を積む。user はカードを使った人。src・chosen・protectKey はカードの使用のもの
   */
  | {
      t: 'villainChoice';
      player: PlayerId;
      user: PlayerId;
      src: SourceRef;
      timing: TimingId;
      chosen: Chosen;
      attackCard: boolean;
      protectKey: string;
      depth: number;
      grow?: number;
      picks?: string[];
    }
  /** 想起：召喚時の効果のあと、そのモンスター（uid）が場にいれば破壊する */
  | { t: 'evokeEnd'; uid: string; depth: number }
  | { t: 'autoAttacks'; player: PlayerId }
  | { t: 'turnEndEffects'; player: PlayerId }
  | { t: 'retain'; player: PlayerId; picks?: string[] }
  | { t: 'turnEndFinish'; player: PlayerId; kept: string[] };

/** カードをどこから使ったか（手札・無料で使う・捨て札） */
export type PlayFrom = 'hand' | 'free' | 'discard' | 'waiting';

export interface ChoiceOption {
  id: string;
  label: string;
  /** カードを選ぶとき、そのカード（表示用） */
  cardId?: string;
}

/** プレイヤーの選択待ち */
export interface PendingChoice {
  player: PlayerId;
  prompt: string;
  options: ChoiceOption[];
  min: number;
  max: number;
  /** 選んだあとに再開する処理 */
  step: Step;
}

/**
 * ダメージの種類。attack：モンスターの攻撃 / hit：ダメージ・連撃効果の1回分（格闘も） / counter：反撃（状態） /
 * retaliate：攻撃されたモンスターの反撃 / trample：貫通の余り / poison・burn・doom：毒・やけど・呪縛 / self：自傷・維持費・寄生 /
 * rad：放射能（MTG 要素 △ バッチA。毒と同じくシールド・無効化を無視） /
 * fatigue：疲労（山札切れ。決定事項 #102。毒と同じくシールド・無効化を無視し、誰が与えたダメージにも数えない）
 */
export type DamageKind = 'attack' | 'hit' | 'counter' | 'retaliate' | 'trample' | 'poison' | 'burn' | 'doom' | 'self' | 'rad' | 'fatigue';

/** ログに付ける構造化された出来事（UI の演出・再生用。決定事項 #71）。公開情報だけを入れる */
export interface LogEvent {
  kind:
    | 'damage'
    | 'heal'
    | 'shield'
    | 'status'
    | 'play'
    | 'summon'
    | 'destroy'
    | 'draw'
    | 'attack'
    | 'retaliate'
    | 'turnStart'
    | 'turnEnd'
    | 'energy'
    | 'discard'
    | 'result'
    // MTG 要素 ○ バッチC1：起動（uid は起動したモンスター・パワー）、手札から使う能力（status は cycling / channel）
    | 'activate'
    | 'handAbility'
    // MTG 要素 ○ バッチC2：速度・王冠・英雄譚の章・蓄積（status は speed / crown / chapter / charge / sagaEnd、amount は値）
    | 'speed'
    | 'crown'
    | 'saga'
    | 'charge'
    // MTG 要素 △ バッチB：捨て札のカードの能力（status は renew / dredge / embalm）
    | 'discardAbility'
    // MTG 要素 △ バッチC：待機ゾーン（status は foretell / plot / suspend / warp / adventure / tick）・表にする・Lv・忠誠・達成・特殊勝利の進み
    | 'waiting'
    | 'reveal'
    | 'level'
    | 'loyalty'
    | 'achieve'
    | 'altWin'
    // MTG 要素 △ バッチD：フィールドが変わった（status はフィールドの ID。無くなったら 'none'）・昼と夜が変わった（status は day / night）
    | 'field'
    | 'dayNight'
    // 演出（決定事項 #126）：効果の解決の始まり（effectId・source/uid・targets・amount）、デメリットが働いた（drawbackId）、
    // キーワードが働いた（keywordId。target はそのモンスター）、攻撃力・体力・守備力・キーワード・封印などの変化（target・delta・keywordId・status）、
    // カードの移動（status は ZoneMove。player・amount・uid）
    | 'effect'
    | 'drawback'
    | 'keyword'
    | 'stat'
    | 'zone';
  player?: PlayerId;
  target?: TargetRef;
  source?: TargetRef;
  /** ダメージ・回復・シールド・状態の量、引いた枚数、エナジーなど */
  amount?: number;
  cardId?: string;
  uid?: string;
  status?: string;
  /** damage のとき、ダメージの種類（毒・やけど・自傷などの区別） */
  damageKind?: DamageKind;
  /** play のとき、捨て札から使った（MTG 要素 ○ バッチC1）・待機ゾーンから使った（△ バッチC） */
  from?: 'discard' | 'waiting';
  /** turnStart のとき、追加ターン（MTG 要素 △ バッチC） */
  extra?: boolean;
  /** play のとき、選んだモード（MTG 要素 ○ バッチC2。0 は双呪） */
  mode?: number;
  // ---- 演出（決定事項 #126）。どれも公開情報だけ（相手の手札・山札のカード、裏向きの正体、サーチしたカードは入れない）
  /** effect：解決する効果の ID（defs/effects） */
  effectId?: string;
  /** drawback：働いたデメリットの ID（defs/drawbacks）。ほかの出来事にも「デメリットのせい」として付くことがある */
  drawbackId?: string;
  /** keyword：働いたキーワードの ID（defs/keywords）。stat では与えたキーワード */
  keywordId?: string;
  /** play：使い方の元になったカードの能力の ID（フラッシュバック・試作・キッカーなど。defs/abilities） */
  abilityId?: string;
  /** effect：解決した時点の対象（場のモンスターとプレイヤーだけ）。選択待ちで止まったときは無い */
  targets?: TargetRef[];
  /** stat：攻撃力・体力・守備力の変化（量） */
  delta?: { attack?: number; hp?: number; defense?: number };
}

/** カードの移動の種類（LogEvent の kind 'zone' の status） */
export type ZoneMove =
  /** 山札の上から捨て札へ（切削・占術・放射能） */
  | 'mill'
  /** 場のモンスターを手札に戻す（バウンス・一撃離脱） */
  | 'bounce'
  /** 手札に加えた（サーチ・回収・コピー。公開のカードだけ cardId） */
  | 'toHand'
  /** 除外した（捨て札・手札から） */
  | 'exile'
  /** 山札にノイズを混ぜた */
  | 'noise'
  /** モンスターが相手の場へ移った（奪う・借用・借用の終わり） */
  | 'steal';

export interface LogEntry {
  turn: number;
  depth: number;
  text: string;
  kind: 'turn' | 'action' | 'effect' | 'damage' | 'info' | 'result';
  /** このプレイヤーにだけ見せる（引いたカード名など） */
  private?: PlayerId;
  /** 構造化された出来事（あれば） */
  ev?: LogEvent;
}

/**
 * カード1回の使用（または1回のタイミングの発動）の記録。キーは protectKey。
 * poison・burn：同じカードのデメリットで付いた毒・やけど（浄化から守る：決定事項 #34）
 * bonus：使った時点の筋力＋気合。最初の1発にだけ乗せる（決定事項 #70 R3）
 * bleedHit・counterHit：出血・反撃（状態）をもう働かせた対象（1枚につき1回：決定事項 #70 R4）
 */
export interface PlayRecord {
  poison: number;
  burn: number;
  /** 脱力（決定事項 #137）：このカードを使うときに脱力を1つ使った。このカードの効果のダメージは最後まで1発の上限まで */
  exhaust?: boolean;
  bonus?: number;
  bonusUsed?: boolean;
  bleedHit?: string[];
  counterHit?: string[];
  /** X（全力）で使ったエナジー（このカードの X の効果がすべて使う） */
  x?: number;
  /** 濫用で自分のモンスターを生け贄にした（条件「自分のモンスター1体を生け贄にしたなら」） */
  exploited?: boolean;
  /** 装備（MTG 要素 ○ バッチB）：このカードを付けるモンスター */
  equipTo?: string;
  /** 無料で使ったカード（続唱）の段。このカードの続唱はこの次の段になる */
  freeDepth?: number;
  /** キッカーを払った（条件「キッカーを払っていれば」。MTG 要素 ○ バッチC1） */
  kicked?: boolean;
  /** 選んだモード（MTG 要素 ○ バッチC2。0 は双呪ですべて）。反復でも同じモード */
  mode?: number;
  // ---- MTG 要素 △ バッチB
  /** 放題で選んだモード（2つ以上。反復では最初の1つだけ） */
  modes?: number[];
  /** 切除を払った（このカードの使用時・召喚時・捨て札から使ったときの効果の条件を無視する） */
  cleaved?: boolean;
  /** 奮励で払った回数（「選んだ1体（相手）」の効果を、ランダムな別の相手モンスターにも） */
  strive?: number;
  /** 協約で差し出した（条件「協約したなら」） */
  bargained?: boolean;
  // ---- MTG 要素 △ バッチC
  /** もう一度出る写し（反復の2回目）。追加ターン・HP交換は出ない */
  copied?: boolean;
}

export interface GameResult {
  winner: PlayerId | null;
  /** timeout：オンライン対戦で続けて時間切れになった。altWin：特殊勝利（MTG 要素 △ バッチC） */
  reason: 'hp' | 'turnLimit' | 'concede' | 'timeout' | 'altWin';
}

export interface GameState {
  v: 1;
  /** シード付き乱数の内部状態 */
  rng: number;
  /** 通算ターン（両者の合計）。マリガン中は0 */
  turnIndex: number;
  phase: 'mulligan' | 'main' | 'ended';
  active: PlayerId;
  first: PlayerId;
  players: [PlayerState, PlayerState];
  /** この対戦で使うカード定義（キーはプレイヤーごとに分けた ID） */
  cards: Record<string, CardDef>;
  queue: Step[];
  /** キューに割り込ませる位置（処理中だけ使う） */
  qInsert: number;
  /** 王冠（MTG 要素 ○ バッチC2）を持っているプレイヤー。無ければ誰も持っていない。公開情報 */
  crown?: PlayerId | null;
  // ---- MTG 要素 △ バッチD（どれも公開情報・省略可能）
  /** 対戦のルールのオプション（次元・昼と夜）。無ければどれも無し */
  rules?: MatchRules;
  /**
   * フィールド（両者に効く場の効果）。by は効果「フィールド」で置いた人（次元で決まったものは null）。
   * since は置いた通算ターン（次元の切り替えは、最後に次元で決めたターンから数える）
   */
  field?: { id: FieldId; by: PlayerId | null; since: number };
  /** 昼と夜。無ければまだ始まっていない */
  dayNight?: 'day' | 'night';
  /** 1つの効果を処理している間は決着を保留する（同時にHP0なら引き分けにするため） */
  holdEnd: number;
  pending: PendingChoice | null;
  /** カード1回の使用の記録（浄化から守る毒・やけど、筋力・気合、出血・反撃の1回判定）。ターン開始時に空になる */
  protect: Record<string, PlayRecord>;
  result: GameResult | null;
  log: LogEntry[];
  nextUid: number;
}

export type MulliganMode = 'keep' | 'all' | 'partial';

/** 手札から使う能力の種類（MTG 要素 ○ バッチC1。予見は △ バッチB） */
export type HandAbilityKind = 'cycling' | 'channel' | 'forecast';
export const HAND_ABILITY_KINDS = ['cycling', 'channel', 'forecast'] as const satisfies readonly HandAbilityKind[];

/** 代わりの使い方（MTG 要素 △ バッチB：試作・想起・超過・解鎖。△ バッチC：ワープ・出来事・裏向き（変装）） */
export type AltPlay = 'prototype' | 'evoke' | 'overload' | 'unleash' | 'warp' | 'adventure' | 'faceDown';
export const ALT_PLAYS = ['prototype', 'evoke', 'overload', 'unleash', 'warp', 'adventure', 'faceDown'] as const satisfies readonly AltPlay[];
/** 起動の使い方（MTG 要素 △ バッチC）：Lvアップ・忠誠+1・忠誠−K（省略は能力「起動」） */
export type ActivateUse = 'level' | 'plus' | 'minus';
export const ACTIVATE_USES = ['level', 'plus', 'minus'] as const satisfies readonly ActivateUse[];
/** 追加の支払い（MTG 要素 △ バッチB）：切除・奮励・分隊 */
export type ExtraPayKind = 'cleave' | 'strive' | 'squad';
/** 差し出す能力（MTG 要素 △ バッチB）：現出・犠牲・協約 */
export type SacrificeKind = 'emerge' | 'casualty' | 'bargain';
/** 捨て札のカードの能力（MTG 要素 △ バッチB）：相続・発掘・不朽 */
export type DiscardAbilityKind = 'renew' | 'dredge' | 'embalm';
export const DISCARD_ABILITY_KINDS = ['renew', 'dredge', 'embalm'] as const satisfies readonly DiscardAbilityKind[];

export type Action =
  | { type: 'mulligan'; player: PlayerId; mode: MulliganMode; cardUids?: string[] }
  /**
   * カードを使う。MTG 要素 ○ バッチC1：from 'discard' なら捨て札から（フラッシュバック・再活・脱出）。discardUid は再活で捨てる手札、
   * exileUids は脱出で除外する捨て札、kick はキッカーを払う
   */
  | {
      type: 'playCard';
      player: PlayerId;
      cardUid: string;
      chosen?: Chosen;
      /** 'waiting' は待機ゾーンから（予顕・計画・ワープ・出来事。MTG 要素 △ バッチC） */
      from?: 'discard' | 'waiting';
      discardUid?: string;
      exileUids?: string[];
      kick?: boolean;
      /** モード選択のカード（MTG 要素 ○ バッチC2）で選ぶモード（1〜3）。0 は双呪（すべてのモード。追加エナジー） */
      mode?: number;
      // ---- MTG 要素 △ バッチB（どれも省略可能）
      /** 切除・奮励・分隊の追加払いの回数 */
      extra?: number;
      /** 放題で選ぶモード（昇順・重複なし・2つ以上。mode の代わり） */
      modes?: number[];
      /** 代わりの使い方（試作・想起・超過・解鎖） */
      alt?: AltPlay;
      /** 現出・犠牲・協約で差し出す自分のモンスター（協約はトークン）・パワー */
      sacrificeUid?: string;
      /** 召集・調和で休ませる自分のモンスター */
      tapUids?: string[];
      /** 代替コストで除外する手札 */
      pitchUid?: string;
      /** 血の支払い：HP で払うエナジーの数 */
      lifePay?: number;
    }
  /**
   * 起動（MTG 要素 ○ バッチC1）：場のモンスター・パワー（sourceUid）の「起動」の効果を使う。
   * use（MTG 要素 △ バッチC）は Lvアップ（level）・忠誠+1（plus）・忠誠−K（minus）
   */
  | { type: 'activate'; player: PlayerId; sourceUid: string; chosen?: Chosen; use?: ActivateUse }
  /** 手札のカードを待機ゾーンに置く（MTG 要素 △ バッチC：予顕・計画・待機） */
  | { type: 'setAside'; player: PlayerId; cardUid: string; kind: SetAsideKind }
  /** 裏向きの自分のモンスター（uid）を表にする（MTG 要素 △ バッチC：変装・予示）。chosen は「表になったとき」の対象 */
  | { type: 'reveal'; player: PlayerId; uid: string; chosen?: Chosen }
  /** 手札から使う能力（MTG 要素 ○ バッチC1）：サイクリング・魂力 */
  | { type: 'handAbility'; player: PlayerId; cardUid: string; ability: HandAbilityKind; chosen?: Chosen }
  /** 攻撃。enlistUid は後援（MTG 要素 △ バッチB）で休ませる自分の他のモンスター */
  | { type: 'attack'; player: PlayerId; attackerUid: string; target: TargetRef; enlistUid?: string }
  /** 捨て札のカードの能力（MTG 要素 △ バッチB）：相続・発掘・不朽 */
  | { type: 'discardAbility'; player: PlayerId; cardUid: string; ability: DiscardAbilityKind; chosen?: Chosen }
  | { type: 'removeNoise'; player: PlayerId; cardUid: string }
  | { type: 'choose'; player: PlayerId; picks: string[] }
  | { type: 'endTurn'; player: PlayerId }
  | { type: 'concede'; player: PlayerId; reason?: 'timeout' };

export type ApplyResult = { ok: true; state: GameState } | { ok: false; error: string };

/** 効果ファイルの処理関数に渡す道具（battle/runtime.ts が作る） */
export interface EffectRuntime {
  readonly g: GameState;
  readonly controller: PlayerId;
  readonly opponent: PlayerId;
  /** この効果の対象（解決時点で有効なものだけ） */
  readonly targets: TargetRef[];
  readonly src: SourceRef;
  /** ダメージ効果の1回分（出血・反撃が働く。筋力・気合はアタックの使用時、そのカードの最初の1発にだけ乗る） */
  hit(target: TargetRef, amount: number, opts?: { pierce?: boolean; drain?: boolean; wither?: boolean }): void;
  /** 自分へのダメージ（自傷など） */
  selfDamage(amount: number): void;
  heal(target: TargetRef, amount: number): void;
  addStatus(target: TargetRef, key: StatusKey, amount: number): void;
  setSealed(target: TargetRef): void;
  gainShield(player: PlayerId, amount: number): void;
  gainEnergy(player: PlayerId, amount: number): void;
  addNextTurn(player: PlayerId, delta: { draw?: number; energy?: number }): void;
  addDiscount(player: PlayerId, amount: number): void;
  addRetain(player: PlayerId, amount: number): void;
  draw(player: PlayerId, count: number): void;
  addNoise(player: PlayerId, count: number): void;
  discardRandom(player: PlayerId, count: number): void;
  cleanse(player: PlayerId): void;
  changeAttack(target: TargetRef, delta: number): void;
  changeDefense(target: TargetRef, delta: number): void;
  /** force：守護の不壊でも破壊する（生け贄。MTG 要素 △ バッチA） */
  destroy(target: TargetRef, force?: boolean): void;
  bounce(target: TargetRef): void;
  steal(target: TargetRef): void;
  /** 選択肢を作るための情報 */
  monster(target: TargetRef): Monster | undefined;
  player(id: PlayerId): PlayerState;
  cardDef(cardId: string): CardDef | undefined;
  cardName(cardId: string): string;
  /** 選んだカードを動かす */
  takeFromDeck(player: PlayerId, cardUid: string): void;
  takeFromDiscard(player: PlayerId, cardUid: string): void;
  copyFromHand(player: PlayerId, cardUid: string, keep: boolean): void;
  reviveFromDiscard(player: PlayerId, cardUid: string): void;
  dispelOptions(player: PlayerId): ChoiceOption[];
  dispel(player: PlayerId, key: string): void;
  log(text: string): void;
  // ---- MTG 要素バッチ2
  /** 攻撃力と体力（最大値も）を変える（衰弱で体力が0以下になると破壊。ダメージではない） */
  changeStats(target: TargetRef, attack: number, hp: number): void;
  /** このターンだけ攻撃力を上げる（一時強化） */
  addTempAttack(target: TargetRef, amount: number): void;
  /** キーワードを与える（重複は無視。不屈・聖盾は使用済みを戻す） */
  grantKeyword(target: TargetRef, keywordId: string): void;
  /** もう一度攻撃できるようにする（1体につき1ターン1回） */
  ready(target: TargetRef): void;
  /** 格闘：ally と enemy が互いに攻撃力ぶんのダメージを与え合う */
  fight(ally: TargetRef, enemy: TargetRef): void;
  /** 攻撃力 attack・体力 hp のトークンを count 体出す（場のトークンの上限まで） */
  createTokens(player: PlayerId, attack: number, hp: number, count: number): void;
  /** 手札を count 枚選んで捨てる処理を積む（この効果のあとに選ぶ） */
  chooseDiscard(player: PlayerId, count: number): void;
  /** 手札か捨て札のカードを除外する */
  exileCard(player: PlayerId, cardUid: string): void;
  /** 占術：山札の上の uids を、元の並びのまま山札の下か捨て札へ */
  scryMove(player: PlayerId, uids: string[], toDiscard: boolean): void;
  // ---- MTG 要素 ○ バッチB
  /** シード付き乱数（0〜n−1） */
  randInt(n: number): number;
  /** 手札を count 枚選んで捨てる処理を積む。then が recruit なら徴募 */
  chooseDiscardThen(player: PlayerId, count: number, then: 'recruit'): void;
  /** 装備：このカードを使い終えたら target に付ける（カードから使ったときだけ） */
  equipTo(target: TargetRef): void;
  /** 借用：turns ターンの間、自分の場に移す（すぐ攻撃できる） */
  borrow(target: TargetRef, turns: number): void;
  /** 懸賞を掛ける（破壊されたら player が draw 枚引く） */
  addBounty(target: TargetRef, player: PlayerId, draw: number): void;
  /** トークンを1体出す（複写トークンは召喚扱いで召喚時の効果も出る）。出せたら場のモンスター */
  createToken(player: PlayerId, cardId: string | null, token: TokenSpec): Monster | undefined;
  /** 動員：軍団を（いなければ出してから）攻撃力・体力+n */
  amass(player: PlayerId, n: number): void;
  /** 動力化：まだ攻撃できるモンスターをこのターン攻撃できなくする。できたら true */
  exhaustForEnergy(target: TargetRef): boolean;
  /** 同士討ち：player のモンスターそれぞれが、ランダムな他のモンスターに攻撃力ぶんのダメージ */
  infight(player: PlayerId): void;
  /** 山札の uids を捨て札へ（名前は公開） */
  deckToDiscard(player: PlayerId, uids: string[], why: string): void;
  /** 山札の uids を、元の並びのまま山札の下へ */
  deckToBottom(player: PlayerId, uids: string[]): void;
  /** 山札の特定のカードを引く（引いた枚数の上限に数え、引いたときも出る）。引けたら true */
  drawSpecific(player: PlayerId, uid: string): boolean;
  /** 山札の特定のカードを、順番を変えずに手札へ（引いた扱いではない。名前は本人だけ） */
  seekFromDeck(player: PlayerId, uid: string): void;
  /** 山札から抜いて無料で使う（続唱） */
  freePlayFromDeck(player: PlayerId, uid: string): void;
  /** 封殺を掛ける */
  addQuash(player: PlayerId, kind: string): void;
  /** フィールドを置き換える（両者に効く。MTG 要素 △ バッチD） */
  setField(id: FieldId): void;
  /** 恩恵 */
  addBoon(player: PlayerId, amount: number, uses: number): void;
  /** 最大エナジー増加。上限なら false */
  ramp(player: PlayerId): boolean;
  /** 創出：カード定義を登録し、使い切りのコピーを手札に count 枚 */
  conjure(player: PlayerId, def: CardDef, count: number): void;
  // ---- MTG 要素 ○ バッチC2
  /** エンジン始動：速度が無ければ始める */
  startEngine(player: PlayerId): void;
  /** 王冠を得る */
  takeCrown(player: PlayerId): void;
  // ---- MTG 要素 △ バッチA
  /** 経験を得る（上限あり） */
  addExp(player: PlayerId, n: number): void;
  /** 氷結を掛ける（次のターン開始時に手札が凍る。上限あり） */
  addIce(player: PlayerId, n: number): void;
  /** 英雄譚1つを次の章に進める */
  advanceSaga(player: PlayerId, powerUid: string): void;
  /** 山札の uids を除外へ（名前は公開） */
  deckToExile(player: PlayerId, uids: string[], why: string): void;
  /** モンスターの状態（消滅の印・容疑・守護） */
  markMonster(target: TargetRef, mark: 'finality' | 'suspected' | 'indestructible' | 'protection'): void;
  /** このターンだけキーワードを与える（賛助） */
  tempGrant(target: TargetRef, keywordIds: string[]): void;
  /** 手札のカードを永久強化（どこに移っても残る） */
  perpetual(player: PlayerId, cardUid: string, n: number): void;
  /** 山札の uids を元の並びのまま山札の下へ（消術。ログは「山札の上から N 枚を山札の下に置いた」） */
  deckToBottomQuiet(player: PlayerId, uids: string[]): void;
  // ---- MTG 要素 △ バッチC
  /** 予示：山札の一番上を裏向きのモンスターとして出す（山札が無ければ不発） */
  manifest(player: PlayerId): void;
  /** 追加ターン（1試合1回・写しでは出ない）。得られたら true */
  extraTurn(): boolean;
  /** HP交換（1試合1回・写しでは出ない）。できたら true */
  swapHp(): boolean;
  /** 強奪：相手（from）の山札のカード uid の使い切りのコピーを、この効果の持ち主の手札に加える */
  heistCopy(from: PlayerId, uid: string): void;
  /** 砦を築く：相手の場に体力 hp の砦（報酬はこの効果のカード） */
  buildSiege(hp: number): void;
}

export type StatusKey =
  | 'poison'
  | 'burn'
  | 'weak'
  | 'vulnerable'
  | 'bleed'
  | 'freeze'
  | 'confuse'
  | 'counter'
  | 'nullify'
  | 'regen'
  | 'strength'
  | 'focus'
  | 'doom'
  | 'rad';

/** 選択を求めるときの指定（効果ファイルが返す） */
export interface ChoiceSpec {
  prompt: string;
  options: ChoiceOption[];
  min: number;
  max: number;
}
