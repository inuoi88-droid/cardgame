# フレンド機能・公開の部屋・相手のデッキ（サーバーの約束）

決定事項 #121。画面（UI）を作る人のための、サーバーとの送受信の説明。中身は `src/online/social/`（純粋関数）、
型は `src/online/social/protocol.ts`（`SocialRequest`・`SocialReplies`・`SocialResponse`）と `src/online/protocol.ts`（部屋の `OnlineRequest`・`RoomView`）。

## 考え方

- **ログインもパスワードも無い。** 初めて使う端末で `register` を送ると「プレイヤー」ができ、**秘密の鍵 `secret`（16進64文字）**が1回だけ返る。
  画面はこれを端末に保存し、フレンドまわりの送信にはいつも付ける。サーバーは鍵の SHA-256 だけを持つ。
- **引き継ぎコード＝`secret` そのもの。** 別の端末に移すときは、画面が鍵を見せて（写す・コピー・QR など）、移った先で保存する。
  漏れたかもしれないときは `rotateSecret` で作り直す（前の鍵は使えなくなる）。
- 他人を指す識別子は**フレンドコード**（紛らわしくない8文字。部屋コードと同じ文字。表示は `ABCD-EFGH` のように区切ってよい。
  サーバーは大文字・小文字・空白・ハイフンをならす）。内部の ID・鍵・`inboxId`・招待リンクの鍵が他人に返ることは無い。
- 名前は12文字まで（部屋の名前と同じならし方）。`hello` の `name` で変えられる。部屋の席の名前は部屋ごとに送る名前のまま。
- 部屋の合言葉（部屋コード）の仕組みは今までどおり。`secret` を付けない古い画面もそのまま遊べる。

## 送り方

部屋の操作と同じ受付（Edge Function「cardgame」・手元のサーバー）に POST する。`op` で見分ける。
返事はどれも `{ ok: true, op, ... }` か `{ ok: false, error, reason? }`（`error` は画面にそのまま出せる日本語）。
形が違う送信は HTTP 400、ほかの断りは 200 で `ok: false`。

| reason | 意味・画面の動き |
| --- | --- |
| `auth` | 鍵が違う（端末の鍵が無効）。**勝手に作り直さず**、引き継ぎコードの入力か、新しく始めるかを選んでもらう |
| `notFound` | フレンドコード・申請・招待・部屋・リンクが無い |
| `notFriend` | フレンドではない |
| `limit` | 上限（下の表） |
| `expired` | 招待の期限切れ・部屋がもう相手待ちでない |
| `invalid` | できない操作（自分あて・自分の部屋でない など） |
| `unsupported` | フレンド機能の無いサーバー（古い Edge Function・`social` を渡していない受付） |

## 操作

`secret` は省略して書く（`register`・`list` 以外はすべて要る）。

| op | 送る | 返る（`ok`・`op` のほか） |
| --- | --- | --- |
| `register` | `name?` | `secret`・`friendCode`・`inboxId`・`name` |
| `hello` | `name?` | 下の **snapshot**。生存の合図も兼ねる（20〜30秒おき・画面を開いたとき・通知を受けたとき） |
| `rotateSecret` | — | `secret`（新しい鍵） |
| `list` | （鍵なし） | `rooms: ListedRoomView[]`・`serverNow` |
| `friendRequest` | `friendCode` | snapshot＋`result`（`requested`／`friends`＝相手の申請が届いていたので即フレンド／`already`） |
| `friendRequestRoom` | `code`（部屋コード） | 同上。その部屋に自分が座っていて、相手の席もプレイヤーに結び付いているとき（対戦中・決着後） |
| `friendRespond` | `friendCode`・`accept` | snapshot。断るのは何度でもよい。もうフレンドなら何もしない |
| `friendRemove` | `friendCode` | snapshot。フレンドをやめる・送った申請を取り消す（2人の間の申請はどちら向きも消える） |
| `inviteLink` | `rotate?` | `friendCode`・`token`。`rotate: true` で作り直し、前のリンクを無効にする |
| `friendByLink` | `friendCode`・`token` | snapshot＋`friend: { friendCode, name }`。**すぐフレンドになる**（リンクを渡した時点で持ち主は同意している）。画面は開いたときに「○○さんとフレンドになりますか」と確かめてから送る |
| `invite` | `friendCode`・`roomCode` | snapshot＋`inviteId`。自分が作った（席0）相手待ちの部屋に、フレンドだけを招待。同じ部屋・同じ相手は1つ（期限を延ばして知らせ直す） |
| `inviteRespond` | `inviteId`・`accept` | snapshot（＋受けたら `room: { code, mode }`）。画面はそのまま `join`（ドラフトの部屋はデッキなし・`features: ['draft']`）。受けたのに入る前に閉じたら、もう一度受ければ部屋が返る |
| `shareDeck` | `deck`・`cards` | snapshot。「フレンドに公開」。ルールの確かめ（部屋に出すデッキと同じ `checkDeck`）を通ったものだけ。同じ `deck.id` は置き換え |
| `unshareDeck` | `deckId` | snapshot（何度でもよい） |
| `friendDecks` | `friendCode`・`deckId?` | `friend: { friendCode, name }`・`decks: SharedDeckView[]`（中身あり・新しい順）。フレンドか自分だけ |

