import { supabase, supabasePublic, SPACE_ID } from './supabase';
import type {
  AttendanceEvent,
  AttendanceResponse,
  Config,
  DbConfig,
  DbEvent,
  DbMember,
  DbResponse,
  EventInput,
  Member,
} from '../types/models';

// --- Status conversion ---

const DB_TO_FRONTEND: Record<string, AttendanceResponse['status']> = {
  attend: '○',
  maybe: '△',
  absent: '×',
  unselected: '-',
};

const FRONTEND_TO_DB: Record<string, string> = {
  '○': 'attend',
  '△': 'maybe',
  '×': 'absent',
  '-': 'unselected',
};

// --- Display period filter (matches GAS getEvents() logic) ---

function filterByDisplayPeriod(events: AttendanceEvent[], config: Config): AttendanceEvent[] {
  const now = new Date();
  let startDate: Date | null = null;
  let endDate: Date | null = null;
  const c = config as unknown as Record<string, string>;

  const showAll = c['SHOW_ALL_EVENTS'] === 'true';
  if (!showAll) {
    startDate = now;
  } else {
    const s = c['DISPLAY_START_DATE'];
    if (s) startDate = new Date(s);
  }

  const e = c['DISPLAY_END_DATE'];
  if (e) {
    endDate = new Date(e);
    endDate.setHours(23, 59, 59, 999);
  }

  if (!startDate && !endDate) return events;

  return events.filter((ev) => {
    const evStart = new Date(ev.start);
    const evEnd = new Date(ev.end);
    if (startDate && evEnd < startDate) return false;
    if (endDate && evStart > endDate) return false;
    return true;
  });
}

// --- Converters ---

