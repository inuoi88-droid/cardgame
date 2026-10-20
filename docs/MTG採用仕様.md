# MTG 要素の採用：審査結果と今回の実装仕様（2バッチ）

元データ：MTG要素カタログ（641件）。審査の最終結果は `final-review.json`（全641件の ◎○△× とメモ）。この文書は ◎ のうち**今回実装する46要素**の仕様。価格はユーザーの指示どおり厳密にはせず、balance.ts の書き方（倍率1の基礎単位、固定値は x()）で目安を置く。壊れそうな組み合わせは数の上限・使えるタイミングの制限で止める。実装後に `npm test`・`npm run typecheck`・`npm run sim`（極端なデッキを含む）で測り直す（CLAUDE.md）。

## 1. 審査の最終結果

- ◎ 今回実装（統合を含む）：85件 ／ ○ 採用候補（次回以降）：94件 ／ △ アレンジすれば使える：103件 ／ × 不採用：359件
- 判定のそろえ直し（6チャンクの食い違いの修正）
  - 同じ考えの重複は1つの要素に統合し、出どころの各項目を ◎「統合」にした（例：トークン生成 #124・#168・#411・#604、再行動 #91・#104・#431、X #100・#600・#233・#258・#364、狂喜 #256・#345・#381、陰惨 #271・#517・#535・#525・#538）。
  - 今回の新要素の組み合わせで作れるものは ◎「今回の要素で作れる」にした（死後 #343、胞子 #163、果敢 #311、高名 #315、毒性 #372、進化 #302、疾駆 #312、奇襲 #360、結集 #523 など）。キーワードを増やさず、タイミング・対象・効果の組み合わせで表す方針。
  - 既存の要素の組み合わせで作れるのに ◎/△ だったものは × にした（毒牙 #272＝攻撃するたび＋毒、教導 #342＝攻撃するたび＋攻撃力アップ、側面攻撃 #223＝攻撃するたび＋弱化）。#223 のメモの「威圧」は #314 の「威圧」と意味が衝突していたので取り消した。
  - ◎ だったが今回の46要素から外したものは ○「次回」にした：護法 #218、威迫 #314、嚥下 #318、切削 #421、準備 #420・#170、抽出 #550、コスト除去 #101、増殖 #439、ランプ #618、激突 #435、鼓舞（いちばん体力の低い味方）#444、消耗 #447、枯朽 #472、窮地 #501、注入 #539、英雄的 #508。
  - スタック・ブロック・マナが前提なのに ◎ になっていたものは無かった（打ち消し系 #410・#601 は ○ の「予約型の封じ」で、割り込みは使わない）。
  - 同じ仕組みを指す ○/△ の表現をそろえた（選択式カード #243→#54・#599、速度 #187→#387、ゲージ付きパワー #36・#64→#154）。

## 2. 今回の46要素（一覧）

| バッチ | 種類 | ID | 名前 | 価格の目安 | MTG 番号 |
|---|---|---|---|---|---|
| 1 | 条件 | `enemyDamagedThisTurn` | このターン相手にダメージを与えた | condition.enemyDamagedThisTurn: 0.6 | #256・#345・#381 |
| 1 | 条件 | `monsterDestroyedThisTurn` | このターンにモンスターが破壊された | condition.monsterDestroyedThisTurn: 0.6 | #271・#517・#535・#525・#538 |
| 1 | 条件 | `allyAttackedThisTurn` | このターン自分のモンスターが攻撃した | condition.allyAttackedThisTurn: 0.7 | #350・#522・#529 |
| 1 | 条件 | `loneMonster` | 自分の場のモンスターが1体だけ | condition.loneMonster: 0.7 | #285 |
| 1 | 条件 | `twoPowers` | 自分のパワーが2つ以上 | condition.twoPowers: 0.6 | #33・#516 |
| 1 | 条件 | `coinFlip` | コイン投げで表（50%） | condition.coinFlip: 0.5 | #131・#639 |
| 1 | 条件 | `secondPlayer` | 後攻 | condition.secondPlayer: 0.5 | #561 |
| 1 | 条件 | `emptyHand` | 手札が0枚 | condition.emptyHand: 0.5 | #507 |
| 1 | 条件 | `bigMonster` | 攻撃力4以上の自分のモンスターがいる | condition.bigMonster: 0.7 | #503 |
| 1 | 条件 | `bigDiscard` | 捨て札が10枚以上 | condition.bigDiscard: 0.7 | #532・#39 |
| 1 | 条件 | `monsterInHand` | 手札にモンスターカードがある | condition.monsterInHand: 0.8 | #408 |
| 1 | 条件 | `twoSummonsThisTurn` | このターンにモンスターを2体以上出した | condition.twoSummonsThisTurn: 0.5 | #486 |
| 1 | タイミング | `allySummoned` | 自分のモンスターが出るたび | timing.allySummonedMonster: 1.5 / timing.allySummonedPower: 5.0 | #483・#523 |
| 1 | タイミング | `allyDestroyed` | 自分の他のモンスターが破壊されるたび | timing.allyDestroyedMonster: 1.2 / timing.allyDestroyedPower: 4.0 | #597 |
| 1 | タイミング | `powerPlayed` | 自分がパワーを使うたび | timing.powerPlayedMonster: 1.0 / timing.powerPlayedPower: 3.0 | #490・#498 |
| 1 | タイミング | `skillPlayed` | 自分がスキルを使うたび | timing.skillPlayedMonster: 1.5 / timing.skillPlayedPower: 4.5 | #515・#311 |
| 1 | タイミング | `hitEnemyPlayer` | 相手プレイヤーにダメージを与えたとき | timing.hitEnemyPlayer: 1.5 | #315・#372・#318 |
| 1 | 対象 | `thisMonster` | このモンスター | target.thisMonster: 1.0 | #315・#302・#311 |
| 1 | 対象 | `allyMonsters` | 自分のモンスター全体 | target.allyMonsters: 2.0 | #446・#598・#523 |
| 1 | 対象 | `triggerAlly` | 出たモンスター | target.chosen と同じ 1.0 | #483 |
| 1 | 修飾 | `xEnergy` | X（全力） | modifiers.xEnergy: 0.2 | #100・#600・#233・#258・#364 |
| 1 | 修飾 | `perEnemyMonster` | 相手モンスター1体につき | modifiers.perEnemyMonster: 0.5 | #221 |
| 1 | 修飾 | `perCardPlayed` | このターン使ったカード1枚につき | modifiers.perCardPlayed: 0.8 | #241 |
| 2 | キーワード | `deathtouch` | 接死 | keywords.deathtouch: { flat: x(6) } | #197 |
| 2 | キーワード | `firstStrike` | 先制攻撃 | keywords.firstStrike: { min: x(2), perAttack: 0.5 } | #202 |
| 2 | キーワード | `hexproof` | 呪禁 | keywords.hexproof: { flat: x(4) } | #206・#128 |
| 2 | キーワード | `lifelink` | 絆魂 | keywords.lifelink: { min: x(1), perAttack: 1 } | #211 |
| 2 | キーワード | `bushido` | 武士道 | keywords.bushido: { perValue: 2 } | #246 |
| 2 | キーワード | `divineShield` | 聖盾 | keywords.divineShield: { flat: x(4) } | #143 |
| 2 | 効果 | `token` | トークン生成 | effects.token: { perValue: 4, perToken: x(1), maxValue: x(5), maxTokens: 3 }。基礎 = (N×4 + x(1))×M | #604・#124・#168・#411・#343・#163 |
| 2 | 効果 | `train` | 鍛錬 | effects.train: { perValue: 4.5 } | #140・#450・#442・#432・#302・#315 |
| 2 | 効果 | `wither` | 衰弱 | effects.wither: { perValue: 5 } | #141 |
| 2 | 効果 | `grantKeyword` | キーワード付与 | effects.grantKeyword: { haste: x(4), taunt: x(7), flying: x(3), trample: x(2), undying: x(4), deathtouch: x(6), lifelink: x(3), divineShield: x(4), hexproof: x(4), firstStrike: x(2) } | #142・#174・#200 |
| 2 | 効果 | `fight` | 格闘 | effects.fight: { flat: x(9) } | #418・#240 |
| 2 | 効果 | `ready` | 再行動 | effects.ready: { flat: x(10) } | #91・#104・#431 |
| 2 | 効果 | `scry` | 占術 | effects.scry: { perValue: x(1.5), maxValue: 5 } | #426・#429 |
| 2 | 効果 | `loot` | 手札整理 | effects.loot: { perValue: x(3), maxValue: 3 } | #454・#631・#171 |
| 2 | 効果 | `purge` | 処分 | effects.purge: { flat: x(3) } | #417 |
| 2 | 効果 | `double` | 倍化 | effects.double: { flat: x(12), bleedMaxAdd: x(5) } | #414 |
| 2 | 効果 | `doom` | 呪縛 | effects.doom: { perValue: 15, maxValue: x(2) }、battle.doomCap: x(5) | #31 |
| 2 | 効果 | `pump` | 一時強化 | effects.pump: { perValue: 1.5 } | #311 |
| 2 | デメリット | `defender` | 防衛 | drawbacks.defender: { min: x(1), perAttack: 2 } | #198 |
| 2 | デメリット | `lifespan` | 寿命 | drawbacks.lifespan: { byTurns: [x(6), x(4), x(2)] } | #231・#265・#312・#360 |
| 2 | デメリット | `decay` | 腐乱 | drawbacks.decay: { min: x(1), perAttack: 1 } | #355 |
| 2 | デメリット | `exhaust` | 廃棄 | drawbacks.exhaust: { flat: x(3) } | #73 |
| 2 | デメリット | `sacrifice` | 生け贄 | drawbacks.sacrifice: { flat: x(5) } | #425・#597・#133 |

- バッチ1（条件12・タイミング5・対象3・修飾3）＝23要素＋options.ts の項目（group・description）
- バッチ2（キーワード6・効果12・デメリット5）＝23要素＋小さな仕組み3つ（トークン、付与キーワード、一時強化）

## 3. 共通の決まり

