-- Enable UUID extension
create extension if not exists "pgcrypto";

-- Spaces (Phase 1: single space, Phase 2: multi-tenant)
create table spaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- Space admins (Phase 2 use: Supabase Auth user_id + role)
create table space_admins (
  space_id    uuid not null references spaces(id) on delete cascade,
  user_id     uuid not null,
  role        text not null check (role in ('owner', 'admin')),
  created_at  timestamptz not null default now(),
  primary key (space_id, user_id)
);

-- Events
create table events (
  id                  uuid primary key default gen_random_uuid(),
  space_id            uuid not null references spaces(id) on delete cascade,
  title               text not null,
  start_at            timestamptz not null,
  end_at              timestamptz not null,
  is_all_day          boolean not null default false,
  location            text,
  description         text,
  calendar_event_id   text,
  status              text not null default 'active' check (status in ('active', 'archived', 'deleted')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Responses
create table responses (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references spaces(id) on delete cascade,
  event_id    uuid not null references events(id) on delete cascade,
  user_key    text not null,
  status      text not null default 'unselected' check (status in ('attend', 'maybe', 'absent', 'unselected')),
  comment     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (event_id, user_key)
);

-- Members
create table members (
  id            uuid primary key default gen_random_uuid(),
  space_id      uuid not null references spaces(id) on delete cascade,
  user_key      text not null,
  part          text not null default '',
  name          text not null default '',
  display_name  text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (space_id, user_key)
);

-- Config (key-value per space)
create table config (
  space_id  uuid not null references spaces(id) on delete cascade,
  key       text not null,
  value     text not null default '',
  primary key (space_id, key)
);

-- Auto-update updated_at
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger events_updated_at
  before update on events
  for each row execute function set_updated_at();

create trigger responses_updated_at
  before update on responses
  for each row execute function set_updated_at();

create trigger members_updated_at
  before update on members
  for each row execute function set_updated_at();

-- Indexes
create index events_space_id_status_idx on events (space_id, status);
create index events_space_id_start_at_idx on events (space_id, start_at);
create index responses_space_id_event_id_idx on responses (space_id, event_id);
create index responses_event_id_user_key_idx on responses (event_id, user_key);
create index members_space_id_idx on members (space_id);
create index members_space_id_user_key_idx on members (space_id, user_key);
