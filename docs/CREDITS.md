# クレジット

## カードの絵（アイコン）

カードの絵には [game-icons.net](https://game-icons.net) のアイコンを使っています。

- 作者：**Lorc**・**Delapouite** ほか、game-icons.net の貢献者のみなさん（一覧：<https://game-icons.net/about.html#authors>）
- ライセンス：[クリエイティブ・コモンズ 表示 3.0（CC BY 3.0）](https://creativecommons.org/licenses/by/3.0/)
- 変更点：白い絵をレアリティの色のグラデーションで塗り、円い台座と種類の色の縁取りを付けて表示しています（色と見た目を変更）。
- 取り込み元：Iconify の [`@iconify-json/game-icons`](https://www.npmjs.com/package/@iconify-json/game-icons)（`scripts/gen-icons.mjs` が `src/ui/icons/generated/` と `public/icons/` を作ります）
- 日本語での検索に使う訳語（`scripts/icons/ja.json`）はこのゲームで付けたものです。

ゲームの中では「クレジット」の画面（`#/credits`）に同じ内容を表示しています。

## 見出しの書体

見出し・主ボタン・ダイアログの見出しの明朝は **しっぽり明朝 B1**（Shippori Mincho B1、FONTDASU）の ExtraBold です。

- ライセンス：[SIL Open Font License 1.1](https://openfontlicense.org)
- 取り込み元：[google/fonts](https://github.com/google/fonts/tree/main/ofl/shipporiminchob1) の `ShipporiMinchoB1-ExtraBold.ttf`
- 変更点：画面に使う文字（`src/ui` の固定の文字＋かな・英数字・記号）だけを切り出して woff2 にしたもの（`scripts/gen-display-font.mjs` → `src/ui/theme/fonts/ui-mincho.woff2`）。CSS では `UI Mincho` の名前で使っています。

## 画面の記号

メニュー・ボタン・帯の記号（`src/ui/icons/uiIcons.json` の約50個）も game-icons.net のアイコン（CC BY 3.0）を単色で使っています（`UiIcon`）。

## 絵文字

絵文字のアイコンは、お使いの端末のフォントで表示しています。
