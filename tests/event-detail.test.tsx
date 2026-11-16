import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { EventDetailModal } from '../src/components/modals/EventDetailModal'
import type { AttendanceEvent, AttendanceResponse, Member } from '../src/types/models'

const event: AttendanceEvent = { id: 'event', title: '練習', start: '2026-11-28T10:00:00+09:00', end: '2026-11-28T12:00:00+09:00', isAllDay: false, location: '', status: 'active', createdAt: '', updatedAt: '' }
const members: Member[] = ['回答済', '未定回答', '未回答'].map((name, i) => ({ userKey: String(i), name, displayName: name, part: 'フルート', createdAt: '', updatedAt: '' }))
const response = (userKey: string, status: AttendanceResponse['status']): AttendanceResponse => ({ eventId: event.id, userKey, status, createdAt: '', updatedAt: '' })

function render(responses: AttendanceResponse[]) {
  return renderToStaticMarkup(<EventDetailModal open eventId={event.id} events={[event]} members={members} responsesMap={{ [event.id]: responses }} isAdmin={false} onClose={() => {}} onEdit={() => {}} onDelete={() => {}} />)
}

describe('予定詳細の集計', () => {
  it('未回答と未定回答をどちらも未定に含め、メンバー外の回答を除く', () => {
    const html = render([response('0', '○'), response('1', '-'), response('removed', '×')])
    expect(html).toContain('未定回答、未回答')
    expect(html).toContain('フルート (2人)')
    expect(html).toContain('回答済')
    expect(html).not.toContain('不明')
  })

  it('全員が未回答でも未定の内訳を表示する', () => {
    const html = render([])
    expect(html).toContain('フルート (3人)')
    expect(html).toContain('回答済、未定回答、未回答')
    expect(html).not.toContain('出欠回答がありません')
    expect(html).toContain('コメントはありません')
  })
})
