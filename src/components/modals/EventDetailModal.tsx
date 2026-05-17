import type { AttendanceEvent, AttendanceResponse, Member } from '../../types/models'
import {
  formatDateLong,
  formatTime,
  getIsAllDay,
  cleanDescription,
  PART_ORDER,
} from '../../lib/utils'

interface Props {
  open: boolean
  eventId: string | null
  events: AttendanceEvent[]
  members: Member[]
  responsesMap: Record<string, AttendanceResponse[]>
  isAdmin: boolean
  onClose: () => void
  onEdit: (eventId: string) => void
  onDelete: (eventId: string, title: string) => void
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

export function EventDetailModal({
  open,
  eventId,
  events,
  members,
  responsesMap,
  isAdmin,
  onClose,
  onEdit,
  onDelete,
}: Props) {
  if (!open || !eventId) return null

  const event = events.find(e => e.id === eventId)
  if (!event) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  const startDate = new Date(event.start)
  const endDate = new Date(event.end)
  const isAllDay = getIsAllDay(event.isAllDay)

  const displayEndDate = isAllDay
    ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() - 1)
    : endDate

  const isMultiDay = startDate.getFullYear() !== displayEndDate.getFullYear() ||
    startDate.getMonth() !== displayEndDate.getMonth() ||
    startDate.getDate() !== displayEndDate.getDate()

  let dateStr: string
  if (isMultiDay) {
    dateStr = formatDateLong(startDate) + '～' + formatDateLong(displayEndDate)
  } else {
    dateStr = formatDateLong(startDate)
  }

  const timeDisplay = isAllDay
    ? '終日'
    : `${formatTime(startDate)}～${formatTime(endDate)}`

  // Get active member keys
  const activeMemberKeys = new Set(members.map(m => m.userKey))
  const rawResponses = responsesMap[eventId] || []
  const responses = rawResponses.filter(r => activeMemberKeys.has(r.userKey))

  // Tally
  const tally = {
    attend: responses.filter(r => r.status === '○').length,
    maybe: responses.filter(r => r.status === '△').length,
    absent: responses.filter(r => r.status === '×').length,
    undecided: responses.filter(r => r.status === '-').length,
  }

  // Breakdown by status and part
  type BreakdownMap = Record<string, Record<string, string[]>>
  const statusBreakdown: BreakdownMap = { '○': {}, '△': {}, '×': {}, '-': {} }
  const totalCounts: Record<string, number> = { '○': 0, '△': 0, '×': 0, '-': 0 }

  responses.forEach(response => {
    const status = response.status as string
    if (!['○', '△', '×', '-'].includes(status)) return

    totalCounts[status]++

    const member = members.find(m => m.userKey === response.userKey)
    let part = ''
    let name = ''

    if (member) {
      part = member.part || ''
      name = member.name || ''
    } else {
      part = ''
      name = '不明'
    }

    const partKey = part || 'その他'
    if (!statusBreakdown[status][partKey]) {
      statusBreakdown[status][partKey] = []
    }
    statusBreakdown[status][partKey].push(name)
  })

  function sortParts(parts: string[]): string[] {
    return parts.sort((a, b) => {
      const ia = PART_ORDER.indexOf(a)
      const ib = PART_ORDER.indexOf(b)
      if (ia !== -1 && ib !== -1) return ia - ib
      if (ia === -1) return 1
      if (ib === -1) return -1
      return a.localeCompare(b, 'ja')
    })
  }

  const comments = responses.filter(r => r.comment && r.comment.trim())

  const statusColor = (status: string) =>
    status === '○' ? '#4caf50' : status === '△' ? '#ff9800' : status === '×' ? '#f44336' : '#999'
  const statusLabel = (status: string) =>
    status === '○' ? '出席' : status === '△' ? '遅刻/早退' : status === '×' ? '欠席' : '未定'