招待リンクの URL の形は画面が決める。画面（決定事項 #123）は `https://…/#/friend/<friendCode>/<token>/<名前>`（名前は確かめの画面の表示用で、サーバーには送らない。LINE などで送る）。

### snapshot（`SocialSnapshot`）

```ts
{
  me: { name, friendCode, inboxId },
  friends: { friendCode, name, presence: 'online' | 'battle' | 'offline', lastSeen, since,
             record: { win, loss, draw }, decks /* 公開デッキの数 */ }[],   // 対戦中 → オンライン → オフライン、名前順
  incoming: { friendCode, name, at }[],    // 届いた申請（新しい順）
  outgoing: { friendCode, name, at }[],    // 送った申請
  invites: { id, from: { friendCode, name }, roomCode, mode, rules?, at, expiresAt }[],      // 届いている有効な招待
  sentInvites: { id, to: { friendCode, name }, roomCode, mode,
                 status: 'pending' | 'accepted' | 'declined' | 'expired', at, expiresAt }[], // 作って10分の間
  sharedDecks: { deckId, name, count, updatedAt }[],   // 自分の公開デッキ
  serverNow,
}
```

- **在室**：`battle`＝その人の席がドラフト中か対戦中の部屋にあり、その部屋に60秒以内に通信している。`online`＝60秒以内に通信あり
  （`hello` か部屋の送信）。ほかは `offline`。決着すると相手の操作で決着しても、その場で `battle` ではなくなる。
- **成績**：両方の席がプレイヤーに結び付いた部屋で、決着ごとに1戦（再戦も1戦ずつ。ドラフトの部屋も）。フレンドになる前の対戦も数える。
- 届いた招待は、送った人がフレンドで、期限内で、部屋がまだ送った人の相手待ちのものだけ。送った招待は期限切れ・部屋が始まったら `expired`。

### 公開の部屋（`ListedRoomView`）

```ts
{ code, hostName, mode: 'deck' | 'draft', rules?, leader, since /* 部屋ができた時刻 */, hostSeen }
```

`create` に `listed: true` を付けた部屋のうち、相手待ちで、作成者が30秒以内に状態を取りに来ている部屋だけを新しい順に30件まで。
入るのは普通の `join`（コードの入力の代わりに一覧から選ぶだけ）。入られると一覧から消える。ドラフトの部屋も出せる。

## 部屋の送受信の追加

- `create`・`join` に `secret?`：送ると席がそのプレイヤーに結び付く（成績・在室・`friendRequestRoom`）。鍵が無効なら
  `{ ok: false, reason: 'player' }`。自分が作った部屋に同じプレイヤーでは入れない。
