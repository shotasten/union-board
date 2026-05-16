/**
 * Google Calendar Sync Edge Function
 *
 * Syncs events between Supabase and Google Calendar using a service account.
 * Called by:
 *   - admin API (/sync-calendar route) for on-demand sync
 *   - pg_cron for scheduled sync (Phase 1)
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   GOOGLE_SERVICE_ACCOUNT_JSON  (JSON key file from GCP)
 *   GOOGLE_CALENDAR_ID           (target calendar ID)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const CALENDAR_ID = Deno.env.get('GOOGLE_CALENDAR_ID')!;

// --- Google Auth (service account JWT) ---

async function getAccessToken(): Promise<string> {
  const sa = JSON.parse(Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')!) as {
    client_email: string;
    private_key: string;
  };

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const signingInput = `${enc(header)}.${enc(payload)}`;

  const pemKey = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');

  const binaryKey = Uint8Array.from(atob(pemKey), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const jwt = `${signingInput}.${sigB64}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const tokenData = (await tokenRes.json()) as { access_token: string };
  return tokenData.access_token;
}

// --- Calendar API helpers ---

async function upsertCalendarEvent(
  token: string,
  event: {
    id: string;
    title: string;
    start_at: string;
    end_at: string;
    is_all_day: boolean;
    location: string | null;
    description: string | null;
    calendar_event_id: string | null;
  },
): Promise<string | null> {
  const body = {
    summary: event.title,
    location: event.location ?? undefined,
    description: event.description ?? undefined,
    start: event.is_all_day
      ? { date: event.start_at.slice(0, 10) }
      : { dateTime: event.start_at, timeZone: 'Asia/Tokyo' },
    end: event.is_all_day
      ? { date: event.end_at.slice(0, 10) }
      : { dateTime: event.end_at, timeZone: 'Asia/Tokyo' },
  };

  const calId = encodeURIComponent(CALENDAR_ID);

  if (event.calendar_event_id) {
    // Update
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${event.calendar_event_id}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    if (res.ok) return event.calendar_event_id;
    // If not found, fall through to create
    if (res.status !== 404) return null;
  }

  // Create
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calId}/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { id: string };
  return data.id;
}

async function deleteCalendarEvent(token: string, calEventId: string): Promise<void> {
  const calId = encodeURIComponent(CALENDAR_ID);
  await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${calEventId}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
  );
}

// --- Main ---

type DbEvent = {
  id: string;
  space_id: string;
  title: string;
  start_at: string;
  end_at: string;
  is_all_day: boolean;
  location: string | null;
  description: string | null;
  calendar_event_id: string | null;
  status: string;
};

async function syncEvents(
  spaceId: string,
  events: DbEvent[],
): Promise<{ success: number; failed: number; errors: string[] }> {
  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  const token = await getAccessToken();

  for (const event of events) {
    try {
      if (event.status === 'deleted') {
        if (event.calendar_event_id) {
          await deleteCalendarEvent(token, event.calendar_event_id);
          await db
            .from('events')
            .update({ calendar_event_id: null })
            .eq('id', event.id);
        }
        success++;
        continue;
      }

      const calEventId = await upsertCalendarEvent(token, event);
      if (calEventId) {
        await db
          .from('events')
          .update({ calendar_event_id: calEventId })
          .eq('id', event.id);
        success++;
      } else {
        failed++;
        errors.push(`Failed to sync event: ${event.title}`);
      }
    } catch (e) {
      failed++;
      errors.push(`Error syncing "${event.title}": ${(e as Error).message}`);
    }
  }

  return { success, failed, errors };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  const body = (await req.json()) as {
    spaceId: string;
    action?: string;
    eventId?: string;
  };

  const { spaceId, action = 'syncAll', eventId } = body;

  if (!CALENDAR_ID) {
    return new Response(
      JSON.stringify({ success: false, error: 'GOOGLE_CALENDAR_ID not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let query = db.from('events').select('*').eq('space_id', spaceId);

  if (action === 'syncOne' && eventId) {
    query = query.eq('id', eventId);
  } else {
    query = query.neq('status', 'deleted');
  }

  const { data, error } = await query;
  if (error) {
    return new Response(JSON.stringify({ success: 0, failed: 0, errors: [error.message] }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await syncEvents(spaceId, (data ?? []) as DbEvent[]);
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
});
