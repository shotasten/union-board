import { useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  onInvite: (email: string, displayName: string) => Promise<{ success: boolean; token?: string; error?: string }>
}

export function AdminInviteModal({ open, onClose, onInvite }: Props) {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const reset = () => {
    setDisplayName('')
    setEmail('')
    setInviteUrl(null)
    setError(null)
    setCopied(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleInvite = async () => {
    if (!displayName.trim() || !email.trim()) return
    setLoading(true)
    setError(null)
    setInviteUrl(null)
    const result = await onInvite(email.trim(), displayName.trim())
    setLoading(false)
    if (result.success && result.token) {
      const url = `${window.location.origin}${window.location.pathname}?admin_invite=${result.token}`
      setInviteUrl(url)
    } else {
      setError(result.error ?? '招待URLの発行に失敗しました')
    }
  }

  const handleCopy = async () => {
    if (!inviteUrl) return
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!open) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) handleClose()
  }

  return (
    <div className="modal" style={{ display: 'block' }} onClick={handleBackdropClick}>
      <div className="modal-content" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2>管理者を招待</h2>
          <button className="close-btn" onClick={handleClose}>&times;</button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: '20px', fontSize: '0.9rem', color: '#555', lineHeight: '1.6' }}>
            招待URLを発行して管理者に送付してください。相手はURLを開いてGoogleアカウントでログインすると管理者として登録されます。
          </p>

          {!inviteUrl ? (
            <>
              <div className="form-group">
                <label htmlFor="invite-display-name">名前 <span style={{ color: 'red' }}>*</span></label>
                <input
                  type="text"
                  id="invite-display-name"
                  placeholder="例: 山田太郎"
                  maxLength={50}
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ marginTop: '16px' }}>
                <label htmlFor="invite-email">メールアドレス <span style={{ color: 'red' }}>*</span></label>
                <input
                  type="email"
                  id="invite-email"
                  placeholder="例: user@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleInvite()}
                />
              </div>

              {error && (
                <p style={{ color: '#c62828', fontSize: '0.9rem', marginTop: '8px' }}>{error}</p>
              )}

              <div className="form-actions" style={{ marginTop: '24px' }}>
                <button type="button" className="form-btn secondary" onClick={handleClose}>
                  キャンセル
                </button>
                <button
                  type="button"
                  className="form-btn primary"
                  onClick={handleInvite}
                  disabled={loading || !displayName.trim() || !email.trim()}
                  style={{ opacity: (loading || !displayName.trim() || !email.trim()) ? 0.5 : 1 }}
                >
                  {loading ? '発行中...' : 'URLを発行する'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ padding: '16px', backgroundColor: '#e8f5e9', borderRadius: '8px', marginBottom: '20px' }}>
                <p style={{ margin: '0 0 4px', fontWeight: 'bold', color: '#2e7d32' }}>招待URLが発行されました</p>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#555' }}>有効期限：7日間</p>
              </div>

              <div className="form-group">
                <label>招待URL</label>
                <input
                  type="text"
                  readOnly
                  value={inviteUrl}
                  style={{ fontSize: '0.82rem' }}
                  onClick={e => (e.target as HTMLInputElement).select()}
                />
              </div>

              <div className="form-actions" style={{ marginTop: '24px' }}>
                <button type="button" className="form-btn secondary" onClick={handleClose}>
                  閉じる
                </button>
                <button type="button" className="form-btn primary" onClick={handleCopy}>
                  {copied ? 'コピー済み ✓' : 'URLをコピー'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
