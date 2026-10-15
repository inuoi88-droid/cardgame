# Phase 1 実装計画：カードエディターとデッキ構築（承認待ち）

## 1. ファイル構成

```
cardgame/
├─ package.json / vite.config.ts / tsconfig.json / index.html
├─ scripts/
│   └─ gen-registry.mjs          … src/engine/defs/ 以下を走査して登録用の索引を自動生成
├─ src/
│   ├─ engine/                   … ルールエンジン。純粋関数のみ（React・DOM・localStorage・Math.random・Date を使わない）
│   │   ├─ balance.ts            … バランス数値をすべてここに集約
│   │   ├─ types.ts              … カード・デッキ・効果インスタンスの型
│   │   ├─ options.ts            … タイミング・対象・条件の定義（表示名と、使えるカード種別）
│   │   ├─ registry.ts           … レジストリ本体（登録・検索・一覧）
│   │   ├─ registry.generated.ts … 自動生成。手で編集しない
│   │   ├─ defs/
│   │   │   ├─ effects/          … 効果1つにつき1ファイル（39ファイル）
│   │   │   ├─ modifiers/        … 防御無視・吸収（2ファイル）
│   │   │   ├─ keywords/         … キーワード1つにつき1ファイル（8ファイル）
│   │   │   └─ drawbacks/        … デメリット1つにつき1ファイル（10ファイル）
│   │   ├─ points.ts             … ポイント計算と内訳
│   │   ├─ classify.ts           … カードの種類・呪い判定
│   │   ├─ validate.ts           … ルール検証（違反理由の一覧を返す）
│   │   ├─ text.ts               … 効果テキストの自動生成
│   │   ├─ analyze.ts            … 上の4つをまとめた入口 analyzeCard(card)
│   │   ├─ deck.ts               … デッキ検証 analyzeDeck(deck, cards)
│   │   └─ io.ts                 … エクスポート/インポート形式の検証と変換
│   ├─ ui/
│   │   ├─ main.tsx / App.tsx / router.ts（ハッシュで画面切り替え）
│   │   ├─ store.ts              … localStorage の読み書き（engine からは参照しない）
│   │   ├─ pages/                … CardListPage / CardEditorPage / DeckListPage / DeckBuilderPage
│   │   ├─ components/           … CardView（カード風プレビュー）/ PointPanel / EffectRow / DrawbackRow /
│   │   │                          KeywordPicker / EmojiPicker / RuleErrors / ImportExport
│   │   ├─ emoji.ts              … アイコン候補の絵文字（カテゴリ別に約120個）
│   │   └─ styles.css
│   └─ samples.ts                … 作成例4枚（「サンプルを追加」ボタン用）
└─ tests/
    ├─ examples.test.ts          … 作成例4枚の計算結果
    ├─ violations.test.ts        … ルール違反で作れないケース
    ├─ registry.test.ts          … 全定義の整合性（balance.ts に数値がある、テキストが作れる、索引の生成漏れがない）
    ├─ deck.test.ts              … デッキの枚数・レアリティ制限
    └─ io.test.ts                … エクスポート→インポートの往復、壊れたJSONの拒否
```

### 効果を1つ追加するときの手順

1. `src/engine/defs/effects/<id>.ts` を1ファイル作る（名前、数値の範囲、使える対象、ポイント式、テキスト。Phase 2 で処理関数もここに追加）
2. その効果の基礎ポイントを `balance.ts` に1行書く（数値は balance.ts だけに置くルールのため）

索引は `npm run dev / test / build` の前に自動生成されるので、登録漏れは起きません。エディターの選択肢、ポイント計算、効果テキストには自動で反映されます。

## 2. データ構造

### 保存するもの

