# CLAUDE.md — 開発ルールの要約

自作カードで戦う1対1オンライン対戦カードゲーム（タイトル未定）。仕様の原本は `docs/SPEC.md`。迷ったら必ず原本を読む。

## 進め方

- フェーズは Phase 1（カードエディター・デッキ構築）→ Phase 2（対戦エンジン・CPU戦）→ Phase 3（オンライン対戦）の順に進める。
- 各フェーズの最初に実装計画（ファイル構成、データ構造、作業手順）を示し、ユーザーの承認を得てから着手する。
- フェーズの終わりにはテストを通し、ユーザーが動作確認する手順を示して止まる。
- **ゲーム性に影響する判断（ルール、数値、効果の挙動）で仕様にないものは、推測で決めずに質問する。**
- 実装上の細かい判断は自分で決め、`docs/SPEC.md` 末尾の「決定事項ログ」に記録する。質問で確定した仕様もここに記録する。
- 作業のまとまりごとに git でコミットする。
- **バランスの数値は監査で決めた価格表（決定事項 #68。`docs/SPEC.md` 本文の数字は原案で、決定事項ログが優先）が元。** 価格やルールを変えたら `tests/*.test.ts`（倍率1）と `tests/*.real.test.ts`（実際の倍率）を通したうえで、CPU 同士のシミュレーション（勝率・試合の長さ・極端なデッキ・CPU のリーサル見逃し）で測り直す。シミュレーションは `scripts/sim/`（`npm run sim` でまとめ、`npm run sim:presets` でプリセット総当たり。使い方は `scripts/sim/README.md`。結果の `scripts/sim/out/` は git に入れない）。
- Phase 3 開始時に、Supabase プロジェクト（既存の ability-debate を共用するか新規か）と公開方法（GitHub Pages / Vercel / Googleサイト埋め込みの有無）をユーザーに確認する。

## 技術方針

- TypeScript + Vite + React。UI は日本語。スマホでも遊べるレイアウト。
- テストは Vitest。仕様の「作成例」4枚は必ずテストケースとして維持し、ルール違反で作れないケースもテストする。
- テストは2組。`tests/**/*.test.ts` は倍率1（元の仕様の数字。`tests/setup/base-scale.ts` で倍率を1に差し替え）、`tests/**/*.real.test.ts` は実際の倍率で動く。
- **ルールエンジン（`src/engine/`）は UI から完全に分離した純粋関数で書く。** React や DOM、localStorage、`Math.random`、`Date.now` を engine から参照しない。
- 対戦処理は `(state, action) => newState` の形。乱数はシード付き乱数を state に持たせる。同じエンジンを CPU 戦とサーバー（Edge Function）で使う。
- **バランスに関わる数値はすべて `src/engine/balance.ts` の1か所に置く。** コード内に数値を直接書かない（ポイント、倍率、上限、HP、エナジー、手札枚数、ターン数など）。
- **倍率（`src/engine/scale.ts`）。** 倍率は SCALE（20）の1つだけ（以前の インフレ倍率×予算倍率 は #67 で一本化）。balance.ts では、量（HP・ダメージ・毒・筋力など）とポイント（レアリティ上限・コストの差し引き・効果やキーワードの固定ポイント・枚数やターン数1あたりのポイント・デメリット）にまとめて `x()`（SCALE）を掛け、量1あたりのポイント（ダメージ1につき2pt など）と「数」（枚数・エナジー・ターン・回数）には掛けない。効果の数値の入力欄は、量なら `valueParam`、数なら `countParam` を使う。プリセット・作成例は倍率1の数字で書いて `fromBaseScale` で変換する。カードは量の倍率 `scale`（今は20）を持ち、違う倍率のカードは読み込み時に移行される（決定事項 #65〜#67）。
- **効果はレジストリ方式。** 定義データ（ポイント、使えるタイミング・対象・条件、テキスト生成）と処理関数を1ファイルにまとめて登録する。新しい効果は1ファイル追加すれば、エディター・ポイント計算・効果テキスト・対戦処理のすべてに反映される。
- カードの種類、呪い判定、ポイント、効果テキストは保存しない。毎回エンジンで計算する。

## ファイル構成（Phase 3 時点）

