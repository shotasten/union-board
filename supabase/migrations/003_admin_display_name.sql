-- ============================================================
-- Add display_name to admin management
-- ============================================================

-- display_name for confirmed admins (nullable: existing owners have no name)
alter table space_admins add column display_name text;

-- display_name for pending invitations (required on new invites)
alter table admin_invitations add column display_name text not null default '';

-- ============================================================
-- Updated RPC Functions
-- ============================================================

-- admin_list_admins: include display_name
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
          'display_name', sa.display_name,
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

-- admin_invite_admin: accept display_name param
create or replace function admin_invite_admin(p_space_id uuid, p_email text, p_display_name text)
returns jsonb language plpgsql security definer as $$
declare
  v_token text;
  v_normalized_email text;
  v_normalized_name text;
begin
  if not is_space_admin(p_space_id) then
    return jsonb_build_object('success', false, 'error', 'Unauthorized');
  end if;

  v_normalized_email := lower(trim(p_email));
  v_normalized_name  := trim(p_display_name);

  if v_normalized_email = '' then
    return jsonb_build_object('success', false, 'error', 'メールアドレスを入力してください');
  end if;

  if v_normalized_name = '' then
    return jsonb_build_object('success', false, 'error', '名前を入力してください');
  end if;

  if exists (
    select 1 from space_admins sa
    join auth.users u on sa.user_id = u.id
    where sa.space_id = p_space_id and lower(u.email) = v_normalized_email
  ) then
    return jsonb_build_object('success', false, 'error', 'このメールアドレスは既に管理者として登録されています');
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');

  delete from admin_invitations
  where space_id = p_space_id and email = v_normalized_email and accepted_at is null;

  insert into admin_invitations (space_id, email, display_name, token, invited_by, expires_at)
  values (p_space_id, v_normalized_email, v_normalized_name, v_token, auth.uid(), now() + interval '7 days');

  return jsonb_build_object('success', true, 'token', v_token);
end;
$$;

-- accept_admin_invitation: copy display_name to space_admins
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

  insert into space_admins (space_id, user_id, role, display_name)
  values (v_invitation.space_id, auth.uid(), 'admin', v_invitation.display_name)
  on conflict (space_id, user_id) do nothing;

  update admin_invitations set accepted_at = now() where id = v_invitation.id;

  return jsonb_build_object('success', true, 'space_id', v_invitation.space_id);
end;
$$;

-- New: list pending invitations
create or replace function admin_list_invitations(p_space_id uuid)
returns jsonb language plpgsql security definer as $$
begin
  if not is_space_admin(p_space_id) then
    return jsonb_build_object('success', false, 'error', 'Unauthorized');
  end if;
  return jsonb_build_object(
    'success', true,
    'invitations', coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'id', id,
          'email', email,
          'display_name', display_name,
          'token', token,
          'expires_at', expires_at,
          'created_at', created_at
        ) order by created_at)
        from admin_invitations
        where space_id = p_space_id
          and accepted_at is null
          and expires_at > now()
      ),
      '[]'::jsonb
    )
  );
end;
$$;

-- New: cancel a pending invitation
create or replace function admin_cancel_invitation(p_space_id uuid, p_token text)
returns jsonb language plpgsql security definer as $$
begin
  if not is_space_admin(p_space_id) then
    return jsonb_build_object('success', false, 'error', 'Unauthorized');
  end if;

  delete from admin_invitations
  where space_id = p_space_id and token = p_token and accepted_at is null;

  return jsonb_build_object('success', true);
end;
$$;
