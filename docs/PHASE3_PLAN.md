# Phase 3 実装計画：オンライン対戦（承認待ち）

## 0. 調べた現状（2026-10-17）

- Supabase：組織は無料プラン。プロジェクトは「ability-debate」と「知識体系化」の2つ（どちらも稼働中）。
  - 無料プランで同時に動かせるのは2プロジェクトまで。新規に作るには、どちらかを一時停止するか Pro（月$25〜）が必要。
  - ability-debate の public スキーマには `matches`・`cards`・`heartbeat` テーブルがあり、名前がぶつかる。共用するなら専用スキーマ `cardgame` に分ける。Edge Function はまだ0個。
- Vercel：個人アカウントに5プロジェクト（ability-debate など）。
- GitHub：`inuoi88-droid/cardgame` は公開リポジトリ（GitHub Pages も無料で使える）。

## 1. 仕組み

```
ブラウザA ──(HTTPS)──▶ Edge Function「cardgame」 ──▶ Postgres（cardgame.rooms）
ブラウザB ──(HTTPS)──▶        │  Phase 2 と同じエンジンで検証・適用
     ▲                          │
     └──(Realtime)── 「部屋の版が上がった」の通知だけ（中身なし）
```

- 完全な対戦状態はサーバー（DB）だけが持つ。ブラウザからは DB を直接読めない（RLS で全拒否。Edge Function だけが読み書きする）。
- 各プレイヤーには `viewFor()` で相手の手札・両者の山札の中身・乱数・相手専用ログを隠した状態だけを返す。
- Realtime で流すのは「版番号が上がった」という通知だけ。通知を受けたら、自分の合言葉（トークン）付きで Edge Function に最新の状態を取りに行く。通知を盗み見ても中身は分からない。
- 行動は Edge Function に送り、サーバーで `validateAction` → `applyAction`。手番・選択の持ち主・版番号（同時送信の衝突）を確認してから保存する。
- 対戦開始時に、両者のデッキとカードをサーバーで `analyzeDeck` / `analyzeCard` によって検証する（ルール違反なら入室できない）。
- ログインは不要。部屋を作る・入るときにサーバーがランダムな合言葉（トークン）を発行し、ブラウザに保存する。サーバーにはトークンのハッシュだけを保存する。

## 2. ファイル構成

```
supabase/
├─ migrations/<日時>_cardgame_rooms.sql   … スキーマ cardgame と rooms テーブル（RLS 有効・ポリシーなし）
└─ functions/cardgame/
    ├─ index.ts                          … Edge Function（Deno）：受付・DB 読み書き・Realtime 通知
    └─ engine.js                         … src/ 以下を1ファイルにまとめたもの（npm run build:server で生成）
src/online/                              … サーバーの中身（純粋関数。DB や時刻は外から渡す → Vitest で試せる）
├─ protocol.ts                           … 送受信の形
├─ room.ts                               … 部屋の作成・入室・状態取得・行動・時間切れ処理
└─ codes.ts                              … 部屋コードとトークン
src/ui/
├─ battle/BattleBoard.tsx                … 対戦画面の本体（CPU 戦とオンライン対戦で共用するよう今の画面から切り出す）
├─ online/client.ts                      … Edge Function 呼び出しと Realtime 購読、再接続
├─ online/config.ts                      … Supabase の URL と公開キー（公開してよい値）
├─ pages/OnlineLobbyPage.tsx             … 部屋を作る／コードで入る／相手待ち
└─ pages/OnlineBattlePage.tsx            … オンライン対戦（残り時間、相手の接続状態）
tests/online/                            … 2人の対戦をサーバーの中身だけで再現するテスト
```

## 3. データ構造

```sql
create schema cardgame;
create table cardgame.rooms (
  code         text primary key,          -- 部屋コード（6文字）
  status       text not null,             -- waiting | playing | ended
  version      integer not null,          -- 更新のたびに+1（同時送信の検出、通知に使う）
  state        jsonb,                     -- 完全な対戦状態（サーバーだけが読む）
  seats        jsonb not null,            -- [{ name, tokenHash, lastSeen, timeouts }, …]
  host_deck    jsonb,                     -- 相手が入るまで預かる作成者のデッキ
  deadline     timestamptz,               -- 今の手番（またはマリガン）の締め切り
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table cardgame.rooms enable row level security;   -- ポリシーなし＝ブラウザからは読めない
```

