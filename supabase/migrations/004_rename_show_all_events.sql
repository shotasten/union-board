-- Rename SHOW_ONLY_FUTURE_EVENTS → SHOW_ALL_EVENTS (value is inverted)
-- Old: true = future only, false = show all
-- New: true = show all, false = future only (default)
update config
set key   = 'SHOW_ALL_EVENTS',
    value = case when value = 'true' then 'false' else 'true' end
where key = 'SHOW_ONLY_FUTURE_EVENTS';

-- Replace RPC function
drop function if exists admin_set_show_only_future_events(uuid, text, boolean);

create or replace function admin_set_show_all_events(
  p_space_id uuid,
  p_token    text,
  p_flag     boolean
) returns jsonb language plpgsql security definer as $$
begin
  if not check_admin_token(p_space_id, p_token) then
    return jsonb_build_object('success', false, 'error', 'Unauthorized');
  end if;
  insert into config (space_id, key, value)
  values (p_space_id, 'SHOW_ALL_EVENTS', p_flag::text)
  on conflict (space_id, key) do update set value = excluded.value;
  return jsonb_build_object('success', true);
end;
$$;
