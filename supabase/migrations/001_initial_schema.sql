-- ============================================================
-- Initial schema (consolidated)
-- ============================================================

-- Extensions
create extension if not exists "pgcrypto";

-- ============================================================
-- Tables
-- ============================================================

create table spaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table space_admins (
  space_id    uuid not null references spaces(id) on delete cascade,
  user_id     uuid not null,
  role        text not null check (role in ('owner', 'admin')),
  created_at  timestamptz not null default now(),
  primary key (space_id, user_id)
);

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

create table config (
  space_id  uuid not null references spaces(id) on delete cascade,
  key       text not null,
  value     text not null default '',
  primary key (space_id, key)
);

-- Archive tables (new-year reset rescue)
create table members_archive (
  id            uuid not null,
  space_id      uuid not null,
  user_key      text not null,
  part          text not null,
  name          text not null,
  display_name  text not null,
  created_at    timestamptz not null,
  updated_at    timestamptz not null,
  archived_at   date not null default current_date
);

create table responses_archive (
  id          uuid not null,
  space_id    uuid not null,
  event_id    uuid not null,
  user_key    text not null,
  status      text not null,
  comment     text,
  created_at  timestamptz not null,
  updated_at  timestamptz not null,
  archived_at date not null default current_date
);

-- ============================================================
-- Triggers
-- ============================================================

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

-- ============================================================
-- Indexes
-- ============================================================

create index events_space_id_status_idx on events (space_id, status);
create index events_space_id_start_at_idx on events (space_id, start_at);
create index responses_space_id_event_id_idx on responses (space_id, event_id);
create index responses_event_id_user_key_idx on responses (event_id, user_key);
create index members_space_id_idx on members (space_id);
create index members_space_id_user_key_idx on members (space_id, user_key);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table spaces         enable row level security;
alter table space_admins   enable row level security;
alter table events         enable row level security;
alter table responses      enable row level security;
alter table members        enable row level security;
alter table config         enable row level security;

-- spaces
create policy "spaces_anon_read" on spaces
  for select to anon using (true);

create policy "spaces_auth_read" on spaces
  for select to authenticated using (true);

-- events
create policy "events_anon_read" on events
  for select to anon using (status <> 'deleted');

create policy "events_auth_read" on events
  for select to authenticated using (status <> 'deleted');

-- responses
create policy "responses_anon_read" on responses
  for select to anon using (true);

create policy "responses_anon_insert" on responses
  for insert to anon with check (true);

create policy "responses_anon_update" on responses
  for update to anon using (true) with check (true);

create policy "responses_auth_read" on responses
  for select to authenticated using (true);

create policy "responses_auth_insert" on responses
  for insert to authenticated with check (true);

create policy "responses_auth_update" on responses
  for update to authenticated using (true) with check (true);

-- members
create policy "members_anon_read" on members
  for select to anon using (true);

create policy "members_anon_insert" on members
  for insert to anon with check (true);

create policy "members_anon_update" on members
  for update to anon using (true) with check (true);

create policy "members_anon_delete" on members
  for delete to anon using (true);

create policy "members_auth_read" on members
  for select to authenticated using (true);

create policy "members_auth_insert" on members
  for insert to authenticated with check (true);

create policy "members_auth_update" on members
  for update to authenticated using (true) with check (true);

create policy "members_auth_delete" on members
  for delete to authenticated using (true);

-- config (ADMIN_TOKEN is not used; anon read excludes it for safety)
create policy "config_anon_read" on config
  for select to anon using (key <> 'ADMIN_TOKEN');

create policy "config_auth_read" on config
  for select to authenticated using (true);

-- ============================================================
-- RPC Functions
-- ============================================================

-- Admin check via Supabase Auth (Google OAuth)
create or replace function is_space_admin(p_space_id uuid)
returns boolean
language sql security definer
as $$
  select exists (
    select 1 from space_admins
    where space_id = p_space_id
      and user_id = auth.uid()
  );
$$;

-- Admin: create event
create or replace function admin_create_event(
  p_space_id    uuid,
  p_title       text,
  p_start_at    timestamptz,
  p_end_at      timestamptz,
  p_is_all_day  boolean,
  p_location    text,
  p_description text
) returns jsonb language plpgsql security definer as $$
declare v_row events;
begin
  if not is_space_admin(p_space_id) then
    return jsonb_build_object('success', false, 'error', 'Unauthorized');
  end if;
  insert into events (space_id, title, start_at, end_at, is_all_day, location, description, status)
  values (p_space_id, p_title, p_start_at, p_end_at, p_is_all_day, p_location, p_description, 'active')
  returning * into v_row;
  return jsonb_build_object('success', true, 'event', row_to_json(v_row));
