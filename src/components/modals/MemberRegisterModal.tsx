import { useState, useRef, useEffect } from 'react'
import { PART_OPTIONS } from '../../lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  onRegister: (part: string, name: string) => Promise<boolean>
}

export function MemberRegisterModal({ open, onClose, onRegister }: Props) {
  const [part, setPart] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setPart('')
      setName('')
      setTimeout(() => nameRef.current?.focus(), 100)
    }
  }, [open])

  if (!open) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  const handleRegister = async () => {
    setLoading(true)
    const ok = await onRegister(part, name)
    setLoading(false)
    if (ok) {
      setPart('')
      setName('')
    }
  }

  return (
    <div className="modal" style={{ display: 'block' }} onClick={handleBackdropClick}>
      <div className="modal-content">
        <div className="modal-header">
          <h2>メンバー登録</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="form-group" style={{ marginTop: '20px' }}>
            <label htmlFor="member-part">パート</label>
            <select
              id="member-part"
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
            <label htmlFor="member-name">名前</label>
            <input
              type="text"
              id="member-name"
              ref={nameRef}
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
          <div className="form-actions" style={{ marginTop: '20px' }}>
            <button type="button" className="form-btn secondary" onClick={onClose}>キャンセル</button>
            <button
              type="button"
              className="form-btn primary"
              onClick={handleRegister}
              disabled={loading}
            >
              {loading ? '登録中...' : '登録'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
