import { describe, expect, it } from 'vitest'
import { formatMemberNameForDisplay, getIsAllDay, sortMembers, sortMembersByPart } from '../src/lib/utils'

describe('member ordering and display', () => {
  it('sorts known parts in specification order and unknown parts last', () => {
    const members = [
      { userKey: '1', part: 'その他', name: '伊藤', displayName: '', createdAt: '', updatedAt: '' },
      { userKey: '2', part: 'Cl', name: '鈴木', displayName: '', createdAt: '', updatedAt: '' },
      { userKey: '3', part: 'Fl', name: '山田', displayName: '', createdAt: '', updatedAt: '' },
    ]
    expect(sortMembers(members).map(m => m.part)).toEqual(['Fl', 'Cl', 'その他'])
    expect([...sortMembersByPart(members).keys()]).toEqual(['Fl', 'Cl', 'その他'])
  })

  it('truncates long names with the documented line break', () => {
    expect(formatMemberNameForDisplay('山田太郎')).toBe('山田太郎')
    expect(formatMemberNameForDisplay('山田太郎花子々')).toBe('山田\n太郎花...')
  })
})

describe('calendar input normalization', () => {
  it.each([true, 'TRUE', 1, '1'])('recognizes %s as all-day', value => {
    expect(getIsAllDay(value)).toBe(true)
  })
  it.each([false, 'false', 0, '0', null, undefined])('rejects %s as all-day', value => {
    expect(getIsAllDay(value)).toBe(false)
  })
})