- `src/engine/` … ルールエンジン（純粋関数）
  - `balance.ts` バランス数値 / `types.ts` 保存する型 / `options.ts` タイミング・対象・条件
  - `define.ts` 定義の型 / `registry.ts` 定義の検索 / `registry.generated.ts` 自動生成の索引（手で編集しない）
  - `defs/effects|modifiers|keywords|drawbacks/*.ts` … 効果などを1ファイル1つで定義
  - `points.ts` ポイント計算 / `classify.ts` 種類・呪い判定 / `validate.ts` ルール検証 / `text.ts` 効果テキスト
  - `analyze.ts` カード解析の入口 / `deck.ts` デッキ検証 / `io.ts` 書き出し・取り込み / `editing.ts` エディター用の補助
  - `index.ts` 公開窓口（UI はここから読む）
  - `battle/` … 対戦エンジン。入口は `applyAction(state, action)`（apply.ts）。setup・turn・play・combat・damage・queue（解決キューと選択待ち）・runtime（効果ファイルに渡す道具）・legal（今できる行動）・view（相手の非公開情報を隠す）。主なルール（#69・#70）：HP 120（倍率1）、エナジーは自分のターン数で 3→4（4ターン目）→5（7ターン目）と成長（`battle.energySchedule`）、モンスターが相手モンスターを攻撃すると守備側がその攻撃力を返す「反撃」（combat。攻撃と同時に解決、`battle.retaliation`）、毒・再生は毎ターン半減、筋力・気合は1枚につき最初の1発だけ、ログの各行に構造化イベント `ev`（#71）
  - `ai/` … CPU。`Strategy` を差し替えられる。今は貪欲法（greedy.ts）と評価関数（evaluate.ts。重みは balance.ts ではなくここ）
- `src/online/` … オンライン対戦のサーバー処理（純粋関数。engine と同じ決まり：DOM・Date・Math.random を使わない）
  - `codes.ts` 部屋コード・名前 / `protocol.ts` 送受信の形と検証 / `room.ts` 部屋の作成・入室・行動・時間切れ・各席への見え方
  - `server.ts` 1回の送信の処理 / `http.ts` 受付（DB・時刻・乱数・ハッシュ・通知は外から渡す）/ `index.ts` 公開窓口
- `supabase/` … `migrations/`（専用スキーマ `cardgame` の rooms）と `functions/cardgame/`（Deno の Edge Function。`engine.js` は `npm run build:server` の生成物）
- `src/ui/` … React の画面。`store.ts` が localStorage を扱う。`battle/BattleBoard.tsx` が対戦画面の本体（CPU 戦とオンラインで共用）。`pages/Battle*` が CPU 戦、`pages/Online*` と `online/`（通信・Realtime・再接続）がオンライン対戦
- `src/samples.ts` … 作成例4枚（テストで固定）＋今の予算の見本4枚
- `src/presets.ts` … CPU 用プリセットデッキ5つ（毒・モンスター・呪い・守り・コンボ。どれも選ぶ効果のカードを含む。決定事項 #76）
- `tests/` … Vitest（作成例・違反ケース・デッキ・取り込み・レジストリ整合性・エンジンの純粋性・対戦・オンラインのサーバー処理）
- `scripts/gen-registry.mjs` … 定義ファイルの索引を生成

効果を追加するときは `src/engine/defs/effects/<id>.ts` を1ファイル作り（定義・テキスト・対戦での処理 `battle.resolve`）、基礎ポイントを `balance.ts` に書く。

対戦の状態は JSON にできる形を保つ。対戦ルールの確定事項は `docs/SPEC.md` の決定事項ログ #25 以降。

## よく使うコマンド（Node.js 22.12 以上）

```
npm install
npm run dev        # 開発サーバー（索引を自動生成してから起動）
npm test           # Vitest
npm run typecheck  # 型チェック（engine は DOM なしの設定でも確認）
npm run build      # 型チェック + ビルド
npm run build:single  # release/cardgame.html（ダブルクリックで開ける1ファイル版）を作り直す
npm run build:server  # supabase/functions/cardgame/engine.js（Edge Function 用の1ファイル）を作り直す
```

- フェーズの終わりや画面を変えたときは `npm run build:single` で `release/cardgame.html` を更新してコミットする（ユーザーはこのファイルで動作確認する）。
- `src/online` かエンジンを変えたら `npm run build:server` → コミット・push → Edge Function「cardgame」を再デプロイする（Supabase プロジェクト ability-debate `hefydmrqrdumpifbqlfp`、verify_jwt なし）。MCP でデプロイするときは、`index.ts` はそのまま、`engine.js` は push 済みコミットの raw.githubusercontent.com の URL を `export *` する1行にする（決定事項 #61）。
- Supabase は ability-debate と共用。触ってよいのは `cardgame` スキーマと Edge Function「cardgame」だけ。
