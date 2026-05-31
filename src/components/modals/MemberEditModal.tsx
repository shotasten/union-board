import { useState, useEffect, useCallback } from 'react'
import type { AttendanceEvent, AttendanceResponse, Member, ResponseStatus } from '../../types/models'
import { getMemberDisplayName, formatDateShort, formatTime, getIsAllDay, PART_LABELS } from '../../lib/utils'

type StatusOrNone = ResponseStatus | '-' | null

interface EventStatusEntry {
  status: StatusOrNone
  comment: string
  originalStatus: StatusOrNone
  originalComment: string
}

interface Props {
  open: boolean
  memberKey: string | null
  members: Member[]
  events: AttendanceEvent[]
  responsesMap: Record<string, AttendanceResponse[]>
  onClose: () => void
  onSave: (
    memberUserKey: string,
    memberDisplayName: string,
    updates: Array<{ eventId: string; status: ResponseStatus | '-'; comment: string }>
  ) => Promise<boolean>
  onEditMemberInfo: () => void
  onDeleteMember: () => void
}

export function MemberEditModal({
  open,
  memberKey,
  members,
  events,
  responsesMap,
  onClose,
  onSave,
  onEditMemberInfo,
  onDeleteMember,
}: Props) {
  const [eventStatuses, setEventStatuses] = useState<Record<string, EventStatusEntry>>({})
  const [loading, setLoading] = useState(false)

  const member = memberKey ? members.find(m => m.userKey === memberKey) : null
  const displayName = member ? getMemberDisplayName(member) : ''

  const sortedEvents = [...events].sort((a, b) => {
    const dateA = new Date(a.start)
    const dateB = new Date(b.start)
    if (isNaN(dateA.getTime())) return 1
    if (isNaN(dateB.getTime())) return -1
    return dateA.getTime() - dateB.getTime()
  })

  // Initialize event statuses when modal opens
  useEffect(() => {
    if (!open || !member) return

    const initial: Record<string, EventStatusEntry> = {}
    sortedEvents.forEach(event => {
      const responses = responsesMap[event.id] || []
      const memberResponse = responses.find(r => r.userKey === member.userKey)
      const status = memberResponse ? memberResponse.status : null
      const comment = memberResponse?.comment || ''
      initial[event.id] = {
        status: status,
        comment: comment,
        originalStatus: status,
        originalComment: comment,
      }
    })
    setEventStatuses(initial)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, memberKey])

  const hasChanges = useCallback(() => {
    return Object.values(eventStatuses).some(entry =>
      entry.status !== entry.originalStatus || entry.comment !== entry.originalComment
    )
  }, [eventStatuses])

  if (!open || !member) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  const handleStatusChange = (eventId: string, status: StatusOrNone) => {
    setEventStatuses(prev => ({
      ...prev,
      [eventId]: { ...prev[eventId], status },
    }))
  }

  const handleCommentChange = (eventId: string, comment: string) => {
    setEventStatuses(prev => ({
      ...prev,
      [eventId]: { ...prev[eventId], comment },
    }))
  }

  const handleSave = async () => {
    if (!member) return

    const updates = sortedEvents
      .map(event => {
        const entry = eventStatuses[event.id]
        if (!entry) return null

        const statusChanged = entry.status !== entry.originalStatus
        const commentChanged = entry.comment !== entry.originalComment

        if (!statusChanged && !commentChanged) return null

        return {
          eventId: event.id,
          status: (entry.status ?? '-') as ResponseStatus | '-',
          comment: entry.comment,
        }
      })
      .filter((u): u is { eventId: string; status: ResponseStatus | '-'; comment: string } => u !== null)

    if (updates.length === 0) return

    setLoading(true)
    await onSave(member.userKey, displayName, updates)
    setLoading(false)
  }

  const partLabel = PART_LABELS[member.part] || member.part || '-'

  return (
    <div className="modal" style={{ display: 'block' }} onClick={handleBackdropClick}>
      <div className="modal-content" style={{ maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h2>メンバー編集</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {/* Member info header */}
          <div
            className="member-info-header"
            style={{ marginTop: '10px', padding: '12px', background: '#f8f9fa', borderRadius: '6px' }}
          >
            <div className="member-info-block">
              <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '4px' }}>パート</div>
              <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>{partLabel}</div>
            </div>
            <div className="member-info-block">
              <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '4px' }}>名前</div>
              <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>{member.name || '-'}</div>
            </div>
            <div className="member-info-actions">
              <button
                type="button"
                onClick={onEditMemberInfo}
                style={{ padding: '8px 16px', background: '#667eea', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem' }}
              >
                編集
              </button>
              <button
                type="button"
                onClick={onDeleteMember}
                style={{ padding: '8px 16px', background: '#f44336', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem' }}
              >
                削除
              </button>
            </div>
          </div>

          {/* Event status list */}
          <div style={{ marginTop: '20px' }}>
            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '10px' }}>各日程の出欠を選択:</label>
            <div
              id="event-status-list"
              style={{ maxHeight: '520px', minHeight: '360px', overflowY: 'auto', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '10px', backgroundColor: '#ffffff' }}
            >
              {sortedEvents.length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: '#666', backgroundColor: '#f8f9fa', borderRadius: '6px', fontWeight: 500 }}>
                  イベントがありません
                </div>
              )}
              {sortedEvents.map(event => {
                const entry = eventStatuses[event.id] || { status: null, comment: '', originalStatus: null, originalComment: '' }
                const startDate = new Date(event.start)
                const endDate = new Date(event.end)
                const isAllDay = getIsAllDay(event.isAllDay)

                const timeDisplay = isAllDay
                  ? '終日'
                  : `${formatTime(startDate)}～${formatTime(endDate)}`

                const dateStr = formatDateShort(startDate)

                const statuses: Array<{ value: StatusOrNone; label: string; cls: string }> = [
                  { value: '○', label: '○', cls: 'attend' },
                  { value: '△', label: '△', cls: 'maybe' },
                  { value: '×', label: '×', cls: 'absent' },
                  { value: '-', label: '未定', cls: 'cancel' },
                ]
                return (
                  <div
                    key={event.id}
                    style={{ padding: '8px 12px', borderBottom: '1px solid #e0e0e0', display: 'flex', flexDirection: 'column', gap: '6px', backgroundColor: '#ffffff' }}
                  >
                    <div className="event-row-top">
                      {/* Event info */}
                      <div
                        className="event-date-label"
                        style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '2px' }}
                      >
                        <div style={{ fontWeight: 'bold', fontSize: '0.9rem', lineHeight: '1.2', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {event.title || '（タイトルなし）'}
                        </div>
                        {event.location && (
                          <div style={{ fontSize: '0.85rem', color: '#666', lineHeight: '1.2' }}>
                            📍{event.location}
                          </div>
                        )}
                        <div style={{ fontSize: '0.8rem', color: '#666', lineHeight: '1.2' }}>
                          {dateStr} {timeDisplay}
                        </div>
                      </div>

                      {/* Status buttons */}
                      <div className="event-status-buttons">
                        {statuses.map(s => (
                          <button
                            key={s.cls}
                            type="button"
                            className={`response-btn ${s.cls}${s.value === entry.status ? ' active' : ''}`}
                            onClick={() => handleStatusChange(event.id, s.value)}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Comment input */}
                    <div style={{ display: 'flex', flexDirection: 'row', gap: '4px', marginTop: '8px', alignItems: 'flex-start' }}>
                      <textarea
                        className="comment-input"
                        placeholder="コメントを入力（任意）"
                        value={entry.comment}
                        onChange={e => handleCommentChange(event.id, e.target.value)}
                        style={{
                          flex: 1,
                          padding: '6px 8px',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          fontSize: '0.85rem',
                          minHeight: '40px',
                          resize: 'vertical',
                        }}
                      />
                      {entry.comment && (
                        <button
                          type="button"
                          onClick={() => handleCommentChange(event.id, '')}
                          style={{
                            flexShrink: 0,
                            width: '24px',
                            height: '24px',
                            padding: 0,
                            border: 'none',
                            background: 'transparent',
                            color: '#999',
                            cursor: 'pointer',
                            fontSize: '16px',
                            lineHeight: '24px',
                            borderRadius: '50%',
                            marginTop: '6px',
                          }}
                          title="コメントをクリア"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="form-actions" style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
            <button type="button" className="form-btn secondary" onClick={onClose} style={{ flex: 1 }}>閉じる</button>
            <button
              type="button"
              className="form-btn primary"
              onClick={handleSave}
              disabled={loading || !hasChanges()}
              style={{ flex: 2, opacity: (!hasChanges() || loading) ? 0.5 : 1, cursor: (!hasChanges() || loading) ? 'not-allowed' : 'pointer' }}
            >
              {loading ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
