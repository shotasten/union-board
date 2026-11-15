import { useState, useEffect } from 'react'
import type { AttendanceEvent, AttendanceResponse, Member, ResponseStatus } from '../../types/models'
import { getMemberDisplayName } from '../../lib/utils'
import { eventDateLabel, eventTimeLabel, RESPONSE_LABELS, RESPONSE_STATUSES, responseClass } from '../../lib/attendance'
import { BoardDialog } from '../BoardDialog'

interface EventStatusEntry {
  status: ResponseStatus
  comment: string
  hasResponse: boolean
  originalStatus: ResponseStatus
  originalComment: string
  originalHasResponse: boolean
}

interface Props {
  open: boolean
  memberKey: string | null
  members: Member[]
  events: AttendanceEvent[]
  responsesMap: Record<string, AttendanceResponse[]>
  onClose: () => void
  onSave: (memberUserKey: string, memberDisplayName: string, updates: Array<{ eventId: string; status: ResponseStatus; comment: string }>) => Promise<boolean>
  onEditMemberInfo: () => void
  onDeleteMember: () => void
}

export function MemberEditModal({ open, memberKey, members, events, responsesMap, onClose, onSave, onEditMemberInfo, onDeleteMember }: Props) {
  const [draft, setDraft] = useState<Record<string, EventStatusEntry>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const member = memberKey ? members.find(m => m.userKey === memberKey) : undefined
  const sortedEvents = [...events].sort((a, b) => Date.parse(a.start) - Date.parse(b.start))

  useEffect(() => {
    if (!open || !memberKey) return
    const initial: Record<string, EventStatusEntry> = {}
    for (const event of events) {
      const response = (responsesMap[event.id] || []).find(r => r.userKey === memberKey)
      const status = response?.status || '-'
      const comment = response?.comment || ''
      initial[event.id] = { status, comment, hasResponse: Boolean(response), originalStatus: status, originalComment: comment, originalHasResponse: Boolean(response) }
    }
    setDraft(initial)
    setError('')
    // Keep unsaved edits when data refreshes or a nested dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, memberKey])

  if (!open || !member) return null
  const updates = sortedEvents.flatMap(event => {
    const entry = draft[event.id]
    if (!entry || (entry.status === entry.originalStatus && entry.comment === entry.originalComment && entry.hasResponse === entry.originalHasResponse)) return []
    return [{ eventId: event.id, status: entry.status, comment: entry.comment }]
  })
  const save = async () => {
    if (!updates.length || busy) return
    setBusy(true)
    setError('')
    try {
      if (await onSave(member.userKey, getMemberDisplayName(member), updates)) onClose()
      else setError('保存できませんでした。入力内容を保持しています。もう一度お試しください。')
    } catch {
      setError('保存できませんでした。入力内容を保持しています。もう一度お試しください。')
    } finally { setBusy(false) }
  }

  return <BoardDialog title={`${member.name}（${member.part}）の出欠`} onClose={onClose} busy={busy}>
    <div className="board-dialog-body">
      <div className="board-member-actions">
        <button type="button" disabled={busy} onClick={onEditMemberInfo}>名前・パートを編集</button>
        <button type="button" className="board-danger" disabled={busy} onClick={onDeleteMember}>メンバーを削除</button>
      </div>
      {!sortedEvents.length && <p>入力対象の日程はありません。</p>}
      {sortedEvents.map(event => {
        const entry = draft[event.id]
        if (!entry) return null
        return <fieldset className="board-editor-event" key={event.id}>
          <legend>{eventDateLabel(event)} {event.title}</legend>
          <p className="board-note">{event.location || '場所未設定'}<br />{eventTimeLabel(event)}</p>
          <div className="board-choices">{RESPONSE_STATUSES.map(status => <button type="button" key={status} disabled={busy} className={responseClass(status)} aria-pressed={entry.status === status} onClick={() => setDraft(prev => ({ ...prev, [event.id]: { ...prev[event.id], status, hasResponse: true } }))}>{status}<small>{RESPONSE_LABELS[status]}</small></button>)}</div>
          <label><textarea aria-label="コメント（任意）" placeholder="コメント（任意）" rows={1} disabled={busy} value={entry.comment} onChange={input => setDraft(prev => ({ ...prev, [event.id]: { ...prev[event.id], comment: input.target.value } }))} /></label>
        </fieldset>
      })}
      {error && <p role="alert" className="board-registration-error">{error}</p>}
    </div>
    <div className="board-dialog-footer"><span role="status">{updates.length}件変更</span><button disabled={busy} onClick={onClose}>取消</button><button className="board-primary" disabled={busy || !updates.length} onClick={() => void save()}>{busy ? '保存中…' : '保存'}</button></div>
  </BoardDialog>
}