function toEvent(row: DbEvent): AttendanceEvent {
  return {
    id: row.id,
    title: row.title,
    start: row.start_at,
    end: row.end_at,
    isAllDay: row.is_all_day,
    location: row.location ?? '',
    description: row.description ?? undefined,
    calendarEventId: row.calendar_event_id ?? undefined,
    status: row.status as AttendanceEvent['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMember(row: DbMember): Member {
  return {
    userKey: row.user_key,
    part: row.part,
    name: row.name,
    displayName: row.display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toResponse(row: DbResponse): AttendanceResponse {
  return {
    eventId: row.event_id,
    userKey: row.user_key,
    status: DB_TO_FRONTEND[row.status] ?? '-',
    comment: row.comment ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toResponsesMap(rows: DbResponse[]): Record<string, AttendanceResponse[]> {
  const map: Record<string, AttendanceResponse[]> = {};
  for (const row of rows) {
    if (!map[row.event_id]) map[row.event_id] = [];
    map[row.event_id].push(toResponse(row));
  }
  return map;
}

// --- API ---

export const api = {
  // ------------------------------------------------------------------
  // Read (direct Supabase anon key)
  // ------------------------------------------------------------------

  async getInitData(): Promise<{
    config: Config;
    members: Member[];
    events: AttendanceEvent[];
    responsesMap: Record<string, AttendanceResponse[]>;
  }> {
    const [configResult, membersResult, eventsResult, responsesResult] = await Promise.all([
      supabasePublic.from('config').select('key,value').eq('space_id', SPACE_ID),
      supabasePublic.from('members').select('*').eq('space_id', SPACE_ID),
      supabasePublic.from('events').select('*').eq('space_id', SPACE_ID).neq('status', 'deleted').order('start_at', { ascending: true }),
      supabasePublic.from('responses').select('*').eq('space_id', SPACE_ID),
    ]);

    const config: Config = { AUTH_MODE: 'anonymous' };
    (configResult.data as DbConfig[] | null)?.forEach(({ key, value }) => {
      (config as unknown as Record<string, string>)[key] = value;
    });

    const events = filterByDisplayPeriod(
      (eventsResult.data as DbEvent[] | null)?.map(toEvent) ?? [],
      config,
    );

    return {
      config,
      members: (membersResult.data as DbMember[] | null)?.map(toMember) ?? [],
      events,
      responsesMap: toResponsesMap((responsesResult.data as DbResponse[] | null) ?? []),
    };
  },

  async getAllEventsWithResponses(): Promise<{
    success: boolean;
    events: AttendanceEvent[];
    responsesMap: Record<string, AttendanceResponse[]>;
    error?: string;
  }> {
    const [configResult, eventsResult, responsesResult] = await Promise.all([
      supabasePublic.from('config').select('key,value').eq('space_id', SPACE_ID),
      supabasePublic.from('events').select('*').eq('space_id', SPACE_ID).neq('status', 'deleted').order('start_at', { ascending: true }),
      supabasePublic.from('responses').select('*').eq('space_id', SPACE_ID),
    ]);
    if (eventsResult.error) return { success: false, events: [], responsesMap: {}, error: eventsResult.error.message };
    if (responsesResult.error) return { success: false, events: [], responsesMap: {}, error: responsesResult.error.message };

    const config: Config = { AUTH_MODE: 'anonymous' };
    (configResult.data as DbConfig[] | null)?.forEach(({ key, value }) => {
      (config as unknown as Record<string, string>)[key] = value;
    });

    const events = filterByDisplayPeriod((eventsResult.data as DbEvent[]).map(toEvent), config);
    return {
      success: true,
      events,
      responsesMap: toResponsesMap((responsesResult.data as DbResponse[]) ?? []),
    };
  },

  async getMembers(): Promise<Member[]> {
    const { data, error } = await supabasePublic.from('members').select('*').eq('space_id', SPACE_ID);
    if (error) throw new Error(error.message);
    return (data as DbMember[]).map(toMember);
  },

  async getAllEventsForLocationHistory(): Promise<AttendanceEvent[]> {
    const { data, error } = await supabasePublic.from('events').select('*').eq('space_id', SPACE_ID).neq('status', 'deleted').order('start_at', { ascending: false });
    if (error) return [];
    return (data as DbEvent[]).map(toEvent);
  },

  // ------------------------------------------------------------------
  // Response upsert (direct anon key)
  // ------------------------------------------------------------------

  async userSubmitResponsesBatch(
    responses: Array<{ eventId: string; userKey: string; status: AttendanceResponse['status']; comment?: string }>,
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    const rows = responses.map((r) => ({
      space_id: SPACE_ID,
      event_id: r.eventId,
      user_key: r.userKey,
      status: FRONTEND_TO_DB[r.status] ?? 'unselected',
      comment: r.comment ?? null,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('responses').upsert(rows, { onConflict: 'event_id,user_key' });
    if (error) return { success: 0, failed: responses.length, errors: [error.message] };
    return { success: responses.length, failed: 0, errors: [] };
  },

  // ------------------------------------------------------------------
  // Member CRUD (direct anon key - open in Phase 1)
  // ------------------------------------------------------------------

  async createMember(userKey: string, part: string, name: string, displayName: string): Promise<{ success: boolean; error?: string }> {
    if (!userKey || !part || !name || !displayName) return { success: false, error: 'userKey, part, name, displayNameは必須です' };
    const { error } = await supabase.from('members').upsert(
      { space_id: SPACE_ID, user_key: userKey, part, name, display_name: displayName, updated_at: new Date().toISOString() },
      { onConflict: 'space_id,user_key' },
    );
    if (error) return { success: false, error: error.message };
    return { success: true };
  },

  async updateMember(userKey: string, part: string, name: string, displayName: string): Promise<{ success: boolean; error?: string }> {
    if (!userKey || !part || !name || !displayName) return { success: false, error: 'userKey, part, name, displayNameは必須です' };
    const { error } = await supabase.from('members')
      .update({ part, name, display_name: displayName, updated_at: new Date().toISOString() })
      .eq('space_id', SPACE_ID)
      .eq('user_key', userKey);
    if (error) return { success: false, error: error.message };
    return { success: true };
  },

  async deleteMemberAPI(userKey: string): Promise<{ success: boolean; error?: string }> {
    if (!userKey) return { success: false, error: 'userKeyは必須です' };
    const { error: rErr } = await supabase.from('responses').delete().eq('space_id', SPACE_ID).eq('user_key', userKey);
    if (rErr) return { success: false, error: rErr.message };
    const { error } = await supabase.from('members').delete().eq('space_id', SPACE_ID).eq('user_key', userKey);
    if (error) return { success: false, error: error.message };
    return { success: true };
  },

  // ------------------------------------------------------------------
  // Admin: Event CRUD (RPC)
  // ------------------------------------------------------------------

  async adminCreateEvent(
    eventData: EventInput,
  ): Promise<{ success: boolean; event?: AttendanceEvent; error?: string }> {
    const { data, error } = await supabase.rpc('admin_create_event', {
      p_space_id:    SPACE_ID,
      p_title:       eventData.title,
      p_start_at:    eventData.start,
      p_end_at:      eventData.end,
      p_is_all_day:  eventData.isAllDay ?? false,
      p_location:    eventData.location ?? null,
      p_description: eventData.description ?? null,
    });
    if (error) return { success: false, error: error.message };
    const result = data as { success: boolean; event?: DbEvent; error?: string };
    if (!result.success) return { success: false, error: result.error };
    return { success: true, event: result.event ? toEvent(result.event) : undefined };
  },

  async adminUpdateEvent(
    eventId: string,
    updates: Partial<EventInput>,
  ): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.rpc('admin_update_event', {
      p_space_id:    SPACE_ID,
      p_event_id:    eventId,
      p_title:       updates.title ?? null,
      p_start_at:    updates.start ?? null,
      p_end_at:      updates.end ?? null,
      p_is_all_day:  updates.isAllDay ?? null,
      p_location:    updates.location ?? null,
      p_description: updates.description ?? null,
    });
    if (error) return { success: false, error: error.message };
    return data as { success: boolean; error?: string };
  },

  async adminDeleteEvent(eventId: string): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.rpc('admin_delete_event', {
      p_space_id: SPACE_ID,
      p_event_id: eventId,
    });
    if (error) return { success: false, error: error.message };
    return data as { success: boolean; error?: string };
  },

  // ------------------------------------------------------------------
  // Admin: Config (RPC)
  // ------------------------------------------------------------------

  async adminSetDisplayPeriod(startDate: string, endDate: string): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.rpc('admin_set_display_period', {
      p_space_id:   SPACE_ID,
      p_start_date: startDate,
      p_end_date:   endDate,
    });
    if (error) return { success: false, error: error.message };
    return data as { success: boolean; error?: string };
  },

  async adminSetShowAllEvents(flag: boolean): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.rpc('admin_set_show_all_events', {
      p_space_id: SPACE_ID,
      p_flag:     flag,
    });
    if (error) return { success: false, error: error.message };
    return data as { success: boolean; error?: string };
  },

  // ------------------------------------------------------------------
  // Admin: Cleanup (RPC)
  // ------------------------------------------------------------------

  async adminCleanupAllData(): Promise<{ success: boolean; calendarDeleted?: number; eventsDeleted?: number; responsesDeleted?: number; auditLogDeleted?: number; errors?: string[] }> {
    const { data, error } = await supabase.rpc('admin_cleanup_all', {
      p_space_id: SPACE_ID,
    });
    if (error) return { success: false, errors: [error.message] };
    return data as { success: boolean; eventsDeleted: number; responsesDeleted: number };
  },

  async adminCleanupMembersAndResponses(): Promise<{ success: boolean; membersDeleted?: number; responsesDeleted?: number; errors?: string[] }> {
    const { data, error } = await supabase.rpc('admin_cleanup_members_responses', {
      p_space_id: SPACE_ID,
    });
    if (error) return { success: false, errors: [error.message] };
    return data as { success: boolean; membersDeleted: number; responsesDeleted: number };
  },

  // ------------------------------------------------------------------
  // Calendar sync (Edge Function)
  // ------------------------------------------------------------------

  async syncEvent(eventId: string): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.functions.invoke('calendar-sync', {
      body: { action: 'syncOne', spaceId: SPACE_ID, eventId },
    });
    if (error) return { success: false, error: error.message };
    return data as { success: boolean; error?: string };
  },

  async syncAllEvents(limit: boolean): Promise<{ success: number; failed: number; errors: string[] }> {
    const { data, error } = await supabase.functions.invoke('calendar-sync', {
      body: { action: 'syncAll', spaceId: SPACE_ID, limit },
    });
    if (error) return { success: 0, failed: 1, errors: [error.message] };
    return data as { success: number; failed: number; errors: string[] };
  },

  async syncAttendance(eventIds: string[]): Promise<{ success: number; failed: number; errors: string[] }> {
    if (eventIds.length === 0) return { success: 0, failed: 0, errors: [] };
    const { data, error } = await supabase.functions.invoke('calendar-sync', {
      body: { action: 'syncAttendance', spaceId: SPACE_ID, eventIds },
    });
    if (error) return { success: 0, failed: eventIds.length, errors: [error.message] };
    return (data as { success: number; failed: number; errors: string[] }) ?? { success: 0, failed: 0, errors: [] };
  },
};
