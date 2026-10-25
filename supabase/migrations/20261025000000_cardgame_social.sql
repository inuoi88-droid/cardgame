-- フレンド機能・公開の部屋・対戦成績・公開デッキ（決定事項 #121。プロトコルは docs/ONLINE_SOCIAL.md）。
-- ability-debate と共用のプロジェクトなので、cardgame スキーマだけを変える。
-- どの表もブラウザからは読み書きできない（RLS 有効・ポリシーなし・anon／authenticated の権限も外す）。
-- Edge Function「cardgame」の直接接続（SUPABASE_DB_URL）だけが使う。時刻はすべて timestamptz。
-- 関数（supabase/functions/cardgame の index.ts・sqlStore.ts・engine.js）より先に当てる。

-- プレイヤー（ログインなし。端末で自動に作る。秘密の鍵はハッシュだけを持つ）
create table cardgame.players (
  id          text primary key,                 -- 内部 ID（16進32文字。他人には返さない）
  secret_hash text not null unique,             -- 秘密の鍵（＝引き継ぎコード）の SHA-256
  friend_code text not null unique,             -- 公開してよい識別子（紛らわしくない8文字）
  inbox_id    text not null unique,             -- 本人あての Realtime のチャンネル cardgame:inbox:<inbox_id>
  link_token  text not null,                    -- 招待リンクの鍵（作り直せる）
  name        text not null,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null,             -- 最後の通信（hello・部屋の送信）
  room_code   text,                             -- 最後に送信した部屋と、そのときの部屋の状態・時刻（「対戦中」の表示）
  room_status text,
  room_seen   timestamptz
);

-- フレンド（2人の ID を a < b の順で1行）
create table cardgame.friendships (
  a     text not null references cardgame.players (id) on delete cascade,
  b     text not null references cardgame.players (id) on delete cascade,
  since timestamptz not null,
  primary key (a, b),
  check (a < b)
);
create index friendships_b_idx on cardgame.friendships (b);

-- 答えを待っているフレンド申請（受けるか断ると消える）
create table cardgame.friend_requests (
  from_id    text not null references cardgame.players (id) on delete cascade,
  to_id      text not null references cardgame.players (id) on delete cascade,
  created_at timestamptz not null,
  primary key (from_id, to_id),
  check (from_id <> to_id)
);
create index friend_requests_to_idx on cardgame.friend_requests (to_id);

-- 対戦への招待（期限は10分。部屋が相手待ちでなくなったら、その前でも無効。1日より古いものは消す）
create table cardgame.invites (
  id         text primary key,                  -- 16進32文字
  from_id    text not null references cardgame.players (id) on delete cascade,
  to_id      text not null references cardgame.players (id) on delete cascade,
  room_code  text not null,
  mode       text not null check (mode in ('deck', 'draft')),
  status     text not null check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null,
  expires_at timestamptz not null
);
create index invites_to_idx on cardgame.invites (to_id, created_at);
create index invites_from_idx on cardgame.invites (from_id, created_at);
create index invites_created_idx on cardgame.invites (created_at);

-- 決着した1戦（両方の席がプレイヤーに結び付いた部屋だけ。再戦も1戦ずつ）
create table cardgame.matches (
  id        text primary key,                   -- 部屋コード-何戦目-決着の時刻（同じ記録は1つ）
  room_code text not null,
  game      integer not null,
  p0        text not null references cardgame.players (id) on delete cascade,  -- 席0
  p1        text not null references cardgame.players (id) on delete cascade,  -- 席1
  winner    smallint check (winner in (0, 1)),  -- 勝った席（引き分けは null）
  mode      text not null check (mode in ('deck', 'draft')),
  ended_at  timestamptz not null
);
create index matches_p0_idx on cardgame.matches (p0, p1);
create index matches_p1_idx on cardgame.matches (p1, p0);

-- 「フレンドに公開」したデッキ（1人20個まで。持ち主とデッキの ID で1つ）
create table cardgame.shared_decks (
  owner_id   text not null references cardgame.players (id) on delete cascade,
  deck_id    text not null,
  name       text not null,
  card_count integer not null,
  deck       jsonb not null,                    -- 検証済みのデッキ
  cards      jsonb not null,                    -- デッキで使うカードの定義
  updated_at timestamptz not null,
  primary key (owner_id, deck_id)
);

-- 公開の部屋（「募集中の部屋」）：meta の listed から作る生成列と、相手待ちの公開の部屋だけの部分インデックス
alter table cardgame.rooms
  add column if not exists listed boolean generated always as (coalesce((meta ->> 'listed')::boolean, false)) stored;
create index if not exists rooms_listed_idx on cardgame.rooms (updated_at desc) where listed and status = 'waiting';

alter table cardgame.players enable row level security;
alter table cardgame.friendships enable row level security;
alter table cardgame.friend_requests enable row level security;
alter table cardgame.invites enable row level security;
alter table cardgame.matches enable row level security;
alter table cardgame.shared_decks enable row level security;

revoke all on schema cardgame from public, anon, authenticated;
revoke all on all tables in schema cardgame from public, anon, authenticated;
