import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbResponse } from '../src/types/models'

// Fake PostgREST-style builder: each range() call returns only that slice,
// mimicking the real 1000-row cap that fetchAllResponses must page through.
const state = {
  rows: [] as DbResponse[],
  error: null as { message: string } | null,
  ranges: [] as Array<[number, number]>,
}

vi.mock('../src/lib/supabase', () => {
  const builder = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      select: () => b,
      eq: () => b,
      order: () => b,
      range: (from: number, to: number) => {
        state.ranges.push([from, to])
        if (state.error) return Promise.resolve({ data: null, error: state.error })
        return Promise.resolve({ data: state.rows.slice(from, to + 1), error: null })
      },
    }
    return b
  }
  return {
    supabase: {},
    supabasePublic: { from: () => builder() },
    SPACE_ID: 'test-space',
    FUNCTIONS_URL: '',
  }
})

import { fetchAllResponses } from '../src/lib/api'

const makeRows = (n: number): DbResponse[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    space_id: 'test-space',
    event_id: 'event-1',
    user_key: `user-${i}`,
    status: 'attend',
    comment: null,
    created_at: '',
    updated_at: '',
  })) as DbResponse[]

beforeEach(() => {
  state.rows = []
  state.error = null
  state.ranges = []
})

describe('fetchAllResponses', () => {
  it('returns everything in a single page when under the 1000-row cap', async () => {
    state.rows = makeRows(350)
    const result = await fetchAllResponses()
    expect(result.error).toBeNull()
    expect(result.data).toHaveLength(350)
    expect(state.ranges).toEqual([[0, 999]])
  })

  it('pages through all rows when the total exceeds the 1000-row cap', async () => {
    state.rows = makeRows(2500)
    const result = await fetchAllResponses()
    expect(result.error).toBeNull()
    expect(result.data).toHaveLength(2500)
    expect(result.data[0].user_key).toBe('user-0')
    expect(result.data[2499].user_key).toBe('user-2499')
    expect(state.ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
  })

  it('handles an exact multiple of the page size', async () => {
    state.rows = makeRows(1000)
    const result = await fetchAllResponses()
    expect(result.error).toBeNull()
    expect(result.data).toHaveLength(1000)
    expect(state.ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it('propagates an error instead of silently returning partial data as success', async () => {
    state.rows = makeRows(10)
    state.error = { message: 'boom' }
    const result = await fetchAllResponses()
    expect(result.error).toEqual({ message: 'boom' })
  })
})
