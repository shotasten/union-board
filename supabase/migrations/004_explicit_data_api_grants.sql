-- ============================================================
-- Explicit Data API grants
-- ============================================================
--
-- Supabase no longer exposes new public schema tables to the Data API
-- automatically on new projects. Keep grants close to the RLS/RPC surface
-- this frontend and Edge Function actually use.

-- Public read surface used by supabase-js in the browser.
grant select on table public.spaces to anon, authenticated;
grant select on table public.events to anon, authenticated;
grant select on table public.config to anon, authenticated;

-- Anonymous member attendance flow.
grant select, insert, update on table public.responses to anon, authenticated;
grant select, insert, update, delete on table public.members to anon, authenticated;

-- Calendar sync Edge Function uses the service role through supabase-js.
grant select, update on table public.events to service_role;
grant select on table public.responses to service_role;
grant select on table public.members to service_role;
grant select on table public.config to service_role;

-- RPCs called from the browser or from Edge Functions.
grant execute on function public.is_space_admin(uuid) to authenticated;
grant execute on function public.admin_create_event(uuid, text, timestamptz, timestamptz, boolean, text, text) to authenticated;
grant execute on function public.admin_update_event(uuid, uuid, text, timestamptz, timestamptz, boolean, text, text) to authenticated;
grant execute on function public.admin_delete_event(uuid, uuid) to authenticated;
grant execute on function public.admin_set_display_period(uuid, text, text) to authenticated;
grant execute on function public.admin_set_show_all_events(uuid, boolean) to authenticated;
grant execute on function public.admin_cleanup_members_responses(uuid) to authenticated;
grant execute on function public.admin_cleanup_all(uuid) to authenticated;
grant execute on function public.admin_list_admins(uuid) to authenticated;
grant execute on function public.admin_invite_admin(uuid, text, text) to authenticated;
grant execute on function public.admin_remove_admin(uuid, uuid) to authenticated;
grant execute on function public.accept_admin_invitation(text) to authenticated;
grant execute on function public.admin_list_invitations(uuid) to authenticated;
grant execute on function public.admin_cancel_invitation(uuid, text) to authenticated;