- 量（ダメージ・攻撃力など）の数値は倍率1で書き、balance.ts で x() を掛ける。量1あたりのポイントと「数」（枚数・ターン・回数）には掛けない（CLAUDE.md）。
- 新しい対戦状態はすべて JSON にできる形で、**省略可能**にする（途中保存の古い状態を読めるように、無ければ 0 / false / [] として扱う）。
- engine は純粋関数のまま（Math.random・Date を使わない）。乱数は `rng.ts` の randInt。
- 新しい数値はすべて balance.ts へ。効果テキストの数字は BALANCE から読む。
- 決定事項ログ（docs/SPEC.md 末尾）に、バッチ1・バッチ2それぞれ1行で記録する（番号は記録時の次の空き番号。#85 以降）。CLAUDE.md のファイル構成・主なルールの説明も更新する。
- 1バッチ＝1つ以上のコミット。バッチ1はバッチ2の前提（入場処理・対象・scalable・EffectDef の timings/excludeTargets）を作る。バッチ2はバッチ1のファイルを読むだけで、options.ts への変更は targetNoun / allowedTargets の `fight` 分だけ。

## 4. バッチ1：条件・タイミング・対象・修飾（＋options.ts の項目）

### 4.1 土台の変更（バッチ1の担当）

1. **options.ts の項目**：`TimingDef` と `ConditionDef` に `group?: string; description?: string;` を追加し、既存・新規のすべてに入れる。並び順のために `TIMING_GROUPS` と `CONDITION_GROUPS`（見出しの配列）を export する。エディターの新しい選択パネル（プルダウンの代わり。UI 側の作業）は group で見出しを作り、description を1行の説明として出す。
   - タイミングの見出し：基本 / このモンスター / ターン / 自分が使ったカード / 味方の出入り
   - 条件の見出し：場 / 手札 / HP / 状態 / このターン / 捨て札 / 運・先後
2. **types.ts**：TIMING_IDS・TARGET_IDS（thisMonster・allyMonsters）・CONDITION_IDS・ModifierId を増やす。`ChosenMode` に `triggerAlly` を追加。
3. **allowedTargets(rule, timing, base)**：第3引数 base を追加（thisMonster はモンスターの土台で destroyed 以外）。triggerAlly の扱いは対象の節。呼び出し元（validate・editing・UI）を合わせる。`targetLabel` / `targetNoun` に新しい対象を追加。
4. **EffectDef に追加**（バッチ2もこれを使う）：`scalable?: boolean`（scale 系の修飾を付けられる）、`timings?: readonly TimingId[]`（使えるタイミングの制限。無ければすべて）、`excludeTargets?: readonly TargetId[]`。validate とエディターが参照。既存の効果のうち scalable にするもの：damage・multiHit（1回の値）・poison・bleed・heal・shield・regen・repair・attackUp・defenseUp・focus・draw・counter・weaken。
5. **ModifierDef に追加**：`scope: "damage" | "scale"`（既存の pierce・drain は damage＝allowsMods の効果だけ）、`timings?: readonly TimingId[]`。scale は scalable な効果だけ・1効果に1つまで。ポイントは今の式（基礎×(1＋上乗せ率の合計)）のまま。テキストは前置き＋効果テキスト＋後置き。
6. **解決時の数値の掛け算**（queue.ts）：effect のステップを resolve する直前に、scale 系の修飾があれば倍数を求め、`{...effect, value: min(value×倍数, 入力欄の上限)}` の写しを効果ファイルに渡す（効果ファイルは変えない）。倍数0なら「（数値が0のため不発）」とログして飛ばす。
7. **このターンの記録**：`PlayerState.turn` に `enemyDamaged?: boolean; allyAttacks?: number; summoned?: number; monstersDestroyed?: number;` を追加（startTurn で手番の記録を作り直す）。conditions.ts の判定は無ければ 0/false。
8. **入場の共通処理** `onMonsterEntered(g, m, depth)`（zones.ts）：手番プレイヤーの場に出たら turn.summoned+1、allySummoned を積む。summon と reviveFromDiscard から呼ぶ（バッチ2のトークンも呼ぶ）。
9. **繰り返し誘発の安全装置**：`battle.maxRepeatTriggersPerTurn: 2`。allySummoned・allyDestroyed・powerPlayed・skillPlayed は、出どころ（パワーは PowerInst.triggers を timing ごとに、モンスターは counters の `rt:<timing>:turn` と `rt:<timing>:count`）ごとに通算ターン1つにつき2回まで。cardPlayed は今の `maxCardPlayedTriggersPerTurn` のまま。triggers.ts の enqueuePowers / enqueueMonsters に回数チェックを入れる。
10. **ポイント**：`BALANCE.timing` に新しい倍率、`BALANCE.target` に thisMonster・allyMonsters、`BALANCE.condition` に新しい条件、`BALANCE.conditionParams` に `bigMonsterAttack: x(4)`・`discardMin: 10`・`powersMin: 2`・`summonsMin: 2`、`BALANCE.modifiers` に新しい修飾、`BALANCE.modifierParams.scaleCountCap: 3`。timingMultiplier に新しいケース（monster / spell で値が違うもの）。

### 4.2 既存のタイミング・条件に入れる group / description

| 種類 | ID | 名前 | group | description |
|---|---|---|---|---|
| タイミング | `play` | 使用時 | 基本 | カードを使ったとき（モンスター以外） |
| タイミング | `summon` | 召喚時 | 基本 | このモンスターが場に出たとき |
| タイミング | `destroyed` | 破壊されたとき | このモンスター | このモンスターが破壊されたとき（選んだ1体は使えない） |
| タイミング | `damaged` | ダメージを受けたとき | このモンスター | ダメージを受けて生き残ったとき（毒・やけどでは発動しない） |
| タイミング | `attack` | 攻撃するたび | このモンスター | このモンスターが攻撃するたび（攻撃した相手を対象にできる） |
| タイミング | `turnStart` | 自分のターン開始時 | ターン | 自分のターンの始め（引いた後）。モンスター以外ならパワーとして場に残る |
| タイミング | `turnEnd` | 自分のターン終了時 | ターン | 自分のターンの終わり（手札を捨てる前）。モンスター以外ならパワーとして場に残る |
| タイミング | `cardPlayed` | カードを使うたび | 自分が使ったカード | 自分がカードを使い終えるたび（パワー専用。1つにつき1ターン2回まで） |
| 条件 | `hasMonster` | 自分の場にモンスターがいる | 場 | 自分の場にモンスターが1体でもいれば発動 |
| 条件 | `manyMonsters` | 自分の場にモンスターが3体以上 | 場 | 自分の場にモンスターが3体以上いれば発動 |
| 条件 | `smallHand` | 手札が3枚以下 | 手札 | 効果が出る時点で手札が3枚以下なら発動（ターン開始時・終了時のパワーには付けられない） |
| 条件 | `enemyHpHigher` | 相手のHPが自分より多い | HP | 相手プレイヤーのHPが自分より多ければ発動 |
| 条件 | `lowHp` | 自分のHPが半分以下 | HP | 自分のHPが最大の半分以下なら発動 |
| 条件 | `enemyPoisoned` | 相手が毒状態 | 状態 | 相手プレイヤーに毒が残っていれば発動 |
| 条件 | `enemyPoisonBurn` | 相手が毒とやけどの両方 | 状態 | 相手プレイヤーが毒とやけどの両方の状態なら発動 |
| 条件 | `nthCard` | このターン3枚目以降に使う | このターン | このターン3枚目以降に使ったカード（またはそのときの誘発）なら発動 |

### 4.3 条件

#### 条件『このターン相手にダメージを与えた』 `enemyDamagedThisTurn`

- MTG：#256・#345・#381
- group：このターン ／ description：自分のターン中に、相手プレイヤーのHPを1以上減らしていれば発動（攻撃・効果どちらでも）
- テキスト：このターン相手にダメージを与えていれば、
- 対戦での動き：g.active===自分 かつ PlayerState.turn.enemyDamaged が true。dealDamage のプレイヤー側で、対象が手番でない側のプレイヤーかつ hpLost>0 のとき、手番プレイヤーの turn.enemyDamaged=true（出どころは問わない。シールド・無効化で0なら立たない）。相手のターン中は常に false。
- エディター：timings: turnStart と hitEnemyPlayer（常に真）以外。パワーにも付けられる（ターン終了時のパワー向き）
- CPU：特になし（仮実行で評価）
- 価格：condition.enemyDamagedThisTurn: 0.6

#### 条件『このターンにモンスターが破壊された』 `monsterDestroyedThisTurn`

- MTG：#271・#517・#535・#525・#538
- group：このターン ／ description：このターン中に、敵味方どちらかのモンスターが1体でも破壊されていれば発動
- テキスト：このターンにモンスターが破壊されていれば、
- 対戦での動き：手番プレイヤーの turn.monstersDestroyed>=1（destroyMonster で、手番プレイヤーの記録に +1。どちらのモンスターでも、トークンでも数える。バウンス・奪取は数えない）。相手のターン中に発動する効果（ダメージを受けたとき等）でも、その相手のターンの記録を見る。
- エディター：timings: turnStart・destroyed・allyDestroyed（常に真）以外
- CPU：特になし
- 価格：condition.monsterDestroyedThisTurn: 0.6

#### 条件『このターン自分のモンスターが攻撃した』 `allyAttackedThisTurn`

- MTG：#350・#522・#529
- group：このターン ／ description：自分のターン中に、自分のモンスターが1回でも攻撃していれば発動（混乱などの自動攻撃も数える）
- テキスト：このターン自分のモンスターが攻撃していれば、
- 対戦での動き：g.active===自分 かつ turn.allyAttacks>=1。performAttack の先頭で攻撃したモンスターの持ち主（controller）が手番なら +1。
- エディター：timings: turnStart・attack・hitEnemyPlayer（常に真）以外
- CPU：特になし（攻撃の後にカードを使う順を CPU が試す。greedy は攻撃→カードの順も評価すること）
- 価格：condition.allyAttackedThisTurn: 0.7

#### 条件『自分の場のモンスターが1体だけ』 `loneMonster`

- MTG：#285
- group：場 ／ description：自分の場のモンスターがちょうど1体なら発動（召喚時なら、そのモンスター自身だけ）
- テキスト：自分の場のモンスターが1体だけなら、
- 対戦での動き：mine.board.length === 1（トークンも数える）。
- エディター：timings: すべて
- CPU：特になし
- 価格：condition.loneMonster: 0.7

#### 条件『自分のパワーが2つ以上』 `twoPowers`

