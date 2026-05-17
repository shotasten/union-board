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

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

const db = createClient(
  SUPABASE_URL,
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

// start_at/end_at are stored as UTC timestamps (JST midnight = UTC 15:00 previous day).
// For all-day events we need the JST date string, not the UTC date string.
function toJSTDateString(isoString: string): string {
  const jst = new Date(new Date(isoString).getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

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
      ? { date: toJSTDateString(event.start_at) }
      : { dateTime: event.start_at, timeZone: 'Asia/Tokyo' },
    end: event.is_all_day
      ? { date: toJSTDateString(event.end_at) }
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

const corsHeaders = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
const ok = (payload: unknown) => new Response(JSON.stringify(payload), { headers: corsHeaders });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
      },
    });
  }

  try {
  const body = (await req.json()) as {
    spaceId: string;
    action?: string;
    eventId?: string;
    eventIds?: string[];
    limit?: boolean;
  };

  const { spaceId, action = 'syncAll', eventId, eventIds, limit } = body;

  if (!CALENDAR_ID) {
    return ok({ success: 0, failed: 0, errors: ['GOOGLE_CALENDAR_ID not configured'] });
  }

  // syncAttendance は一般ユーザーからも呼ばれるため認証不要（出欠サマリー書き込みのみ）
  // それ以外の操作（作成・更新・削除）は Supabase Auth JWT で管理者検証
  if (action !== 'syncAttendance') {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return ok({ success: 0, failed: 0, errors: ['Unauthorized'] });
    }
    const userDb = createClient(
      SUPABASE_URL,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: adminOk } = await userDb.rpc('is_space_admin', { p_space_id: spaceId });
    if (!adminOk) {
      return ok({ success: 0, failed: 0, errors: ['Unauthorized'] });
    }
  }

  type ResponseRow = { event_id: string; user_key: string; status: string; comment: string | null };
  type MemberRow = { user_key: string; name: string; display_name: string; part: string };
  const statusLabel: Record<string, string> = { attend: '○', maybe: '△', absent: '×', unselected: '-' };
  const partOrder = ['Fl', 'Ob', 'Cl', 'Sax', 'Hr', 'Tp', 'Tb', 'Bass', 'Perc', 'その他'];

  function buildDescription(ev: DbEvent, eventResponses: ResponseRow[], memberMap: Map<string, MemberRow>): string {
    let attend = 0, maybe = 0, absent = 0, unselected = 0;
    for (const r of eventResponses) {
      if (!memberMap.has(r.user_key)) continue;
      if (r.status === 'attend') attend++;
      else if (r.status === 'maybe') maybe++;
      else if (r.status === 'absent') absent++;
      else unselected++;
    }
    const total = attend + maybe + absent + unselected;

    let desc = '';
    if (ev.description?.trim()) desc += ev.description.trim() + '\n\n';

    desc += '【出欠状況】\n';
    desc += `○ 参加: ${attend}人\n`;
    desc += `△ 遅早: ${maybe}人\n`;
    desc += `× 欠席: ${absent}人\n`;
    desc += `- 未定: ${unselected}人\n`;
    desc += `合計: ${total}人\n\n`;

    const statusGroups: Array<{ key: string; label: string }> = [
      { key: 'attend', label: '○ (参加) の内訳' },
      { key: 'maybe', label: '△ (遅早) の内訳' },
      { key: 'absent', label: '× (欠席) の内訳' },
      { key: 'unselected', label: '- (未定) の内訳' },
    ];
    desc += '【パート別内訳】\n';
    for (const { key, label } of statusGroups) {
      const rows = eventResponses.filter(r => r.status === key && memberMap.has(r.user_key));
      if (rows.length === 0) continue;
      desc += `${label}\n`;
      const byPart = new Map<string, string[]>();
      for (const r of rows) {
        const m = memberMap.get(r.user_key)!;
        const part = m.part || 'その他';
        if (!byPart.has(part)) byPart.set(part, []);
        byPart.get(part)!.push(m.display_name || m.name);
      }
      const sortedParts = [...byPart.keys()].sort((a, b) => {
        const ai = partOrder.indexOf(a), bi = partOrder.indexOf(b);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
      for (const part of sortedParts) {
        const names = byPart.get(part)!;
        desc += `${part} (${names.length}人): ${names.join('、')}\n`;
      }
      desc += '\n';
    }

    const comments = eventResponses.filter(r => r.comment?.trim() && memberMap.has(r.user_key));
    desc += '【コメント】\n';
    if (comments.length > 0) {
      for (const r of comments) {
        const m = memberMap.get(r.user_key)!;
        const name = m.display_name || m.name;
        const commentLines = (r.comment ?? '').split('\n');
        const prefix = `${statusLabel[r.status] ?? '-'} ${name}: `;
        desc += prefix + commentLines[0] + '\n';
        for (let i = 1; i < commentLines.length; i++) {
          desc += '  ' + commentLines[i] + '\n';
        }
      }
    } else {
      desc += '（コメントなし）\n';
    }

    const now = new Date();
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const formatted = jst.toISOString().slice(0, 16).replace('T', ' ');
    desc += `\n最終更新: ${formatted}`;

    return desc;
  }

  // --- syncAttendance: description のみ PATCH ---
  if (action === 'syncAttendance') {
    const targetIds = eventIds ?? (eventId ? [eventId] : []);
    if (targetIds.length === 0) return ok({ success: 0, failed: 0, errors: ['eventIds is required'] });

    const [{ data: evData, error: evErr }, { data: responses, error: rErr }, { data: members, error: mErr }] = await Promise.all([
      db.from('events').select('*').eq('space_id', spaceId).in('id', targetIds),
      db.from('responses').select('event_id,user_key,status,comment').eq('space_id', spaceId).in('event_id', targetIds),
      db.from('members').select('user_key,name,display_name,part').eq('space_id', spaceId),
    ]);
    if (evErr) return ok({ success: 0, failed: 0, errors: [evErr.message] });
    if (rErr) return ok({ success: 0, failed: 0, errors: [rErr.message] });
    if (mErr) return ok({ success: 0, failed: 0, errors: [mErr.message] });

    const memberMap = new Map<string, MemberRow>();
    for (const m of (members ?? []) as MemberRow[]) memberMap.set(m.user_key, m);

    const responsesMap = new Map<string, ResponseRow[]>();
    for (const r of (responses ?? []) as ResponseRow[]) {
      if (!responsesMap.has(r.event_id)) responsesMap.set(r.event_id, []);
      responsesMap.get(r.event_id)!.push(r);
    }

    const token = await getAccessToken();
    const calId = encodeURIComponent(CALENDAR_ID);
    let success = 0, failed = 0;
    const errors: string[] = [];

    for (const ev of (evData ?? []) as DbEvent[]) {
      if (!ev.calendar_event_id || ev.status === 'deleted') continue;
      const description = buildDescription(ev, responsesMap.get(ev.id) ?? [], memberMap);
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${ev.calendar_event_id}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ description }),
        },
      );
      if (res.ok) { success++; } else { failed++; errors.push(`Failed to patch: ${ev.title}`); }
    }
    return ok({ success, failed, errors });
  }

  // --- syncOne / syncAll ---
  let query = db.from('events').select('*').eq('space_id', spaceId);

  if (action === 'syncOne' && eventId) {
    query = query.eq('id', eventId);
  } else {
    query = query.neq('status', 'deleted');
  }

  const eventsQuery = query;
  let responsesQuery = db.from('responses').select('event_id,user_key,status,comment').eq('space_id', spaceId);
  if (action === 'syncOne' && eventId) {
    responsesQuery = responsesQuery.eq('event_id', eventId);
  }

  const [{ data, error }, { data: responses, error: rErr }, { data: members, error: mErr }] = await Promise.all([
    eventsQuery,
    responsesQuery,
    db.from('members').select('user_key,name,display_name,part').eq('space_id', spaceId),
  ]);
  if (error) return ok({ success: 0, failed: 0, errors: [error.message] });
  if (rErr) return ok({ success: 0, failed: 0, errors: [rErr.message] });
  if (mErr) return ok({ success: 0, failed: 0, errors: [mErr.message] });

  const memberMap = new Map<string, MemberRow>();
  for (const m of (members ?? []) as MemberRow[]) memberMap.set(m.user_key, m);

  const responsesMap = new Map<string, ResponseRow[]>();
  for (const r of (responses ?? []) as ResponseRow[]) {
    if (!responsesMap.has(r.event_id)) responsesMap.set(r.event_id, []);
    responsesMap.get(r.event_id)!.push(r);
  }

  // syncAll + limit=true のとき、表示期間設定に基づいてイベントを絞り込む（GAS syncAll と同じロジック）
  let syncStartDate: Date | undefined;
  let syncEndDate: Date | undefined;

  if (action === 'syncAll' && limit) {
    const { data: configData } = await db.from('config').select('key,value').eq('space_id', spaceId);
    const cfg: Record<string, string> = {};
    for (const row of (configData ?? []) as { key: string; value: string }[]) cfg[row.key] = row.value;

    const showAll = cfg['SHOW_ALL_EVENTS'] === 'true';
    const displayStart = cfg['DISPLAY_START_DATE'];
    const displayEnd = cfg['DISPLAY_END_DATE'];

    if (!showAll) {
      syncStartDate = new Date();
    } else if (displayStart) {
      const d = new Date(displayStart);
      if (!isNaN(d.getTime())) syncStartDate = d;
    }

    if (displayEnd) {
      const d = new Date(displayEnd);
      if (!isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999);
        syncEndDate = d;
      }
    }
  }

  const filteredEvents = ((data ?? []) as DbEvent[]).filter((ev) => {
    if (!syncStartDate && !syncEndDate) return true;
    const evStart = new Date(ev.start_at);
    const evEnd = new Date(ev.end_at);
    if (syncStartDate && evEnd < syncStartDate) return false;
    if (syncEndDate && evStart > syncEndDate) return false;
    return true;
  });

  const eventsWithAttendance = filteredEvents.map((ev) => ({
    ...ev,
    description: buildDescription(ev, responsesMap.get(ev.id) ?? [], memberMap),
  }));

  const result = await syncEvents(spaceId, eventsWithAttendance);
  return ok(result);
  } catch (e) {
    return ok({ success: 0, failed: 0, errors: [`Unhandled error: ${(e as Error).message}`] });
  }
});
