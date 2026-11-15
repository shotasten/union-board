import { supabase, supabasePublic, SPACE_ID } from './supabase';
import type {
  AdminInfo,
  AdminInvitation,
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

export function getDisplayPeriod(config: Config, now = new Date()): { start: Date | null; end: Date | null } {
  const start = config.SHOW_ALL_EVENTS === 'true'
    ? (config.DISPLAY_START_DATE ? new Date(config.DISPLAY_START_DATE) : null)
    : now;
  const end = config.DISPLAY_END_DATE ? new Date(config.DISPLAY_END_DATE) : null;
  if (end) end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function filterByDisplayPeriod(events: AttendanceEvent[], config: Config, now = new Date()): AttendanceEvent[] {
  const { start, end } = getDisplayPeriod(config, now);
  return events.filter(ev => (!start || new Date(ev.end) >= start) && (!end || new Date(ev.start) <= end));
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

export function toResponsesMap(rows: DbResponse[]): Record<string, AttendanceResponse[]> {
  const map: Record<string, AttendanceResponse[]> = {};
  for (const row of rows) {
    if (!map[row.event_id]) map[row.event_id] = [];
    map[row.event_id].push(toResponse(row));
  }
  return map;
}

// PostgREST returns at most 1000 rows per request, so page through all
// responses with a stable order. Without this, rows past the cap are
// silently dropped and the newest events appear to lose their responses.
const RESPONSES_PAGE_SIZE = 1000;

export async function fetchAllResponses(eventIds?: string[]): Promise<{ data: DbResponse[]; error: { message: string } | null }> {
  const rows: DbResponse[] = [];
  // Keep URLs bounded even for large schedules. An empty list requires no request.
  const batches = eventIds ? Array.from({ length: Math.ceil(eventIds.length / 100) }, (_, i) => eventIds.slice(i * 100, i * 100 + 100)) : [undefined];
  for (const batch of batches) {
    let from = 0;
    for (;;) {
      let query = supabasePublic.from('responses').select('*').eq('space_id', SPACE_ID);
      if (batch) query = query.in('event_id', batch);
      const { data, error } = await query.order('id', { ascending: true }).range(from, from + RESPONSES_PAGE_SIZE - 1);
      if (error) return { data: rows, error };
      const page = (data as DbResponse[] | null) ?? [];
      rows.push(...page);
      if (page.length < RESPONSES_PAGE_SIZE) break;
      from += RESPONSES_PAGE_SIZE;
    }
  }
  return { data: rows, error: null };
}

async function fetchDisplayData(config: Config) {
  const { start, end } = getDisplayPeriod(config);
  const rows: DbEvent[] = [];
  for (let from = 0;; from += 1000) {
    let query = supabasePublic.from('events').select('*').eq('space_id', SPACE_ID).neq('status', 'deleted');
    if (start) query = query.gte('end_at', start.toISOString());
    if (end) query = query.lte('start_at', end.toISOString());
    const { data, error } = await query.order('start_at', { ascending: true }).order('id', { ascending: true }).range(from, from + 999);
    if (error) throw new Error(error.message);
    const page = (data as DbEvent[] | null) ?? [];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  const responses = await fetchAllResponses(rows.map(row => row.id));
  if (responses.error) throw new Error(responses.error.message);
  return { events: rows.map(toEvent), responsesMap: toResponsesMap(responses.data) };
}

async function fetchConfig(): Promise<Config> {
  const { data, error } = await supabasePublic.from('config').select('key,value').eq('space_id', SPACE_ID);
  if (error) throw new Error(error.message);
  const config: Config = { AUTH_MODE: 'anonymous' };
  (data as DbConfig[] | null)?.forEach(({ key, value }) => {
    (config as unknown as Record<string, string>)[key] = value;
  });
  return config;
}

export function validateMemberInput(userKey: string, part: string, name: string, displayName: string): string | null {
  if (!userKey || !part || !name || !displayName) return 'userKey, part, name, displayNameは必須です'
  return null
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
    const [config, membersResult] = await Promise.all([
      fetchConfig(),
      supabasePublic.from('members').select('*').eq('space_id', SPACE_ID),
    ]);
    if (membersResult.error) throw new Error(membersResult.error.message);
    const display = await fetchDisplayData(config);
    return { config, members: (membersResult.data as DbMember[] | null)?.map(toMember) ?? [], ...display };
  },

  async getAllEventsWithResponses(): Promise<{
    success: boolean;
    events: AttendanceEvent[];
    responsesMap: Record<string, AttendanceResponse[]>;
    error?: string;
  }> {
    try {
      return { success: true, ...await fetchDisplayData(await fetchConfig()) };
    } catch (error) {
      return { success: false, events: [], responsesMap: {}, error: error instanceof Error ? error.message : '取得に失敗しました' };
    }
  },

  async getMemberResponseEventIds(userKey: string): Promise<string[]> {
    const ids: string[] = [];
    for (let from = 0;; from += 1000) {
      const { data, error } = await supabasePublic.from('responses').select('event_id').eq('space_id', SPACE_ID)
        .eq('user_key', userKey).order('id', { ascending: true }).range(from, from + 999);
      if (error) throw new Error(error.message);
      const page = (data as Array<{ event_id: string }> | null) ?? [];
      ids.push(...page.map(row => row.event_id));
      if (page.length < 1000) return ids;
    }
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
    const validationError = validateMemberInput(userKey, part, name, displayName);
    if (validationError) return { success: false, error: validationError };
    const { error } = await supabase.from('members').upsert(
      { space_id: SPACE_ID, user_key: userKey, part, name, display_name: displayName, updated_at: new Date().toISOString() },
      { onConflict: 'space_id,user_key' },
    );
    if (error) return { success: false, error: error.message };
    return { success: true };
  },

  async updateMember(userKey: string, part: string, name: string, displayName: string): Promise<{ success: boolean; error?: string }> {
    const validationError = validateMemberInput(userKey, part, name, displayName);
    if (validationError) return { success: false, error: validationError };
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
  // Admin: Admin management (RPC)
  // ------------------------------------------------------------------

  async adminListAdmins(): Promise<{ success: boolean; admins?: AdminInfo[]; error?: string }> {
    const { data, error } = await supabase.rpc('admin_list_admins', { p_space_id: SPACE_ID });
    if (error) return { success: false, error: error.message };
    const result = data as { success: boolean; admins?: Array<{ user_id: string; email: string; display_name: string | null; role: string; created_at: string }>; error?: string };
    if (!result.success) return { success: false, error: result.error };
    return {
      success: true,
      admins: (result.admins ?? []).map(a => ({
        userId: a.user_id,
        email: a.email,
        displayName: a.display_name ?? null,
        role: a.role as 'owner' | 'admin',
        createdAt: a.created_at,
      })),
    };
  },

  async adminInviteAdmin(email: string, displayName: string): Promise<{ success: boolean; token?: string; error?: string }> {
    const { data, error } = await supabase.rpc('admin_invite_admin', {
      p_space_id: SPACE_ID,
      p_email: email,
      p_display_name: displayName,
    });
    if (error) return { success: false, error: error.message };
    return data as { success: boolean; token?: string; error?: string };
  },

  async adminListInvitations(): Promise<{ success: boolean; invitations?: AdminInvitation[]; error?: string }> {
    const { data, error } = await supabase.rpc('admin_list_invitations', { p_space_id: SPACE_ID });
    if (error) return { success: false, error: error.message };
    const result = data as { success: boolean; invitations?: Array<{ id: string; email: string; display_name: string; token: string; expires_at: string; created_at: string }>; error?: string };
    if (!result.success) return { success: false, error: result.error };
    return {
      success: true,
      invitations: (result.invitations ?? []).map(i => ({
        id: i.id,
        email: i.email,
        displayName: i.display_name,
        token: i.token,
        expiresAt: i.expires_at,
        createdAt: i.created_at,
      })),
    };
  },

  async adminCancelInvitation(token: string): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.rpc('admin_cancel_invitation', {
      p_space_id: SPACE_ID,
      p_token: token,
    });
    if (error) return { success: false, error: error.message };
    return data as { success: boolean; error?: string };
  },

  async adminRemoveAdmin(targetUserId: string): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.rpc('admin_remove_admin', {
      p_space_id: SPACE_ID,
      p_target_user_id: targetUserId,
    });
    if (error) return { success: false, error: error.message };
    return data as { success: boolean; error?: string };
  },

  async acceptAdminInvitation(token: string): Promise<{ success: boolean; spaceId?: string; error?: string }> {
    const { data, error } = await supabase.rpc('accept_admin_invitation', { p_token: token });
    if (error) return { success: false, error: error.message };
    const result = data as { success: boolean; space_id?: string; error?: string };
    return { success: result.success, spaceId: result.space_id, error: result.error };
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