- MTG：#33・#516
- group：場 ／ description：自分の場にパワーが2つ以上あれば発動（パワーは3つまで）
- テキスト：自分のパワーが2つ以上あれば、
- 対戦での動き：mine.powers.length >= conditionParams.powersMin（2）。パワーのカード自身の使用時の効果では、まだ自分は数えない（場に残るのは finishCard）。
- エディター：timings: すべて
- CPU：特になし
- 価格：condition.twoPowers: 0.6

#### 条件『コイン投げで表（50%）』 `coinFlip`

- MTG：#131・#639
- group：運・先後 ／ description：効果が出るたびにコインを投げ、表なら発動（50%）
- テキスト：コインを投げて表なら、
- 対戦での動き：解決のたびに randInt(g,2)===0（state のシード乱数）。結果を「コイン投げ：表／裏」とログに出す（ev: kind status, status "coin"）。同じ効果の条件は解決ごとに投げ直す。
- エディター：timings: すべて
- CPU：CPU は仮実行で乱数の結果を先読みしてしまう（既存のランダム対象と同じ扱い。許容）。気になる場合は evaluate で期待値0.5を掛ける改良を次回
- 価格：condition.coinFlip: 0.5

#### 条件『後攻』 `secondPlayer`

- MTG：#561
- group：運・先後 ／ description：自分が後攻の対戦でだけ発動（先攻なら発動しない）
- テキスト：後攻なら、
- 対戦での動き：g.first !== 自分。
- エディター：timings: すべて
- CPU：特になし
- 価格：condition.secondPlayer: 0.5

#### 条件『手札が0枚』 `emptyHand`

- MTG：#507
- group：手札 ／ description：効果が出る時点で手札が1枚もなければ発動（使ったカード自身は数えない）
- テキスト：手札がなければ、
- 対戦での動き：mine.hand.length === 0（playCard で使ったカードは先に手札から抜けている）。ターン終了時は手札を捨てる前に判定。
- エディター：timings: turnStart（引いた直後で満たせない）以外
- CPU：特になし
- 価格：condition.emptyHand: 0.5

#### 条件『攻撃力4以上の自分のモンスターがいる』 `bigMonster`

- MTG：#503
- group：場 ／ description：自分の場に攻撃力が一定以上（倍率1で4）のモンスターがいれば発動
- テキスト：攻撃力{bigMonsterAttack}以上の自分のモンスターがいれば、
- 対戦での動き：mine.board.some(m => 実効攻撃力 >= conditionParams.bigMonsterAttack)。実効攻撃力は attack＋一時強化（バッチ2の tempAttack。無ければ attack）。
- エディター：timings: すべて。数値は balance の conditionParams.bigMonsterAttack = x(4)（量なので倍率を掛ける。表示は80）
- CPU：特になし
- 価格：condition.bigMonster: 0.7

#### 条件『捨て札が10枚以上』 `bigDiscard`

- MTG：#532・#39
- group：捨て札 ／ description：自分の捨て札が10枚以上あれば発動（山札を切り直すと0に戻る）
- テキスト：捨て札が{discardMin}枚以上あれば、
- 対戦での動き：mine.discard.length >= conditionParams.discardMin（10。数なので倍率なし）。
- エディター：timings: すべて
- CPU：特になし
- 価格：condition.bigDiscard: 0.7

#### 条件『手札にモンスターカードがある』 `monsterInHand`

- MTG：#408
- group：手札 ／ description：手札にモンスターのカードが1枚以上あれば発動（使ったカード自身は数えない）
- テキスト：手札にモンスターカードがあれば、
- 対戦での動き：mine.hand.some(c => g.cards[c.cardId]?.stats)（ノイズ・トークンは数えない）。
- エディター：timings: すべて
- CPU：特になし
- 価格：condition.monsterInHand: 0.8

#### 条件『このターンにモンスターを2体以上出した』 `twoSummonsThisTurn`

- MTG：#486
- group：このターン ／ description：自分のターン中に、モンスターを2体以上場に出していれば発動（召喚・蘇生・トークン。いま出たものも数える）
- テキスト：このターンにモンスターを2体以上出していれば、
- 対戦での動き：g.active===自分 かつ turn.summoned >= conditionParams.summonsMin（2）。共通の入場処理 onMonsterEntered で手番プレイヤーの turn.summoned を +1（自分の場に出たときだけ）。
- エディター：timings: turnStart 以外
- CPU：特になし
- 価格：condition.twoSummonsThisTurn: 0.5

### 4.4 タイミング

#### タイミング『自分のモンスターが出るたび』 `allySummoned`

- MTG：#483・#523
- group：味方の出入り ／ description：このカード以外の自分のモンスターが場に出るたび（召喚・蘇生・トークン）。1つにつき1ターン2回まで
- テキスト：自分のモンスターが出るたび、
- 対戦での動き：共通の入場処理 onMonsterEntered(g, m, depth)（summon・reviveFromDiscard・バッチ2のトークン生成から呼ぶ。奪取は入場に数えない）で、出たモンスターの召喚時の効果を積んだあと、同じ持ち主のパワー（使った順）→場のモンスター（左から、出たモンスター自身を除く）の allySummoned を積む。chosen={ally: 出たモンスターの uid}（ChosenMode triggerAlly）。1つの出どころ（パワー・モンスター）につき1ターン maxRepeatTriggersPerTurn（2）回まで。封印されたモンスターは発動しない。
- エディター：bases: monster・spell（spell ならパワーになる：powerTiming true）。chosen: triggerAlly
- CPU：特になし
- 価格：timing.allySummonedMonster: 1.5 / timing.allySummonedPower: 5.0

#### タイミング『自分の他のモンスターが破壊されるたび』 `allyDestroyed`

- MTG：#597
- group：味方の出入り ／ description：このカード以外の自分のモンスターが破壊されるたび（どちらのターンでも。トークンも含む）。1つにつき1ターン2回まで
- テキスト：自分の他のモンスターが破壊されるたび、
- 対戦での動き：destroyMonster で、破壊されたモンスターの「破壊されたとき」を積んだあと、破壊時点の controller のパワー → 場のモンスター（左から）の allyDestroyed を積む。chosen なし。全体破壊で同時に消えたモンスターは発動しない（場に残っているものだけ）。回数の安全装置は allySummoned と同じ（相手のターン中も通算ターンごとに数える）。
- エディター：bases: monster・spell（パワー）。chosen: none
- CPU：特になし（生け贄の選び方で破壊時効果を持つものを優先する。バッチ2）
- 価格：timing.allyDestroyedMonster: 1.2 / timing.allyDestroyedPower: 4.0

#### タイミング『自分がパワーを使うたび』 `powerPlayed`

- MTG：#490・#498
- group：自分が使ったカード ／ description：自分が種類「パワー」「パワーアタック」のカードを使い終えるたび（そのパワー自身は除く）。1つにつき1ターン2回まで
- テキスト：自分がパワーを使うたび、
- 対戦での動き：finishCard の「カードを使うたび」と同じ場所で、使ったカードの classifyCard が power / powerAttack のとき、パワー（いま置いたものを除く）→場のモンスターの powerPlayed を積む。
- エディター：bases: monster・spell（パワー）。chosen: none
- CPU：特になし
- 価格：timing.powerPlayedMonster: 1.0 / timing.powerPlayedPower: 3.0

#### タイミング『自分がスキルを使うたび』 `skillPlayed`

- MTG：#515・#311
- group：自分が使ったカード ／ description：自分が種類「スキル」のカードを使い終えるたび。1つにつき1ターン2回まで
- テキスト：自分がスキルを使うたび、
- 対戦での動き：finishCard で、使ったカードの classifyCard が skill のとき、パワー→場のモンスターの skillPlayed を積む。モンスターに付けると「果敢」（一時強化と組む）になる。
- エディター：bases: monster・spell（パワー）。chosen: none
- CPU：特になし
- 価格：timing.skillPlayedMonster: 1.5 / timing.skillPlayedPower: 4.5

#### タイミング『相手プレイヤーにダメージを与えたとき』 `hitEnemyPlayer`

- MTG：#315・#372・#318
- group：このモンスター ／ description：このモンスターの攻撃（または貫通の余り）で相手プレイヤーのHPが1以上減るたび
- テキスト：相手プレイヤーにダメージを与えるたび、
- 対戦での動き：performAttack で、プレイヤーへの攻撃の hpLost>0、または貫通の余りの hpLost>0 のとき（1回の攻撃で最大1回）、「攻撃するたび」を積んだあとに積む。攻撃したモンスターが場に残っていて封印されていないときだけ。chosen なし（相手側の対象は enemyPlayer など）。
- エディター：bases: monster のみ。chosen: none
- CPU：特になし
- 価格：timing.hitEnemyPlayer: 1.5

### 4.5 対象

#### 対象『このモンスター』 `thisMonster`

- MTG：#315・#302・#311
- 説明：効果を持つモンスター自身（モンスターのカードだけ。破壊されたときは選べない）
- テキスト：このモンスター
- 対戦での動き：TargetId に追加。targetRule allyMonsterOne の効果で、土台が monster のカードの destroyed 以外のタイミングで選べる。解決時、出どころ（src.kind==="monster"）のモンスターが場にいればそれ1体、いなければ不発。
- エディター：allowedTargets(rule, timing, base) に base を足して判定。効果側の excludeTargets で外せる（再行動は外す）
- CPU：特になし
- 価格：target.thisMonster: 1.0

#### 対象『自分のモンスター全体』 `allyMonsters`

- MTG：#446・#598・#523
- 説明：自分の場のモンスターすべて（効果を持つモンスター自身も含む）
- テキスト：自分のモンスター全体
- 対戦での動き：TargetId に追加。targetRule allyMonsterOne の効果で、すべてのタイミングで選べる。解決時点の自分の場のモンスターすべて（左から）。
- エディター：excludeTargets で外せる（再行動は外す）
- CPU：特になし
- 価格：target.allyMonsters: 2.0

#### 対象『出たモンスター』 `triggerAlly`

- MTG：#483
- 説明：「自分のモンスターが出るたび」で、いま場に出たモンスター
- テキスト：出たモンスター
- 対戦での動き：新しい TargetId は作らず、ChosenMode に triggerAlly を追加。allySummoned の chosen が triggerAlly。allyMonsterOne の効果は "chosen" を選べ、ラベル・テキストは「出たモンスター」。相手側の効果（enemyAny など）は chosen を出さない（none と同じ扱い）。
- エディター：allowedTargets：ally 側は chosen==="manual"||"triggerAlly" で chosen を許可。enemy 側は chosen が none / triggerAlly なら出さない
- CPU：特になし
- 価格：target.chosen と同じ 1.0

