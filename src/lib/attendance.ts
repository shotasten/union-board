import type { AttendanceEvent, AttendanceResponse, Member, ResponseStatus } from '../types/models'
export const RESPONSE_STATUSES: ResponseStatus[] = ['○', '△', '×', '-']
export const RESPONSE_LABELS: Record<ResponseStatus, string> = { '○': '出席', '△': '遅刻/早退', '×': '欠席', '-': '未定' }
export const responseClass = (status: ResponseStatus) => ({ '○': 'yes', '△': 'late', '×': 'no', '-': 'unknown' })[status]
export function memberResponse(responses: AttendanceResponse[], key: string) { return responses.find(r => r.userKey === key) }
export function tallyAttendance(members: Member[], responses: AttendanceResponse[]) {
  const lookup = new Map(responses.map(r => [r.userKey, r.status]))
  const counts: Record<ResponseStatus, number> = { '○': 0, '△': 0, '×': 0, '-': 0 }
  for (const member of members) counts[lookup.get(member.userKey) || '-']++
  return counts
}
export function eventDateLabel(event: AttendanceEvent) {
  const start = new Date(event.start), end = new Date(event.end)
  if (event.isAllDay) end.setDate(end.getDate() - 1)
  const format = (date: Date) => date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' })
  return format(start) + (start.toDateString() !== end.toDateString() ? '〜' + format(end) : '')
}
export function eventTimeLabel(event: AttendanceEvent) {
  if (event.isAllDay) return '終日'
  const format = (date: string) => new Date(date).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false })
  return format(event.start) + '–' + format(event.end)
}
export function changedResponses(events: AttendanceEvent[], originals: AttendanceResponse[], draft: Record<string, { status: ResponseStatus; comment: string }>) {
  return events.flatMap(event => {
    const next = draft[event.id]
    if (!next) return []
    const original = originals.find(r => r.eventId === event.id)
    if (next.status === (original?.status || '-') && next.comment === (original?.comment || '')) return []
    return [{ eventId: event.id, ...next }]
  })
}
