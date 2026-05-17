// Frontend data models (matches existing GAS interface for compatibility)

export interface AttendanceEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  isAllDay: boolean;
  location: string;
  description?: string;
  calendarEventId?: string;
  status: 'active' | 'archived' | 'deleted';
  createdAt: string;
  updatedAt: string;
}

export interface Member {
  userKey: string;
  part: string;
  name: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

// Frontend status values (GAS compatibility)
export type ResponseStatus = '○' | '△' | '×' | '-';

export interface AttendanceResponse {
  eventId: string;
  userKey: string;
  status: ResponseStatus;
  comment?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Config {
  AUTH_MODE: 'google' | 'anonymous';
  CALENDAR_ID?: string;
  CALENDAR_SHARING_ENABLED?: string;
  DISPLAY_START_DATE?: string;
  DISPLAY_END_DATE?: string;
  SHOW_ALL_EVENTS?: string;
}

export interface InitData {
  config: Config;
  members: Member[];
  events: AttendanceEvent[];
  responses: AttendanceResponse[];
}

export interface EventInput {
  title: string;
  start: string;
  end: string;
  isAllDay?: boolean;
  location?: string;
  description?: string;
}

export interface ResponseUpdate {
  eventId: string;
  userKey: string;
  status: ResponseStatus;
  comment?: string;
}

export interface ApiResult {
  success: boolean;
  error?: string;
}

export interface EventApiResult extends ApiResult {
  event?: AttendanceEvent;
}

// Supabase DB row types (snake_case)
export interface DbEvent {
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
  created_at: string;
  updated_at: string;
}

export interface DbMember {
  id: string;
  space_id: string;
  user_key: string;
  part: string;
  name: string;
  display_name: string;
  created_at: string;
  updated_at: string;
}

export interface DbResponse {
  id: string;
  space_id: string;
  event_id: string;
  user_key: string;
  status: string;
  comment: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbConfig {
  space_id: string;
  key: string;
  value: string;
}