```ts
// ブラウザ → Edge Function
type Request =
  | { op: 'create'; name: string; deck: Deck; cards: CardDef[] }
  | { op: 'join'; code: string; name: string; deck: Deck; cards: CardDef[] }
  | { op: 'state'; code: string; token: string }                       // 定期的に送り、接続中の目印にもする
  | { op: 'action'; code: string; token: string; version: number; action: Action };

// Edge Function → ブラウザ
type Response =
  | { ok: true; code: string; seat: 0 | 1; token?: string; status: 'waiting' | 'playing' | 'ended';
      version: number; view: GameState | null; deadline: string | null;
      opponent: { name: string; connected: boolean } | null }
  | { ok: false; error: string };
```

## 4. 時間切れと再接続（数値は balance.ts）

- 1ターンの制限時間 90 秒（マリガンも 90 秒）。締め切りは手番が変わったときに設定する。
- 時間切れの処理はサーバーが行う。どちらかのブラウザが状態を取りに来たとき（数秒おきに来る）に締め切りを過ぎていれば、時間切れの処理をしてから返す（質問4）。
- 再接続：部屋コードとトークンはブラウザに保存する。同じブラウザで開き直すと自動で部屋に戻る。
- 相手の接続状態：最後の通信から一定時間（30秒）以上たっていれば「切断中」と表示する。
- 部屋は最後の操作から24時間で削除する（新しい部屋を作るときに古いものを片付ける）。

## 5. 作業手順（コミット単位）

1. 対戦画面を CPU 戦・オンライン対戦で共用できる部品に切り出す（見た目と動きは変えない）
2. サーバーの中身（src/online）とテスト：作成・入室・デッキ検証・非公開情報・手番と持ち主の確認・同時送信・時間切れ・再接続
3. Supabase：マイグレーション適用、Edge Function をデプロイ、curl で動作確認
4. 画面：ロビー（作成・入室・相手待ち）、オンライン対戦（残り時間、相手の接続状態、再接続）
5. 公開の設定（質問2）と `release/cardgame.html` の更新（1ファイル版からもオンライン対戦できるようにする）
6. 通し確認：2つのブラウザで実際にオンライン対戦を最後まで行い、通信の中に相手の手札や山札が含まれないことを確かめる

## 6. 質問

1. **Supabase**：推奨は **ability-debate を共用**（専用スキーマ `cardgame` に分け、既存の matches・cards には触れない）。新規にする場合は、無料枠2つが埋まっているので「知識体系化」などを一時停止するか、Pro（月$25〜）が必要です。
2. **公開方法**：推奨は **Vercel**（すでにお使いで、push すると自動で更新される）。GitHub Pages（このリポジトリは公開なので無料）でもできます。どちらの場合も、1ファイル版からオンライン対戦できるようにします。
3. **Google サイトへの埋め込み**：推奨は**しない**（Google サイトにはリンクを置く）。埋め込むと、埋め込んだページの中ではブラウザの保存場所が別扱いになり、作ったカードやデッキが見えません。Safari では保存自体がブロックされることがあります。
4. **時間切れ（ゲーム性）**：推奨は、90 秒たったら**自動でターン終了**（選択の途中なら自動で選ぶ、マリガン中なら今の手札で開始）。**3回連続で時間切れになったら負け**（放置対策）。
5. **切断**：推奨は、同じブラウザで開き直せば自動で再接続。切断中も時間は進み、4の時間切れルールで進行する（切断だけを理由に負けにはしない）。

## 7. 自分で決める実装判断（承認後に決定事項ログへ記録）

- 部屋コードは紛らわしい文字（0/O、1/I/L）を除いた6文字。入室時は大文字・小文字を区別しない。
- プレイヤー名は部屋を作る・入るときに入力（最大12文字、空なら「プレイヤー」）。
- 先攻・後攻は CPU 戦と同じくランダム（シードはサーバーで暗号学的乱数から作る）。
- オンライン対戦でもプリセットデッキを使える。
- Supabase の URL と公開キー（ブラウザに埋め込む前提の値）はリポジトリに含める。DB を読み書きする強い鍵は Edge Function の中だけで使う。
- Edge Function は Supabase 側の JWT 検証を使わず、上のトークンで本人確認する（ログイン不要にするため）。
- 対戦が終わった部屋は「もう一度」に対応しない（必要なら新しい部屋を作る）。
