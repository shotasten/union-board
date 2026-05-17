import { useState, useEffect, useRef } from 'react'
import type { AttendanceEvent } from '../../types/models'
import { api } from '../../lib/api'
import { formatDateTimeLocal, formatDateForInput, cleanDescription, getIsAllDay } from '../../lib/utils'

interface EventFormData {
  title: string
  isAllDay: boolean
  startDatetime: string
  endDatetime: string
  startDate: string
  endDate: string
  location: string
  description: string
}

interface Props {
  open: boolean
  eventId: string | null // null = create new
  events: AttendanceEvent[]
  onClose: () => void
  onCreate: (data: { title: string; start: string; end: string; isAllDay: boolean; location: string; description: string }) => Promise<boolean>
  onUpdate: (eventId: string, data: { title: string; start: string; end: string; isAllDay: boolean; location: string; description: string }) => Promise<boolean>
}

function defaultForm(): EventFormData {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startDate = new Date(today)
  startDate.setHours(13, 0, 0, 0)
  const endDate = new Date(today)
  endDate.setHours(17, 0, 0, 0)

  return {
    title: '練習',
    isAllDay: false,
    startDatetime: formatDateTimeLocal(startDate),
    endDatetime: formatDateTimeLocal(endDate),
    startDate: '',
    endDate: '',
    location: '',
    description: '',
  }
}