### 4.6 修飾

#### 修飾『X（全力）』 `xEnergy`

- MTG：#100・#600・#233・#258・#364
- 説明：残りのエナジーをすべて使い、数値を「N×使ったエナジー」にする（使用時・召喚時のみ）
- テキスト：前置き「残りのエナジーをすべて使い、」＋後置き「（数値は使ったエナジー1につき）」。例：残りのエナジーをすべて使い、相手1体に100ダメージを与える（数値は使ったエナジー1につき）
- 対戦での動き：playCard でコストを払ったあと、このカードの play / summon の効果に xEnergy が1つでもあれば X=残りエナジー、エナジーを0にし、playRecord(protectKey).x=X、ログ「X＝◯（エナジーをすべて使った）」。解決時、その効果の value を value×X にした写しで resolve（X=0 なら「数値が0で不発」とログして飛ばす）。値は効果の入力欄の上限（ダメージは damagePerCardMax、ドローは maxDrawPerTurn の仕組みで）で頭打ち。カードの全 X 効果は同じ X を使う。
- エディター：scope "scale"。scalable な効果だけ、timings play / summon のみ。scale 系の修飾は1効果に1つまで（pierce・drain とは併用可）
- CPU：greedy：X を含むカードは「他に使えるカードがないとき」か「X を含むカードの評価が他より高いとき」だけ使う小規則を足す（先に使って残りを無駄にしないため）
- 価格：modifiers.xEnergy: 0.2（×1.2。コスト1以上のカードなら「1エナジーあたり N」がだいたい公平：コスト表が1エナジー約11〜13pt なので）

#### 修飾『相手モンスター1体につき』 `perEnemyMonster`

- MTG：#221
- 説明：数値を「N×相手の場のモンスターの数（最大3）」にする。相手のモンスターがいなければ不発
- テキスト：後置き「（数値は相手モンスター1体につき、最大{scaleCountCap}体）」
- 対戦での動き：解決時の相手の場のモンスターの数（隠密も数える）を min(数, modifierParams.scaleCountCap=3) で掛ける。0 なら不発。値の頭打ちは xEnergy と同じ。
- エディター：scope "scale"。scalable な効果、すべてのタイミング
- CPU：特になし
- 価格：modifiers.perEnemyMonster: 0.5

#### 修飾『このターン使ったカード1枚につき』 `perCardPlayed`

- MTG：#241
- 説明：数値を「N×このターンに使ったカードの枚数（このカードを含む、最大3）」にする
- テキスト：後置き「（数値はこのターン使ったカード1枚につき、最大{scaleCountCap}枚）」
- 対戦での動き：g.active===自分 なら min(turn.cardsPlayed, 3)、相手のターン中は 0（不発）。使用時ならこのカードも数える（最低1）。
- エディター：scope "scale"。scalable な効果、timings: play・summon・attack・turnEnd・cardPlayed・skillPlayed・powerPlayed・allySummoned
- CPU：特になし（仮実行で順番を評価）
- 価格：modifiers.perCardPlayed: 0.8

### 4.7 バッチ1の価格（balance.ts への追記の形）

```ts
timing: { /* 既存 */ allySummonedMonster: 1.5, allySummonedPower: 5.0, allyDestroyedMonster: 1.2, allyDestroyedPower: 4.0,
          powerPlayedMonster: 1.0, powerPlayedPower: 3.0, skillPlayedMonster: 1.5, skillPlayedPower: 4.5, hitEnemyPlayer: 1.5 },
target: { /* 既存 */ thisMonster: 1.0, allyMonsters: 2.0 },
condition: { /* 既存 */ enemyDamagedThisTurn: 0.6, monsterDestroyedThisTurn: 0.6, allyAttackedThisTurn: 0.7, loneMonster: 0.7,
             twoPowers: 0.6, coinFlip: 0.5, secondPlayer: 0.5, emptyHand: 0.5, bigMonster: 0.7, bigDiscard: 0.7,
             monsterInHand: 0.8, twoSummonsThisTurn: 0.5 },
conditionParams: { /* 既存 */ bigMonsterAttack: x(4), discardMin: 10, powersMin: 2, summonsMin: 2 },
modifiers: { /* 既存 */ xEnergy: 0.2, perEnemyMonster: 0.5, perCardPlayed: 0.8 },
modifierParams: { scaleCountCap: 3 },
battle: { /* 既存 */ maxRepeatTriggersPerTurn: 2 },
```

価格の確かめ（倍率1）：コスト2コモンの予算は 20＋5＝25。「このターン相手にダメージを与えていれば、相手1体に13ダメージ」＝13×3×0.6＝23.4→24 で作れる。「X：相手1体に5ダメージ（1エナジーにつき）」コスト1コモン＝5×3×1.2＝18 は予算15を超えるので4ダメージ（14.4→15）。エナジー5なら X=4 で16ダメージ（コスト5コモンの素のダメージ21より弱め、早い段階では柔軟）。パワー「自分のモンスターが出るたび、出たモンスターの攻撃力+1」＝3×5.0＝15（コスト1レア 18 に収まる）。

### 4.8 バッチ1のテスト（tests/mtg-batch1.test.ts と .real.test.ts）

- 条件12個：それぞれ真になる盤面・偽になる盤面（「このターン」の4つは相手のターンでは偽、monsterDestroyedThisTurn は相手のターンの記録を見る）。coinFlip は同じシードで同じ結果。
- タイミング5個：発動する／しない（自分自身は数えない、奪取は入場ではない、封印は発動しない、1ターン2回まで）。allySummoned の「出たモンスター」に攻撃力アップが入る。hitEnemyPlayer はシールドで0なら発動しない。
- 対象：thisMonster は破壊されたときに選べない、allyMonsters は自分自身を含む。allowedTargets の表。
- 修飾：X でエナジーが0になり数値が掛かる・X=0 で不発・上限で頭打ち。perEnemyMonster は最大3。perCardPlayed は使用時に自分を数える。scale は1効果に1つまで・scalable でない効果には付かない（validate のコード）。
- ポイント：新しい倍率の式（PointPanel の内訳に出る）。テキスト：上の「テキスト」の文字列そのまま。
- 既存のテスト（作成例4枚・テンプレート・プリセット・純粋性・レジストリ整合）が通ること。

## 5. バッチ2：キーワード・効果・デメリット・小さな仕組み

### 5.1 小さな仕組み（バッチ2の担当）

1. **トークン**：`TOKEN_CARD_ID = "__token__"`。setup で `g.cards[TOKEN_CARD_ID]` に名前「小鬼」・アイコン「👺」・コモン・コスト0・stats {0,1,0}・効果なしの定義を入れる。`CardInst.token?: { attack: number; hp: number }`。placeMonster は token があればその値を使う。トークンが場を離れる（破壊・バウンス・寿命など）と**どこにも行かずに消える**（捨て札・除外・手札に入らない。destroyMonster・bounce・discardCard で分岐）。奪取はできる。蘇生・回収・複製の対象にはならない。場のトークンは1人 `battle.maxTokens`（5）体まで。UI はトークンを通常のモンスターとして表示（名前「小鬼」）。
2. **付与キーワード**：`Monster.granted?: string[]`。`keywordFlags` は定義のキーワード＋granted を合わせる（封印中は空）。カードの詳細表示には「付与：飛行」のように出す（UI）。
3. **一時強化**：`Monster.tempAttack?: number`。実効攻撃力＝attack＋tempAttack（攻撃・反撃・格闘・bigMonster 条件・UI 表示）。各ターン終了時の処理で両者のモンスターを0に戻す。
4. **呪縛の状態**：`Statuses.doom`（プレイヤーのみ）、`StatusKey` に "doom"、`DamageKind` に "doom"（isDot に含める）、LogEvent の status "doom"。浄化で0。UI の状態チップとルールページ（glossary.ts）に「呪縛」を追加。
5. **定義の型の追加**：KeywordDef.battle に `deathtouch?`・`firstStrike?`・`hexproof?`・`lifelink?`・`divineShield?`（boolean）と `combatBonus?(k): number`。DamageOpts に `combat?: boolean`（格闘）。DrawbackDef に `timings?`・`canPlay?(g, p, card): string | null`・`choose?(rt, d): ChoiceSpec | null`、resolve に picks。queue.ts で drawback のステップの選択を扱う。新しい Step `{ t: "discardChoice"; player; count; depth; picks? }`（手札整理）。TargetRule に "fight"。
6. **validate**：防衛と裏切りは同時に付けない／寿命はモンスターかパワーだけ／廃棄は呪文（パワーにならないもの）だけ／生け贄は play・summon だけ／再行動は play・summon だけ・thisMonster と allyMonsters 不可。エラーコードは既存の命名に合わせる。
7. **CPU**：選択が要るもの（占術・手札整理の discardChoice・処分・生け贄）に ai の選び方を追加（各要素の CPU 欄）。格闘は legal で組を列挙。evaluate.ts に doom・tempAttack・防衛・寿命・聖盾・付与キーワードの扱いを足す（重みは evaluate.ts の中）。

### 5.2 キーワード

#### キーワード『接死』 `deathtouch`

- MTG：#197
- テキスト：このモンスターが攻撃・反撃・格闘でダメージを与えたモンスターは破壊される
- 対戦での動き：dealDamage のモンスター側で、opts.kind が attack / retaliate、または opts.combat（格闘）で、出どころのモンスターが接死を持ち、実際の減少量>0 で守備側が生き残ったら destroyMonster（不屈は効かない）。聖盾で0にされたら働かない。守備力で減っても最低1が入るので通常は必ず破壊。貫通・効果ダメージ（hit）には働かない。封印で失う。
- エディター：値なし
- CPU：特になし（評価関数：接死持ちへの攻撃は反撃で必ず死ぬ。仮実行で自然に反映）
- 価格：keywords.deathtouch: { flat: x(6) }

#### キーワード『先制攻撃』 `firstStrike`

- MTG：#202
- テキスト：攻撃で相手モンスターを倒したとき、反撃を受けない
- 対戦での動き：performAttack で、攻撃先がモンスターで r.destroyed（不屈で踏みとどまったら false）かつ攻撃側が先制攻撃なら、反撃を飛ばしてログ「先制攻撃：反撃を受けない」。接死の相手でも倒せば無事。
- エディター：値なし
- CPU：特になし
- 価格：keywords.firstStrike: { min: x(2), perAttack: 0.5 }（max(min, A×0.5)）

