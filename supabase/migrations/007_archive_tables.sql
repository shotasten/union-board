-- Archive tables for new-year reset (rescue from accidental operation)
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

-- Update cleanup RPC to archive before delete
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
