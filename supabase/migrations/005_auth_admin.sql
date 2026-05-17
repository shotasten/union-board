-- Replace token-based admin auth with Supabase Auth (Google OAuth)

-- Admin check via auth.uid()
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

-- Drop old token-based function signatures before recreating without p_token
drop function if exists admin_create_event(uuid, text, text, timestamptz, timestamptz, boolean, text, text);
drop function if exists admin_update_event(uuid, text, uuid, text, timestamptz, timestamptz, boolean, text, text);
drop function if exists admin_delete_event(uuid, text, uuid);
drop function if exists admin_set_display_period(uuid, text, text, text);
drop function if exists admin_set_show_all_events(uuid, text, boolean);
drop function if exists admin_cleanup_members_responses(uuid, text);
drop function if exists admin_cleanup_all(uuid, text);

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

-- Admin: cleanup members and responses
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
  delete from responses where space_id = p_space_id;
  get diagnostics v_responses_deleted = row_count;
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

-- Drop the old token verification function
drop function if exists check_admin_token(uuid, text);

-- Remove ADMIN_TOKEN config entries
delete from config where key = 'ADMIN_TOKEN';
