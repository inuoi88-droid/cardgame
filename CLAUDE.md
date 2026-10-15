# CLAUDE.md — 開発ルールの要約

自作カードで戦う1対1オンライン対戦カードゲーム（タイトル未定）。仕様の原本は `docs/SPEC.md`。迷ったら必ず原本を読む。

## 進め方

- フェーズは Phase 1（カードエディター・デッキ構築）→ Phase 2（対戦エンジン・CPU戦）→ Phase 3（オンライン対戦）の順に進める。
- 各フェーズの最初に実装計画（ファイル構成、データ構造、作業手順）を示し、ユーザーの承認を得てから着手する。
- フェーズの終わりにはテストを通し、ユーザーが動作確認する手順を示して止まる。
- **ゲーム性に影響する判断（ルール、数値、効果の挙動）で仕様にないものは、推測で決めずに質問する。**
- 実装上の細かい判断は自分で決め、`docs/SPEC.md` 末尾の「決定事項ログ」に記録する。質問で確定した仕様もここに記録する。
- 作業のまとまりごとに git でコミットする。
- Phase 3 開始時に、Supabase プロジェクト（既存の ability-debate を共用するか新規か）と公開方法（GitHub Pages / Vercel / Googleサイト埋め込みの有無）をユーザーに確認する。

## 技術方針

- TypeScript + Vite + React。UI は日本語。スマホでも遊べるレイアウト。
- テストは Vitest。仕様の「作成例」4枚は必ずテストケースとして維持し、ルール違反で作れないケースもテストする。
- **ルールエンジン（`src/engine/`）は UI から完全に分離した純粋関数で書く。** React や DOM、localStorage、`Math.random`、`Date.now` を engine から参照しない。
- 対戦処理は `(state, action) => newState` の形。乱数はシード付き乱数を state に持たせる。同じエンジンを CPU 戦とサーバー（Edge Function）で使う。
- **バランスに関わる数値はすべて `src/engine/balance.ts` の1か所に置く。** コード内に数値を直接書かない（ポイント、倍率、上限、HP、エナジー、手札枚数、ターン数など）。
- **効果はレジストリ方式。** 定義データ（ポイント、使えるタイミング・対象・条件、テキスト生成）と処理関数を1ファイルにまとめて登録する。新しい効果は1ファイル追加すれば、エディター・ポイント計算・効果テキスト・対戦処理のすべてに反映される。
- カードの種類、呪い判定、ポイント、効果テキストは保存しない。毎回エンジンで計算する。

## ファイル構成（Phase 1 時点）

- `src/engine/` … ルールエンジン（純粋関数）
  - `balance.ts` バランス数値 / `types.ts` 保存する型 / `options.ts` タイミング・対象・条件
  - `define.ts` 定義の型 / `registry.ts` 定義の検索 / `registry.generated.ts` 自動生成の索引（手で編集しない）
  - `defs/effects|modifiers|keywords|drawbacks/*.ts` … 効果などを1ファイル1つで定義
  - `points.ts` ポイント計算 / `classify.ts` 種類・呪い判定 / `validate.ts` ルール検証 / `text.ts` 効果テキスト
  - `analyze.ts` カード解析の入口 / `deck.ts` デッキ検証 / `io.ts` 書き出し・取り込み / `editing.ts` エディター用の補助
  - `index.ts` 公開窓口（UI はここから読む）
- `src/ui/` … React の画面。`store.ts` が localStorage を扱う
- `src/samples.ts` … 作成例4枚
- `tests/` … Vitest（作成例・違反ケース・デッキ・取り込み・レジストリ整合性・エンジンの純粋性）
- `scripts/gen-registry.mjs` … 定義ファイルの索引を生成

効果を追加するときは `src/engine/defs/effects/<id>.ts` を1ファイル作り、基礎ポイントを `balance.ts` に書く。

## よく使うコマンド（Node.js 22.12 以上）

```
npm install
npm run dev        # 開発サーバー（索引を自動生成してから起動）
npm test           # Vitest
npm run typecheck  # 型チェック（engine は DOM なしの設定でも確認）
npm run build      # 型チェック + ビルド
```
