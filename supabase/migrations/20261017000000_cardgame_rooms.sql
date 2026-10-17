-- オンライン対戦の部屋。ability-debate プロジェクトを共用するため、専用スキーマ cardgame に分ける（決定事項 #56）
-- ブラウザからは読み書きできない（RLS 有効・ポリシーなし、権限も外す）。Edge Function「cardgame」だけが直接接続で扱う。
create schema if not exists cardgame;

create table cardgame.rooms (
  code        text primary key,               -- 部屋コード（6文字）
  status      text not null check (status in ('waiting', 'playing', 'ended')),
  version     integer not null,               -- 更新のたびに+1（同時送信の検出と通知に使う）
  state       jsonb,                          -- 完全な対戦状態（サーバーだけが読む）
  seats       jsonb not null,                 -- [{ name, tokenHash, lastSeen, timeouts }, …]
  host_deck   jsonb,                          -- 相手が入るまで預かる作成者のデッキ
  deadline    timestamptz,                    -- 今の手番（またはマリガン）の締め切り
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index rooms_updated_at_idx on cardgame.rooms (updated_at);

alter table cardgame.rooms enable row level security;

revoke all on schema cardgame from public, anon, authenticated;
revoke all on all tables in schema cardgame from public, anon, authenticated;