#### キーワード『呪禁』 `hexproof`

- MTG：#206・#128
- テキスト：相手がカードを使うときに選ぶ対象（選んだ1体）にならない
- 対戦での動き：play.ts の enemyCandidates で相手の呪禁モンスターを除く。挑発の制限（#83）はカードの対象では「呪禁でない挑発」だけで判定（damage.ts に cardTargetableTaunts を追加）。呪禁の挑発しかいなければ、カードの対象は呪禁以外から自由に選べる。モンスターの攻撃・ランダム・全体・攻撃した相手・ダメージを与えてきた相手は従来どおり当たる。封印で失う。
- エディター：値なし
- CPU：特になし（legal の候補から消えるだけ）
- 価格：keywords.hexproof: { flat: x(4) }

#### キーワード『絆魂』 `lifelink`

- MTG：#211
- テキスト：このモンスターが攻撃・反撃・格闘で与えたダメージぶん、自分のHPを回復する
- 対戦での動き：attack / retaliate / trample / 格闘のダメージで、実際の減少量（hpLost）ぶん controller のプレイヤーを heal（やけどなら半分）。プレイヤーへのシールドで防がれた分は回復しない。
- エディター：値なし
- CPU：特になし
- 価格：keywords.lifelink: { min: x(1), perAttack: 1 }

#### キーワード『武士道』 `bushido`

- MTG：#246
- テキスト：モンスターと戦うとき（攻撃・反撃・格闘）、攻撃力+N
- 対戦での動き：攻撃先がモンスターのときの攻撃ダメージ、反撃の量、格闘のダメージに +N（攻撃力そのものは変えない。プレイヤーへの攻撃には乗らない）。KeywordDef.battle に combatBonus(k) を追加して合計。
- エディター：value: valueParam("上昇量", default 1, max x(5))。displayName「武士道N」
- CPU：特になし
- 価格：keywords.bushido: { perValue: 2 }

#### キーワード『聖盾』 `divineShield`

- MTG：#143
- テキスト：最初に受けるダメージ1回を0にする（毒・やけど・呪縛は防がない）
- 対戦での動き：Monster.shieldUsed（無ければ false）。dealDamage のモンスター側で、kind が attack / hit / retaliate / counter かつ最終量>0 のとき、聖盾があって未使用なら 0 にして shieldUsed=true、ログ「聖盾が防いだ」。ダメージを受けたときは発動しない（0なので）。キーワード付与で聖盾を与えると未使用に戻る。
- エディター：値なし
- CPU：特になし（評価で聖盾つきは体力に少し上乗せしてよい）
- 価格：keywords.divineShield: { flat: x(4) }

### 5.3 効果

#### 効果『トークン生成』 `token`

- MTG：#604・#124・#168・#411・#343・#163
- テキスト：攻撃力N・体力Nの小鬼をM体出す
- 対戦での動き：小さな仕組み「トークン」（下記）を使う。自分の場に攻撃力N・体力N・守備力0の小鬼をM体、1体ずつ onMonsterEntered（出るたび・祝祭の数え）。召喚酔いあり。場のトークンが1人 battle.maxTokens（5）体に達していたら作らない（ログ）。
- エディター：group buff。value: valueParam("強さ", default 1, max x(5))、hits: countParam("体数", min 1, max 3, default 1)。targetRule self（対象欄は出さない）。scalable false
- CPU：特になし
- 価格：effects.token: { perValue: 4, perToken: x(1), maxValue: x(5), maxTokens: 3 }。基礎 = (N×4 + x(1))×M

#### 効果『鍛錬』 `train`

- MTG：#140・#450・#442・#432・#302・#315
- テキスト：{対象}の攻撃力と体力を+Nする
- 対戦での動き：対象モンスターの attack と maxHp と hp をそれぞれ +N（永続）。
- エディター：group buff。value: valueParam("上昇量", default 1, max x(10))。targetRule allyMonsterOne（chosen / random / thisMonster / allyMonsters / 出たモンスター）。scalable true
- CPU：特になし（既存の攻撃力アップと同じ選び方）
- 価格：effects.train: { perValue: 4.5 }

#### 効果『衰弱』 `wither`

- MTG：#141
- テキスト：{対象}の攻撃力と体力を−Nする（体力が0になると破壊）
- 対戦での動き：対象の attack を −N（最低0）、maxHp と hp を −N。hp<=0 なら destroyMonster（ダメージではないので守備力・聖盾・不屈は効かず、ダメージを受けたときも出ない）。
- エディター：group disrupt。value: valueParam("減少量", default 1, max x(10))。targetRule enemyMonster（chosen / random / enemyMonsters / everyone）。scalable true
- CPU：特になし
- 価格：effects.wither: { perValue: 5 }

#### 効果『キーワード付与』 `grantKeyword`

- MTG：#142・#174・#200
- テキスト：{対象}に{キーワード}を与える
- 対戦での動き：Monster.granted（キーワード ID の配列）に追加（重複は無視）。keywordFlags は定義のキーワードと granted を合わせる。場を離れると消える。封印中は働かない。不屈・聖盾を与えたときは使用済みを戻す。
- エディター：group buff。option: 速攻 haste / 挑発 taunt / 飛行 flying / 貫通 trample / 不屈 undying / 接死 deathtouch / 絆魂 lifelink / 聖盾 divineShield / 呪禁 hexproof / 先制攻撃 firstStrike（二回攻撃・隠密・数値つきは出さない）。targetRule allyMonsterOne
- CPU：特になし
- 価格：effects.grantKeyword: { haste: x(4), taunt: x(7), flying: x(3), trample: x(2), undying: x(4), deathtouch: x(6), lifelink: x(3), divineShield: x(4), hexproof: x(4), firstStrike: x(2) }

#### 効果『格闘』 `fight`

- MTG：#418・#240
- テキスト：{自分のモンスター1体と相手モンスター1体}を戦わせる（互いに攻撃力ぶんのダメージを与える）
- 対戦での動き：新しい TargetRule "fight"。chosen なら Chosen.ally と Chosen.enemy の両方（enemy は挑発・呪禁・隠密の制限に従うモンスターのみ）、random ならランダムな自分と相手のモンスター。両方そろわなければ不発。先に両方の量（攻撃力＋一時強化＋武士道）を決めてから、相手へ→自分へ の順に dealDamage(kind "hit", source=相手側のモンスター, combat:true)。守備力・弱体・脆弱は働く。筋力・気合は乗らない。反撃・攻撃するたびは起きない。接死・絆魂は働く。
- エディター：group damage。値なし。targetRule fight（allowedTargets：manual のタイミングなら chosen、どこでも random）。targetNoun：chosen→「自分のモンスター1体と相手モンスター1体」、random→「ランダムな自分のモンスター1体とランダムな相手モンスター1体」
- CPU：legal で (ally, enemy) の組を列挙（モンスター数が多いときは上位数組に絞る）
- 価格：effects.fight: { flat: x(9) }

#### 効果『再行動』 `ready`

- MTG：#91・#104・#431
- テキスト：{対象}をもう一度攻撃できるようにする（1体につき1ターン1回）
- 対戦での動き：対象の counters.readyTurn !== g.turnIndex なら attacksUsed=0 にして readyTurn を記録。召喚酔い・凍結・防衛は解除しない（攻撃できない理由が残れば攻撃できない）。
- エディター：group buff。値なし。targetRule allyMonsterOne、excludeTargets: thisMonster・allyMonsters（無限攻撃の防止）。timings: play・summon のみ
- CPU：特になし（攻撃済みの強いモンスターを選ぶのが良い手。仮実行で評価）
- 価格：effects.ready: { flat: x(10) }

#### 効果『占術』 `scry`

- MTG：#426・#429
- テキスト：山札の上N枚を見て、好きな枚数を山札の下に置く（選択肢「捨て札へ」なら：好きな枚数を捨て札に置く）
- 対戦での動き：choose：自分の山札の上N枚（足りなければある分。切り直さない）を選択肢に（cardId つき・相手には見せない）、min 0 / max N。resolve：選んだカードを、元の並びのまま山札の下へ／捨て札へ。ログは枚数だけ公開（捨て札へ置いたカード名は公開）。
- エディター：group resource。value: countParam("枚数", max 5, default 2)。option: bottom「山札の下へ」/ discard「捨て札へ」。targetRule self
- CPU：残すのは「ノイズ・呪いでなく、次のターンの基本エナジー以下のコスト」のカード。それ以外を下へ／捨て札へ
- 価格：effects.scry: { perValue: x(1.5), maxValue: 5 }

#### 効果『手札整理』 `loot`

- MTG：#454・#631・#171
- テキスト：カードをN枚引き、手札を1枚選んで捨てる
- 対戦での動き：rt.draw(N) のあと、新しい Step { t: "discardChoice", player, count: 1 } を積む（手札が0なら何もしない）。選んだカードは discardCard（捨てても何も誘発しない）。
- エディター：group resource。value: countParam("枚数", max 3, default 1)。targetRule self
- CPU：discardChoice の方針：ノイズ → 呪い（デメリットつき）→ このターン払えないコストのうち一番重いもの → 一番軽いもの
- 価格：effects.loot: { perValue: x(3), maxValue: 3 }

#### 効果『処分』 `purge`

- MTG：#417
- テキスト：手札か捨て札のカードを1枚選んで除外する
- 対戦での動き：choose：自分の手札と捨て札のカード（ラベル「手札：名前」「捨て札：名前」）、min 0 / max 1。resolve：選んだカードを除外へ。
- エディター：group resource。値なし。targetRule self
- CPU：ノイズ → 呪いカード → 選ばない
- 価格：effects.purge: { flat: x(3) }

#### 効果『倍化』 `double`

- MTG：#414
- テキスト：相手の毒を2倍にする（増えるのは最大{cap}）／相手の出血を2倍にする（同）／自分の筋力を2倍にする（上限{strengthCap}）
- 対戦での動き：option poison：相手プレイヤーの毒に min(今の毒, effects.poison.maxValue) を足す。bleed：相手プレイヤーの出血に min(今の出血, double.bleedMaxAdd) を足す。strength：自分の筋力に今の値を addStatus（strengthCap で頭打ち）。0なら何も起きない。
- エディター：group status。値なし。option poison / bleed / strength。targetRule self（テキストで相手・自分を書き分ける）。minRarity rare
- CPU：特になし
- 価格：effects.double: { flat: x(12), bleedMaxAdd: x(5) }

