# 自作カードバトル（仮）

全カードをプレイヤーが自作して戦う、1対1の対戦カードゲーム。仕様は [docs/SPEC.md](docs/SPEC.md)。

## PCで遊ぶ（インストール不要）

1. [`release/cardgame.html`](release/cardgame.html) をダウンロードします（GitHub ではファイルを開いて「Download raw file」ボタン）。
2. ダウンロードしたファイルをダブルクリックすると、ブラウザ（Chrome / Edge / Firefox / Safari）で開きます。

- カード作りと CPU 戦は、インターネットにつながっていなくても動きます。作ったカードはどこにも公開されません（オンライン対戦で使ったデッキだけ、対戦のためにサーバーへ送ります）。
- 作ったカードとデッキは、そのブラウザの中に保存されます。別のブラウザや別のPCでは見えないので、移すときや控えを取るときは「書き出し」→「取り込み」を使ってください。
- 新しい版の `cardgame.html` に置き換えても、同じブラウザで開けば保存したカードはそのまま使えます。
- 「🤖 CPU戦」から CPU と対戦できます（自分のデッキか、プリセットデッキを選べます）。対戦の途中で閉じても、次に開いたとき続きから再開できます。
- 「🌐 オンライン」から、ほかの人と対戦できます（インターネットが必要）。

## オンライン対戦の遊び方

1. 「🌐 オンライン」で名前とデッキを選び、1人が「部屋を作る」を押します。6文字の部屋コードが出ます。
2. もう1人は同じ画面で「コードで入る」にそのコードを入れて「入る」を押します。対戦が始まります。
3. 1ターンの制限時間は90秒です。時間切れになると自動でターンが終わり、3回続けて時間切れになると負けです。
4. 途中で閉じても、同じブラウザで開き直せば続きに戻れます（その間も時間は進みます）。

サーバーは Supabase（Edge Function「cardgame」と、専用スキーマ `cardgame` の表）です。勝敗の判定はすべてサーバーで行い、相手の手札や山札の中身はブラウザに送りません。

## 開発用の動かし方

Node.js 22.12 以上が必要です。

```
npm install
npm run dev
```

表示された URL（例：http://localhost:5173/）をブラウザで開きます。スマホで確認するときは `npm run dev -- --host` で起動し、同じ Wi-Fi のスマホから表示されたネットワーク側の URL を開きます。

## テスト

```
npm test
```

## 配布用ファイルの作り直し

```
npm run build:single
```

`release/cardgame.html`（JS と CSS を埋め込んだ HTML 1ファイル）が作り直されます。

## サーバー（オンライン対戦）の更新

1. `npm run build:server` で `supabase/functions/cardgame/engine.js`（`src/online` とエンジンをまとめた1ファイル）を作り直し、コミットして push します。
2. Edge Function「cardgame」をデプロイし直します（JWT の検証はオフ。本人確認は独自のトークンで行います）。
   Supabase CLI なら `supabase functions deploy cardgame --no-verify-jwt --project-ref hefydmrqrdumpifbqlfp`。
3. 表を変えるときは `supabase/migrations/` に SQL を足して適用します（ability-debate と共用のため、`cardgame` スキーマの外には触れません）。

公開は Vercel（`vercel.json`）。push すると自動で更新されます。
