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

  it('keeps events crossing the start and end boundaries, including an exclusive all-day end at the boundary', () => {
    const config = { AUTH_MODE: 'anonymous' as const, SHOW_ALL_EVENTS: 'true', DISPLAY_START_DATE: '2026-08-10T00:00:00+09:00', DISPLAY_END_DATE: '2026-08-10T00:00:00+09:00' }
    const boundary = new Date(config.DISPLAY_END_DATE)
    boundary.setHours(23, 59, 59, 999)
    const start = new Date(config.DISPLAY_START_DATE)
    const cases = [
      event('all-day-boundary', '2026-08-09T00:00:00+09:00', start.toISOString()),
      event('overnight', '2026-08-09T23:00:00+09:00', '2026-08-10T01:00:00+09:00'),
      event('end-boundary', boundary.toISOString(), new Date(boundary.getTime() + 3600000).toISOString()),
      event('outside', new Date(boundary.getTime() + 1).toISOString(), new Date(boundary.getTime() + 3600000).toISOString()),
    ]
    expect(filterByDisplayPeriod(cases, config, now).map(e => e.id)).toEqual(['all-day-boundary', 'overnight', 'end-boundary'])
  })

  it('honors a start-only period and ignores it when past events are hidden', () => {
    const config = { AUTH_MODE: 'anonymous' as const, SHOW_ALL_EVENTS: 'true', DISPLAY_START_DATE: '2026-08-11T00:00:00+09:00' }
    expect(filterByDisplayPeriod(events, config, now).map(e => e.id)).toEqual(['future'])
    expect(filterByDisplayPeriod(events, { ...config, SHOW_ALL_EVENTS: 'false' }, now).map(e => e.id)).toEqual(['ongoing', 'future'])
    expect(filterByDisplayPeriod(events, { AUTH_MODE: 'anonymous', SHOW_ALL_EVENTS: 'true' }, now)).toEqual(events)
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
