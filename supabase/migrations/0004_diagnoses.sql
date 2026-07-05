-- LP秘書 スコープ5: LP健康診断(リードマグネット)の結果保存テーブル
-- SupabaseダッシュボードのSQL Editorにそのまま貼って実行すればセットアップ完了。
-- 診断は未ログインの見込み客が実行する公開機能。IDは推測不能なuuidで、共有リンク兼アクセストークンを兼ねる。

create table if not exists diagnoses (
  id uuid primary key default gen_random_uuid(),
  -- 入力URLと、リダイレクト追跡後の最終URL
  input_url text not null,
  final_url text not null,
  -- 総合スコア(0-100)と等級(A/B/C/D)
  score int not null,
  grade text not null,
  -- 個別チェック結果(lib/diagnose.tsのDiagCheck[])
  checks jsonb not null,
  -- Web詳細ビュー用(Markdown)
  report_md text not null,
  -- 講評の生成元: claude-haiku-4-5-20251001 | rule-based
  model text,
  created_at timestamptz not null default now()
);

create index if not exists diagnoses_created_idx on diagnoses (created_at);

-- 読み書きはサーバ(secretキー)のみ。anon向けポリシーは作らない
alter table diagnoses enable row level security;
