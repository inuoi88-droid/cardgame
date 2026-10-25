-- 報告（cardgame.feedback。決定事項 #129）の updated_at を、書き換えたときに自動で今にする
-- （定期の確認のセッションが status・note だけを書いても、送った本人の「送った報告」に更新の時刻が出るように）。cardgame スキーマだけを変える。
create or replace function cardgame.feedback_touch() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger feedback_touch before update on cardgame.feedback
for each row execute function cardgame.feedback_touch();

revoke all on function cardgame.feedback_touch() from public, anon, authenticated;
