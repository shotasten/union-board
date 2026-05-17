import { useState, useEffect } from 'react'
import type { Config } from '../../types/models'
import { formatDateForInput } from '../../lib/utils'

interface Props {
  open: boolean
  config: Config | null
  onClose: () => void
  onSave: (startDateISO: string, endDateISO: string, showOnlyFuture: boolean) => Promise<boolean>
  onClearConfirm: () => void
}

export function DisplayPeriodModal({ open, config, onClose, onSave, onClearConfirm }: Props) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open && config) {
      const c = config as unknown as Record<string, string>
      if (c['DISPLAY_START_DATE']) {
        setStartDate(formatDateForInput(new Date(c['DISPLAY_START_DATE'])))
      } else {
        setStartDate('')
      }
      if (c['DISPLAY_END_DATE']) {
        setEndDate(formatDateForInput(new Date(c['DISPLAY_END_DATE'])))
      } else {
        setEndDate('')
      }
      setShowAll(c['SHOW_ONLY_FUTURE_EVENTS'] === 'false')
    } else if (open) {
      setStartDate('')
      setEndDate('')
      setShowAll(false)
    }
  }, [open, config])

  if (!open) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  const handleSave = async () => {
    let startISO = ''
    let endISO = ''

    if (startDate) {
      const d = new Date(startDate)
      d.setHours(0, 0, 0, 0)
      startISO = d.toISOString()
    }

    if (endDate) {
      const d = new Date(endDate)
      d.setHours(23, 59, 59, 999)
      endISO = d.toISOString()
    }

    if (startISO && endISO && new Date(startISO) > new Date(endISO)) {
      return
    }

    setLoading(true)
    await onSave(startISO, endISO, !showAll)
    setLoading(false)
  }

  return (
    <div className="modal" style={{ display: 'block' }} onClick={handleBackdropClick}>
      <div className="modal-content">
        <div className="modal-header">
          <h2>表示期間を設定</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <p>表示するイベントの期間を設定します。空欄にすると制限なし（全期間）になります。</p>
          <div className="form-group" style={{ marginTop: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                id="show-all-events"
                checked={showAll}
                onChange={e => setShowAll(e.target.checked)}
                style={{ width: 'auto', marginRight: '8px', cursor: 'pointer' }}
              />
              <span>全期間の予定を表示する（過去の予定を含む）</span>
            </label>
            <small style={{ color: '#666', fontSize: '0.85rem', display: 'block', marginTop: '4px' }}>
              チェックしない場合は現在日時以降の予定のみ表示されます（デフォルト）
            </small>
          </div>
          <div className="form-group" style={{ marginTop: '20px' }}>
            <label htmlFor="display-period-start">開始日</label>
            <input
              type="date"
              id="display-period-start"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
            />
            <small style={{ color: '#666', fontSize: '0.85rem' }}>空欄の場合は制限なし</small>
          </div>
          <div className="form-group" style={{ marginTop: '20px' }}>
            <label htmlFor="display-period-end">終了日</label>
            <input
              type="date"
              id="display-period-end"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
            />
            <small style={{ color: '#666', fontSize: '0.85rem' }}>空欄の場合は制限なし</small>
          </div>
          <div className="form-actions" style={{ marginTop: '20px' }}>
            <button type="button" className="form-btn secondary" onClick={onClose}>キャンセル</button>
            <button
              type="button"
              className="form-btn danger"
              onClick={() => { onClose(); onClearConfirm() }}
              style={{ background: '#f44336' }}
            >
              制限を解除
            </button>
            <button
              type="button"
              className="form-btn primary"
              onClick={handleSave}
              disabled={loading}
            >
              {loading ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
