-- LP秘書 イベント基盤 初期スキーマ
-- 適用先は専用のSupabaseプロジェクト(無料枠)を想定。既存プロジェクト(SR Assist等)には適用しないこと。

create table if not exists sites (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  -- Lokuで発行した経路ID(l.oku-ai.co.jp/r/xxx のxxx)。レポート生成時のread合成キー
  loku_channel_id text,
  active_version int not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id bigint generated always as identity primary key,
  site_slug text not null,
  lp_version int,
  visitor_id text,
  session_id text,
  -- pageview | scroll | section_view | section_dwell | cta_click
  type text not null,
  section text,
  -- scroll% または dwell(ms)
  value numeric,
  meta jsonb,
  url text,
  referrer text,
  query jsonb,
  ua text,
  created_at timestamptz not null default now()
);

create index if not exists events_site_created_idx on events (site_slug, created_at);
create index if not exists events_site_type_idx on events (site_slug, type);
create index if not exists events_site_session_idx on events (site_slug, session_id);

-- 書き込みはservice roleのみ(API Route経由)。anonからのアクセスは全面拒否
alter table sites enable row level security;
alter table events enable row level security;
