import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ config: [] as Array<{ key: string; value: string }>, events: [] as any[], responses: [] as any[], requests: [] as any[] }))
vi.mock('../src/lib/supabase', () => ({
  SPACE_ID: 'space', supabase: {},
  supabasePublic: { from: (table: string) => {
    let rows = [...(state as any)[table]]
    const request: any = { table, filters: [] }
    state.requests.push(request)
    const b: any = {
      select: () => b,
      eq: (key: string, value: string) => { if (key !== 'space_id') rows = rows.filter(r => r[key] === value); return b },
      neq: (key: string, value: string) => { rows = rows.filter(r => r[key] !== value); return b },
      gte: (key: string, value: string) => { request.filters.push([key, 'gte', value]); rows = rows.filter(r => new Date(r[key]) >= new Date(value)); return b },
      lte: (key: string, value: string) => { request.filters.push([key, 'lte', value]); rows = rows.filter(r => new Date(r[key]) <= new Date(value)); return b },
      in: (key: string, values: string[]) => { request.filters.push([key, 'in', values]); rows = rows.filter(r => values.includes(r[key])); return b },
      order: () => b,
      range: (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
      then: (resolve: (value: unknown) => void) => Promise.resolve({ data: rows, error: null }).then(resolve),
    }
    return b
  } },
}))
import { api } from '../src/lib/api'

beforeEach(() => {
  vi.useFakeTimers().setSystemTime(new Date('2026-08-10T12:00:00+09:00'))
  state.config = []
  state.requests = []
  ;(state as any).members = []
  state.events = [
    { id: 'past', start_at: '2026-08-08T00:00:00+09:00', end_at: '2026-08-09T00:00:00+09:00', status: 'active' },
    { id: 'camp', start_at: '2026-08-09T00:00:00+09:00', end_at: '2026-08-11T00:00:00+09:00', status: 'active', is_all_day: true },
    { id: 'future', start_at: '2026-08-12T10:00:00+09:00', end_at: '2026-08-12T11:00:00+09:00', status: 'active' },
  ]
  state.responses = state.events.map(e => ({ id: e.id, event_id: e.id, user_key: 'u', status: 'attend', comment: e.id }))
})

describe('display data fetching', () => {
  it('queries overlapping events and only their responses, then replaces results when the range changes', async () => {
    const first = await api.getInitData()
    expect(first.events.map(e => e.id)).toEqual(['camp', 'future'])
    expect(Object.keys(first.responsesMap)).toEqual(['camp', 'future'])
    expect(first.responsesMap.camp[0].comment).toBe('camp')
    expect(state.requests.find(r => r.table === 'responses').filters).toEqual([['event_id', 'in', ['camp', 'future']]])
    state.config = [{ key: 'SHOW_ALL_EVENTS', value: 'true' }, { key: 'DISPLAY_END_DATE', value: '2026-08-08T00:00:00+09:00' }]
    const second = await api.getAllEventsWithResponses()
    expect(second.events.map(e => e.id)).toEqual(['past'])
    expect(Object.keys(second.responsesMap)).toEqual(['past'])
  })

  it('makes no responses request for an empty range', async () => {
    state.events = []
    const result = await api.getInitData()
    expect(result.responsesMap).toEqual({})
    expect(state.requests.some(r => r.table === 'responses')).toBe(false)
  })
})
