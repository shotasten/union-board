import { useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'

interface Props {
  open: boolean
  onClose: () => void
  session: Session | null
  isAdmin: boolean
  onLoginClick: () => void
  onLogout: () => void
}

export function AdminLoginModal({ open, onClose, session, isAdmin, onLoginClick, onLogout }: Props) {
  useEffect(() => {
    if (isAdmin && open) onClose()
  }, [isAdmin, open, onClose])

  if (!open) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="modal" style={{ display: 'block' }} onClick={handleBackdropClick}>
      <div className="modal-content">
        <div className="modal-header">
          <h2>管理者ログイン</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {!session ? (
            <>
              <p>Googleアカウントでサインインしてください</p>
              <div className="form-actions" style={{ marginTop: '20px' }}>
                <button type="button" className="form-btn secondary" onClick={onClose}>キャンセル</button>
                <button type="button" className="form-btn primary" onClick={onLoginClick}>
                  Googleでサインイン
                </button>
              </div>
            </>
          ) : (
            <>
              <p style={{ color: '#d32f2f' }}>このアカウントには管理者権限がありません</p>
              <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '8px' }}>{session.user.email}</p>
              <div className="form-actions" style={{ marginTop: '20px' }}>
                <button type="button" className="form-btn secondary" onClick={onLogout}>ログアウト</button>
                <button type="button" className="form-btn primary" onClick={onLoginClick}>
                  別アカウントでサインイン
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
