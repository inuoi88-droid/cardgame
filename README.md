# 自作カードバトル（仮）

全カードをプレイヤーが自作して戦う、1対1の対戦カードゲーム。仕様は [docs/SPEC.md](docs/SPEC.md)。

## 動かし方

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
