# 自作カードバトル（仮）

全カードをプレイヤーが自作して戦う、1対1の対戦カードゲーム。仕様は [docs/SPEC.md](docs/SPEC.md)。

## PCで遊ぶ（インストール不要）

1. [`release/cardgame.html`](release/cardgame.html) をダウンロードします（GitHub ではファイルを開いて「Download raw file」ボタン）。
2. ダウンロードしたファイルをダブルクリックすると、ブラウザ（Chrome / Edge / Firefox / Safari）で開きます。

- インターネットにつながっていなくても動きます。どこにも公開されません。
- 作ったカードとデッキは、そのブラウザの中に保存されます。別のブラウザや別のPCでは見えないので、移すときや控えを取るときは「書き出し」→「取り込み」を使ってください。
- 新しい版の `cardgame.html` に置き換えても、同じブラウザで開けば保存したカードはそのまま使えます。

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