#### 効果『呪縛』 `doom`

- MTG：#31
- テキスト：相手に呪縛Nを与える（相手のターン開始時にNダメージ。減らず、浄化で消える）
- 対戦での動き：Statuses に doom（プレイヤーのみ。StatusKey "doom"）。startTurn の毒の後に、doom>0 なら dealDamage(kind "doom")。doom はシールド・無効化を通る（isDot に含める）。半減しない。浄化で0。合計は battle.doomCap（x(5)）まで。
- エディター：group status。value: valueParam("量", default 1, max x(2))。targetRule enemyPlayer
- CPU：evaluate.ts：相手の doom は「量×残りの見込みターン（例：4）」として毒と同じ重みで足す
- 価格：effects.doom: { perValue: 15, maxValue: x(2) }、battle.doomCap: x(5)

#### 効果『一時強化』 `pump`

- MTG：#311
- テキスト：{対象}の攻撃力をこのターンだけ+Nする
- 対戦での動き：Monster.tempAttack（無ければ0）に +N。攻撃・反撃・格闘のダメージと条件 bigMonster で attack＋tempAttack を使う。各ターン終了時（両者のモンスター）に0へ戻す。
- エディター：group buff。value: valueParam("上昇量", default 1, max x(10))。targetRule allyMonsterOne。scalable true
- CPU：evaluate.ts：tempAttack は手番中だけ数える（ターン終了で消えるので盤面評価に入れない）
- 価格：effects.pump: { perValue: 1.5 }

### 5.4 デメリット

#### デメリット『防衛』 `defender`

- MTG：#198
- テキスト：このモンスターは攻撃できない
- 対戦での動き：attackBlockReason が「防衛：このモンスターは攻撃できない」を返す。混乱・裏切りの自動攻撃もしない。反撃はする（壁になる）。封印されても働く（デメリット）。
- エディター：monsterOnly・fixed。裏切りとは同時に付けられない（validate）
- CPU：legal から攻撃が消えるだけ。evaluate：防衛モンスターの攻撃力は打点として数えない
- 価格：drawbacks.defender: { min: x(1), perAttack: 2 }（max(min, A×2)）

#### デメリット『寿命』 `lifespan`

- MTG：#231・#265・#312・#360
- テキスト：寿命N：N回目の自分のターン終了時に場から消える（モンスターは破壊される）
- 対戦での動き：モンスター：入場時 counters.life=N。持ち主（controller）のターン終了時の処理（ターン終了時の効果の後）で −1、0 で destroyMonster（破壊されたときが出る）。パワー：PowerInst.life=N、持ち主のターン終了時に −1、0 でログを出して消す（誘発なし）。出たターンも1回目に数える（寿命1＋速攻＝使い捨て召喚）。
- エディター：fixed。value: countParam("ターン", min 1, max 3, default 2)。モンスターかパワーのカードにだけ付けられる（validate）
- CPU：evaluate：残り寿命の短いモンスターは価値を下げる（残り1なら半分など）
- 価格：drawbacks.lifespan: { byTurns: [x(6), x(4), x(2)] }（N=1,2,3）

#### デメリット『腐乱』 `decay`

- MTG：#355
- テキスト：攻撃したターンの終了時に破壊される
- 対戦での動き：performAttack で counters.attackedTurn=g.turnIndex。controller のターン終了時に attackedTurn===turnIndex なら destroyMonster。
- エディター：monsterOnly・fixed
- CPU：特になし（仮実行で評価）
- 価格：drawbacks.decay: { min: x(1), perAttack: 1 }

#### デメリット『廃棄』 `exhaust`

- MTG：#73
- テキスト：使ったあと、捨て札ではなく除外される
- 対戦での動き：finishCard で、パワーとして残らない呪文のカードがこのデメリットを持てば discardCard の代わりに除外へ（ログ「廃棄：除外された」）。
- エディター：fixed。モンスターとパワーのカードには付けられない（validate）
- CPU：特になし
- 価格：drawbacks.exhaust: { flat: x(3) }

#### デメリット『生け贄』 `sacrifice`

- MTG：#425・#597・#133
- テキスト：自分のモンスター1体を選んで破壊する（いなければ使えない）
- 対戦での動き：timings play / summon のみ。validatePlay：自分の場にモンスターがいなければ「生け贄にするモンスターがいません」（DrawbackDef に canPlay(g, p, card) を追加）。解決：DrawbackDef に choose を追加し、自分の場のモンスター（召喚時なら出たモンスター自身を除く）から1体を選ばせて destroyMonster（破壊されたとき・他のモンスターが破壊されるたびが出る）。#34 によりデメリットは効果より先に解決するので、生け贄にしたモンスターを選んでいた効果は不発。
- エディター：timing を選ぶデメリット（DrawbackDef.timings: play・summon）
- CPU：トークン → 破壊されたときの効果を持つもの → 評価値（攻撃力×3＋体力×1.5）が一番低いもの
- 価格：drawbacks.sacrifice: { flat: x(5) }（× タイミング倍率）

### 5.5 バッチ2の価格（balance.ts への追記の形）

```ts
keywords: { /* 既存 */ deathtouch: { flat: x(6) }, firstStrike: { min: x(2), perAttack: 0.5 }, hexproof: { flat: x(4) },
            lifelink: { min: x(1), perAttack: 1 }, bushido: { perValue: 2 }, divineShield: { flat: x(4) } },
effects: { /* 既存 */ token: { perValue: 4, perToken: x(1), maxValue: x(5), maxTokens: 3 }, train: { perValue: 4.5 },
           wither: { perValue: 5 }, grantKeyword: { haste: x(4), taunt: x(7), flying: x(3), trample: x(2), undying: x(4),
           deathtouch: x(6), lifelink: x(3), divineShield: x(4), hexproof: x(4), firstStrike: x(2) },
           fight: { flat: x(9) }, ready: { flat: x(10) }, scry: { perValue: x(1.5), maxValue: 5 }, loot: { perValue: x(3), maxValue: 3 },
           purge: { flat: x(3) }, double: { flat: x(12), bleedMaxAdd: x(5) }, doom: { perValue: 15, maxValue: x(2) }, pump: { perValue: 1.5 } },
drawbacks: { /* 既存 */ defender: { min: x(1), perAttack: 2 }, lifespan: { byTurns: [x(6), x(4), x(2)] },
             decay: { min: x(1), perAttack: 1 }, exhaust: { flat: x(3) }, sacrifice: { flat: x(5) } },
battle: { /* 既存 */ maxTokens: 5, tokenName: "小鬼", doomCap: x(5) },
```

価格の確かめ（倍率1）：「1/1の小鬼を2体」＝(4＋1)×2＝10（コスト1コモン 15 に収まる）。「接死・攻撃力1・体力2」＝3＋3＋6＝12（コスト1レア）。「呪縛1」＝15（コスト1コモン。相手のターンごとに20ダメージ、上限 x(5)）。防衛つき「攻撃力2・体力8・挑発」＝6＋12＋8−4＝22（コスト2コモン）。

### 5.6 バッチ2のテスト

- キーワード6つ：接死（攻撃・反撃・格闘で破壊、聖盾なら破壊しない、不屈は効かない）、先制攻撃（倒したら反撃なし・倒せなければ反撃あり）、呪禁（選べない・挑発との関係・ランダムは当たる）、絆魂（hpLost ぶん回復・シールド分は回復しない）、武士道（モンスター戦だけ）、聖盾（1回だけ・毒は防がない）。
- 効果12個：それぞれの動き・境界（トークンの上限5、トークンは捨て札に行かない、再行動は1ターン1回、占術で山札が足りない、手札整理で手札0、処分で選ばない、倍化の上限、呪縛の上限と浄化、一時強化がターン終了で消える）。
- デメリット5つ：防衛（攻撃できない・自動攻撃もしない・反撃はする）、寿命（1で出たターンの終わりに破壊、パワーは消える）、腐乱、廃棄（除外へ）、生け贄（いなければ使えない・破壊時が誘発）。
- CPU：選択が要る効果で CPU が止まらずに選ぶ（cpuAction が必ず合法手を返す）。オンラインの view で占術の選択肢が相手に見えない。
- 終わったら `npm run sim` と `npm run sim:presets`、新要素を詰め込んだ極端なデッキ（トークン＋出るたび、X＋エナジー、呪縛の重ね掛け、接死＋挑発の壁）で勝率・試合の長さを確認し、外れていれば balance.ts だけで直す。`npm run build:server`・`npm run build:single` も更新。

## 6. バッチの分担

- バッチ1：`enemyDamagedThisTurn`、`monsterDestroyedThisTurn`、`allyAttackedThisTurn`、`loneMonster`、`twoPowers`、`coinFlip`、`secondPlayer`、`emptyHand`、`bigMonster`、`bigDiscard`、`monsterInHand`、`twoSummonsThisTurn`、`allySummoned`、`allyDestroyed`、`powerPlayed`、`skillPlayed`、`hitEnemyPlayer`、`thisMonster`、`allyMonsters`、`triggerAlly`、`xEnergy`、`perEnemyMonster`、`perCardPlayed`（＋ options.ts の group/description、EffectDef/ModifierDef の追加項目、入場の共通処理、このターンの記録、繰り返し誘発の安全装置）
- バッチ2：`deathtouch`、`firstStrike`、`hexproof`、`lifelink`、`bushido`、`divineShield`、`token`、`train`、`wither`、`grantKeyword`、`fight`、`ready`、`scry`、`loot`、`purge`、`double`、`doom`、`pump`、`defender`、`lifespan`、`decay`、`exhaust`、`sacrifice`（＋ トークン・付与キーワード・一時強化・呪縛の状態、DrawbackDef の追加項目、discardChoice、CPU の選び方）
- 重なり：バッチ2の格闘で options.ts の allowedTargets / targetNoun に "fight" を足すことだけ。バッチ1の完了（テスト緑・コミット）後にバッチ2を始める。

## 7. 次回以降の候補（○ のうち価値の高いもの）

