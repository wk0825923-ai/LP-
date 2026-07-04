-- LP秘書 スコープ2: レポート保存テーブル
-- SupabaseダッシュボードのSQL Editorにそのまま貼って実行すればセットアップ完了。

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  site_slug text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  -- 集計値スナップショット(lib/stats.tsのSiteStats)
  stats jsonb not null,
  -- LINEサマリー(プレーンテキスト)
  summary_text text not null,
  -- Web詳細ビュー用(Markdown)
  report_md text not null,
  -- 所見の生成元: claude-sonnet-4-6 | rule-based
  model text,
  created_at timestamptz not null default now()
);

create index if not exists reports_site_created_idx on reports (site_slug, created_at);

-- 読み書きはサーバ(secretキー)のみ。anon向けポリシーは作らない
alter table reports enable row level security;
