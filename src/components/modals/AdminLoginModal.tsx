import { useState, useRef, useEffect } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  onLogin: (token: string) => Promise<boolean>
}

export function AdminLoginModal({ open, onClose, onLogin }: Props) {
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setToken('')
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  if (!open) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  const handleSubmit = async () => {
    if (!token.trim()) return
    setLoading(true)
    const ok = await onLogin(token.trim())
    setLoading(false)
    if (!ok) {
      setToken('')
      inputRef.current?.focus()
    }
  }

  return (
    <div className="modal" style={{ display: 'block' }} onClick={handleBackdropClick}>
      <div className="modal-content">
        <div className="modal-header">
          <h2>管理者ログイン</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <p>管理者トークンを入力してください</p>
          <div className="form-group" style={{ marginTop: '20px' }}>
            <label htmlFor="admin-token-input">管理者トークン</label>
            <input
              type="password"
              id="admin-token-input"
              ref={inputRef}
              placeholder="管理者トークンを入力"
              maxLength={100}
              autoComplete="off"
              value={token}
              onChange={e => setToken(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
            />
          </div>
          <div className="form-actions" style={{ marginTop: '20px' }}>
            <button type="button" className="form-btn secondary" onClick={onClose}>キャンセル</button>
            <button
              type="button"
              className="form-btn primary"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? 'ログイン中...' : 'ログイン'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