```ts
type Rarity = 'common' | 'rare' | 'epic' | 'legend';
type TimingId = 'play' | 'summon' | 'destroyed' | 'damaged' | 'attack' | 'turnStart' | 'turnEnd' | 'cardPlayed';
type TargetId = 'chosen' | 'random' | 'enemyMonsters' | 'enemyAll' | 'everyone'
              | 'self' | 'enemyPlayer' | 'board';   // 下の3つは選択肢のない固定対象（×1.0）
type ConditionId = 'hasMonster' | 'enemyHpHigher'                 // ゆるい
                 | 'enemyPoisoned' | 'lowHp' | 'smallHand'        // ふつう
                 | 'enemyPoisonBurn' | 'thirdCard' | 'threeMonsters'; // きびしい

interface CardDef {
  v: 1;                         // データ形式のバージョン
  id: string;
  name: string;
  icon: string;                 // 絵文字
  rarity: Rarity;
  cost: number;
  stats: { attack: number; hp: number; defense: number } | null;
  keywords: { id: KeywordId; value?: number }[];
  effects: EffectInstance[];
  drawbacks: DrawbackInstance[];
}

interface EffectInstance {
  id: EffectId;
  value?: number;               // N
  hits?: number;                // M（連撃のみ）
  timing: TimingId;
  target: TargetId;
  condition: ConditionId | null; // 1つまで（型で保証）
  mods?: ('pierce' | 'drain')[]; // 防御無視・吸収（ダメージと連撃のみ）
  option?: string;              // サーチで指定するカードの種類
}

interface DrawbackInstance {
  id: DrawbackId;
  value?: number;
  timing: TimingId | null;      // 倍率込み固定値のもの（維持費・寄生・裏切り）は null
}

interface Deck {
  v: 1;
  id: string;
  name: string;
  entries: { cardId: string; count: number }[];
}
```

### 毎回エンジンが計算するもの（保存しない）

```ts
type CardType = 'monster' | 'powerAttack' | 'power' | 'attack' | 'skill';

interface CardAnalysis {
  cardType: CardType;
  isCurse: boolean;
  points: {
    lines: { label: string; formula: string; value: number }[];  // 内訳（例：「攻撃するたび 毒1」「3 × 2.0」「6」）
    total: number;             // 上限と比べる合計
    cap: number;               // レアリティ上限
    remaining: number;         // 上限までの残り
    drawbackTotal: number;     // デメリット合計（正の数で表示）
  };
  text: { effects: string[]; keywords: string[]; drawbacks: string[] };
  violations: { code: string; message: string; path?: string }[];  // 赤字表示する理由
  valid: boolean;
}
```

### レジストリの定義（1ファイルにまとめる中身）

```ts
interface EffectDef {
  kind: 'effect';
  id: EffectId;
  name: string;                         // 'ダメージ'
  group: 'damage' | 'defense' | 'status' | 'buff' | 'resource' | 'disrupt' | 'special';
  value?: ParamSpec;                    // N の入力欄（範囲は balance.ts）
  hits?: ParamSpec;                     // M の入力欄
  option?: OptionSpec;                  // サーチの種類選択など
  targetRule: TargetRule;               // 下の「効果ごとの対象」表のどれか
  minRarity?: Rarity;                   // 蘇生・複製は epic、全体破壊・奪取は legend
  isDamage?: boolean;                   // 種類判定の「相手へのダメージ効果」
  isPlayerPermanent?: boolean;          // 種類判定の「永続効果」（筋力）
  allowsMods?: boolean;                 // 防御無視・吸収を付けられる
  basePoints(e: EffectInstance): number;        // balance.ts の数値で計算
  describe(e: EffectInstance, ctx: TextContext): string;  // 「毒1を与える」
  // Phase 2 で追加：resolve(...)  … 対戦での処理
}
```

キーワード（`KeywordDef`）とデメリット（`DrawbackDef`）も同じ形で、それぞれのポイント式とテキストを持ちます。

## 3. 計算と判定

- 効果1つ：`基礎ポイント ×（1 + 防御無視0.5 + 吸収0.5）× タイミング × 対象 × 条件` → 切り上げ（※質問2）
- デメリット1つ：`基礎ポイント × タイミング` → 切り捨て（※質問5）。維持費・寄生・裏切りは固定値
- 合計：`ステータス + キーワード + 効果 − コスト×10 − デメリット` ≦ レアリティ上限
- 呪い：デメリットが1つ以上 → 呪い。デメリット合計 ≧ レアリティ上限が必要
- 小数の誤差（例：3×0.7＝2.0999…）で切り上げ・切り捨てがずれないよう補正してから丸める
- 種類判定：仕様の順（モンスター → パワー・アタック → パワー → アタック → スキル）。細部は質問4

