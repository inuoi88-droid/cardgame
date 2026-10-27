/**
 * 極端なデッキ（1つの効果だけに寄せたデッキ）を基準デッキ B0・B1 にぶつけて、効果ごとの強さの上限を測る。
 *   node scripts/sim/stress.mts [n]   … 1組み合わせあたり n 試合（既定 60）
 * 出力：scripts/sim/out/stress.json
 *
 * 各デッキはコモン・コスト1（例外は備考に記す）のカード30枚。数値 N は価格表の範囲で作れる最大（fitValue）なので、
 * balance.ts の価格を変えればデッキも自動で追従する。
 *
 * | キー         | 中身                                             | 備考 |
 * |--------------|--------------------------------------------------|------|
 * | damage       | ダメージ N ×30                                   | 純バーン |
 * | multiHit     | 連撃 N×3 ×30                                     | |
 * | pierce       | 防御無視ダメージ N ×30                           | |
 * | drain        | 吸収ダメージ N ×30                               | |
 * | execute      | 処刑 N ×30                                       | モンスター限定 |
 * | counter      | 反撃 N（自分）×30                                | |
 * | shield       | シールド N ×30                                   | |
 * | heal         | 回復 N ×30                                       | |
 * | nullify      | 無効化 ×30                                       | |
 * | poison       | 毒 N ×30                                         | |
 * | burn         | やけど（延長 N）×30                              | |
 * | freeze       | 凍結 ×30                                         | |
 * | weak         | 脱力 N 個 ×30（id は weak。#138）                | |
 * | vulnerable   | 脆弱 N ターン ×30                                | |
 * | bleed        | 出血 N ×30                                       | |
 * | seal         | 封印 ×30                                         | モンスター限定 |
 * | confuse      | 混乱 ×30                                         | モンスター限定 |
 * | strength     | 筋力 N ×15 ＋ ダメージ7 ×15                      | 筋力はアタックに乗るので半分はアタック |
 * | focus        | 気合 N ×15 ＋ ダメージ7 ×15                      | 同上 |
 * | attackUp     | 攻撃力アップ N ×15 ＋ 兵士 3/3 ×15               | 自分のモンスターが要る |
 * | defenseUp    | 守備力アップ N ×15 ＋ 兵士 3/3 ×15               | 同上 |
 * | regen        | 再生 N ×30                                       | |
 * | draw         | ドロー N ×30                                     | |
 * | energy       | エナジー +N ×30                                  | |
 * | savings      | 貯金 N ×30                                       | |
 * | discount     | 軽減 ×30                                         | |
 * | search       | サーチ ×30                                       | |
 * | retain       | 保持 ×30                                         | |
 * | drawJam      | ドロー妨害 ×30                                   | |
 * | energyJam    | エナジー妨害 ×30                                 | |
 * | noise        | ノイズ N ×30                                     | |
 * | bounce       | バウンス（コスト N 以下）×30                     | |
 * | weaken       | 弱化 N ×30                                       | モンスター限定 |
 * | dispel       | 解除 ×30                                         | |
 * | revive       | 蘇生（コスト N 以下）×4 ＋ 兵士 3/3 ×26          | エピック・コスト2（デッキの上限4枚） |
 * | wipe         | 全体破壊 ×2 ＋ 兵士 3/3 ×28                      | レジェンド・コスト2（上限2枚） |
 * | steal        | 奪取 ×2 ＋ 兵士 3/3 ×28                          | レジェンド・コスト3（上限2枚） |
 * | vanilla      | 兵士 3/3 ×30                                     | 純モンスター |
 * | haste        | 速攻 N/2 ×30                                     | N は攻撃力 |
 * | taunt        | 挑発 1/N ×30                                     | N は体力 |
 * | flying       | 飛行 2/N ×30                                     | |
 * | trample      | 貫通 3/N ×30                                     | |
 * | doubleAttack | 二回攻撃 1/N ×30                                 | |
 * | stealth      | 隠密 2/N ×30                                     | |
 * | undying      | 不屈 2/N ×30                                     | |
 * | selfRepair   | 自己修復 N 1/3 ×30                               | |
 * | powerBurn    | パワー「ターン開始時に相手にダメージ N」×30      | |
 * | attackPoison | 1/2「攻撃するたび毒 N」×30                       | |
 *
 * MTG 要素（決定事項 #85・#86）の極端なデッキ（キーの頭に m）
 *
 * | キー            | 中身                                                          | 備考 |
 * |-----------------|---------------------------------------------------------------|------|
 * | mTokenSwarm     | 小鬼 N/N を3体 ×22 ＋ パワー「自分のモンスターが出るたび、出たモンスターの攻撃力+N」（レア）×8 | トークン＋出るたび |
 * | mXBurn          | X：相手1体に N ダメージ（使ったエナジー1につき）×30          | X＋エナジー |
 * | mDoom           | 呪縛 N ×30                                                    | 呪縛の重ね掛け |
 * | mDeathTaunt     | 接死・挑発 1/N（コスト3）×30                                  | 接死＋挑発の壁 |
 * | mDeathTauntBurn | 接死・挑発 1/N（コスト3）×15 ＋ ダメージ N ×15               | 接死の壁＋バーン |
 * | mTauntBurnCtl   | 挑発 1/N（コスト3）×15 ＋ ダメージ N ×15                       | mDeathTauntBurn の比較用（接死なし） |
 * | mDefenderWall   | 防衛・挑発 3/N ×15 ＋ ダメージ N ×15                          | 攻撃しない壁＋バーン（防衛は呪いの下限を満たすため攻撃力3） |
 * | mLifelink       | 絆魂 N/3 ×30                                                  | |
 * | mDivineShield   | 聖盾 2/N ×30                                                  | |
 * | mFirstStrike    | 先制攻撃 N/3 ×30                                              | |
 * | mBushido        | 武士道N 2/3 ×30                                               | |
 * | mHexproof       | 呪禁 2/N ×30                                                  | |
 * | mFight          | 格闘 ×15 ＋ 兵士 3/3 ×15                                      | |
 * | mWither         | 衰弱 N ×30                                                    | |
 * | mTrain          | 鍛錬 N ×15 ＋ 兵士 3/3 ×15                                    | |
 * | mPump           | 一時強化 N（自分のモンスター全体）×15 ＋ 兵士 3/3 ×15        | |
 * | mReady          | 再行動 ×15 ＋ 戦士 5/5（コスト2）×15                          | |
 * | mPerEnemy       | 相手1体に N ダメージ（相手モンスター1体につき）×30          | |
 * | mPerCard        | 相手1体に N ダメージ（このターン使ったカード1枚につき）×30  | |
 * | mDamagedBurn    | このターン相手にダメージを与えていれば、相手1体に N ダメージ ×15 ＋ ダメージ N ×15 | 条件付きの安いバーン |
 * | mCoinBurn       | コインを投げて表なら、相手1体に N ダメージ ×30               | |
 * | mLifespanHaste  | 速攻 N/2・寿命1 ×30                                           | 使い捨て召喚 |
 * | mSacrifice      | 小鬼 N/N を2体 ×15 ＋ 生け贄の大型 N/N（コスト1）×15          | |
 *
 * ○ の MTG 要素（決定事項 #91〜#94）の極端なデッキ（キーの頭に o。測定は #95）
 *
 * | キー            | 中身                                                          | 備考 |
 * |-----------------|---------------------------------------------------------------|------|
 * | oBothDraw       | お互い N 枚引く ×15 ＋ ダメージ N ×15                         | お互いの対象 |
 * | oDelayBurn      | 次のターンに：相手1体に N ダメージ ×30                        | 予約の積み上げ |
 * | oDrawnChain     | 引いたとき：1枚引く＋1枚引く ×8（レア）＋ ダメージ N ×22      | 引いたときの連鎖（コモンでは引いたときのドローを作れない） |
 * | oMobilize       | 応召の小鬼 N/N を2体 ×15 ＋ パワー「出るたび、出たモンスターの攻撃力+N」×8 ＋ 兵士 ×7 | 一時トークン＋出るたび |
 * | oAmass          | 動員 N ×30                                                    | 軍団 |
 * | oClone          | 複写召喚 ×4（エピック）＋ 兵士 ×26                            | |
 * | oQuash          | 封殺（すべて）×8（レア・コスト2）＋ ダメージ N ×22            | 封殺の連打 |
 * | oCascade        | 続唱（コスト N 以下）×8（レア・コスト2）＋ ダメージ N ×22     | 続唱の連鎖 |
 * | oInspire        | 激励 N 1/1 ×30                                                | 激励の並べ |
 * | oBuyback        | 再利用：ダメージ N（コスト2）×30                              | 再利用の繰り返し |
 * | oRebound        | 反復：ダメージ N ×30                                          | 反復 |
 * | oFlashback      | フラッシュバック：ダメージ N ×30                              | 捨て札から |
 * | oEscape         | 脱出3：ダメージ N ×8（レア）＋ ダメージ N ×22                 | 脱出の連打 |
 * | oActivatePower  | パワー「起動（エナジー1）：相手に N ダメージ」×30              | 起動のパワーを重ねる |
 * | oAffinity       | 親和（使ったカード）：ダメージ N（コスト3）×15 ＋ 小鬼 ×15    | 親和で軽くする |
 * | oKickerOffspring| キッカー1・払えば新生：N/N（レア・コスト2）×8 ＋ 兵士 ×22     | キッカー＋新生 |
 * | oEntwine        | 双呪1：A 相手1体に N ダメージ・B 回復 N ×30                   | 双呪の重ね使い |
 * | oSpeed          | エンジン始動 ×6 ＋ 速度が最大なら相手に N ダメージ ×12 ＋ 速攻 ×12 | 速度4の条件 |
 * | oCrown          | 王冠を得る ×8 ＋ 王冠を持っていれば N ダメージ ×22           | 王冠の奪い合い |
 * | oSaga           | 英雄譚（第1〜3章：ダメージ N）×30                             | パワー枠の圧迫 |
 * | oCharge         | 蓄積（カードを使うたび・2）：ダメージ N のパワー（コスト2）×15 ＋ ダメージ N ×15 | 蓄積 |
 * | oTribe          | 獣の N/N（召喚時、同じ種族の自分のモンスター全体の攻撃力+1）×30 | 同じ種族の並べ（ロード） |
 * | oLordAll        | N/N（召喚時、自分のモンスター全体の攻撃力+1）×30             | oTribe の比較用（種族なし。#85 の対象） |
 *
 * △ の MTG 要素（決定事項 #97〜#100）の極端なデッキ（キーの頭に t。測定は統合 #101）
 *
 * | キー            | 中身                                                          | 備考 |
 * |-----------------|---------------------------------------------------------------|------|
 * | tTrap           | 罠のパワー「相手のモンスターが攻撃するたび、攻撃してきたモンスターに N ダメージ」×15 ＋ 火球 ×15 | 罠（1回で消える） |
 * | tAmbush         | パワー「相手のモンスターが攻撃するたび、攻撃してきたモンスターに N ダメージ」（コスト2）×15 ＋ 火球 ×15 | 罠なし（残る） |
 * | tRad            | 放射能 N（相手）×30                                           | 山札削り＋ダメージ |
 * | tDormant        | 休眠 N/N ×30                                                  | 1ターンおきに休む大型 |
 * | tUpkeepPower    | パワー「ターン開始時に相手に N ダメージ」・累加維持費2 ×30   | （維持費1 では呪いの下限に届かない） |
 * | tGamble         | ばらつき：ダメージ N ×30                                      | |
 * | tIncubate       | 培養 N ×30                                                    | 卵のトークン |
 * | tSpawn          | 落とし子 N/N を2体 ×30                                        | 破壊でエナジー |
 * | tBackup         | 賛助 N（召喚時）1/2（コスト2）×30                             | |
 * | tGuard          | 守護（不壊）×15 ＋ 兵士 ×15                                   | |
 * | tExp            | 経験を得る N ×10 ＋ ダメージ N（経験1につき）×20               | |
 * | tIce            | 氷結 N ×15 ＋ 火球 ×15                                        | |
 * | tPitch          | 代替コスト：ダメージ N（レア・コスト3）×8 ＋ 火球 ×22         | 0⚡の呪文 |
 * | tSquad          | 分隊2：N/N（レア・コスト2）×8 ＋ 兵士 ×22                     | コピーのトークン |
 * | tEvoke          | 想起1：召喚時に相手1体へ N ダメージ（コスト4）×30            | |
 * | tLifePay        | 血の支払い2：ダメージ N（コスト2）×30                         | HP で払う |
 * | tUnearth        | 一時蘇生1：N/N ×30                                            | 捨て札から |
 * | tEmbalm         | 不朽1：N/N ×30                                                | 捨て札からコピー |
 * | tRetrace        | 回顧：ダメージ N ×30                                          | 捨て札から（手札を捨てて） |
 * | tDelveDredge    | 探査：ダメージ N（コスト3）×15 ＋ 発掘2：ダメージ N ×15       | 捨て札を燃料に |
 * | tEnlist         | 後援 N/N ×30                                                  | |
 * | tForetell       | 予顕−2：ダメージ N（コスト4）×30                              | |
 * | tSuspend        | 待機（エナジー0・2ターン）：ダメージ N（コスト3）×30          | |
 * | tSuspendK1      | 待機（エナジー1・1ターン）：ダメージ N（コスト3）×30          | |
 * | tWarp           | ワープ1：召喚時に相手1体へ N ダメージ（コスト3）×30           | ワープの出し入れ |
 * | tDisguise       | 変装1：N/N（表になったとき相手1体に N ダメージ。コスト3）×30  | |
 * | tLevelUp        | Lvアップ（エナジー1・Lv1つにつき+1）：N/N ×30                 | |
 * | tEvolve         | 進化+2（自分の場にモンスターが3体以上）：N/N ×30              | |
 * | tLoyalty        | 忠誠3：+1 で相手1体に N ダメージ（パワー・コスト2）×30       | |
 * | tSiege          | 砦を築く（体力 N）・砦を落としたとき：2枚引く ×15 ＋ 兵士 ×15  | |
 * | tExtraTurn      | 追加ターン（レジェンド）×2 ＋ 火球 ×28                        | 1試合1回 |
 * | tAltWin         | 特殊勝利（カードを使う。レジェンドのパワー・コスト4）×2 ＋ 火球 ×28 | |
 * | tEmblem         | 紋章：ターン開始時に相手に N ダメージ（レジェンド）×2 ＋ 火球 ×28 | |
 * | tExileMill      | 山札消滅 N（相手）×30                                         | 疲労（決定事項 #102）で勝てるか |
 * | tExileMillHalf  | 山札消滅 N（相手）×15 ＋ 兵士 ×15                             | 同上（守りつき） |
 */
