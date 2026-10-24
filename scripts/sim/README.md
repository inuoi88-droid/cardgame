# scripts/sim — CPU 同士のシミュレーション

バランス（価格表・ルール・数値）を変えたあとに、勝率・試合の長さ・CPU の強さを測り直すための道具。監査のときの作業用スクリプトを整理して入れたもの。エンジン（`src/engine/`）を直接 import して Node で動かす（Node 22.12 以上。型は Node の type stripping で落とす）。

## 使い方

```
npm run sim                 # 全部をほどほどの試合数で回し、out/summary.json と out/summary.md を書く
npm run sim:presets         # プリセット総当たり（1組み合わせ 200 試合）
node scripts/sim/presets.mts 300        # 試合数を指定
npm run sim:options -- 60 --leader      # リーダー・フィールド・昼と夜（--leader・--field・--daynight。省くと全部。見送り中の闘技場は --all-fields で測る）
node scripts/sim/stress.mts 60          # 極端なデッキ vs 基準デッキ
node scripts/sim/stress.mts 60 poison burn   # デッキのキーを指定（stress.mts 冒頭の表）
node scripts/sim/stress10.mts 150       # 基準デッキの10枚だけを極端なカードに差し替えて元の基準デッキと戦う（40 種類、約15分）
node scripts/sim/length.mts 200         # 試合の長さの分布
node scripts/sim/aicheck.mts 10         # CPU のリーサル検査
node scripts/sim/run-all.mts 40         # まとめ（n はプリセットの試合数。他はそれに比例。n=10 で 7〜8 分）
node scripts/sim/final.mts after 200 rr mirror burn mono   # 最終調整（#84）の基準をまとめて測る（グループは final.mts 冒頭）
node scripts/sim/official.mts common 60   # 公式カード（src/official）：色ごとのコモンだけのデッキの総当たり
node scripts/sim/official.mts draft 600 2 # 公式カード：「場から交互に取る」ドラフト600回×2試合（アーキタイプ・先に取った側・カードごとの勝率）
node scripts/sim/official.mts pickers 40 2 # 公式カード：取り方どうし（おまかせ・燃やしだけ・汎用だけ・でたらめ）のドラフトのデッキで対戦
npm run sim:draft                          # ドラフト戦の本番の形（公式カード・場から交互に取る・後から取った人が先攻・再戦）：400回×2試合＋つよいどうし50回＋リーサル検査20回
node scripts/sim/draft.mts 800 2 --hard 100 --lethal 30 --tag after   # 回数と出力の名前（out/draft-<tag>.json・.md）を指定。--seed で最初のシード
```

`npm run gen`（索引の生成）は npm script の pre フックで自動で走る。`node` で直接動かすときは、`src/engine/registry.generated.ts` がなければ先に `npm run gen`。

結果は標準出力に表で出し、同じ内容を `scripts/sim/out/*.json`（git には入れない）に書く。進み具合は標準エラーに出す。

- 4 並列（`node:worker_threads`、CPU 数と 4 の小さいほう）。`SIM_WORKERS=0` で直列（デバッグ用）、`SIM_WORKERS=2` などで数を変えられる
- 同じシードなら同じ結果。各スクリプトはシードを固定しているので、バランスを変える前後で比べられる
- 1試合はプリセット同士で 0.3 秒前後、B0・B1 のような長い試合で 1 秒強（CPU の貪欲法が行動ごとに全候補を試すため）

## ファイル