export function EventModal({ open, eventId, events, onClose, onCreate, onUpdate }: Props) {
  const [form, setForm] = useState<EventFormData>(defaultForm())
  const [loading, setLoading] = useState(false)
  const [showLocationHistory, setShowLocationHistory] = useState(false)
  const [locationHistory, setLocationHistory] = useState<string[]>([])
  const [locationHistoryLoading, setLocationHistoryLoading] = useState(false)
  const prevStartDatetimeRef = useRef<string>('')
  const prevStartDateRef = useRef<string>('')

  useEffect(() => {
    if (!open) return
    setShowLocationHistory(false)

    if (eventId) {
      // Edit mode
      const event = events.find(e => e.id === eventId)
      if (!event) return

      const startDate = new Date(event.start)
      const endDate = new Date(event.end)
      const isAllDay = getIsAllDay(event.isAllDay)

      let startDatetimeVal = ''
      let endDatetimeVal = ''
      let startDateVal = ''
      let endDateVal = ''

      if (isAllDay) {
        startDateVal = formatDateForInput(startDate)
        const displayEnd = new Date(endDate)
        displayEnd.setDate(displayEnd.getDate() - 1)
        endDateVal = formatDateForInput(displayEnd)
      } else {
        startDatetimeVal = formatDateTimeLocal(startDate)
        endDatetimeVal = formatDateTimeLocal(endDate)
      }

      setForm({
        title: event.title,
        isAllDay,
        startDatetime: startDatetimeVal,
        endDatetime: endDatetimeVal,
        startDate: startDateVal,
        endDate: endDateVal,
        location: event.location || '',
        description: cleanDescription(event.description || ''),
      })
      prevStartDatetimeRef.current = startDatetimeVal
      prevStartDateRef.current = startDateVal
    } else {
      // Create mode
      const fresh = defaultForm()
      setForm(fresh)
      prevStartDatetimeRef.current = fresh.startDatetime
      prevStartDateRef.current = ''
    }
  }, [open, eventId, events])

  if (!open) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  const handleAllDayToggle = (checked: boolean) => {
    setForm(prev => {
      const next = { ...prev, isAllDay: checked }
      if (checked) {
        // Switch to date mode
        if (!next.startDate && next.startDatetime) {
          next.startDate = formatDateForInput(new Date(next.startDatetime))
        }
        if (!next.endDate && next.endDatetime) {
          next.endDate = formatDateForInput(new Date(next.endDatetime))
        }
      } else {
        // Switch to datetime mode
        if (!next.startDatetime && next.startDate) {
          const parts = next.startDate.split('-')
          const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
          d.setHours(13, 0, 0, 0)
          next.startDatetime = formatDateTimeLocal(d)
          prevStartDatetimeRef.current = next.startDatetime
        }
        if (!next.endDatetime && next.endDate) {
          const parts = next.endDate.split('-')
          const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
          d.setHours(17, 0, 0, 0)
          next.endDatetime = formatDateTimeLocal(d)
        }
      }
      return next
    })
  }

  const handleStartDatetimeChange = (value: string) => {
    const oldStart = prevStartDatetimeRef.current
    const oldEnd = form.endDatetime
    setForm(prev => {
      const next = { ...prev, startDatetime: value }
      if (oldStart && oldEnd) {
        const oldStartDate = new Date(oldStart)
        const oldEndDate = new Date(oldEnd)
        const newStartDate = new Date(value)
        const diff = oldEndDate.getTime() - oldStartDate.getTime()
        const newEnd = new Date(newStartDate.getTime() + diff)
        next.endDatetime = formatDateTimeLocal(newEnd)
      }
      return next
    })
    prevStartDatetimeRef.current = value
  }

  const handleStartDateChange = (value: string) => {
    const oldStart = prevStartDateRef.current
    const oldEnd = form.endDate
    setForm(prev => {
      const next = { ...prev, startDate: value }
      if (value) {
        let diffDays = 0
        if (oldStart && oldEnd) {
          const oldStartDate = new Date(oldStart)
          const oldEndDate = new Date(oldEnd)
          diffDays = Math.round((oldEndDate.getTime() - oldStartDate.getTime()) / (1000 * 60 * 60 * 24))
        }
        const newStart = new Date(value)
        const newEnd = new Date(newStart)
        newEnd.setDate(newEnd.getDate() + diffDays)
        next.endDate = formatDateForInput(newEnd)
      }
      return next
    })
    prevStartDateRef.current = value
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    let startISO: string
    let endISO: string

    if (form.isAllDay) {
      if (!form.startDate || !form.endDate) return
      const start = new Date(form.startDate)
      start.setHours(0, 0, 0, 0)
      const end = new Date(form.endDate)
      end.setDate(end.getDate() + 1)
      end.setHours(0, 0, 0, 0)
      startISO = start.toISOString()
      endISO = end.toISOString()
    } else {
      if (!form.startDatetime || !form.endDatetime) return
      startISO = new Date(form.startDatetime).toISOString()
      endISO = new Date(form.endDatetime).toISOString()
    }

    if (!form.title.trim()) return

    setLoading(true)
    const payload = {
      title: form.title.trim(),
      start: startISO,
      end: endISO,
      isAllDay: form.isAllDay,
      location: form.location.trim(),
      description: form.description.trim(),
    }

    let ok: boolean
    if (eventId) {
      ok = await onUpdate(eventId, payload)
    } else {
      ok = await onCreate(payload)
    }
    setLoading(false)
    if (ok) {
      setShowLocationHistory(false)
    }
  }

  const loadLocationHistory = async () => {
    setLocationHistoryLoading(true)
    try {
      const allEvents = await api.getAllEventsForLocationHistory()
      const locations: string[] = []
      const locationSet = new Set<string>()
      allEvents.forEach(event => {
        if (event.location && event.location.trim() && !locationSet.has(event.location.trim())) {
          locationSet.add(event.location.trim())
          locations.push(event.location.trim())
        }
      })
      setLocationHistory(locations.slice(0, 5))
    } catch {
      setLocationHistory([])
    }
    setLocationHistoryLoading(false)
  }

  const toggleLocationHistory = () => {
    if (!showLocationHistory) {
      loadLocationHistory()
    }
    setShowLocationHistory(prev => !prev)
  }

  return (
    <div className="modal" style={{ display: 'block' }} onClick={handleBackdropClick}>
      <div className="modal-content">
        <div className="modal-header">
          <h2 id="modal-title">{eventId ? 'イベントを編集' : '新しいイベントを作成'}</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <form id="event-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="event-title">タイトル <span style={{ color: 'red' }}>*</span></label>
            <input
              type="text"
              id="event-title"
              required
              maxLength={100}
              value={form.title}
              onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                id="event-all-day"
                checked={form.isAllDay}
                onChange={e => handleAllDayToggle(e.target.checked)}
              />
              <span>終日</span>
            </label>
          </div>
          <div className="form-group">
            <label htmlFor="event-start">開始日時 <span style={{ color: 'red' }}>*</span></label>
            {!form.isAllDay ? (
              <input
                type="datetime-local"
                id="event-start"
                required
                value={form.startDatetime}
                onChange={e => handleStartDatetimeChange(e.target.value)}
              />
            ) : (
              <input
                type="date"
                id="event-start-date"
                required
                value={form.startDate}
                onChange={e => handleStartDateChange(e.target.value)}
              />
            )}
          </div>
          <div className="form-group">
            <label htmlFor="event-end">終了日時 <span style={{ color: 'red' }}>*</span></label>
            {!form.isAllDay ? (
              <input
                type="datetime-local"
                id="event-end"
                required
                value={form.endDatetime}
                onChange={e => setForm(prev => ({ ...prev, endDatetime: e.target.value }))}
              />
            ) : (
              <input
                type="date"
                id="event-end-date"
                required
                value={form.endDate}
                onChange={e => setForm(prev => ({ ...prev, endDate: e.target.value }))}
              />
            )}
          </div>
          <div className="form-group">
            <label htmlFor="event-location">場所</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                id="event-location"
                style={{ flex: 1 }}
                value={form.location}
                onChange={e => setForm(prev => ({ ...prev, location: e.target.value }))}
              />
              <button
                type="button"
                className="location-history-btn"
                onClick={toggleLocationHistory}
                title="場所の履歴を表示"
              >
                📋
              </button>
            </div>
            {showLocationHistory && (
              <div id="location-history" className="location-history" style={{ display: 'block' }}>
                <div className="location-history-header">
                  <span>最近使用した場所</span>
                  <button type="button" className="location-history-close" onClick={() => setShowLocationHistory(false)}>×</button>
                </div>
                <div id="location-history-list" className="location-history-list">
                  {locationHistoryLoading && (
                    <div style={{ padding: '15px', textAlign: 'center', color: '#999' }}>読み込み中...</div>
                  )}
                  {!locationHistoryLoading && locationHistory.length === 0 && (
                    <div style={{ padding: '15px', textAlign: 'center', color: '#999' }}>履歴がありません</div>
                  )}
                  {!locationHistoryLoading && locationHistory.map(loc => (
                    <div
                      key={loc}
                      className="location-history-item"
                      onClick={() => {
                        setForm(prev => ({ ...prev, location: loc }))
                        setShowLocationHistory(false)
                      }}
                    >
                      {loc}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="form-group">
            <label htmlFor="event-description">説明</label>
            <textarea
              id="event-description"
              value={form.description}
              onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
            />
          </div>
          <div className="form-actions">
            <button type="button" className="form-btn secondary" onClick={onClose}>キャンセル</button>
            <button type="submit" className="form-btn primary" id="save-event-btn" disabled={loading}>
              {loading ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
