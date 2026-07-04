-- LP秘書 イベント基盤 初期スキーマ(LP秘書専用プロジェクトに適用する)
-- SupabaseダッシュボードのSQL Editorにそのまま貼って実行すればセットアップ完了。

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

alter table sites enable row level security;
alter table events enable row level security;

-- 書き込みはAPI Route(サーバ)経由。anonキーでもinsertだけ通し、読み取りは一切許可しない
drop policy if exists lph_events_insert on events;
create policy lph_events_insert on events
  for insert to anon, authenticated
  with check (true);

-- 初期データ: デモサイト(Loku経路「LP」= 01kr15470zxg)
insert into sites (slug, name, loku_channel_id)
values ('studio-lien', 'Studio Lien', '01kr15470zxg')
on conflict (slug) do update set loku_channel_id = excluded.loku_channel_id;
