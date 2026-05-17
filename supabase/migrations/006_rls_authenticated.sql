-- Add RLS policies for authenticated role (Google OAuth users)
-- Admin writes go through security definer RPCs which bypass RLS,
-- so only read + user-facing writes are needed here.

-- spaces: authenticated read
create policy "spaces_auth_read" on spaces
  for select to authenticated using (true);

-- events: authenticated read active/archived
create policy "events_auth_read" on events
  for select to authenticated using (status <> 'deleted');

-- responses: authenticated read/write
create policy "responses_auth_read" on responses
  for select to authenticated using (true);

create policy "responses_auth_insert" on responses
  for insert to authenticated with check (true);

create policy "responses_auth_update" on responses
  for update to authenticated using (true) with check (true);

-- members: authenticated full CRUD
create policy "members_auth_read" on members
  for select to authenticated using (true);

create policy "members_auth_insert" on members
  for insert to authenticated with check (true);

create policy "members_auth_update" on members
  for update to authenticated using (true) with check (true);

create policy "members_auth_delete" on members
  for delete to authenticated using (true);

-- config: authenticated read (ADMIN_TOKEN already deleted in 005)
create policy "config_auth_read" on config
  for select to authenticated using (true);