import {
  B0,
  B1,
  burnCard,
  monsterAtCap,
  BALANCE,
  argN,
  buildDeck,
  cardAtCap,
  fill,
  fitValue,
  fx,
  isMain,
  mdTable,
  pct,
  series,
  table,
  writeOut,
  type DeckSpec,
  type SeriesResult,
} from './lib.mts';
import { createEffect, type AbilityInstance, type TribeId, type CardDef, type DrawbackInstance, type EffectInstance, type KeywordInstance, type Rarity, type Stats } from '../../src/engine/index.ts';

/** 効果の既定（タイミング・対象・option）を createEffect からもらい、上書きする */
const eff = (id: string, over: Partial<EffectInstance> = {}, monster = false): EffectInstance => ({ ...createEffect(id, monster ? 'monster' : 'spell'), ...over });

const SOLDIER = (): CardDef => cardAtCap('common', 1, [], { attack: 3, hp: 3, defense: 0 }, [], { name: '兵士' });
const FIREBALL = (): CardDef => burnCard(7, '火球');

interface Parts {
  abilities?: AbilityInstance[];
  tribe?: TribeId;
  drawbacks?: DrawbackInstance[];
  effects?: EffectInstance[];
  stats?: Stats | null;
  keywords?: KeywordInstance[];
  name?: string;
}

