-- Phase 1: Create the single space and set the admin token
-- Run this after applying migrations.
-- Replace the values below with your actual settings.

-- 1. Create the space (copy this UUID and set it as VITE_SPACE_ID)
insert into spaces (id, name)
values (gen_random_uuid(), 'まるカレ')
returning id, name;

-- 2. After running the above, set the admin token (replace <space_id> and <token>):
-- insert into config (space_id, key, value)
-- values
--   ('<space_id>', 'ADMIN_TOKEN', '<your-secret-token>'),
--   ('<space_id>', 'CALENDAR_ID', '<google-calendar-id>'),
--   ('<space_id>', 'SHOW_ONLY_FUTURE_EVENTS', 'false');
