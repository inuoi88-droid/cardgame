-- みんなの広場（一般公開）・運営・公式カードの上書き（決定事項 #141。protocol は src/online/plaza）。
-- ability-debate と共用のプロジェクトなので、cardgame スキーマだけを変える。
-- どの表もブラウザからは読み書きできない（RLS 有効・ポリシーなし・anon／authenticated の権限も外す）。
-- Edge Function「cardgame」の直接接続（SUPABASE_DB_URL）だけが使う。関数（index.ts・sqlStore.ts・engine.js）より先に当てる。
-- 運営のパスワードはこのファイルに書かない（リポジトリは公開）。保存値（回数$塩$ハッシュ。src/online/plaza/handlers.ts の
-- staffPasswordHash）を別に insert する：insert into cardgame.admin_settings (key, value) values ('staff_password', '<保存値>')

-- 運営の設定（パスワードの保存値など）
create table cardgame.admin_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- 運営（パスワードを入れたプレイヤー）
create table cardgame.staff (
  player_id text primary key references cardgame.players (id) on delete cascade,
  since     timestamptz not null
);

-- 広場に公開したカード・デッキ（公開できるのは運営だけ。持ち主・種類・元の ID で1つ）
create table cardgame.public_items (
  id         text primary key,                  -- 16進16文字
  owner_id   text not null references cardgame.players (id) on delete cascade,
  kind       text not null check (kind in ('card', 'deck')),
  source_id  text not null,                     -- 元のカード・デッキの ID
  name       text not null,
  item       jsonb not null,                    -- card: CardDef／deck: { deck, cards }
  cover      jsonb,                             -- 一覧の表紙（CardDef）
  card_count integer not null,
  size       integer not null,                  -- item の JSON の文字数（1つ4万字まで）
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (owner_id, kind, source_id)
);
create index public_items_updated_idx on cardgame.public_items (updated_at desc, id desc);
create index public_items_kind_idx on cardgame.public_items (kind, updated_at desc, id desc);

-- 運営が書き換えた公式カード（無いカードは元のまま）
create table cardgame.official_cards (
  card_id    text primary key,
  card       jsonb not null,
  updated_by text,
  updated_at timestamptz not null
);

-- 公式カードの書き換えの履歴（card が null なら元に戻した）。版＝最後の id
create table cardgame.official_card_history (
  id         bigint generated always as identity primary key,
  card_id    text not null,
  card       jsonb,
  by_id      text,
  at         timestamptz not null
);
create index official_card_history_card_idx on cardgame.official_card_history (card_id, id desc);

-- 運営のパスワードの間違いの回数（rate_events の kind に staffFail を足す）
alter table cardgame.rate_events drop constraint if exists rate_events_kind_check;
alter table cardgame.rate_events add constraint rate_events_kind_check check (kind in ('register', 'request', 'declined', 'linkInfo', 'staffFail'));

alter table cardgame.admin_settings enable row level security;
alter table cardgame.staff enable row level security;
alter table cardgame.public_items enable row level security;
alter table cardgame.official_cards enable row level security;
alter table cardgame.official_card_history enable row level security;
revoke all on cardgame.admin_settings, cardgame.staff, cardgame.public_items, cardgame.official_cards, cardgame.official_card_history from public, anon, authenticated;