護法 #218、威圧 #314、切削 #421、準備 #420、抽出 #550、討伐 #101、増殖 #439、最大エナジー増加 #618、選択式カード #54・#599、起動型能力 #108・#406・#638、捨て札から使う（フラッシュバック・再活）#234・#341、サイクリング #227、一時奪取 #127・#636、種族タグ #53・#612、居住・動員・複写召喚（トークンの発展）#441・#451・#635、引いたとき #296（コストの差し引きで予算が増える抜け穴に注意）。

**○ の実装の進み具合（決定事項 #91〜）**：○ 94件は88要素・4バッチ（A：条件・タイミング・対象・修飾・デメリット／B：キーワード・効果・行動の要らないカードの能力／C1：捨て札から使う・起動型能力・サイクリング・動的コスト／C2：モード選択・種族・速度・王冠・英雄譚・蓄積）で実装する。バッチA（27要素：激突 #435・鼓舞 #444・消耗 #447・枯朽 #472・窮地 #501・注入 #539・英雄的 #508・引いたとき #296 を含む）は実装済み（#91。引いたときの抜け穴は `DRAWN_OVER_CAP` で止めた）。バッチB（34要素：キーワード6＝一撃離脱 #86・激励 #110・護法 #218・猛襲 #270・威圧 #314・分身 #558、効果23＋応召＝装備 #21・討伐 #101・借用 #127・#636・蓄え #139・懸賞 #162・準備 #170・#420・続唱 #287・#461・新生 #383・切削 #318・#421・封殺 #410・#601・増殖 #439・居住 #441・探検 #448・動員 #451・動力化 #471・徴募 #474・同士討ち #548・抽出 #550・創出 #551・発見 #553・恩恵 #557・最大エナジー増加 #618・複写召喚 #635・応召 #389、カードの能力4＝循環 #61・再利用 #225・反復 #290・成長 #554）も実装済み（#92）。バッチC1（13要素：捨て札から使う＝フラッシュバック #234・余波 #335（タイミング「捨て札から使ったとき」）・再活 #341・脱出 #346、起動 #108・#406・#638、サイクリング #227・魂力 #487、親和 #242・#608、条件付き軽減＝怒濤 #320・罠 #48、キッカー #232（条件「キッカーを払っていれば」））も実装済み（#93。新しい行動 activate・handAbility と捨て札から使う playCard、実コストの内訳、UI のドラッグ元・捨て札の山の落とし先・追加の支払いのダイアログ）。バッチC2（14要素：モード選択 #54・#599・#326（製造）・#344（暴動）と双呪 #243、種族 #53・#612（条件「同じ種族の自分のモンスターがいる」・修飾「同じ種族1体につき」・対象「同じ種族の自分のモンスター全体」）、速度 #187・#386・#387（効果「エンジン始動」・条件「速度が最大」）、王冠 #183・#479（効果「王冠を得る」・条件「王冠を持っている」）、英雄譚 #62（タイミング 第1章〜第3章）、蓄積 #154（能力「蓄積」・タイミング「蓄積がたまったとき」））も実装済み（#94。playCard の mode とモードの選択シート、種族・速度・王冠・章・蓄積の表示）。これで ○ 94件（88要素）はすべて実装した。統合（#95）で、敵対的レビュー（ランダムなカードの対戦ファズ・仕組みどうしの組み合わせ）・UI の残り（護法の札・封殺の札・成長込みの表示・装備の名前・パワーの札の光・手札に入ったカードの光・エディターのモードごとのポイントと実コストの見込み）・測り直し（プリセット総当たり・ミラー・○ の極端なデッキ22種）を済ませ、外れた4つ（動員・激励・王冠を持っていれば・同じ種族の全体）の値段を balance.ts で直した。召喚時に「自分のモンスター全体（または同じ種族の全体）の攻撃力+N」を並べるロードのデッキは、値段では止まらない（ユーザーに確認する事項として #95 に記録）。

## 8. △ の実装（アレンジして採用。決定事項 #97〜）

ユーザー依頼「△もお願いします」：△（アレンジすれば使える）103件を、今ある仕組みの上でアレンジした101要素として4バッチで実装する（A：単純な要素／B：追加の支払いと選択／C：新しいゾーンと状態／D：対戦のオプションと画面の機能）。

**バッチA（実装済み・決定事項 #97。30要素。新しい行動・ゾーンなし）**

| 種類 | 要素（ID） | MTG | 価格の目安（倍率1） |
|---|---|---|---|
| 条件 | 収斂：このターン3種類以上のカードを使った（`converge`） | #491 | ×0.5 |
| 条件 | 落魄：捨て札にモンスターとパワーが合わせて4枚以上（`descend`） | #495 | ×0.7 |
| 条件 | 長久：このモンスターがこのターン攻撃していない（`rested`） | #310 | ×0.7 |
| タイミング | 相手のモンスターが攻撃するたび（`enemyAttacked`。見出し「相手の行動」） | #5 | モンスター×1.5・パワー×4.0 |
| タイミング | 捨てられたとき（`discarded`。マッドネス） | #235 | ×0.6（合計はコスト0の上限まで） |
| タイミング | 各ターン初めて自分のカードの対象になったとき（`valiant`。雄姿） | #534 | ×1.0 |
| 対象 | 攻撃してきたモンスター（`attacker`） | #5 | ×1.0 |
| 修飾 | 萎縮（`witherDmg`） | #282 | +10% |
| 修飾 | 経験1につき（`perExp`） | #152 | +100% |
| 修飾 | ばらつき（`gamble`。×0.5／1／1.5） | #564 | −10% |
| キーワード | 対空（`reach`） | #213 | x(2) |
| キーワード | 潜伏（`skulk`） | #321 | x(2) |
| デメリット | 累加維持費 N（`cumulativeUpkeep`） | #222 | N×4（固定値） |
| デメリット | 休眠（`dormant`。フェイジングのアレンジ） | #224 | モンスター max(x(2), 攻撃力×1.5)・パワー 効果×0.4 |
| 効果 | 消滅の印（`finality`） | #148 | x(2) |
| 効果 | 放射能 N（`rad`） | #149 | N×x(1.2) |
| 効果 | 経験を得る N（`gainExp`） | #152 | N×x(2) |
| 効果 | 氷結 N（`iceLock`） | #155 | N×x(4) |
| 効果 | 章を進める（`advanceSaga`） | #157 | x(3) |
| 効果 | 培養 N（`incubate`。卵のトークン） | #173・#457 | N×3＋x(0.5) |
| 効果 | 容疑（`suspect`） | #193・#464 | x(5) |
| 効果 | 守護（`guard`。不壊／加護） | #208・#212 | x(8)／x(7) |
| 効果 | 賛助 N（`backup`） | #373 | N×4.5＋x(2) |
| 効果 | 消術 N（`fateseal`） | #434 | N×x(1.5) |
| 効果 | 永久強化 N（`perpetual`） | #549 | N×4 |
| 効果 | 山札消滅 N（`exileMill`。ライブラリーアウトのアレンジ。負けのルールは入れない） | #617 | N×x(1.2) |
| 選択肢 | トークン生成「落とし子」 | #181 | 1体につき+x(1.5) |
| 選択肢 | 倍化「3倍」（レジェンドだけ） | #415 | +x(20) |
| 選択肢 | 蓄積「プラン（1回きり）」 | #36 | 倍率×0.35（最低×1.0） |
| カードの能力 | 罠（`trap`。パワーの効果が1回出たら消える） | #5 | 罠のタイミングの倍率×1.2（能力は0pt） |

新しい対戦の状態（すべて省略可能・JSON）：`Statuses.rad`、`PlayerState.exp`・`ice`・`turn.typesPlayed`、`CardInst.iced`・`perm`・`discardedTurn`、`Monster.finality`・`suspected`・`guard`・`tempGranted`・`counters.age`／`dormantFrom`／`valiantTurn`／`withered`、`PowerInst.age`・`dormantFrom`、`TokenSpec.egg`・`spawn`、`Chosen.trigger`、Step `powerGone`。隠す情報（凍った手札・永久強化した手札・消術で見たカード）は viewFor（手札・山札を隠す）と private のログで相手に見えない。仕様から直した点は決定事項 #97。

**バッチB（実装済み・決定事項 #98。32要素：追加の支払いと選択）**

