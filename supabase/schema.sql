-- Taylor: conversation history
-- Run this once in Supabase → SQL Editor → New query → paste → Run.

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists conversations_user_updated_idx on public.conversations (user_id, updated_at desc);
create index if not exists messages_conversation_idx on public.messages (conversation_id, id);

-- Row Level Security: every user can only ever see and change their own history.
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "own conversations: select" on public.conversations;
drop policy if exists "own conversations: insert" on public.conversations;
drop policy if exists "own conversations: update" on public.conversations;
drop policy if exists "own conversations: delete" on public.conversations;
create policy "own conversations: select" on public.conversations for select to authenticated using ((select auth.uid()) = user_id);
create policy "own conversations: insert" on public.conversations for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own conversations: update" on public.conversations for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own conversations: delete" on public.conversations for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "own messages: select" on public.messages;
drop policy if exists "own messages: insert" on public.messages;
drop policy if exists "own messages: delete" on public.messages;
create policy "own messages: select" on public.messages for select to authenticated using ((select auth.uid()) = user_id);
create policy "own messages: insert" on public.messages for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid()))
  );
create policy "own messages: delete" on public.messages for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Connectors (v3): encrypted account tokens and WhatsApp Business messages.
-- RLS is ON with NO policies: browsers can never read these tables.
-- Only Taylor's server (service role key) can.
-- ---------------------------------------------------------------------------

create table if not exists public.connections (
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft', 'meta', 'linkedin', 'tiktok')),
  account text not null default '',
  secret text not null,            -- AES-256-GCM encrypted with CONNECTIONS_SECRET
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.connections enable row level security;

create table if not exists public.whatsapp_messages (
  id bigint generated always as identity primary key,
  phone text not null,
  name text,
  direction text not null check (direction in ('in', 'out')),
  body text not null,
  wa_message_id text unique,
  sent_by text,                    -- 'auto' (Taylor auto-reply), 'owner' (you via Taylor), null for incoming
  created_at timestamptz not null default now()
);
create index if not exists whatsapp_messages_phone_idx on public.whatsapp_messages (phone, created_at desc);
create index if not exists whatsapp_messages_recent_idx on public.whatsapp_messages (created_at desc);
alter table public.whatsapp_messages enable row level security;

-- ---------------------------------------------------------------------------
-- v4: Running Capvtal (briefings, social autopilot, leads, devices, documents).
-- Server-only tables: RLS on, no policies.
-- ---------------------------------------------------------------------------

create table if not exists public.briefings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  spoken text not null,
  written text not null,
  created_at timestamptz not null default now()
);
create index if not exists briefings_user_day_idx on public.briefings (user_id, day desc, created_at desc);
alter table public.briefings enable row level security;

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  theme jsonb not null,
  pillar jsonb not null,
  headline text not null,
  subline text not null,
  captions jsonb not null,
  status text not null default 'draft',
  results jsonb,
  created_at timestamptz not null default now()
);
create index if not exists social_posts_day_idx on public.social_posts (day desc);
alter table public.social_posts enable row level security;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  place_id text not null unique,     -- Google Place ID only (Google's terms); details are looked up live
  query text not null default '',
  status text not null default 'new',
  email text,
  notes text,
  contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leads_status_idx on public.leads (status, created_at desc);
alter table public.leads enable row level security;

create table if not exists public.outreach_optout (
  email text primary key,
  created_at timestamptz not null default now()
);
alter table public.outreach_optout enable row level security;

create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  kind text not null default 'phone' check (kind in ('phone', 'laptop')),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.device_tokens enable row level security;

create table if not exists public.assistant_channels (
  key text primary key,              -- 'dev:<device id>' or 'wa:<phone>'
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  pending text,                      -- sealed action awaiting "yes"
  updated_at timestamptz not null default now()
);
alter table public.assistant_channels enable row level security;

create table if not exists public.alerts (
  key text primary key,
  created_at timestamptz not null default now()
);
alter table public.alerts enable row level security;

-- Private bucket for documents Taylor creates (shared via 7-day signed links).
insert into storage.buckets (id, name, public) values ('documents', 'documents', false) on conflict (id) do nothing;
