-- Phase 1: Create the single space and configuration
-- Run this after applying migrations.
-- Replace the values below with your actual settings.

-- 1. Create the space (copy this UUID and set it as VITE_SPACE_ID)
insert into spaces (id, name)
values (gen_random_uuid(), 'UnionBoard')
returning id, name;

-- 2. After running the above, set configuration (replace <space_id>):
-- insert into config (space_id, key, value)
-- values
--   ('<space_id>', 'CALENDAR_ID', '<google-calendar-id>'),
--   ('<space_id>', 'SHOW_ALL_EVENTS', 'false'),  -- true: 全期間表示, false: 未来のみ表示（デフォルト）
--   ('<space_id>', 'KEEPALIVE_TOKEN', '<random-token>');  -- 任意: GitHub Secret と一致させる
