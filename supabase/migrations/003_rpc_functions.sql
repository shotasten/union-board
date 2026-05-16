-- RPC functions for admin operations
-- Using security definer to bypass RLS for admin-verified operations.

-- Admin token verification (bypasses RLS to read ADMIN_TOKEN)
create or replace function check_admin_token(p_space_id uuid, p_token text)
returns boolean language plpgsql security definer as $$
begin
  return exists (
    select 1 from config
    where space_id = p_space_id
    and key = 'ADMIN_TOKEN'
    and value = p_token
  );
end;
$$;

-- Admin: create event
create or replace function admin_create_event(
  p_space_id    uuid,
  p_token       text,
  p_title       text,
  p_start_at    timestamptz,
  p_end_at      timestamptz,
  p_is_all_day  boolean,
  p_location    text,
  p_description text
) returns jsonb language plpgsql security definer as $$
declare v_row events;
begin
  if not check_admin_token(p_space_id, p_token) then
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
  p_token       text,
  p_event_id    uuid,
  p_title       text,
  p_start_at    timestamptz,
  p_end_at      timestamptz,
  p_is_all_day  boolean,
  p_location    text,
  p_description text
) returns jsonb language plpgsql security definer as $$
begin
  if not check_admin_token(p_space_id, p_token) then
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
  p_token    text,
  p_event_id uuid
) returns jsonb language plpgsql security definer as $$
begin
  if not check_admin_token(p_space_id, p_token) then
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
  p_token      text,
  p_start_date text,
  p_end_date   text
) returns jsonb language plpgsql security definer as $$
begin
  if not check_admin_token(p_space_id, p_token) then
    return jsonb_build_object('success', false, 'error', 'Unauthorized');
  end if;
  insert into config (space_id, key, value) values
    (p_space_id, 'DISPLAY_START_DATE', p_start_date),
    (p_space_id, 'DISPLAY_END_DATE', p_end_date)
  on conflict (space_id, key) do update set value = excluded.value;
  return jsonb_build_object('success', true);
end;
$$;

-- Admin: set show only future events
create or replace function admin_set_show_only_future_events(
  p_space_id uuid,
  p_token    text,
  p_flag     boolean
) returns jsonb language plpgsql security definer as $$
begin
  if not check_admin_token(p_space_id, p_token) then
    return jsonb_build_object('success', false, 'error', 'Unauthorized');
  end if;
  insert into config (space_id, key, value)
  values (p_space_id, 'SHOW_ONLY_FUTURE_EVENTS', p_flag::text)
  on conflict (space_id, key) do update set value = excluded.value;
  return jsonb_build_object('success', true);
end;
$$;

-- Admin: cleanup members and responses
create or replace function admin_cleanup_members_responses(
  p_space_id uuid,
  p_token    text
) returns jsonb language plpgsql security definer as $$
declare
  v_members_deleted int;
  v_responses_deleted int;
begin
  if not check_admin_token(p_space_id, p_token) then
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
  p_space_id uuid,
  p_token    text
) returns jsonb language plpgsql security definer as $$
declare
  v_events_deleted int;
  v_responses_deleted int;
  v_members_deleted int;
begin
  if not check_admin_token(p_space_id, p_token) then
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