### タイミングの選択肢（カードの種類で絞る）

| モンスター | 倍率 | モンスター以外 | 倍率 |
|---|---|---|---|
| 召喚時 | 1.0 | 使用時 | 1.0 |
| 破壊されたとき | 0.8 | 自分のターン開始時（パワー化） | 3.0 |
| ダメージを受けたとき | 1.5 | 自分のターン終了時（パワー化） | 3.0 |
| 攻撃するたび | 2.0 | カードを使うたび（パワー化） | 4.0 |
| 自分のターン開始時 | 2.5 | | |
| 自分のターン終了時 | 2.5 | | |

### 効果ごとの対象（質問7：この割り当てでよいか）

| 区分 | 効果 | 選べる対象 |
|---|---|---|
| 相手のプレイヤーかモンスター | ダメージ、連撃、毒、やけど、凍結、弱体、脆弱、出血 | 選んだ1体 / ランダム1体 / 相手モンスター全体 / 相手全体 / 敵味方すべて |
| 相手モンスター | 処刑、封印、混乱 | 選んだ1体 / ランダム1体 / 相手モンスター全体 / 敵味方すべて（自分のモンスターも含む） |
| 相手モンスター1体限定（説明に「1体」とあるもの） | バウンス、弱化、奪取 | 選んだ1体 / ランダム1体 |
| 相手プレイヤー限定 | ドロー妨害、エナジー妨害、ノイズ投入、解除 | 相手プレイヤー（固定 ×1.0） |
| 自分のモンスター1体 | 修理、攻撃力アップ、守備力アップ | 選んだ1体 / ランダム1体 |
| 自分 | シールド、回復、無効化、浄化、反撃、筋力、気合、再生、ドロー、エナジー、貯金、軽減、サーチ、回収、保持、蘇生、複製 | 自分（固定 ×1.0） |
| 場全体 | 全体破壊 | 場のすべて（固定 ×1.0） |

「相手全体」は相手モンスター限定の効果では「相手モンスター全体」と同じになるので出しません。

## 4. 画面

画面下のタブで「カード」「デッキ」を切り替えます（Phase 2 で「対戦」を追加）。スマホは1列、PCは2列。

1. **カード一覧**：カード風の一覧。レアリティ・種類で絞り込み。新規作成／編集／複製／削除／サンプル追加／エクスポート／インポート
2. **カードエディター**
   - 入力：名前、アイコン（絵文字パレット）、レアリティ、コスト、「モンスターにする」スイッチ（オンでステータスとキーワード欄が出る）、効果（最大3行）、デメリット
   - 効果の1行：［効果▼］［N］［M］［タイミング▼］［対象▼］［条件▼］［防御無視□］［吸収□］［削除］。選択肢はカードの種類・レアリティ・効果に応じて絞る
   - 結果パネル（スマホでは画面下に固定、タップで展開）：合計／上限／残り、内訳、種類、呪い判定、違反理由（赤字）。違反があると保存ボタンは押せない
   - プレビュー：カード風の見た目。枠の色はコモン＝灰、レア＝青、エピック＝紫、レジェンド＝金。呪いは黒地に赤紫の枠と専用マーク（元のレアリティの色も残す）
3. **デッキ一覧**：デッキごとに枚数と合法かどうかを表示。新規／編集／削除／エクスポート／インポート
4. **デッキ構築**：カード一覧から＋／−で追加。30枚、レアリティごとの合計と同名枚数、呪いの枚数をリアルタイム表示。条件を満たさないと保存できない

## 5. 作業手順（コミット単位）

1. Vite + React + TypeScript + Vitest の土台
2. engine の骨組み：types / balance / options / registry / 索引の自動生成
3. 全効果・キーワード・デメリットの定義ファイル
4. ポイント計算・種類判定・検証・テキスト生成 ＋ 作成例4枚と違反ケースのテスト
5. デッキ検証とエクスポート/インポート ＋ テスト
6. UI の土台：画面切り替え、localStorage 保存、カード風プレビュー
7. カードエディター
8. カード一覧・デッキ一覧・デッキ構築・エクスポート/インポート画面
9. スマホ表示の調整、ビルド確認、ブラウザでの動作確認（スクリーンショット）、決定事項ログの更新