| ファイル | 中身 |
|---|---|
| `lib.mts` | 共通部分。カード・デッキの作成（倍率1の数字で書く）、基準デッキ、1試合（`playGame`）、並列の連戦（`series`）、場面を作る道具、表の出力 |
| `worker.mts` | `series` のワーカー（直接は動かさない） |
| `presets.mts` | プリセット5つの総当たり（ミラー含む）と、先攻後攻ルールの候補の比較 |
| `options.mts` | 対戦のオプション（MTG 要素 △ バッチD）：リーダーごと（ミラー戦で席A だけ）・フィールドごと（総当たり）・昼と夜ありの勝率と試合の長さ |
| `stress.mts` | 1つの効果だけに寄せた極端なデッキ（40 種類以上）を B0・B1 にぶつける。キーが m で始まる 25 個は MTG 要素（#85・#86）の極端なデッキ（トークン＋出るたび・X・呪縛・接死＋挑発など。測定は #89）。キーが o で始まる 22 個は ○ の MTG 要素（#91〜#94）の極端なデッキ（お互いドロー・予約・引いたときの連鎖・応召・動員・複写・封殺・続唱・激励・再利用・反復・フラッシュバック・脱出・起動のパワー・親和・キッカー＋新生・双呪・速度・王冠・英雄譚・蓄積・種族。測定は #95）。キーが t で始まる 33 個は △ の MTG 要素（#97〜#100）の極端なデッキ（罠のパワー・相手の攻撃に応じるパワー・放射能・休眠・累加維持費・ばらつき・培養・落とし子・賛助・守護・経験・氷結・代替コスト・分隊・想起・血の支払い・一時蘇生・不朽・回顧・探査＋発掘・後援・予顕・待機（K0・K1）・ワープ・変装・Lv・進化・忠誠・砦・追加ターン・特殊勝利・紋章。測定は #101）。`node scripts/sim/stress.mts 60 mTokenSwarm mDeathTauntBurn …`、`node scripts/sim/stress.mts 60 oAmass oInspire`、`node scripts/sim/stress.mts 60 tSuspend tEvolve` |
| `stress10.mts` | 基準デッキ B0・B1 の1つの枠（10枚）を1つの効果の上限カードに差し替え、元の基準デッキと戦わせる（監査 sim-c の形。30枚すべてを寄せる stress.mts はダメージのないデッキが勝てずに引き分けばかりになるため）。差し替える枠は stress10.mts の冒頭 |
| `length.mts` | 試合の長さ（各プレイヤーのターン数）の分布 |
| `aicheck.mts` | 作った場面で CPU がリーサルを取れるか＋実戦での見逃し数 |
| `run-all.mts` | 全部回してまとめる |
| `final.mts` | 最終調整（#84）の測定：プリセット総当たり・ミラー・BURN・モンスターだけのデッキ MONO・挑発に寄せた TAUNTX・パワーの極端デッキ。`node scripts/sim/final.mts after 200 valid rr mirror burn mono taunt tauntvs`、`node scripts/sim/final.mts power 150 power`。結果の読み方は `out/final.md`（git には入れない）と決定事項 #84 |
| `draft.mts` | ドラフト戦の本番の形の測定（決定事項 #118）：公式カードでエンジンの createDraft・applyTake のドラフトをして、1戦目は後から取り始めた人が先攻（`battleFirstAfterDraft`）、2戦目は「同じデッキでもう一戦」（前の負けが先攻）。席ごとの取り方は `draftlib.mts` の PROFILES（本物のおまかせ よわい・ふつう・つよい と、色をそろえる focus・ばらつきの大きい focus-wide）からシードで選ぶ。出すもの：デッキがルールどおりか・先に取った人と先攻の勝率・主な色（いちばん多い色が4回以下なら「混色」）ごとのデッキの割合と勝率・色ごとの取られ方（場に出た割合との比）・取り方ごとの勝率・色どうしの勝率・カードごとの「場に出た回数・取られた割合・平均の取った順・入っていたデッキの勝率」と外れ値の印・試合の長さの分布・引き分け・リーサルの見逃し。並列は `draft-worker.mts`（ドラフト2回ずつ） |
| `official.mts` | 公式カード（ドラフト戦の山。決定事項 #116）の測定：色ごとのコモンだけのデッキ（`officialCommonDeck`）の総当たりと、簡単な CPU による「場から交互に取る」ドラフトの勝率（主なアーキタイプ・先に取った側・カードごと）。ドラフトはエンジンの createDraft・applyTake（山はコモン2枚ずつ）。draft の取り方はこのスクリプトだけの目安で、pickers は本物のおまかせ（autoPick）と、燃やし（顔へのダメージ）だけ・汎用だけ・でたらめに取る人との対戦（#117） |

## 基準デッキ（`lib.mts`）

