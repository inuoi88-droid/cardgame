-- ドラフト戦と「同じデッキでもう一戦」（決定事項 #115）。cardgame スキーマの rooms だけを変える（ability-debate と共用のプロジェクト）
-- meta：部屋の形式（自分のデッキ／ドラフト）・ドラフトの状態（伏せた山を含むのでサーバーだけが読む）・両者のデッキ・再戦の印・おまかせ。
-- 列を増やさないよう1つの jsonb にまとめる。古い部屋は null（自分のデッキの部屋として動き、再戦はできない）
alter table cardgame.rooms add column if not exists meta jsonb;

-- 状態に「ドラフト中」を足す（列の check は既定の名前 rooms_status_check）
alter table cardgame.rooms drop constraint if exists rooms_status_check;
alter table cardgame.rooms add constraint rooms_status_check check (status in ('waiting', 'drafting', 'playing', 'ended'));
