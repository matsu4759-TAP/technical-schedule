-- Supabase の SQL Editor に貼り付けて実行してください。
-- 技術部スケジュール管理表(予定・スタッフ・装置・作業種類)を保存するテーブルです。

create extension if not exists pgcrypto;

-- 予定(技術部予定 / デモ予定)
create table if not exists public.schedule_events (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'tech',
  event_date date not null,
  end_date date,
  desired_date_2 date,
  desired_date_3 date,
  staff text[] not null default '{}',
  title text not null default '',
  memo text,
  status text not null default '予定',
  category_id text,
  customer text,
  equipment text[] not null default '{}',
  result text,
  author_name text,
  requester_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists schedule_events_event_date_idx
  on public.schedule_events (event_date);

-- スタッフ一覧・装置一覧・作業種類の設定(key/valueの小さな設定テーブル)
create table if not exists public.schedule_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.schedule_events enable row level security;
alter table public.schedule_config enable row level security;

-- メンバーはアカウントを持たないため、リンクを知っている人は
-- 誰でも読み書きできるポリシーにしています。
-- (docs/SETUP.md の「セキュリティについて」も参照してください)
drop policy if exists "anyone can read events" on public.schedule_events;
create policy "anyone can read events"
  on public.schedule_events for select
  using (true);

drop policy if exists "anyone can insert events" on public.schedule_events;
create policy "anyone can insert events"
  on public.schedule_events for insert
  with check (true);

drop policy if exists "anyone can update events" on public.schedule_events;
create policy "anyone can update events"
  on public.schedule_events for update
  using (true);

drop policy if exists "anyone can delete events" on public.schedule_events;
create policy "anyone can delete events"
  on public.schedule_events for delete
  using (true);

drop policy if exists "anyone can read config" on public.schedule_config;
create policy "anyone can read config"
  on public.schedule_config for select
  using (true);

drop policy if exists "anyone can write config" on public.schedule_config;
create policy "anyone can write config"
  on public.schedule_config for insert
  with check (true);

drop policy if exists "anyone can update config" on public.schedule_config;
create policy "anyone can update config"
  on public.schedule_config for update
  using (true);