## 6. 質問（ゲーム性に関わるため確認させてください）

各質問に推奨案を書いています。「全部推奨でOK」でも、個別の指定でも大丈夫です。

1. **コストの範囲**：推奨は **0〜5**（balance.ts で変更可）。基本エナジー3、増加の上限+3で最大6なので、6以上はほぼ使えません。0は潤滑油的なカード用。
2. **防御無視・吸収の扱い**：推奨は
   - ダメージ・連撃に付けるオプションとして扱い、効果の数（3つ／コモン2つ）に**数えない**
   - 両方付けたら+100%（加算）
   - 基礎ポイントに掛けてから他の倍率を掛け、最後に1回切り上げ（例：防御無視の2ダメージ → 4×1.5＝6pt）
3. **自動で発動するタイミングの「選んだ1体」**：使用時・召喚時以外は選ぶ場面がないため、推奨は
   - 攻撃するたび → その攻撃の相手
   - ダメージを受けたとき → ダメージを与えてきた相手
   - 破壊されたとき・ターン開始/終了時・カードを使うたび → 相手プレイヤー（モンスター限定の効果ではこの選択肢を出さず、ランダム／全体のみ）
   - なお「毎ターン開始時／終了時」は**自分のターンだけ**で発動する前提です
4. **カードの種類判定の細部**：
   - (a) パワー用タイミングのダメージだけを持つカード（例：自分のターン開始時、相手に2ダメージ）。推奨は**パワー**（「相手へのダメージ効果」は使用時の効果だけで判定）。仕様の文面どおりならパワー・アタックになります
   - (b) パワー用タイミングのデメリット（例：毎ターン開始時に自傷）を持つモンスター以外のカード。推奨は**永続効果として数える**（パワーかパワー・アタックになる）。数えないとスキル扱いで捨て札に行き、デメリットが続かなくなるため
   - (c) 「相手へのダメージ効果」はダメージと連撃だけとし、処刑・毒・やけど等は含めない（推奨）
5. **デメリットの倍率**：推奨は**タイミング倍率だけ**掛ける（対象は常に自分で×1.0、条件は付けられない）。参考データ形 `drawbacks: [{ id, value, timing }]` と同じです
6. **カードの最低ライン**：推奨は、モンスターは攻撃力0以上（攻撃力0の壁も可）・体力1以上・守備力0〜3。モンスター以外は効果が1つ以上必要（デメリットだけのカードは不可）
7. **効果ごとの対象**：上の「効果ごとの対象」表の割り当てでよいか
8. **同じ効果の重複**：仕様で1回までとあるのはデメリットだけなので、推奨は**効果は同じものを複数付けてよい**（例：ダメージ3と、条件付きのダメージ5）。キーワードは各1回まで

## 7. 自分で決める実装判断（承認後に決定事項ログへ記録）

- カード名は1〜16文字。同名判定はカード名（前後の空白は無視）。コレクション内で同じ名前は保存不可、インポートで重なったら末尾に「(2)」を付ける
- 数値の入力範囲（N は 1〜30、連撃の回数 M は 2〜10 など）は balance.ts に置く。実際には上限ポイントで自然に制限される
- サーチで指定できる種類は、モンスター／アタック／スキル／パワー／パワー・アタック
- 条件「このターン3枚目以降に使う」は、使用時・召喚時・カードを使うたびのタイミングでだけ選べる
- 保存できないカード・デッキの編集内容は、下書きとして自動で残す（保存済みデータとは別）
- デッキはカードIDで参照する。デッキのエクスポートには使っているカードの定義も同梱する
- balance.ts の調整で既存のカードやデッキが違反になったら、一覧で警告を出す（自動修正はしない）
- ID は UUID。UI側で生成し、engine には渡すだけ
- 「1ターンに引けるのは10枚まで」「エナジー増加は+3まで」「カードを使うたびは1ターン3回まで」は対戦中の上限として Phase 2 で実装する

## 8. Phase 1 終了時の確認手順（予定）

`npm install` → `npm test` → `npm run dev` でブラウザを開き、サンプル4枚の作成、ルール違反時の赤字表示と保存不可、デッキ30枚の構築、エクスポート/インポートを確認していただきます。詳しい手順はフェーズの終わりにお渡しします。
