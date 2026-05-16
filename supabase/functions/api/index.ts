import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(supabaseUrl, serviceRoleKey);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function err(message: string, status = 400): Response {
  return json({ success: false, error: message }, status);
}

async function verifyAdmin(spaceId: string, adminToken: string): Promise<boolean> {
  const { data } = await db
    .from('config')
    .select('value')
    .eq('space_id', spaceId)
    .eq('key', 'ADMIN_TOKEN')
    .single();
  return data?.value === adminToken;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') return err('Method not allowed', 405);

  const url = new URL(req.url);
  // path: /api/<route>
  const route = url.pathname.replace(/^\/api/, '').replace(/^\//, '') || '';

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return err('Invalid JSON body');
  }

  const spaceId = body.spaceId as string;
  if (!spaceId) return err('spaceId is required');

  // ---- Routes ----

  if (route === 'check-admin') {
    const token = body.adminToken as string;
    if (!token) return json({ isAdmin: false });
    const ok = await verifyAdmin(spaceId, token);
    return json({ isAdmin: ok });
  }

  if (route === 'events') {
    const action = body.action as string;
    const token = body.adminToken as string;
    if (!await verifyAdmin(spaceId, token)) return err('Unauthorized', 401);

    if (action === 'create') {
      const ev = body.event as Record<string, unknown>;
      const { data, error } = await db
        .from('events')
        .insert({
          space_id: spaceId,
          title: ev.title,
          start_at: ev.start,
          end_at: ev.end,
          is_all_day: ev.isAllDay ?? false,
          location: ev.location ?? null,
          description: ev.description ?? null,
          status: 'active',
        })
        .select()
        .single();
      if (error) return err(error.message);
      const event = rowToEvent(data as Record<string, unknown>);
      return json({ success: true, event });
    }

    if (action === 'update') {
      const eventId = body.eventId as string;
      const updates = body.updates as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      if (updates.title !== undefined) patch.title = updates.title;
      if (updates.start !== undefined) patch.start_at = updates.start;
      if (updates.end !== undefined) patch.end_at = updates.end;
      if (updates.isAllDay !== undefined) patch.is_all_day = updates.isAllDay;
      if (updates.location !== undefined) patch.location = updates.location;
      if (updates.description !== undefined) patch.description = updates.description;
      const { error } = await db
        .from('events')
        .update(patch)
        .eq('space_id', spaceId)
        .eq('id', eventId);
      if (error) return err(error.message);
      return json({ success: true });
    }

    if (action === 'delete') {
      const eventId = body.eventId as string;
      const { error } = await db
        .from('events')
        .update({ status: 'deleted' })
        .eq('space_id', spaceId)
        .eq('id', eventId);
      if (error) return err(error.message);
      return json({ success: true });
    }

    return err(`Unknown events action: ${action}`);
  }

  if (route === 'config') {
    const action = body.action as string;
    const token = body.adminToken as string;
    if (!await verifyAdmin(spaceId, token)) return err('Unauthorized', 401);

    if (action === 'setDisplayPeriod') {
      const startDate = (body.startDate as string) || '';
      const endDate = (body.endDate as string) || '';
      await db.from('config').upsert([
        { space_id: spaceId, key: 'DISPLAY_START_DATE', value: startDate },
        { space_id: spaceId, key: 'DISPLAY_END_DATE', value: endDate },
      ]);
      return json({ success: true });
    }

    if (action === 'setShowOnlyFutureEvents') {
      const flag = String(body.flag === true);
      await db.from('config').upsert(
        { space_id: spaceId, key: 'SHOW_ONLY_FUTURE_EVENTS', value: flag },
        { onConflict: 'space_id,key' },
      );
      return json({ success: true });
    }

    return err(`Unknown config action: ${action}`);
  }

  if (route === 'sync-calendar') {
    const token = body.adminToken as string;
    if (!await verifyAdmin(spaceId, token)) return err('Unauthorized', 401);

    // Trigger the calendar-sync function
    const action = body.action as string;
    const syncUrl = `${supabaseUrl}/functions/v1/calendar-sync`;
    const syncBody = { spaceId, action, eventId: body.eventId };
    const res = await fetch(syncUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify(syncBody),
    });
    const result = await res.json();
    return json(result, res.status);
  }

  if (route === 'cleanup') {
    const action = body.action as string;
    const token = body.adminToken as string;
    if (!await verifyAdmin(spaceId, token)) return err('Unauthorized', 401);

    if (action === 'membersAndResponses') {
      const { count: rCount, error: rErr } = await db
        .from('responses')
        .delete({ count: 'exact' })
        .eq('space_id', spaceId);
      if (rErr) return err(rErr.message);

      const { count: mCount, error: mErr } = await db
        .from('members')
        .delete({ count: 'exact' })
        .eq('space_id', spaceId);
      if (mErr) return err(mErr.message);

      return json({ success: true, membersDeleted: mCount ?? 0, responsesDeleted: rCount ?? 0 });
    }

    if (action === 'all') {
      const { count: rCount } = await db
        .from('responses')
        .delete({ count: 'exact' })
        .eq('space_id', spaceId);
      const { count: eCount } = await db
        .from('events')
        .delete({ count: 'exact' })
        .eq('space_id', spaceId);
      const { count: mCount } = await db
        .from('members')
        .delete({ count: 'exact' })
        .eq('space_id', spaceId);
      return json({
        success: true,
        calendarDeleted: 0,
        eventsDeleted: eCount ?? 0,
        responsesDeleted: rCount ?? 0,
        auditLogDeleted: 0,
        membersDeleted: mCount ?? 0,
      });
    }

    return err(`Unknown cleanup action: ${action}`);
  }

  return err(`Unknown route: ${route}`, 404);
});

function rowToEvent(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title,
    start: row.start_at,
    end: row.end_at,
    isAllDay: row.is_all_day,
    location: row.location ?? '',
    description: row.description ?? undefined,
    calendarEventId: row.calendar_event_id ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