| 種類 | 要素（ID） | MTG | 価格の目安（倍率1） |
|---|---|---|---|
| 仕組み | 追加の支払い（`extraPay`。playCard の extra・modes・alt・sacrificeUid・tapUids・pitchUid・lifePay、attack の enlistUid、Action discardAbility） | #323・#380・#391・#356・#528・#365・#368 | — |
| カードの能力 | 放題（`spree`。好きな数のモード、2つ目から +K⚡） | #323・#380 | 高いモード＋他×0.5／0.4（K＝1／2） |
| カードの能力 | 段階（`tiered`。B は+1⚡・C は+2⚡） | #391 | 各モード−上乗せ×x(10) でモード選択の式 |
| カードの能力 | 切除（`cleave`。+K⚡で条件を無視） | #356 | （条件なし−条件付き）×0.6／0.45 |
| カードの能力 | 奮励（`strive`。+K⚡ごとに相手をもう1つ選ぶ。2回まで） | #528 | 効果×0.5／0.35 |
| カードの能力 | 分隊（`squad`。+K⚡ごとにコピーのトークン。2回まで） | #365 | 本体×0.45／0.35／0.25（K＝2／3／4） |
| カードの能力 | 試作（`prototype`。K 軽く・半分の強さで出す） | #368 | K×x(2)（最大−3） |
| カードの能力 | 想起（`evoke`。K⚡で出し、召喚時の効果のあと破壊） | #276 | 召喚時の効果×0.5 |
| カードの能力 | 超過（`overload`。+K⚡で「選んだ1体」が全体に） | #298 | （全体の倍率−1）×効果×0.6／0.45／0.35 |
| カードの能力 | 解鎖（`unleash`。+N で出すと反撃しない） | #300 | N×2 |
| カードの能力 | 現出（`emerge`。自分のモンスターを生け贄にしてそのコスト分軽く） | #249・#322 | x(3) |
| カードの能力 | 犠牲（`casualty`。攻撃力 N 以上を生け贄で使用時の効果をもう一度） | #361 | 使用時の効果×0.5／0.4／0.3 |
| カードの能力・条件 | 協約（`bargain`）と条件「協約したなら」（`bargained`） | #374 | 能力0pt・条件×0.6 |
| カードの能力 | 貪食 N（`devour`。出たとき生け贄1体につき攻撃力・体力+N） | #284 | x(1)＋N×4.5 |
| カードの能力 | 召集（`convoke`。モンスターを行動済みにして1体−1⚡） | #253 | x(3)（最大−3） |
| カードの能力 | 探査（`delve`。捨て札を除外して1枚−1⚡） | #268 | x(3)（最大−3） |
| カードの能力 | 血の支払い（`lifePay`。1⚡を HP x(2) で） | #98 | K×x(2)（最大2） |
| カードの能力 | 代替コスト（`pitch`。手札の同じ種類を除外して0⚡。1ターン1回） | #607 | x(6) |
| カードの能力 | 最悪の二択（`villain`。相手がモードを選ぶ） | #459 | 低いモード＋高いモード×0.2 |
| カードの能力 | 回顧（`retrace`。捨て札から、手札を1枚捨てて使う） | #283 | 効果・本体×0.5 |
| カードの能力 | 調和（`harmonize`。捨て札から、攻撃力 x(2) ごとに−1⚡） | #388 | ×0.5／0.4／0.3 |
| カードの能力 | 大混乱（`mayhem`。このターン捨てたカードを捨て札から） | #395 | ×0.4 |
| カードの能力 | 一時蘇生（`unearth`。捨て札から K⚡で速攻付き、ターン終わりに除外） | #286 | 本体×0.45／0.35／0.25 |
| カードの能力・タイミング | 相続（`renew`。捨て札から除外して効果） | #524 | 能力0pt・タイミング×0.9 |
| カードの能力 | 発掘 N（`dredge`。ドローの代わりに N 枚切削して戻す。1ターン1回） | #254 | x(2)（N＝2〜4） |
| カードの能力 | 不朽／永遠（`embalm`。捨て札から除外してコピーのトークン） | #336・#337 | 本体×0.4／0.3／0.2、永遠は x(4)/x(4) で+x(2) |
| カードの能力・タイミング | 予見（`forecast`。手札で見せて効果、カードは手札に残る。1ターン1回） | #259 | 能力0pt・タイミング×1.0 |
| 選択肢 | サーチ・抽出の「このカードと同じコスト」（`sameCost`） | #255 | サーチと同じ |
| キーワード | 後援（`enlist`。攻撃するとき行動していない味方を行動済みにしてその攻撃力を足す） | #362 | x(3) |

UI：支払いのシート `PaySheet`（キッカー・再活・脱出もまとめた）、放題の複数選択、後援のシート、捨て札の一覧・詳細の能力のボタン（相続・発掘・不朽）、捨て札の山へ落とす予見、最悪の二択は相手側にモードのボタン。新しい対戦の状態（省略可能・JSON）：`CardInst.retraceTurn`・`forecastTurn`、`Monster.prototype`・`unleashed`・`unearthed`、`turn.pitched`・`dredged`、`PlayRecord.modes`・`cleaved`・`strive`・`bargained`、Step `devourChoice`・`villainChoice`・`evokeEnd`。仕様から直した点は決定事項 #98。

**バッチC（実装済み・決定事項 #99。30要素：新しいゾーンと状態）**

| 種類 | 要素（ID） | MTG | 価格の目安（倍率1） |
|---|---|---|---|
| 仕組み | 待機ゾーン（`PlayerState.waiting`。Action `setAside`・playCard の from 'waiting'） | #351・#378・#264・#384・#393・#60 | 1人5枚（`battle.maxWaiting`） |
| カードの能力 | 予顕（`foretell`。エナジー2で伏せ、後のターンにコスト−K） | #351 | x(2)＋(K−1)×x(6)（K は2まで） |
| カードの能力 | 計画（`plot`。今の実コストを払って置き、後のターンに無料） | #378 | x(2) |
| カードの能力 | 待機（`suspend`。K⚡で置き、N ターン後に無料で使われる） | #264・#384 | x(3)（N は3まで、K は印刷コスト未満・2まで） |
| カードの能力 | ワープ（`warp`。K⚡で出し、ターン終了時に待機ゾーンへ） | #393 | x(2)＋召喚時の効果×0.4 |
| カードの能力・タイミング | 出来事（`adventure`。K⚡で「出来事」の効果を呪文として使い、あとでモンスターとして出す） | #60 | 能力0pt・タイミング×1.0×0.8 |
| 仕組み・能力 | 達成：事件（`quest`。パワー）・進化（`evolve`。モンスター、攻撃力・体力+N） | #64・#377・#56・#57 | x(1)／x(1)＋N×2.7 |
| 条件・タイミング | 達成していれば（`achieved`）・達成したとき（`achievedNow`） | 同上 | ×0.5／×0.7 |
| カードの能力 | Lvアップ（`levelUp`。K⚡で Lv+1、Lv3まで・1ターン1回） | #63・#159・#289 | モンスター N×5、パワー 0 |
| 条件・タイミング | Lv2以上なら（`level2`）・Lv3なら（`level3`）・Lvが上がったとき（`leveledUp`） | 同上 | ×0.6／×0.4／×1.6 |
| カードの能力・タイミング | 忠誠（`loyalty`。忠誠 L で出て、1ターン1回 +1 か −K。0で消える。攻撃で HP が減ると −1） | #8 | 能力0pt・+1 ×4.0、−K ×1.2（L≧K）／×0.8 |
| 仕組み | 裏向きのモンスター（`Monster.faceDown`。攻撃力・体力 x(2)、変装は護法1。Action `reveal`） | #376・#445 | — |
| カードの能力 | 変装（`disguise`。エナジー2で裏向きに出し、K⚡で表にする） | #376 | x(3) |
| 効果 | 予示（`manifest`。山札の一番上を裏向きで出す） | #445 | x(9) |
| タイミング | 表になったとき（`revealed`） | #376・#445 | ×0.9 |
| 効果 | 追加ターン（`extraTurn`。レジェンド・1試合1回） | #90 | x(40) |
| カードの能力 | 特殊勝利（`altWin`。レジェンドのパワー。カード12枚／ターン4回／モンスター5体。8ターン目より前は勝たない） | #115・#605 | x(30) |
| 効果 | HP交換（`swapHp`。レジェンド・1試合1回・得る HP は最大の50%まで） | #416 | x(30) |
| 効果 | 強奪（`heist`。相手の山札から3枚見て1枚のコピーを手札へ。使い切り） | #560 | x(8) |
| カードの能力 | 紋章（`emblem`。レジェンドのパワー。上限に数えず解除されない。1人1つ） | #191 | パワーの効果×1.3 |
| 効果・タイミング | 砦を築く（`siege`。相手の場に攻撃力0・体力 N）・砦を落としたとき（`siegeWon`） | #2・#51 | x(1)（N は x(2)〜x(6)）／×0.9〜0.5（N ごと） |

UI：自分の待機ゾーン（⏳。手札をドラッグで待機させる落とし先・一覧から盤面へドラッグして使う）、相手の予顕は裏向きの1行、起動のボタンの列（⚡起動・⬆Lv・忠誠 +1／−K・🂠表にする。ドラッグでも押しても使える）、紋章の枠・忠誠・Lv・達成・特殊勝利の進みの札、裏向きのタイルに正体（持ち主だけ）、追加ターンのバナー、結果ダイアログの「特殊勝利」、エディターの達成条件の選択パネル。新しい対戦の状態（省略可能・JSON）：`PlayerState.waiting`・`emblems`・`extraTurnUsed`・`extraTurnPending`・`swapUsed`、`Monster.faceDown`・`achieved`・`warped`・`siege`・`counters.level`／`levelTurn`、`PowerInst.achieved`・`level`・`levelTurn`・`loyalty`・`loyaltyTurn`・`progress`、`CardInst.heisted`、`TokenSpec.siege`、GameResult.reason 'altWin'。仕様から直した点は決定事項 #99。

**バッチD（実装済み・決定事項 #100。9要素：対戦のオプションと画面の機能）**

| 種類 | 要素（ID） | MTG | 価格の目安（倍率1） |
|---|---|---|---|
| 対戦オプション | リーダー（`leader`。なし・騎士・魔術師・召喚士・錬金術師・賢者。`src/engine/leaders.ts`） | #15 | 騎士 HP+x(10)・魔術師 最初の手札+1・召喚士 出たモンスターの体力+x(1)・錬金術師 4ターンごとにエナジー+1・賢者 2ターンごとに1枚多く引く（カードのポイントの外） |
| 仕組み | フィールド（`field`。火山・大図書館・聖域・闘技場・市場・霧。対戦オプション「次元」：なし／ランダム／移り変わる＝通算6ターンごと。`src/engine/fields.ts`） | #11・#19 | 火山 攻撃力+x(1)・大図書館 +1枚・聖域 HP+x(2)・市場 最初のカード−1・霧 プレイヤーへの攻撃−25% |
| 効果 | フィールド（`setField`。両者に効く場の効果を上書き） | #19 | x(6) |
| 仕組み | 昼と夜（`dayNight`。昼に0枚なら夜、夜に2枚以上なら昼。オプションなしでは「昼なら／夜なら」のカードで始まる） | #186・#353 | — |
| 条件 | 昼なら（`isDay`）・夜なら（`isNight`） | #186・#353 | ×0.6／×0.6 |
| 画面の機能 | ドラフト戦（`draft`。3枚から1枚×15回、1回2枚。CPU 戦だけ。#/battle/draft） | #119 | — |
| 画面の機能 | コスト分布のグラフ（`manaCurve`。デッキ構築・準備画面・ドラフト） | #629 | — |
| 画面の機能 | 既存の要素で作れるもの（`mtgGuide`。テンプレート5つ：補強・湧血・種類サイクリング・変成・融合、ルールページの対応表） | #6・#175・#201・#228・#279・#304・#328・#354・#399・#467・#485 | — |

効き目はすべて battle/rules.ts の `ruleHooks(g, p)` から読む（ターン開始時・実効攻撃力・コスト・攻撃のダメージ・場に出たとき）。新しい対戦の状態（省略可能・JSON・公開情報）：`PlayerState.leader`、`GameState.rules`・`field`・`dayNight`。オンラインは create・join の `leader`・create の `rules`（DB の列は増やさず、入室前は `hostDeck.rules` と席の `leader`、対戦が始まったら `GameState.rules`）。仕様から直した点は決定事項 #100。△ の103件はこれですべて実装した（仕様 spec3 の 1〜11）。
