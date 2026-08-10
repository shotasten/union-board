import { describe, expect, it } from 'vitest'
import { filterByDisplayPeriod, toResponsesMap, validateMemberInput } from '../src/lib/api'
import type { AttendanceEvent, DbResponse } from '../src/types/models'

const event = (id: string, start: string, end: string): AttendanceEvent => ({
  id, title: id, start, end, isAllDay: false, location: '', status: 'active', createdAt: '', updatedAt: '',
})

describe('display period filtering', () => {
  const now = new Date('2026-08-10T12:00:00+09:00')
  const events = [
    event('past', '2026-08-08T10:00:00+09:00', '2026-08-08T12:00:00+09:00'),
    event('ongoing', '2026-08-10T10:00:00+09:00', '2026-08-10T13:00:00+09:00'),
    event('future', '2026-08-12T10:00:00+09:00', '2026-08-12T12:00:00+09:00'),
  ]

  it('hides events whose end is before now by default, retaining an ongoing event', () => {
    expect(filterByDisplayPeriod(events, { AUTH_MODE: 'anonymous' }, now).map(e => e.id)).toEqual(['ongoing', 'future'])
  })

  it('uses inclusive date boundaries when SHOW_ALL_EVENTS is enabled', () => {
    const config = { AUTH_MODE: 'anonymous' as const, SHOW_ALL_EVENTS: 'true', DISPLAY_START_DATE: '2026-08-10', DISPLAY_END_DATE: '2026-08-10' }
    expect(filterByDisplayPeriod(events, config, now).map(e => e.id)).toEqual(['ongoing'])
  })
})

describe('response conversion', () => {
  it('groups by event and maps unknown statuses to unselected', () => {
    const rows = [
      { event_id: 'e1', user_key: 'u1', status: 'attend', comment: null, created_at: '', updated_at: '' },
      { event_id: 'e1', user_key: 'u2', status: 'invalid', comment: 'note', created_at: '', updated_at: '' },
    ] as DbResponse[]
    expect(toResponsesMap(rows)).toEqual({ e1: [
      { eventId: 'e1', userKey: 'u1', status: '○', createdAt: '', updatedAt: '' },
      { eventId: 'e1', userKey: 'u2', status: '-', comment: 'note', createdAt: '', updatedAt: '' },
    ] })
  })
})

describe('member input validation', () => {
  it('rejects missing required fields', () => {
    expect(validateMemberInput('', 'Fl', '山田', 'Fl山田')).toBe('userKey, part, name, displayNameは必須です')
    expect(validateMemberInput('yamada', 'Fl', '山田', '')).not.toBeNull()
  })

  it('accepts a complete member input', () => {
    expect(validateMemberInput('yamada', 'Fl', '山田', 'Fl山田')).toBeNull()
  })
})
