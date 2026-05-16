-- RLS policies for Phase 1
-- Admin token verification happens in Edge Functions (service role key bypasses RLS).
-- Anon users can: read all data, upsert responses, and manage members (no auth in Phase 1).
-- Admin writes (events, config) go through Edge Functions which verify the admin token.

alter table spaces       enable row level security;
alter table space_admins enable row level security;
alter table events       enable row level security;
alter table responses    enable row level security;
alter table members      enable row level security;
alter table config       enable row level security;

-- spaces: anon read only
create policy "spaces_anon_read" on spaces
  for select to anon using (true);

-- space_admins: no anon access (service role only)

-- events: anon read active/archived
create policy "events_anon_read" on events
  for select to anon using (status <> 'deleted');

-- responses: anon read
create policy "responses_anon_read" on responses
  for select to anon using (true);

-- responses: anon upsert (anyone can submit attendance)
create policy "responses_anon_insert" on responses
  for insert to anon with check (true);

create policy "responses_anon_update" on responses
  for update to anon using (true) with check (true);

-- members: anon full CRUD (Phase 1: open member management, same as GAS design)
create policy "members_anon_read" on members
  for select to anon using (true);

create policy "members_anon_insert" on members
  for insert to anon with check (true);

create policy "members_anon_update" on members
  for update to anon using (true) with check (true);

create policy "members_anon_delete" on members
  for delete to anon using (true);

-- config: anon read (ADMIN_TOKEN excluded in API layer)
create policy "config_anon_read" on config
  for select to anon using (key <> 'ADMIN_TOKEN');

-- Phase 2 migration note:
-- Replace anon policies with auth.uid() checks after enabling Google OAuth.
-- Add space-scoped RLS: space_id in (select space_id from space_admins where user_id = auth.uid())