- `create` に `listed?: boolean`（公開）。
- `RoomView` に
  - `opponentDeck?: { name, deck, cards }`：**決着した（`status === 'ended'`）ときだけ**、相手のデッキ（自分のデッキの部屋は相手が出したデッキ、
    ドラフトの部屋は相手がドラフトで作ったデッキ。`name` は `deck.name`）。待機中・ドラフト中・対戦中は入らない。
    再戦が始まると消えるので、画面は決着したときに控える（`cardgame.v1.opponents`）。
  - `opponentFriendCode?`：自分と相手の両方の席が結び付いているときだけ（結果の画面の「フレンド申請」、対戦した相手の記録）。
  - `listed?: true`：公開の部屋。

## 通知（Realtime）

本人あてのチャンネル `cardgame:inbox:<inboxId>`、event `social`、payload `{ kind }`（`friendRequest`・`friendAdded`・`invite`・`inviteAnswered`）。
中身は送らないので、受け取ったら `hello` で取り直す（部屋の `cardgame:<code>` の `update` と同じ考え方）。
`inboxId` は本人にだけ返る乱数。通知が届かなくても、`hello` を定期的に送っていれば遅れて気づく。手元のサーバーには通知が無い。

## 上限と時間（`src/online/social/types.ts`）

| もの | 値 |
| --- | --- |
| フレンド | 100人（相手も） |
| 答えを待っている申請 | 送った50件・受け取った50件 |
| 公開デッキ | 1人20個（置き換えは数えない） |
| 答えを待っている招待 | 20件 |
| 招待の期限 | 10分（部屋が相手待ちでなくなればその前でも）。1日より古いものは消す |
| オンラインとみなす | 最後の通信から60秒 |
| 部屋の送信で「見かけた」を書く間隔 | 20秒（部屋の状態が変わったときは毎回） |
| 公開の部屋 | 作成者の通信が30秒以内・30件まで |

上限の確かめと書き込みの間の競合（2つの送信がほぼ同時）は、少人数なので許している。

## 仕組み（サーバー）

- `src/online/social/protocol.ts`：形と検証。`handlers.ts`：操作（`handleSocial`）。`rooms.ts`：部屋とのつなぎ目（決着の記録
  `matchRecordOf`・「見かけた」`presenceUpdates`・一覧の見え方）。`types.ts`：保存する形・上限・保存場所の約束 `SocialStore`。
  `memoryStore.ts`：メモリの保存場所（部屋＋フレンド。手元のサーバーとテスト）。
- `src/online/http.ts`：`HttpDeps.social`（`SocialStore`）・`notifyInbox` を足した。`serve()` は純粋なまま、部屋の送信の前後の部屋から
  決着の記録と「見かけた」を作り、部屋を書いたあとに保存する（失敗しても対戦は止めない）。
- Edge Function：`supabase/functions/cardgame/index.ts`（つなぐだけ）・`sqlStore.ts`（SQL。部屋とフレンド）・`engine.js`（生成物）。
  **デプロイは3ファイル**（MCP で送るときも `sqlStore.ts` を忘れない。`engine.js` は今までどおり raw URL を `export *` する1行でよい）。
- DB：`supabase/migrations/20261025000000_cardgame_social.sql`（関数より先に当てる）。表 `players`・`friendships`（a < b）・
  `friend_requests`・`invites`・`matches`・`shared_decks`、`rooms.listed`（`meta` の listed から作る生成列）と部分インデックス。
  どれも RLS 有効・ポリシーなし・anon／authenticated の権限なし（Edge Function の直接接続だけ）。

## 手元で試す

```
npm run dev:server     # http://localhost:8787（メモリ。部屋もフレンドも再起動で消える。GET / で一覧）
npm run dev            # 別の端末。2つのブラウザ（または通常とプライベート）で
                       # http://localhost:5173/?server=http://localhost:8787#/online
```

curl でも試せる：

```
curl -s -X POST localhost:8787 -d '{"op":"register","name":"アキ"}'
curl -s -X POST localhost:8787 -d '{"op":"hello","secret":"<secret>"}'
curl -s -X POST localhost:8787 -d '{"op":"list"}'
```

SQL の保存場所はメモリ版と同じ返事になるかを `scripts/sql-store-check.mts`（手元の Postgres に移行を当てて、同じ操作を流して比べる）で確かめられる。
テストは `tests/online-social.test.ts`（倍率1）と `tests/online-social.real.test.ts`（公式カードのドラフトの部屋で通し）。