  return (
    <div className="modal" style={{ display: 'block' }} onClick={handleBackdropClick}>
      <div className="modal-content" style={{ maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h2 id="event-detail-title">{event.title || 'イベント詳細'}</h2>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            {isAdmin && (
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  className="admin-btn edit"
                  style={{ padding: '6px 12px', fontSize: '0.9rem' }}
                  onClick={() => { onEdit(eventId) }}
                >
                  編集
                </button>
                <button
                  className="admin-btn delete"
                  style={{ padding: '6px 12px', fontSize: '0.9rem' }}
                  onClick={() => { onDelete(eventId, event.title || 'イベント') }}
                >
                  削除
                </button>
              </div>
            )}
            <button className="close-btn" onClick={onClose}>&times;</button>
          </div>
        </div>

        <div className="modal-body">
          {/* Event info */}
          <div id="event-detail-info" style={{ marginBottom: '20px' }}>
            <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px' }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '1.2rem' }}>{event.title || '予定'}</h3>
              <div style={{ color: '#666', fontSize: '0.9rem', lineHeight: '1.8' }}>
                <div><strong>日付:</strong> {dateStr}</div>
                <div><strong>時刻:</strong> {timeDisplay}</div>
                {event.location && <div><strong>場所:</strong> {event.location}</div>}
                {event.description && (
                  <div style={{ marginTop: '10px' }}>
                    <strong>説明:</strong><br />
                    <span dangerouslySetInnerHTML={{ __html: cleanDescription(event.description).replace(/\n/g, '<br>') }} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Breakdown */}
          <div id="event-detail-breakdown" style={{ marginBottom: '20px' }}>
            {responses.length === 0 ? (
              <div style={{ padding: '15px', textAlign: 'center', color: '#999' }}>出欠回答がありません</div>
            ) : (
              <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px' }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '1.1rem' }}>全体の集計</h3>
                <div style={{ marginBottom: '20px', padding: '12px', background: 'white', borderRadius: '6px', display: 'flex', gap: '20px', justifyContent: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ color: '#4caf50', fontWeight: 'bold', fontSize: '1.2rem' }}>○</span><br />
                    <span style={{ fontSize: '0.9rem', color: '#666' }}>{tally.attend}人</span>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ color: '#ff9800', fontWeight: 'bold', fontSize: '1.2rem' }}>△</span><br />
                    <span style={{ fontSize: '0.9rem', color: '#666' }}>{tally.maybe}人</span>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ color: '#f44336', fontWeight: 'bold', fontSize: '1.2rem' }}>×</span><br />
                    <span style={{ fontSize: '0.9rem', color: '#666' }}>{tally.absent}人</span>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ color: '#999', fontWeight: 'bold', fontSize: '1.2rem' }}>-</span><br />
                    <span style={{ fontSize: '0.9rem', color: '#666' }}>{tally.undecided}人</span>
                  </div>
                </div>

                {(['○', '△', '×', '-'] as const).map(status => {
                  const partData = statusBreakdown[status]
                  const sortedParts = sortParts(Object.keys(partData))
                  if (sortedParts.length === 0) return null
                  const color = statusColor(status)
                  const label = statusLabel(status)

                  return (
                    <div key={status} style={{ marginBottom: '20px' }}>
                      <h4 style={{ margin: '0 0 10px 0', fontSize: '1rem', color, fontWeight: 'bold' }}>
                        {status} ({label}) の内訳
                      </h4>
                      {sortedParts.map(part => {
                        const names = partData[part]
                        if (names.length === 0) return null
                        return (
                          <div key={part} style={{ marginBottom: '10px', padding: '10px', background: 'white', borderRadius: '6px', borderLeft: `4px solid ${color}` }}>
                            <div style={{ fontWeight: 'bold', marginBottom: '5px', fontSize: '0.95rem' }}>
                              {part || 'その他'} ({names.length}人)
                            </div>
                            <div style={{ color: '#666', fontSize: '0.9rem' }}>{names.join('、')}</div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Comments */}
          <div id="event-detail-comments" style={{ marginBottom: '20px' }}>
            {comments.length === 0 ? (
              <div style={{ padding: '15px', textAlign: 'center', color: '#999' }}>コメントはありません</div>
            ) : (
              <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px' }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '1.1rem' }}>コメント一覧</h3>
                {comments.map((response, idx) => {
                  const member = members.find(m => m.userKey === response.userKey)
                  const part = member?.part || ''
                  const name = member?.name || '不明'
                  const color = statusColor(response.status)

                  // Escape the comment and convert newlines to <br>
                  const commentHtml = escapeHtml(response.comment || '').replace(/\n/g, '<br>')

                  return (
                    <div key={idx} style={{ marginBottom: '12px', padding: '12px', background: 'white', borderRadius: '6px', borderLeft: `4px solid ${color}` }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '5px', fontSize: '0.95rem' }}>
                        <span style={{ color, marginRight: '5px' }}>{response.status}</span>
                        <span>{part ? part + ' ' : ''}{name}</span>
                      </div>
                      <div
                        style={{ color: '#333', fontSize: '0.9rem', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}
                        dangerouslySetInnerHTML={{ __html: commentHtml }}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