/** 数値 N を最大にしたカード30枚のデッキ */
const single = (key: string, build: (v: number) => Parts, rarity: Rarity = 'common', cost = 1): DeckSpec => {
  const { card } = fitValue(rarity, cost, build);
  return buildDeck(key, [[card, 30]]);
};
/** 数値のないカード30枚 */
const flat = (key: string, effects: EffectInstance[], rarity: Rarity = 'common', cost = 1): DeckSpec => buildDeck(key, [[cardAtCap(rarity, cost, effects, null, [], { name: key }), 30]]);
/** 数値 N を最大にしたカード15枚＋相方15枚 */
const half = (key: string, partner: CardDef, build: (v: number) => Parts, rarity: Rarity = 'common', cost = 1): DeckSpec => {
  const { card } = fitValue(rarity, cost, build);
  return buildDeck(key, [
    [card, 15],
    [partner, 15],
  ]);
};
/** レアリティ限定の効果：デッキに入れられる上限（エピック4・レジェンド2）まで入れ、残りは兵士 */
const rareLimited = (key: string, rarity: Rarity, cost: number, build: (v: number) => Parts): DeckSpec => {
  const { value } = fitValue(rarity, cost, build);
  const parts = build(value);
  const limit = BALANCE.rarity[rarity].deckLimit ?? 30;
  return buildDeck(key, [...fill(parts.name ?? key, rarity, cost, parts, limit), [SOLDIER(), 30 - limit]]);
};
/** 数値 N を最大にしたカードを count 枚（同名の枚数制限を守って、同じ中身を別名で複製） */
const fitFill = (rarity: Rarity, cost: number, build: (v: number) => Parts, count: number): [CardDef, number][] => {
  const { value } = fitValue(rarity, cost, build);
  const parts = build(value);
  return fill(parts.name ?? 'card', rarity, cost, parts, count);
};
/** モンスター（キーワード付き）。fit は体力か攻撃力 */
const mon = (key: string, build: (v: number) => Parts): DeckSpec => single(key, build);

