import { describe, expect, it } from 'vitest'
import { toResponsesMap, validateMemberInput } from '../src/lib/api'
import type { DbResponse } from '../src/types/models'

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
