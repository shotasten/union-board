-- ============================================================
-- Admin invitations
-- ============================================================

create table admin_invitations (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references spaces(id) on delete cascade,
  email       text not null,
  token       text not null unique,
  invited_by  uuid not null,
  expires_at  timestamptz not null,
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);

alter table admin_invitations enable row level security;

-- ============================================================
-- RPC Functions
-- ============================================================

-- List all admins for a space (joins auth.users for emails)
create or replace function admin_list_admins(p_space_id uuid)
returns jsonb language plpgsql security definer as $$
begin
  if not is_space_admin(p_space_id) then
    return jsonb_build_object('success', false, 'error', 'Unauthorized');
  end if;
  return jsonb_build_object(
    'success', true,
    'admins', coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'user_id', sa.user_id,
          'email', u.email,
          'role', sa.role,
          'created_at', sa.created_at
        ) order by sa.created_at)
        from space_admins sa
        join auth.users u on sa.user_id = u.id
        where sa.space_id = p_space_id
      ),
      '[]'::jsonb
    )
  );
end;
$$;

-- Invite a new admin by email (generates a one-time URL token)
create or replace function admin_invite_admin(p_space_id uuid, p_email text)
returns jsonb language plpgsql security definer as $$
declare
  v_token text;
  v_normalized_email text;
begin
  if not is_space_admin(p_space_id) then
    return jsonb_build_object('success', false, 'error', 'Unauthorized');
  end if;

  v_normalized_email := lower(trim(p_email));

  if v_normalized_email = '' then
    return jsonb_build_object('success', false, 'error', 'メールアドレスを入力してください');
  end if;

  -- Reject if already an admin
  if exists (
    select 1 from space_admins sa
    join auth.users u on sa.user_id = u.id
    where sa.space_id = p_space_id and lower(u.email) = v_normalized_email
  ) then
    return jsonb_build_object('success', false, 'error', 'このメールアドレスは既に管理者として登録されています');
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');

  -- Replace any existing pending invitation for the same email
  delete from admin_invitations
  where space_id = p_space_id and email = v_normalized_email and accepted_at is null;

  insert into admin_invitations (space_id, email, token, invited_by, expires_at)
  values (p_space_id, v_normalized_email, v_token, auth.uid(), now() + interval '7 days');

  return jsonb_build_object('success', true, 'token', v_token);
end;
$$;

-- Remove an admin (owners cannot be removed)
create or replace function admin_remove_admin(p_space_id uuid, p_target_user_id uuid)
returns jsonb language plpgsql security definer as $$
begin
  if not is_space_admin(p_space_id) then
    return jsonb_build_object('success', false, 'error', 'Unauthorized');
  end if;

  if exists (
    select 1 from space_admins
    where space_id = p_space_id and user_id = p_target_user_id and role = 'owner'
  ) then
    return jsonb_build_object('success', false, 'error', 'オーナーは削除できません');
  end if;

  delete from space_admins where space_id = p_space_id and user_id = p_target_user_id;

  return jsonb_build_object('success', true);
end;
$$;

-- Accept an admin invitation after Google OAuth login
create or replace function accept_admin_invitation(p_token text)
returns jsonb language plpgsql security definer as $$
declare
  v_invitation admin_invitations;
  v_user_email text;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'ログインが必要です');
  end if;

  select email into v_user_email from auth.users where id = auth.uid();

  select * into v_invitation
  from admin_invitations
  where token = p_token
    and accepted_at is null
    and expires_at > now();

  if not found then
    return jsonb_build_object('success', false, 'error', '招待リンクが無効または期限切れです');
  end if;

  if lower(v_user_email) != v_invitation.email then
    return jsonb_build_object(
      'success', false,
      'error', format('招待されたメールアドレス（%s）と異なるアカウントでログインしています', v_invitation.email)
    );
  end if;

  insert into space_admins (space_id, user_id, role)
  values (v_invitation.space_id, auth.uid(), 'admin')
  on conflict (space_id, user_id) do nothing;

  update admin_invitations set accepted_at = now() where id = v_invitation.id;

  return jsonb_build_object('success', true, 'space_id', v_invitation.space_id);
end;
$$;
