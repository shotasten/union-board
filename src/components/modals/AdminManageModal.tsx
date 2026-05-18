import { useState, useEffect } from 'react'
import type { AdminInfo } from '../../types/models'

interface Props {
  open: boolean
  onClose: () => void
  onListAdmins: () => Promise<{ success: boolean; admins?: AdminInfo[]; error?: string }>
  onInviteAdmin: (email: string) => Promise<{ success: boolean; token?: string; error?: string }>
  onRemoveAdmin: (userId: string) => Promise<{ success: boolean; error?: string }>
}

export function AdminManageModal({ open, onClose, onListAdmins, onInviteAdmin, onRemoveAdmin }: Props) {
  const [admins, setAdmins] = useState<AdminInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [inviteToken, setInviteToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const inviteUrl = inviteToken
    ? `${window.location.origin}${window.location.pathname}?admin_invite=${inviteToken}`
    : null

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    setInviteToken(null)
    setEmail('')
    setCopied(false)
    onListAdmins().then(result => {
      setLoading(false)
      if (result.success) {
        setAdmins(result.admins ?? [])
      } else {
        setError(result.error ?? '管理者一覧の取得に失敗しました')
      }
    })
  }, [open])

  const handleInvite = async () => {
    if (!email.trim()) return
    setInviting(true)
    setError(null)
    setInviteToken(null)
    setCopied(false)
    const result = await onInviteAdmin(email.trim())
    setInviting(false)
    if (result.success && result.token) {
      setInviteToken(result.token)
      setEmail('')
    } else {
      setError(result.error ?? '招待URLの発行に失敗しました')
    }
  }

  const handleRemove = async (userId: string) => {
    setRemovingId(userId)
    setError(null)
    const result = await onRemoveAdmin(userId)
    setRemovingId(null)
    if (result.success) {
      setAdmins(prev => prev.filter(a => a.userId !== userId))
    } else {
      setError(result.error ?? '削除に失敗しました')
    }
  }

  const handleCopyUrl = async () => {
    if (!inviteUrl) return
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!open) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="modal" style={{ display: 'block' }} onClick={handleBackdropClick}>
      <div className="modal-content" style={{ maxWidth: '560px' }}>
        <div className="modal-header">
          <h2>管理者管理</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '1rem' }}>現在の管理者</h3>

          {loading ? (
            <p style={{ color: '#666' }}>読み込み中...</p>
          ) : (
            <div style={{ marginBottom: '24px' }}>
              {admins.length === 0 ? (
                <p style={{ color: '#666' }}>管理者が登録されていません</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {admins.map(admin => (
                    <li
                      key={admin.userId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 0',
                        borderBottom: '1px solid #eee',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <span
                          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={admin.email}
                        >
                          {admin.email}
                        </span>
                        <span
                          style={{
                            flexShrink: 0,
                            fontSize: '0.75rem',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            backgroundColor: admin.role === 'owner' ? '#e8f5e9' : '#e3f2fd',
                            color: admin.role === 'owner' ? '#2e7d32' : '#1565c0',
                          }}
                        >
                          {admin.role === 'owner' ? 'オーナー' : '管理者'}
                        </span>
                      </div>
                      <button
                        className="form-btn danger"
                        style={{ flexShrink: 0, padding: '4px 12px', fontSize: '0.85rem' }}
                        disabled={admin.role === 'owner' || removingId === admin.userId}
                        title={admin.role === 'owner' ? 'オーナーは削除できません' : undefined}
                        onClick={() => handleRemove(admin.userId)}
                      >
                        {removingId === admin.userId ? '削除中...' : '削除'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <h3 style={{ marginBottom: '12px', fontSize: '1rem' }}>管理者を招待</h3>
          <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#555', lineHeight: '1.5' }}>
            招待URLを発行して招待する管理者に送付してください。相手はURLを開いてGoogleアカウントでログインすると管理者として登録されます。
          </p>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input
              type="email"
              className="form-input"
              placeholder="招待するメールアドレス"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleInvite()}
              style={{ flex: 1 }}
            />
            <button
              className="form-btn primary"
              onClick={handleInvite}
              disabled={inviting || !email.trim()}
              style={{ whiteSpace: 'nowrap' }}
            >
              {inviting ? '発行中...' : 'URL発行'}
            </button>
          </div>

          {error && (
            <p style={{ color: '#c62828', fontSize: '0.9rem', margin: '8px 0 0' }}>{error}</p>
          )}

          {inviteUrl && (
            <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
              <p style={{ margin: '0 0 4px', fontSize: '0.9rem', fontWeight: 'bold' }}>招待URLが発行されました</p>
              <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: '#666' }}>有効期限：7日間</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  readOnly
                  className="form-input"
                  value={inviteUrl}
                  style={{ flex: 1, fontSize: '0.78rem', backgroundColor: '#fff' }}
                  onClick={e => (e.target as HTMLInputElement).select()}
                />
                <button className="form-btn secondary" onClick={handleCopyUrl} style={{ whiteSpace: 'nowrap' }}>
                  {copied ? 'コピー済み' : 'コピー'}
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="form-actions" style={{ marginTop: '20px' }}>
          <button type="button" className="form-btn secondary" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  )
}
