-- ============================================================
-- Keep-alive ping
-- ============================================================
--
-- A lightweight write target for external keep-alive jobs. Supabase Free
-- Plan inactivity detection is not publicly specified, but a real DB write
-- is a stronger activity signal than a read-only Data API request.

create table keepalive_pings (
  space_id      uuid primary key references spaces(id) on delete cascade,
  last_ping_at  timestamptz not null default now(),
  ping_count    bigint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table keepalive_pings enable row level security;

create trigger keepalive_pings_updated_at
  before update on keepalive_pings
  for each row execute function set_updated_at();

-- Keep operational tokens out of the public configuration read surface.
drop policy if exists "config_anon_read" on config;
create policy "config_anon_read" on config
  for select to anon using (key not in ('ADMIN_TOKEN', 'KEEPALIVE_TOKEN'));

drop policy if exists "config_auth_read" on config;
create policy "config_auth_read" on config
  for select to authenticated using (key not in ('ADMIN_TOKEN', 'KEEPALIVE_TOKEN'));

create or replace function record_keepalive(
  p_space_id uuid,
  p_token text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected_token text;
  v_row keepalive_pings;
begin
  if not exists (select 1 from spaces where id = p_space_id) then
    return jsonb_build_object('success', false, 'error', 'Unknown space');
  end if;

  select value into v_expected_token
  from config
  where space_id = p_space_id
    and key = 'KEEPALIVE_TOKEN';

  if v_expected_token is not null and coalesce(p_token, '') <> v_expected_token then
    return jsonb_build_object('success', false, 'error', 'Unauthorized');
  end if;

  insert into keepalive_pings (space_id, last_ping_at, ping_count)
  values (p_space_id, now(), 1)
  on conflict (space_id) do update set
    last_ping_at = excluded.last_ping_at,
    ping_count = keepalive_pings.ping_count + 1
  returning * into v_row;

  return jsonb_build_object(
    'success', true,
    'lastPingAt', v_row.last_ping_at,
    'pingCount', v_row.ping_count
  );
end;
$$;

grant execute on function public.record_keepalive(uuid, text) to anon, authenticated;
