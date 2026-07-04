-- LP秘書 スコープ3: 提案→承認→公開のためのコンテンツバージョン管理
-- SupabaseダッシュボードのSQL Editorにそのまま貼って実行すればセットアップ完了。
--
-- 配信の仕組み: sites.active_version が 1 のときはリポジトリ内のJSONファイルを配信。
-- 提案が承認されると site_versions に published 行ができ、active_version が進み、DB側を配信する。

create table if not exists site_versions (
  id uuid primary key default gen_random_uuid(),
  site_slug text not null,
  version int not null,
  -- SiteContent全体のスナップショット(パッチ適用後)
  content jsonb not null,
  -- 店主向けの提案説明(LINE/承認ページに表示)
  proposal_md text,
  -- 変更点の構造化データ [{target, before, after, reason}]
  changes jsonb,
  -- draft(承認待ち) | published(公開中/過去に公開) | rejected(却下)
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create unique index if not exists site_versions_slug_version_idx
  on site_versions (site_slug, version);

-- 読み書きはサーバ(secretキー)のみ
alter table site_versions enable row level security;