end;
$$;

-- Admin: update event
create or replace function admin_update_event(
  p_space_id    uuid,
  p_event_id    uuid,
  p_title       text,
  p_start_at    timestamptz,
  p_end_at      timestamptz,
  p_is_all_day  boolean,
  p_location    text,
  p_description text
) returns jsonb language plpgsql security definer as $$
begin
  if not is_space_admin(p_space_id) then
    return jsonb_build_object('success', false, 'error', 'Unauthorized');
  end if;
  update events set
    title       = p_title,
    start_at    = p_start_at,
    end_at      = p_end_at,
    is_all_day  = p_is_all_day,
    location    = p_location,
    description = p_description
  where id = p_event_id and space_id = p_space_id;
  return jsonb_build_object('success', true);
end;
$$;

-- Admin: delete event (logical delete)
create or replace function admin_delete_event(
  p_space_id uuid,
  p_event_id uuid
) returns jsonb language plpgsql security definer as $$
begin
  if not is_space_admin(p_space_id) then
    return jsonb_build_object('success', false, 'error', 'Unauthorized');
  end if;
  update events set status = 'deleted'
  where id = p_event_id and space_id = p_space_id;
  return jsonb_build_object('success', true);
end;
$$;

-- Admin: set display period
create or replace function admin_set_display_period(
  p_space_id   uuid,
  p_start_date text,
  p_end_date   text
) returns jsonb language plpgsql security definer as $$
begin
  if not is_space_admin(p_space_id) then
    return jsonb_build_object('success', false, 'error', 'Unauthorized');
  end if;
  insert into config (space_id, key, value) values
    (p_space_id, 'DISPLAY_START_DATE', p_start_date),
    (p_space_id, 'DISPLAY_END_DATE', p_end_date)
  on conflict (space_id, key) do update set value = excluded.value;
  return jsonb_build_object('success', true);
end;
$$;

-- Admin: set show all events
create or replace function admin_set_show_all_events(
  p_space_id uuid,
  p_flag     boolean
) returns jsonb language plpgsql security definer as $$
begin
  if not is_space_admin(p_space_id) then
    return jsonb_build_object('success', false, 'error', 'Unauthorized');
  end if;
  insert into config (space_id, key, value)
  values (p_space_id, 'SHOW_ALL_EVENTS', p_flag::text)
  on conflict (space_id, key) do update set value = excluded.value;
  return jsonb_build_object('success', true);
end;
$$;

-- Admin: cleanup members and responses (archives before delete)
create or replace function admin_cleanup_members_responses(
  p_space_id uuid
) returns jsonb language plpgsql security definer as $$
declare
  v_members_deleted int;
  v_responses_deleted int;
begin
  if not is_space_admin(p_space_id) then
    return jsonb_build_object('success', false, 'error', 'Unauthorized');
  end if;

  insert into responses_archive
    select id, space_id, event_id, user_key, status, comment, created_at, updated_at, current_date
    from responses
    where space_id = p_space_id;

  delete from responses where space_id = p_space_id;
  get diagnostics v_responses_deleted = row_count;

  insert into members_archive
    select id, space_id, user_key, part, name, display_name, created_at, updated_at, current_date
    from members
    where space_id = p_space_id;

  delete from members where space_id = p_space_id;
  get diagnostics v_members_deleted = row_count;

  return jsonb_build_object(
    'success', true,
    'membersDeleted', v_members_deleted,
    'responsesDeleted', v_responses_deleted
  );
end;
$$;

-- Admin: cleanup all data
create or replace function admin_cleanup_all(
  p_space_id uuid
) returns jsonb language plpgsql security definer as $$
declare
  v_events_deleted int;
  v_responses_deleted int;
  v_members_deleted int;
begin
  if not is_space_admin(p_space_id) then
    return jsonb_build_object('success', false, 'error', 'Unauthorized');
  end if;
  delete from responses where space_id = p_space_id;
  get diagnostics v_responses_deleted = row_count;
  delete from events where space_id = p_space_id;
  get diagnostics v_events_deleted = row_count;
  delete from members where space_id = p_space_id;
  get diagnostics v_members_deleted = row_count;
  return jsonb_build_object(
    'success', true,
    'eventsDeleted', v_events_deleted,
    'responsesDeleted', v_responses_deleted,
    'membersDeleted', v_members_deleted,
    'calendarDeleted', 0,
    'auditLogDeleted', 0
  );
end;
$$;

-- ============================================================
-- Timezone
-- ============================================================

alter database postgres set timezone to 'Asia/Tokyo';
