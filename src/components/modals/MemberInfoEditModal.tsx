import { useState, useEffect } from 'react'
import { PART_OPTIONS } from '../../lib/utils'
import type { Member } from '../../types/models'

interface Props {
  open: boolean
  member: Member | null
  onClose: () => void
  onSave: (userKey: string, newPart: string, newName: string) => Promise<boolean>
}

export function MemberInfoEditModal({ open, member, onClose, onSave }: Props) {
  const [part, setPart] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open && member) {
      setPart(member.part || '')
      setName(member.name || '')
    }
  }, [open, member])

  if (!open || !member) return null

  const hasChanged = part !== member.part || name.trim() !== member.name

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  const handleSave = async () => {
    if (!part) return
    if (!name.trim()) return
    setLoading(true)
    const ok = await onSave(member.userKey, part, name.trim())
    setLoading(false)
    if (ok) onClose()
  }

  return (
    <div className="modal" style={{ display: 'block' }} onClick={handleBackdropClick}>
      <div className="modal-content" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2>メンバー情報を編集</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="form-group" style={{ marginTop: '20px' }}>
            <label htmlFor="member-info-part">パート <span style={{ color: 'red' }}>*</span></label>
            <select
              id="member-info-part"
              value={part}
              onChange={e => setPart(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '1rem' }}
            >
              <option value="">選択してください</option>
              {PART_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginTop: '20px' }}>
            <label htmlFor="member-info-name">名前 <span style={{ color: 'red' }}>*</span></label>
            <input
              type="text"
              id="member-info-name"
              placeholder="例: 山田"
              maxLength={50}
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '1rem' }}
            />
            <div style={{ fontSize: '0.85rem', color: '#f44336', marginTop: '6px', lineHeight: '1.4' }}>
              ⚠️ 名前は公開されます。フルネームの入力は控えてください。
            </div>
          </div>
          <div className="form-actions" style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className="form-btn secondary"
              onClick={onClose}
              style={{ flex: 1 }}
            >
              キャンセル
            </button>
            <button
              type="button"
              className="form-btn primary"
              onClick={handleSave}
              disabled={loading || !hasChanged}
              style={{ flex: 2, opacity: (!hasChanged || loading) ? 0.5 : 1, cursor: (!hasChanged || loading) ? 'not-allowed' : 'pointer' }}
            >
              {loading ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