export const EXTREME: Record<string, () => DeckSpec> = {
  damage: () => single('damage', (v) => ({ effects: [eff('damage', { value: v })], name: `ダメージ${v}` })),
  multiHit: () => single('multiHit', (v) => ({ effects: [eff('multiHit', { value: v, hits: 3 })], name: `連撃${v}x3` })),
  pierce: () => single('pierce', (v) => ({ effects: [eff('damage', { value: v, mods: ['pierce'] })], name: `防御無視${v}` })),
  drain: () => single('drain', (v) => ({ effects: [eff('damage', { value: v, mods: ['drain'] })], name: `吸収${v}` })),
  execute: () => single('execute', (v) => ({ effects: [eff('execute', { value: v })], name: `処刑${v}` })),
  counter: () => single('counter', (v) => ({ effects: [eff('counter', { value: v })], name: `反撃${v}` })),
  shield: () => single('shield', (v) => ({ effects: [eff('shield', { value: v })], name: `シールド${v}` })),
  heal: () => single('heal', (v) => ({ effects: [eff('heal', { value: v })], name: `回復${v}` })),
  nullify: () => flat('nullify', [eff('nullify')]),
  poison: () => single('poison', (v) => ({ effects: [eff('poison', { value: v })], name: `毒${v}` })),
  burn: () => single('burn', (v) => ({ effects: [eff('burn', { value: v })], name: `やけど+${v}` }), 'common', 1),
  freeze: () => flat('freeze', [eff('freeze')]),
  weak: () => single('weak', (v) => ({ effects: [eff('weak', { value: v })], name: `脱力${v}` })),
  vulnerable: () => single('vulnerable', (v) => ({ effects: [eff('vulnerable', { value: v })], name: `脆弱${v}` })),
  bleed: () => single('bleed', (v) => ({ effects: [eff('bleed', { value: v })], name: `出血${v}` })),
  seal: () => flat('seal', [eff('seal')]),
  confuse: () => flat('confuse', [eff('confuse')]),
  strength: () => half('strength', FIREBALL(), (v) => ({ effects: [eff('strength', { value: v })], name: `筋力${v}` })),
  focus: () => half('focus', FIREBALL(), (v) => ({ effects: [eff('focus', { value: v })], name: `気合${v}` })),
  attackUp: () => half('attackUp', SOLDIER(), (v) => ({ effects: [eff('attackUp', { value: v })], name: `攻撃力+${v}` })),
  defenseUp: () => half('defenseUp', SOLDIER(), (v) => ({ effects: [eff('defenseUp', { value: v })], name: `守備力+${v}` })),
  regen: () => single('regen', (v) => ({ effects: [eff('regen', { value: v })], name: `再生${v}` })),
  draw: () => single('draw', (v) => ({ effects: [eff('draw', { value: v })], name: `ドロー${v}` })),
  energy: () => single('energy', (v) => ({ effects: [eff('energy', { value: v })], name: `エナジー+${v}` })),
  savings: () => single('savings', (v) => ({ effects: [eff('savings', { value: v })], name: `貯金${v}` })),
  discount: () => flat('discount', [eff('discount')]),
  search: () => flat('search', [eff('search')]),
  retain: () => flat('retain', [eff('retain')]),
  drawJam: () => flat('drawJam', [eff('drawJam')]),
  energyJam: () => flat('energyJam', [eff('energyJam')]),
  noise: () => single('noise', (v) => ({ effects: [eff('noise', { value: v })], name: `ノイズ${v}` })),
  bounce: () => single('bounce', (v) => ({ effects: [eff('bounce', { value: v })], name: `バウンス${v}` }), 'common', 1),
  weaken: () => single('weaken', (v) => ({ effects: [eff('weaken', { value: v })], name: `弱化${v}` })),
  dispel: () => flat('dispel', [eff('dispel')]),
  revive: () => rareLimited('revive', 'epic', 2, (v) => ({ effects: [eff('revive', { value: v })], name: `蘇生${v}` })),
  wipe: () => rareLimited('wipe', 'legend', 2, () => ({ effects: [eff('wipe')], name: '全体破壊' })),
  steal: () => rareLimited('steal', 'legend', 3, () => ({ effects: [eff('steal')], name: '奪取' })),
  vanilla: () => buildDeck('vanilla', [[SOLDIER(), 30]]),
  haste: () => mon('haste', (v) => ({ stats: { attack: v, hp: 2, defense: 0 }, keywords: [{ id: 'haste' }], name: `速攻${v}/2` })),
  taunt: () => mon('taunt', (v) => ({ stats: { attack: 1, hp: v, defense: 0 }, keywords: [{ id: 'taunt' }], name: `挑発1/${v}` })),
  flying: () => mon('flying', (v) => ({ stats: { attack: 2, hp: v, defense: 0 }, keywords: [{ id: 'flying' }], name: `飛行2/${v}` })),
  trample: () => mon('trample', (v) => ({ stats: { attack: 3, hp: v, defense: 0 }, keywords: [{ id: 'trample' }], name: `貫通3/${v}` })),
  doubleAttack: () => mon('doubleAttack', (v) => ({ stats: { attack: 1, hp: v, defense: 0 }, keywords: [{ id: 'doubleAttack' }], name: `二回攻撃1/${v}` })),
  stealth: () => mon('stealth', (v) => ({ stats: { attack: 2, hp: v, defense: 0 }, keywords: [{ id: 'stealth' }], name: `隠密2/${v}` })),
  undying: () => mon('undying', (v) => ({ stats: { attack: 2, hp: v, defense: 0 }, keywords: [{ id: 'undying' }], name: `不屈2/${v}` })),
  selfRepair: () => mon('selfRepair', (v) => ({ stats: { attack: 1, hp: 3, defense: 0 }, keywords: [{ id: 'selfRepair', value: v }], name: `自己修復${v}` })),
  powerBurn: () => single('powerBurn', (v) => ({ effects: [eff('damage', { value: v, timing: 'turnStart', target: 'enemyPlayer' })], name: `燃える大地${v}` })),
  // ---------------------------------------------------------------- MTG 要素（#85・#86）
  mTokenSwarm: () => {
    return buildDeck('mTokenSwarm', [
      ...fitFill('common', 1, (v) => ({ effects: [eff('token', { value: v, hits: 3 })], name: `小鬼${v}x3` }), 22),
      ...fitFill('rare', 1, (v) => ({ effects: [eff('attackUp', { value: v, timing: 'allySummoned', target: 'chosen' })], name: `号令${v}` }), BALANCE.rarity.rare.deckLimit ?? 8),
    ]);
  },
  mXBurn: () => single('mXBurn', (v) => ({ effects: [eff('damage', { value: v, mods: ['xEnergy'] })], name: `X火球${v}` })),
  mDoom: () => single('mDoom', (v) => ({ effects: [eff('doom', { value: v })], name: `呪縛${v}` })),
  mDeathTaunt: () =>
    single('mDeathTaunt', (v) => ({ stats: { attack: 1, hp: v, defense: 0 }, keywords: [{ id: 'deathtouch' }, { id: 'taunt' }], name: `接死の壁1/${v}` }), 'common', 3),
  mDeathTauntBurn: () => {
    const wall = fitValue('common', 3, (v) => ({ stats: { attack: 1, hp: v, defense: 0 }, keywords: [{ id: 'deathtouch' }, { id: 'taunt' }], name: `接死の壁1/${v}` })).card;
    return buildDeck('mDeathTauntBurn', [
      [wall, 15],
      [burnCard(undefined, '火球'), 15],
    ]);
  },
  mTauntBurnCtl: () => {
    const wall = fitValue('common', 3, (v) => ({ stats: { attack: 1, hp: v, defense: 0 }, keywords: [{ id: 'taunt' }], name: `挑発の壁1/${v}` })).card;
    return buildDeck('mTauntBurnCtl', [
      [wall, 15],
      [burnCard(undefined, '火球'), 15],
    ]);
  },
  mDefenderWall: () => {
    const wall = fitValue('common', 1, (v) => ({ stats: { attack: 3, hp: v, defense: 0 }, keywords: [{ id: 'taunt' }], drawbacks: [{ id: 'defender', timing: null }], name: `防壁3/${v}` })).card;
    return buildDeck('mDefenderWall', [
      [wall, 15],
      [burnCard(undefined, '火球'), 15],
    ]);
  },
  mLifelink: () => mon('mLifelink', (v) => ({ stats: { attack: v, hp: 3, defense: 0 }, keywords: [{ id: 'lifelink' }], name: `絆魂${v}/3` })),
  mDivineShield: () => mon('mDivineShield', (v) => ({ stats: { attack: 2, hp: v, defense: 0 }, keywords: [{ id: 'divineShield' }], name: `聖盾2/${v}` })),
  mFirstStrike: () => mon('mFirstStrike', (v) => ({ stats: { attack: v, hp: 3, defense: 0 }, keywords: [{ id: 'firstStrike' }], name: `先制${v}/3` })),
  mBushido: () => mon('mBushido', (v) => ({ stats: { attack: 2, hp: 3, defense: 0 }, keywords: [{ id: 'bushido', value: v }], name: `武士道${v}` })),
  mHexproof: () => mon('mHexproof', (v) => ({ stats: { attack: 2, hp: v, defense: 0 }, keywords: [{ id: 'hexproof' }], name: `呪禁2/${v}` })),
  mFight: () => buildDeck('mFight', [
    [cardAtCap('common', 1, [eff('fight')], null, [], { name: '格闘' }), 15],
    [SOLDIER(), 15],
  ]),
  mWither: () => single('mWither', (v) => ({ effects: [eff('wither', { value: v })], name: `衰弱${v}` })),
  mTrain: () => half('mTrain', SOLDIER(), (v) => ({ effects: [eff('train', { value: v })], name: `鍛錬${v}` })),
  mPump: () => half('mPump', SOLDIER(), (v) => ({ effects: [eff('pump', { value: v, target: 'allyMonsters' })], name: `鼓舞${v}` })),
  mReady: () => buildDeck('mReady', [
    [cardAtCap('common', 1, [eff('ready')], null, [], { name: '再行動' }), 15],
    [monsterAtCap('戦士', 2, 5, 5), 15],
  ]),
  mPerEnemy: () => single('mPerEnemy', (v) => ({ effects: [eff('damage', { value: v, mods: ['perEnemyMonster'] })], name: `群れ撃ち${v}` })),
  mPerCard: () => single('mPerCard', (v) => ({ effects: [eff('damage', { value: v, mods: ['perCardPlayed'] })], name: `連鎖${v}` })),
  mDamagedBurn: () => half('mDamagedBurn', burnCard(undefined, '火球'), (v) => ({ effects: [eff('damage', { value: v, condition: 'enemyDamagedThisTurn' })], name: `追撃${v}` })),
  mCoinBurn: () => single('mCoinBurn', (v) => ({ effects: [eff('damage', { value: v, condition: 'coinFlip' })], name: `賭け${v}` })),
  mLifespanHaste: () =>
    single('mLifespanHaste', (v) => ({ stats: { attack: v, hp: 2, defense: 0 }, keywords: [{ id: 'haste' }], drawbacks: [{ id: 'lifespan', timing: null, value: 1 }], name: `突撃${v}/2` })),
  mSacrifice: () => {
    const tok = fitValue('common', 1, (v) => ({ effects: [eff('token', { value: v, hits: 2 })], name: `小鬼${v}x2` })).card;
    const big = fitValue('common', 1, (v) => ({ stats: { attack: v, hp: v, defense: 0 }, drawbacks: [{ id: 'sacrifice', timing: 'summon' }], name: `生け贄の巨人${v}` })).card;
    return buildDeck('mSacrifice', [
      [tok, 15],
      [big, 15],
    ]);
  },
  // ---------------------------------------------------------------- ○ の MTG 要素（#91〜#94）
  oBothDraw: () => half('oBothDraw', burnCard(undefined, '火球'), (v) => ({ effects: [eff('draw', { value: Math.min(v, 3), target: 'bothPlayers' })], name: `お互いドロー${Math.min(v, 3)}` }), 'common', 1),
  oDelayBurn: () => single('oDelayBurn', (v) => ({ effects: [eff('damage', { value: v, mods: ['nextTurn'] })], name: `予約火球${v}` })),
  oDrawnChain: () => {
    const lim = BALANCE.rarity.rare.deckLimit ?? 8;
    return buildDeck('oDrawnChain', [
      ...fill('連鎖の札', 'rare', 1, { effects: [eff('draw', { value: 1, timing: 'drawn', target: 'self' }), eff('draw', { value: 1, target: 'self' })] }, lim),
      [burnCard(undefined, '火球'), 30 - lim],
    ]);
  },
  oMobilize: () =>
    buildDeck('oMobilize', [
      ...fitFill('common', 1, (v) => ({ effects: [eff('token', { value: v, hits: 2, option: 'mobilize' })], name: `応召${v}x2` }), 15),
      ...fitFill('rare', 1, (v) => ({ effects: [eff('attackUp', { value: v, timing: 'allySummoned', target: 'chosen' })], name: `号令${v}` }), BALANCE.rarity.rare.deckLimit ?? 8),
      [SOLDIER(), 7],
    ]),
  oAmass: () => single('oAmass', (v) => ({ effects: [eff('amass', { value: v })], name: `動員${v}` })),
  oClone: () => rareLimited('oClone', 'epic', 2, () => ({ effects: [eff('cloneToken')], name: '複写召喚' })),
  oQuash: () =>
    buildDeck('oQuash', [
      ...fill('封殺', 'rare', 2, { effects: [eff('quash', { option: 'any' })] }, BALANCE.rarity.rare.deckLimit ?? 8),
      [burnCard(undefined, '火球'), 30 - (BALANCE.rarity.rare.deckLimit ?? 8)],
    ]),
  oCascade: () =>
    buildDeck('oCascade', [
      ...fitFill('rare', 2, (v) => ({ effects: [eff('cascade', { value: Math.min(v, 2) }), eff('damage', { value: v })], name: `続唱${v}` }), BALANCE.rarity.rare.deckLimit ?? 8),
      [burnCard(undefined, '火球'), 30 - (BALANCE.rarity.rare.deckLimit ?? 8)],
    ]),
  oInspire: () => mon('oInspire', (v) => ({ stats: { attack: 1, hp: 1, defense: 0 }, keywords: [{ id: 'inspire', value: v }], name: `激励${v}` })),
  oBuyback: () => single('oBuyback', (v) => ({ effects: [eff('damage', { value: v })], abilities: [{ id: 'buyback' }], name: `再利用${v}` }), 'common', 2),
  oRebound: () => single('oRebound', (v) => ({ effects: [eff('damage', { value: v })], abilities: [{ id: 'rebound' }], name: `反復${v}` })),
  oFlashback: () => single('oFlashback', (v) => ({ effects: [eff('damage', { value: v })], abilities: [{ id: 'flashback', value: 0 }], name: `FB${v}` })),
  oEscape: () =>
    buildDeck('oEscape', [
      ...fitFill('rare', 1, (v) => ({ effects: [eff('damage', { value: v })], abilities: [{ id: 'escape', value: 3 }], name: `脱出${v}` }), BALANCE.rarity.rare.deckLimit ?? 8),
      [burnCard(undefined, '火球'), 30 - (BALANCE.rarity.rare.deckLimit ?? 8)],
    ]),
  oActivatePower: () =>
    single('oActivatePower', (v) => ({ effects: [eff('damage', { value: v, timing: 'activated', target: 'chosen' })], abilities: [{ id: 'activate', value: 1 }], name: `起動砲${v}` })),
  oAffinity: () => {
    const tok = fitValue('common', 1, (v) => ({ effects: [eff('token', { value: v })], name: `小鬼${v}` })).card;
    return half('oAffinity', tok, (v) => ({ effects: [eff('damage', { value: v })], abilities: [{ id: 'affinity', option: 'cardsPlayed' }], name: `親和${v}` }), 'common', 3);
  },
  oKickerOffspring: () =>
    buildDeck('oKickerOffspring', [
      ...fitFill('rare', 2, (v) => ({ stats: { attack: v, hp: v, defense: 0 }, effects: [eff('offspring', { condition: 'kicked' }, true)], abilities: [{ id: 'kicker', value: 1 }], name: `新生${v}` }), BALANCE.rarity.rare.deckLimit ?? 8),
      [SOLDIER(), 30 - (BALANCE.rarity.rare.deckLimit ?? 8)],
    ]),
  oEntwine: () =>
    single('oEntwine', (v) => ({ effects: [eff('damage', { value: v, mode: 1 }), eff('heal', { value: v, target: 'self', mode: 2 })], abilities: [{ id: 'entwine', value: 1 }], name: `双呪${v}` })),
  oSpeed: () =>
    buildDeck('oSpeed', [
      [cardAtCap('common', 1, [eff('startEngine'), eff('draw', { value: 1, target: 'self' })], null, [], { name: 'エンジン始動' }), 6],
      [fitValue('common', 1, (v) => ({ effects: [eff('damage', { value: v, condition: 'maxSpeed' })], name: `最高速${v}` })).card, 12],
      [fitValue('common', 1, (v) => ({ stats: { attack: v, hp: 2, defense: 0 }, keywords: [{ id: 'haste' }], name: `速攻${v}/2` })).card, 12],
    ]),
  oCrown: () =>
    buildDeck('oCrown', [
      [cardAtCap('common', 1, [eff('crown')], null, [], { name: '戴冠' }), 8],
      [fitValue('common', 1, (v) => ({ effects: [eff('damage', { value: v, condition: 'hasCrown' })], name: `王の火${v}` })).card, 22],
    ]),
  oSaga: () =>
    single('oSaga', (v) => ({
      effects: [1, 2, 3].map((c) => eff('damage', { value: v, timing: `chapter${c}` as EffectInstance['timing'], target: 'enemyPlayer' })),
      name: `英雄譚${v}`,
    })),
  oCharge: () =>
    half('oCharge', burnCard(undefined, '火球'), (v) => ({
      effects: [eff('damage', { value: v, timing: 'charged', target: 'enemyPlayer' })],
      abilities: [{ id: 'charge', value: 2, option: 'cardPlayed' }],
      name: `蓄積${v}`,
    }), 'common', 2),
  oLordAll: () =>
    single('oLordAll', (v) => ({ stats: { attack: v, hp: v, defense: 0 }, effects: [eff('attackUp', { value: 1, timing: 'summon', target: 'allyMonsters' }, true)], name: `号令の兵${v}` })),
  oTribe: () =>
    single('oTribe', (v) => ({ stats: { attack: v, hp: v, defense: 0 }, tribe: 'beast', effects: [eff('attackUp', { value: 1, timing: 'summon', target: 'tribeAllies' }, true)], name: `獣の群れ${v}` })),
  // ---------------------------------------------------------------- △ の MTG 要素（#97〜#100。測定は統合 #101）
  tTrap: () =>
    half('tTrap', burnCard(undefined, '火球'), (v) => ({
      effects: [eff('damage', { value: v, timing: 'enemyAttacked', target: 'attacker' })],
      abilities: [{ id: 'trap' }],
      name: `罠${v}`,
    })),
  tAmbush: () =>
    half('tAmbush', burnCard(undefined, '火球'), (v) => ({ effects: [eff('damage', { value: v, timing: 'enemyAttacked', target: 'attacker' })], name: `迎撃${v}` }), 'common', 2),
  tRad: () => single('tRad', (v) => ({ effects: [eff('rad', { value: v, option: 'enemy' })], name: `放射能${v}` })),
  tDormant: () => single('tDormant', (v) => ({ stats: { attack: v, hp: v, defense: 0 }, drawbacks: [{ id: 'dormant', timing: null }], name: `休眠${v}` })),
  tUpkeepPower: () =>
    single('tUpkeepPower', (v) => ({ effects: [eff('damage', { value: v, timing: 'turnStart', target: 'enemyPlayer' })], drawbacks: [{ id: 'cumulativeUpkeep', timing: null, value: 2 }], name: `累加${v}` })),
  tGamble: () => single('tGamble', (v) => ({ effects: [eff('damage', { value: v, mods: ['gamble'] })], name: `ばらつき${v}` })),
  tIncubate: () => single('tIncubate', (v) => ({ effects: [eff('incubate', { value: v })], name: `培養${v}` })),
  tSpawn: () => single('tSpawn', (v) => ({ effects: [eff('token', { value: v, hits: 2, option: 'spawn' })], name: `落とし子${v}x2` })),
  tBackup: () => single('tBackup', (v) => ({ stats: { attack: 1, hp: 2, defense: 0 }, effects: [eff('backup', { value: v }, true)], name: `賛助${v}` }), 'common', 2),
  tGuard: () => buildDeck('tGuard', [[cardAtCap('common', 1, [eff('guard', { option: 'indestructible' })], null, [], { name: '守護' }), 15], [SOLDIER(), 15]]),
  tExp: () =>
    buildDeck('tExp', [
      ...fitFill('common', 1, (v) => ({ effects: [eff('gainExp', { value: Math.min(v, 3) })], name: `経験${Math.min(v, 3)}` }), 10),
      ...fitFill('common', 1, (v) => ({ effects: [eff('damage', { value: v, mods: ['perExp'] })], name: `経験の火${v}` }), 20),
    ]),
  tIce: () => half('tIce', burnCard(undefined, '火球'), (v) => ({ effects: [eff('iceLock', { value: Math.min(v, 3) })], name: `氷結${Math.min(v, 3)}` })),
  tPitch: () =>
    buildDeck('tPitch', [
      ...fitFill('rare', 3, (v) => ({ effects: [eff('damage', { value: v })], abilities: [{ id: 'pitch' }], name: `代替${v}` }), BALANCE.rarity.rare.deckLimit ?? 8),
      [burnCard(undefined, '火球'), 30 - (BALANCE.rarity.rare.deckLimit ?? 8)],
    ]),
  tSquad: () =>
    buildDeck('tSquad', [
      ...fitFill('rare', 2, (v) => ({ stats: { attack: v, hp: v, defense: 0 }, abilities: [{ id: 'squad', value: 2 }], name: `分隊${v}` }), BALANCE.rarity.rare.deckLimit ?? 8),
      [SOLDIER(), 30 - (BALANCE.rarity.rare.deckLimit ?? 8)],
    ]),
  tEvoke: () =>
    single('tEvoke', (v) => ({ stats: { attack: 2, hp: 2, defense: 0 }, effects: [eff('damage', { value: v, timing: 'summon' }, true)], abilities: [{ id: 'evoke', value: 1 }], name: `想起${v}` }), 'common', 4),
  tLifePay: () => single('tLifePay', (v) => ({ effects: [eff('damage', { value: v })], abilities: [{ id: 'lifePay', value: 2 }], name: `血${v}` }), 'common', 2),
  tUnearth: () => single('tUnearth', (v) => ({ stats: { attack: v, hp: v, defense: 0 }, abilities: [{ id: 'unearth', value: 1 }], name: `蘇生${v}` })),
  tEmbalm: () => single('tEmbalm', (v) => ({ stats: { attack: v, hp: v, defense: 0 }, abilities: [{ id: 'embalm', value: 1 }], name: `不朽${v}` })),
  tRetrace: () => single('tRetrace', (v) => ({ effects: [eff('damage', { value: v })], abilities: [{ id: 'retrace' }], name: `回顧${v}` })),
  tDelveDredge: () =>
    buildDeck('tDelveDredge', [
      ...fitFill('common', 3, (v) => ({ effects: [eff('damage', { value: v })], abilities: [{ id: 'delve' }], name: `探査${v}` }), 15),
      ...fitFill('common', 1, (v) => ({ effects: [eff('damage', { value: v })], abilities: [{ id: 'dredge', value: 2 }], name: `発掘${v}` }), 15),
    ]),
  tEnlist: () => mon('tEnlist', (v) => ({ stats: { attack: v, hp: v, defense: 0 }, keywords: [{ id: 'enlist' }], name: `後援${v}` })),
  tForetell: () => single('tForetell', (v) => ({ effects: [eff('damage', { value: v })], abilities: [{ id: 'foretell', value: 2 }], name: `予顕${v}` }), 'common', 4),
  tSuspend: () => single('tSuspend', (v) => ({ effects: [eff('damage', { value: v })], abilities: [{ id: 'suspend', value: 2, option: '0' }], name: `待機${v}` }), 'common', 3),
  tSuspendK1: () => single('tSuspendK1', (v) => ({ effects: [eff('damage', { value: v })], abilities: [{ id: 'suspend', value: 1, option: '1' }], name: `待機1—1:${v}` }), 'common', 3),
  tWarp: () =>
    single('tWarp', (v) => ({ stats: { attack: 2, hp: 2, defense: 0 }, effects: [eff('damage', { value: v, timing: 'summon' }, true)], abilities: [{ id: 'warp', value: 1 }], name: `ワープ${v}` }), 'common', 3),
  tDisguise: () =>
    single('tDisguise', (v) => ({ stats: { attack: v, hp: v, defense: 0 }, effects: [eff('damage', { value: v, timing: 'revealed' }, true)], abilities: [{ id: 'disguise', value: 1 }], name: `変装${v}` }), 'common', 3),
  tLevelUp: () => single('tLevelUp', (v) => ({ stats: { attack: v, hp: v, defense: 0 }, abilities: [{ id: 'levelUp', value: 1, option: '1' }], name: `Lv${v}` })),
  tEvolve: () => single('tEvolve', (v) => ({ stats: { attack: v, hp: v, defense: 0 }, abilities: [{ id: 'evolve', value: 2, condition: 'manyMonsters' }], name: `進化${v}` })),
  tLoyalty: () =>
    single('tLoyalty', (v) => ({ effects: [eff('damage', { value: v, timing: 'loyaltyPlus', target: 'chosen' })], abilities: [{ id: 'loyalty', value: 3, option: '3' }], name: `忠誠${v}` }), 'common', 2),
  tSiege: () =>
    half('tSiege', SOLDIER(), (v) => ({ effects: [eff('siege', { value: Math.max(2, Math.min(v, 6)), target: 'self' }), eff('draw', { value: 2, timing: 'siegeWon', target: 'self' })], name: `砦${v}` })),
  tExtraTurn: () => buildDeck('tExtraTurn', [...fill('追加ターン', 'legend', 3, { effects: [eff('extraTurn')] }, BALANCE.rarity.legend.deckLimit ?? 2), [burnCard(undefined, '火球'), 30 - (BALANCE.rarity.legend.deckLimit ?? 2)]]),
  tAltWin: () =>
    buildDeck('tAltWin', [
      ...fill('特殊勝利', 'legend', 4, { effects: [eff('draw', { value: 1, timing: 'turnStart', target: 'self' })], abilities: [{ id: 'altWin', option: 'cards' }] }, BALANCE.rarity.legend.deckLimit ?? 2),
      [burnCard(undefined, '火球'), 30 - (BALANCE.rarity.legend.deckLimit ?? 2)],
    ]),
  tEmblem: () =>
    buildDeck('tEmblem', [
      ...fitFill('legend', 3, (v) => ({ effects: [eff('damage', { value: v, timing: 'turnStart', target: 'enemyPlayer' })], abilities: [{ id: 'emblem' }], name: `紋章${v}` }), BALANCE.rarity.legend.deckLimit ?? 2),
      [burnCard(undefined, '火球'), 30 - (BALANCE.rarity.legend.deckLimit ?? 2)],
    ]),
  // 疲労（山札切れ。決定事項 #102）：相手の山札を除外し続けて、山札も捨て札も尽きさせる
  tExileMill: () => single('tExileMill', (v) => ({ effects: [eff('exileMill', { value: v, target: 'enemyPlayer' })], name: `山札消滅${v}` })),
  tExileMillHalf: () => half('tExileMillHalf', SOLDIER(), (v) => ({ effects: [eff('exileMill', { value: v, target: 'enemyPlayer' })], name: `山札消滅${v}` })),
  attackPoison: () => mon('attackPoison', (v) => ({ stats: { attack: 1, hp: 2, defense: 0 }, effects: [eff('poison', { value: v, timing: 'attack' }, true)], name: `毒牙${v}` })),
};