| 名前 | 中身 | 由来 |
|---|---|---|
| B0 | 兵士 3/3 ×10、火球 ダメージ7 ×10、戦士 5/5（コスト2）×10。#84 から体力と火球は価格表で作れる最大（今は 兵士 3/4・火球 5・戦士 5/6.5） | 監査 sim-a の基準（除去とモンスターの混合。長い試合） |
| B1 | 見習い兵 2/4.5 ×10、火球 ダメージ7.5 ×10、鉄の盾（コモン・コスト1のシールドの上限）×10。#84 から 見習い兵 2/6・火球 5・鉄の盾 4.25 | 監査 sim-c の基準（顔を殴り合うレース。今は基準どうしでほぼ引き分け） |
| BURN | コスト1・ダメージだけのコモン30枚（数値は価格表で作れる最大。0.25 刻み。#84 からは 5） | 最速の顔レースの目安 |

すべてのカードは `analyzeCard().valid`、デッキは `analyzeDeck().valid` を確かめてから使う（違反なら理由つきで例外）。`fitValue` は数値 N を上から順に試して作れる最大にするので、価格表を変えればデッキの数値も追従する。

## `lib.mts` の主な関数

```ts
cardAtCap(rarity, cost, effects, stats?, keywords?, { name })   // ルールを守るカード。違反なら例外
burnCard(max?, name?) / monsterAtCap(name, cost, attack, minHp)  // 作れる最大のダメージ呪文・バニラモンスター（0.25 刻み）
fitValue(rarity, cost, (v) => ({ effects, stats, keywords, name }))  // N を最大にして作る
buildDeck(name, [[card, count], ...])                             // 検証つきデッキ
playGame(deckA, deckB, seed, { first?, level?, maxActions?, checkLethal?, battle? })
  // → { winner, draw, turns（各プレイヤーのターン数）, turnsTaken, cardsPlayed, finalHp, lethalMissed?, ... }
series(deckA, deckB, n, { first?, level?, battle?, seedBase?, label? })
  // → { winRate, drawRate, firstWinRate, turnsMedian, turnsMean, hist, ... }。first を指定しなければ先攻は交互
patchBattle({ secondPlayerFirstTurnBonusEnergy: 1 })  // BALANCE.battle を一時的に書き換える（戻す関数を返す）
scenario() / giveCard / putMonster / playTurn          // 場面を作って CPU に任せる（aicheck.mts）
```

CPU は `viewFor()` で見える情報だけで決める（`ai.cpuAction(view, …)`）。本物の状態で実行できない行動になったときだけ、本物の状態で決め直す。

### 難易度

`level` は `'easy' | 'normal' | 'hard'`。エンジンが `ai.strategyFor(level)`（または `ai.strategies[level]`）を公開していればそれを使い、なければ全レベル貪欲法（`lib.LEVELS_IMPLEMENTED` が false）。

### 先攻後攻ルールの候補（`FIRST_PLAYER_VARIANTS`）

`balance.ts` の `firstPlayerFirstTurnPenalty`（先攻1ターン目のエナジー −1）、`secondPlayerFirstTurnBonusEnergy`、`secondPlayerFirstTurnExtraDraw`（後攻1ターン目の補正）を実行時に書き換えて比べる。今のルールは #73 からの「先攻1ターン目 −1 ＋後攻1ターン目 エナジー +1」（coin と同じ）。

| キー | 中身 |
|---|---|
| penaltyOnly | 先攻1ターン目 −1 だけ（#73 より前のルール） |
| coin | 先攻1ターン目 −1 ＋ 後攻1ターン目 エナジー +1 |
| card | 先攻1ターン目 −1 ＋ 後攻1ターン目 ドロー +1 |

`presets.mts` がミラー戦（先攻を席0に固定）で先攻の勝率を出す。50% に近いほど公平。表の**先頭の列が今のルール**（`balance.ts` のまま、`firstPlayerColumns()`）で、続く列は今のルールと違う候補だけ（今のルールと同じ候補は回さない）。以前は penaltyOnly が `current`「現行」という名前のままで、#89 でその列を今のルールの数字と取り違えた（#90）。

## 目安（監査の合格基準）

ミラー 45〜55%、中央値 8〜10 ターン、純バーン 5 ターン以上、総当たり 65% 以下、極端デッキ 80% 以下、リーサル見逃し 0%、30 ターンの引き分け 2% 以下。
