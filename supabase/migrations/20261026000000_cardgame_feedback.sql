-- プレイヤーからの報告（決定事項 #129。バランス・バグ・その他の要望）。
-- ability-debate と共用のプロジェクトなので、cardgame スキーマだけを変える。
-- ブラウザからは読み書きできない（RLS 有効・ポリシーなし・anon／authenticated の権限も外す）。
-- 入れるのは Edge Function「cardgame」の直接接続（op 'feedback'）だけ。状況（status・note・pr_url）は運営（定期タスクの確認：
-- docs/FEEDBACK_TRIAGE.md）が書く。関数（supabase/functions/cardgame の index.ts・sqlStore.ts・engine.js）より先に当てる。

create table cardgame.feedback (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reporter   text not null,                     -- 端末の報告の鍵のハッシュ（同じ鍵で自分の報告の状況を読む）
  client     text,                              -- 送り元（IP のハッシュ。回数の上限に使う）
  kind       text not null check (kind in ('balance', 'bug', 'other')),
  topic      text not null,                     -- balance: strong・weak・otk・loop・other／bug: rules・display・stuck・other／other: ui・feature・complaint・other
  source     text not null check (source in ('result', 'battle', 'deck', 'editor')),
  body       text not null default '',          -- 本文（2000文字まで。見えない文字は消してある）
  cards      jsonb not null default '[]'::jsonb, -- 添えたカード（CardDef の写し）
  context    jsonb,                             -- 対戦の記録など（src/ui/feedback/feedbackLogic.ts の FeedbackContext）
  app        jsonb not null default '{}'::jsonb, -- 画面の版・場所・ブラウザ
  status     text not null default 'new' check (status in ('new', 'checking', 'accepted', 'fixed', 'rejected', 'duplicate')),
  note       text,                              -- 運営からのひとこと（送った本人に見える）
  pr_url     text,                              -- 対応した変更（GitHub の PR）
  handled_by text                               -- 対応した定期タスクのセッションなど（本人には見せない）
);
create index feedback_reporter_idx on cardgame.feedback (reporter, created_at desc);
create index feedback_client_idx on cardgame.feedback (client, created_at);
create index feedback_created_idx on cardgame.feedback (created_at);
create index feedback_status_idx on cardgame.feedback (status, created_at);

alter table cardgame.feedback enable row level security;
revoke all on cardgame.feedback from public, anon, authenticated;