export interface StressRow {
  key: string;
  cards: string;
  vsB0: SeriesResult;
  vsB1: SeriesResult;
}
export interface StressResult {
  n: number;
  rows: StressRow[];
}

/** デッキの中身の短い表示（カード名×枚数） */
const contents = (d: DeckSpec): string => d.deck.entries.map((e) => `${d.cards.find((c) => c.id === e.cardId)?.name}×${e.count}`).join(' ');

export async function run(n: number, keys: string[] = Object.keys(EXTREME)): Promise<StressResult> {
  const rows: StressRow[] = [];
  for (const key of keys) {
    const make = EXTREME[key];
    if (!make) throw new Error(`知らないデッキ：${key}`);
    const d = make();
    const vsB0 = await series(d, B0(), n, { label: `${key} vs B0`, seedBase: 2000 });
    const vsB1 = await series(d, B1(), n, { label: `${key} vs B1`, seedBase: 3000 });
    rows.push({ key, cards: contents(d), vsB0, vsB1 });
    console.error(`${key.padEnd(14)} vs B0 ${pct(vsB0.winRate)} (中央${vsB0.turnsMedian}T)  vs B1 ${pct(vsB1.winRate)} (中央${vsB1.turnsMedian}T)`);
  }
  return { n, rows };
}

const HEADER = ['デッキ', '中身', 'vs B0 勝率', '引分', '中央T', 'vs B1 勝率', '引分', '中央T'];
const rowOf = (r: StressRow) => [r.key, r.cards, pct(r.vsB0.winRate), pct(r.vsB0.drawRate), r.vsB0.turnsMedian, pct(r.vsB1.winRate), pct(r.vsB1.drawRate), r.vsB1.turnsMedian];

export function report(r: StressResult): { text: string; md: string } {
  const title = `極端なデッキ vs 基準デッキ（各 ${r.n} 試合、先攻は交互。B0＝除去とモンスター、B1＝顔レース）`;
  return {
    text: `## ${title}\n${table(HEADER, r.rows.map(rowOf))}`,
    md: `### ${title}\n${mdTable(HEADER, r.rows.map(rowOf))}`,
  };
}

if (isMain(import.meta.url)) {
  const keys = process.argv.slice(3);
  const r = await run(argN(60), keys.length ? keys : undefined);
  console.log(report(r).text);
  console.log(`\n→ ${writeOut('stress.json', r)}`);
}
