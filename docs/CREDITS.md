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

## 効果音

効果音（52種類。`src/ui/sound/sfx/*.mp3`、決定事項 #127）は、下の素材を切り出し・ピッチ・フィルタ・短い残響・重ね合わせ・音量の正規化をして作ったものです。

- ライセンス：**すべて [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)（パブリックドメイン相当）の素材だけ**を使っています。表記は必須ではありませんが、出典をここに残します。CC-BY など表記が要る素材は使っていません。
- 音ごとの材料（元のファイル名・ダウンロード元）と加工の手順は `src/ui/sound/sfx/manifest.json` にあります。
- Energy Drain（qubodup）はページに「2024-06-23: terms changed to CC0. Restrictions in the 7z file can be ignored.」とあり、CC0 で使っています（7z の中の license.txt は以前の CC-BY-SA 3.0）。
- Spell sounds（HaelDB）は CC0 と OGA-BY 3.0 の多重ライセンスで、CC0 を選んでいます。

使った素材（24 パック。かっこの中は作者とライセンス、後ろはその素材を使った音）：

- [100 CC0 SFX](https://opengameart.org/content/100-cc0-sfx)（rubberduck・CC0 1.0）：`field`
- [75 CC0 breaking / falling / hit sfx](https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx)（rubberduck・CC0 1.0）：`hit.small`・`spell.earth`
- [80 CC0 creture SFX #2](https://opengameart.org/content/80-cc0-creture-sfx-2)（rubberduck・CC0 1.0）：`summon`
- [80 CC0 RPG SFX](https://opengameart.org/content/80-cc0-rpg-sfx)（rubberduck・CC0 1.0）：`ui.confirm`・`card.play`・`energy.gain`・`target.lock`・`destroy`・`summon`・`spell.arcane`・`status.apply`・`bind`・`token.create`
- [Card Game sounds (Cockatrice)](https://opengameart.org/content/card-game-sounds)（HaelDB・CC0 1.0）：`ui.error`・`card.draw`・`card.discard`
- [Cave In](https://opengameart.org/content/cave-in)（StarNinjas・CC0 1.0）：`destroy`
- [Energy Drain](https://opengameart.org/content/energy-drain)（qubodup・CC0 1.0）：`debuff`
- [Fire Staff Sound Effects](https://opengameart.org/content/fire-staff-sound-effects)（LEGIT Audio・CC0 1.0）：`spell.fire`
- [Heartbeat sounds](https://opengameart.org/content/heartbeat-sounds)（bart・CC0 1.0）：`spell.blood`
- [Ice breaking/shattering](https://opengameart.org/content/ice-breakingshattering)（IgnasD・CC0 1.0）：`ward.break`
- [Ice spells](https://opengameart.org/content/ice-spells)（bart・CC0 1.0）：`spell.ice`
- [Jump Landing](https://opengameart.org/content/jump-landing)（Macro・CC0 1.0）：`summon`
- [Kenney – Casino Audio](https://kenney.nl/assets/casino-audio)（Kenney (kenney.nl)・CC0 1.0）：`card.shuffle`・`card.hover`・`card.play`・`card.play.enemy`・`card.mill`・`draft.pick`・`mulligan`
- [Kenney – Impact Sounds](https://kenney.nl/assets/impact-sounds)（Kenney (kenney.nl)・CC0 1.0）：`card.play`・`turn.mine`・`turn.enemy`・`hit.heavy`・`hit.player`・`destroy`・`summon`・`spell.blood`・`spell.earth`・`victory`・`defeat`
- [Kenney – RPG Audio](https://kenney.nl/assets/rpg-audio)（Kenney (kenney.nl)・CC0 1.0）：`ui.click`・`ui.cancel`・`ui.tab`・`turn.end`・`target.lock`
- [Kenney – Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds)（Kenney (kenney.nl)・CC0 1.0）：`card.play.enemy`・`turn.mine`・`turn.enemy`・`field`・`hit.heavy`・`spell.blood`・`buff`・`defeat`
- [Kenney – UI Audio](https://kenney.nl/assets/ui-audio)（Kenney (kenney.nl)・CC0 1.0）：`ui.confirm`・`ui.toggle`
- [Medieval sound effects – Weapon impacts](https://opengameart.org/content/medieval-sound-effects-weapon-impacts)（MedicineStorm（Still North Media）・CC0 1.0）：`hit.medium`・`retaliate`・`shield.block`
- [Misc SFX Pack](https://opengameart.org/content/misc-sfx-pack)（Timopy・CC0 1.0）：`spell.dark`・`spell.holy`・`keyword.grant`
- [Mystery Sting](https://opengameart.org/content/mystery-sting)（railkill・CC0 1.0）：`draw-game`
- [RPG Sound Pack](https://opengameart.org/content/rpg-sound-pack)（artisticdude・CC0 1.0）：`spell.poison`・`shield.gain`・`buff`
- [Spell sounds](https://opengameart.org/content/spell-sounds)（HaelDB・CC0 1.0（OGA-BY 3.0 との多重ライセンスから CC0 を選択））：`heal`
- [Swishes Sound Pack](https://opengameart.org/content/swishes-sound-pack)（artisticdude・CC0 1.0）：`card.fly`・`attack.swing`
- [UI Sound Effects (Button Clicks, User Feedback, Notifications)](https://opengameart.org/content/ui-sound-effects-button-clicks-user-feedback-notifications)（Robin Lamb・CC0 1.0）：`invite.notify`・`victory`

ゲームの中では「クレジット」の画面（`#/credits`）にも素材と作者を載せています。

## BGM

BGM（7曲。`public/bgm/1/*.mp3`、決定事項 #128）は [OpenGameArt.org](https://opengameart.org/) の曲です。ライセンスはどれもページの License(s) 欄で確かめました。

- 変更点（どの曲も）：頭と終わりの無音を削り、統合ラウドネス -18 LUFS 前後に音量をそろえ、MP3（112kbps）にしました。くり返す曲は前後に1秒の写しを付け、The Old Tower Inn は継ぎ目の段差をならしています。手順と元のファイルは `src/ui/sound/bgm.manifest.json` にあります。
- **CC BY 3.0 の曲（表記が必要）**
  - "Dark Descent" by Matthew Pablo（<http://www.matthewpablo.com>）— [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) — 出典：<https://opengameart.org/content/dark-descent> — 上の変更をしています（対戦）
- CC0 1.0 の曲（表記は必須ではありませんが、出典を残します）
  - [Medieval: The Old Tower Inn](https://opengameart.org/content/medieval-the-old-tower-inn)（RandomMind）：ロビー・メニュー（作者のループ用の版）
  - [Medieval: Exploration](https://opengameart.org/content/medieval-exploration)（RandomMind）：カード・デッキ作り
  - [Medieval: The Bard's Tale](https://opengameart.org/content/medieval-the-bards-tale)（RandomMind）：ドラフト（作者のループ用の版）
  - [Medieval: Battle](https://opengameart.org/content/medieval-battle)（RandomMind）：対戦
  - [Epic Boss Battle](https://opengameart.org/content/boss-battle-music)（Juhani Junkala／SubspaceAudio）：対戦（継ぎ目なしループの版）
  - [The Final Battle](https://opengameart.org/content/the-final-battle)（skrjablin）：対戦

## 画面の記号

メニュー・ボタン・帯の記号（`src/ui/icons/uiIcons.json` の約50個）も game-icons.net のアイコン（CC BY 3.0）を単色で使っています（`UiIcon`）。

## 絵文字

絵文字のアイコンは、お使いの端末のフォントで表示しています。
