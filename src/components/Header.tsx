interface Props {
  isAdmin: boolean
  onAdminLoginClick: () => void
  onAdminManageClick: () => void
  onSyncAllClick: () => void
  onLogoutClick: () => void
}

export function Header({ isAdmin, onAdminLoginClick, onAdminManageClick, onSyncAllClick, onLogoutClick }: Props) {
  return (
    <header>
      <div className="header-top">
        <h1>UnionBoard</h1>
        <div className="header-actions">
          {!isAdmin && (
            <button className="admin-login-btn" onClick={onAdminLoginClick} id="admin-login-btn">
              🔐 管理者ログイン
            </button>
          )}
          {isAdmin && (
            <div className="header-action-group" style={{ display: 'flex' }}>
              <button
                className="icon-action-btn"
                onClick={onAdminManageClick}
                title="管理者管理"
              >
                <i className="fas fa-user-shield"></i>
              </button>
              <button
                className="sync-all-btn icon-action-btn"
                onClick={onSyncAllClick}
                id="sync-all-btn"
                title="同期"
              >
                <i className="fas fa-rotate"></i>
              </button>
              <button
                className="admin-logout-btn icon-action-btn"
                onClick={onLogoutClick}
                id="admin-logout-btn"
                title="ログアウト"
              >
                <i className="fas fa-right-from-bracket"></i>
              </button>
            </div>
          )}
        </div>
      </div>
      <p>TMU 練習予定・出欠管理アプリ</p>
    </header>
  )
}
