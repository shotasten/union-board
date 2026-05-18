import { useEffect } from 'react'
import { useAppState } from './hooks/useAppState'
import { Header } from './components/Header'
import { AttendanceGrid } from './components/AttendanceGrid'
import { LoadingSpinner } from './components/LoadingSpinner'
import { Toast } from './components/Toast'
import { FullscreenLoader } from './components/FullscreenLoader'
import { getMemberDisplayName } from './lib/utils'

// Modals
import { AdminLoginModal } from './components/modals/AdminLoginModal'
import { LogoutConfirmModal } from './components/modals/LogoutConfirmModal'
import { SyncConfirmModal } from './components/modals/SyncConfirmModal'
import { EventModal } from './components/modals/EventModal'
import { EventDetailModal } from './components/modals/EventDetailModal'
import { DeleteConfirmModal } from './components/modals/DeleteConfirmModal'
import { MemberRegisterModal } from './components/modals/MemberRegisterModal'
import { MemberEditModal } from './components/modals/MemberEditModal'
import { MemberInfoEditModal } from './components/modals/MemberInfoEditModal'
import { MemberDeleteConfirmModal } from './components/modals/MemberDeleteConfirmModal'
import { DisplayPeriodModal } from './components/modals/DisplayPeriodModal'
import { ClearDisplayPeriodConfirmModal } from './components/modals/ClearDisplayPeriodConfirmModal'
import { CleanupMembersResponsesModal } from './components/modals/CleanupMembersResponsesModal'
import { CleanupMembersResponsesFinalConfirmModal } from './components/modals/CleanupMembersResponsesFinalConfirmModal'
import { AddToCalendarModal } from './components/modals/AddToCalendarModal'
import { AdminManageModal } from './components/modals/AdminManageModal'
import { AdminInviteModal } from './components/modals/AdminInviteModal'
import { AdminDeleteConfirmModal } from './components/modals/AdminDeleteConfirmModal'

export function App() {
  const {
    events,
    members,
    responsesMap,
    config,
    isAdmin,
    session,
    isLoading,
    error,
    toast,
    fullscreenLoader,
    modals,
    selectedMember,
    localStatusOverrides,
    loadInitData,
    reloadEvents,
    openModal,
    closeModal,
    setSelectedMember,
    handleAdminLogin,
    handleAdminLogout,
    handleAdminListAdmins,
    handleAdminListInvitations,
    handleAdminInviteAdmin,
    handleAdminCancelInvitation,
    handleAdminRemoveAdmin,
    handleRegisterMember,
    handleUpdateMemberInfo,
    handleDeleteMember,
    handleBulkUpdateResponses,
    handleCreateEvent,
    handleUpdateEvent,
    handleDeleteEvent,
    handleSaveDisplayPeriod,
    handleClearDisplayPeriod,
    handleCleanupMembersAndResponses,
    handleSyncAllEvents,
    showToast,
    pendingInvitationToken,
  } = useAppState()

  useEffect(() => {
    loadInitData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Get the member being edited
  const editingMember = modals.memberEdit.memberKey
    ? members.find(m => m.userKey === modals.memberEdit.memberKey) ?? null
    : null

  // Handle member click: select and open edit modal
  const handleMemberClick = (displayName: string) => {
    const member = members.find(m => getMemberDisplayName(m) === displayName)
    if (!member) return

    setSelectedMember(displayName)
    openModal('memberEdit', { open: true, memberKey: member.userKey })
  }

  // Handle member edit modal close
  const handleMemberEditClose = () => {
    closeModal('memberEdit')
    setSelectedMember(null)
  }

  // Handle member info edit (opens sub-modal from member edit modal)
  const handleOpenMemberInfoEdit = () => {
    openModal('memberInfoEdit', true)
  }

  // Handle delete from member edit modal
  const handleDeleteFromMemberModal = () => {
    if (!modals.memberEdit.memberKey) return
    const member = members.find(m => m.userKey === modals.memberEdit.memberKey)
    if (!member) return
    openModal('memberDeleteConfirm', {
      open: true,
      memberKey: member.userKey,
      memberName: getMemberDisplayName(member),
    })
  }

  // Handle save member info
  const handleSaveMemberInfo = async (userKey: string, newPart: string, newName: string) => {
    const ok = await handleUpdateMemberInfo(userKey, newPart, newName)
    if (ok) {
      closeModal('memberInfoEdit')
    }
    return ok
  }

  // Handle event click: open detail modal
  const handleEventClick = (eventId: string) => {
    openModal('eventDetail', { open: true, eventId })
  }

  // Handle edit from event detail modal
  const handleEditFromDetail = (eventId: string) => {
    closeModal('eventDetail')
    openModal('event', { open: true, eventId })
  }

  // Handle delete from event detail modal
  const handleDeleteFromDetail = (eventId: string, title: string) => {
    closeModal('eventDetail')
    openModal('deleteConfirm', { open: true, eventId, eventTitle: title })
  }

  // Handle add to calendar - check calendarId first
  const handleAddToCalendarClick = () => {
    const c = config as unknown as Record<string, string> | null
    const calendarId = c?.['CALENDAR_ID'] || ''
    if (!calendarId) {
      showToast('カレンダーIDが設定されていません。管理者に連絡してください。', 'error')
      return
    }
    openModal('addToCalendar', true)
  }

  return (
    <div id="scale-wrapper">
      <div id="app-root">
        <div className="page-shell">
          <div className="container">
            <Header
              isAdmin={isAdmin}
              onAdminLoginClick={() => openModal('adminLogin', true)}
              onAdminManageClick={() => openModal('adminManage', true)}
              onSyncAllClick={() => openModal('syncConfirmation', true)}
              onLogoutClick={() => openModal('logoutConfirmation', true)}
            />

            <main>
              {isLoading && <LoadingSpinner />}
              {error && <div className="error">{error}</div>}

              {!isLoading && (
                <div id="events-container" style={{ display: 'block' }}>
                  <div id="grid-view" style={{ display: 'block' }}>
                    {/* Main actions bar */}
                    <div
                      className="main-actions-bar"
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}
                    >
                      <div className="left-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <button
                          className="member-register-btn primary-btn"
                          onClick={() => openModal('memberRegister', true)}
                        >
                          メンバー登録
                        </button>
                        <button
                          className="add-to-calendar-btn secondary-btn"
                          id="add-to-calendar-btn"
                          onClick={handleAddToCalendarClick}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                          <i className="fas fa-calendar-plus"></i>
                          <span>カレンダーに追加</span>
                        </button>
                        <button
                          className="reload-btn secondary-btn"
                          id="reload-btn"
                          onClick={reloadEvents}
                        >
                          <i className="fas fa-rotate"></i>
                          <span>最新表示</span>
                        </button>
                      </div>
                      <div className="right-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {isAdmin && (
                          <>
                            <button
                              id="display-period-edit-btn"
                              className="secondary-btn"
                              onClick={() => openModal('displayPeriod', true)}
                            >
                              表示期間を設定
                            </button>
                            <button
                              id="cleanup-members-responses-btn"
                              className="danger-btn"
                              onClick={() => openModal('cleanupMembersResponses', true)}
                            >
                              新年度リセット
                            </button>
                            <button
                              className="admin-feature primary-btn create-event-btn"
                              id="create-event-btn"
                              onClick={() => openModal('event', { open: true, eventId: null })}
                            >
                              イベント登録
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Legend */}
                    <div
                      id="attendance-legend"
                      style={{ padding: '10px 0', background: '#e3f2fd', borderRadius: '8px', display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.9rem', marginBottom: '16px', border: '1px solid #bbdefb' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '16px' }}>
                        <span style={{ display: 'inline-block', width: '24px', height: '24px', backgroundColor: '#c8e6c9', borderRadius: '4px', textAlign: 'center', lineHeight: '24px', fontWeight: 'bold' }}>○</span>
                        <span>出席</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ display: 'inline-block', width: '24px', height: '24px', backgroundColor: '#fff9c4', borderRadius: '4px', textAlign: 'center', lineHeight: '24px', fontWeight: 'bold' }}>△</span>
                        <span>遅刻/早退</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ display: 'inline-block', width: '24px', height: '24px', backgroundColor: '#ffcdd2', borderRadius: '4px', textAlign: 'center', lineHeight: '24px', fontWeight: 'bold' }}>×</span>
                        <span>欠席</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ display: 'inline-block', width: '24px', height: '24px', backgroundColor: '#f5f5f5', borderRadius: '4px', textAlign: 'center', lineHeight: '24px', color: '#999' }}>-</span>
                        <span>未定</span>
                      </div>
                    </div>

                    <AttendanceGrid
                      events={events}
                      members={members}
                      responsesMap={responsesMap}
                      selectedMember={selectedMember}
                      isAdmin={isAdmin}
                      localStatusOverrides={localStatusOverrides}
                      onMemberClick={handleMemberClick}
                      onEventClick={handleEventClick}
                    />
                  </div>
                </div>
              )}
            </main>

            <footer>
              <p>&copy; 2025 UnionBoard - Tokyo Music Union</p>
            </footer>
          </div>
        </div>
      </div>

      {/* Invitation banner */}
      {pendingInvitationToken && !session && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          backgroundColor: '#1565c0', color: '#fff',
          padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
        }}>
          <span style={{ fontSize: '0.95rem' }}>管理者として招待されています。Googleアカウントでログインして招待を承認してください。</span>
          <button
            className="form-btn primary"
            style={{ backgroundColor: '#fff', color: '#1565c0', whiteSpace: 'nowrap' }}
            onClick={() => openModal('adminLogin', true)}
          >
            ログイン
          </button>
        </div>
      )}

      {/* Modals */}
      <AdminLoginModal
        open={modals.adminLogin}
        onClose={() => closeModal('adminLogin')}
        session={session}
        isAdmin={isAdmin}
        onLoginClick={handleAdminLogin}
        onLogout={handleAdminLogout}
      />

      <LogoutConfirmModal
        open={modals.logoutConfirmation}
        onClose={() => closeModal('logoutConfirmation')}
        onConfirm={handleAdminLogout}
      />

      <SyncConfirmModal
        open={modals.syncConfirmation}
        onClose={() => closeModal('syncConfirmation')}
        onConfirm={handleSyncAllEvents}
      />

      <EventModal
        open={modals.event.open}
        eventId={modals.event.eventId}
        events={events}
        onClose={() => closeModal('event')}
        onCreate={handleCreateEvent}
        onUpdate={handleUpdateEvent}
      />

      <EventDetailModal
        open={modals.eventDetail.open}
        eventId={modals.eventDetail.eventId}
        events={events}
        members={members}
        responsesMap={responsesMap}
        isAdmin={isAdmin}
        onClose={() => closeModal('eventDetail')}
        onEdit={handleEditFromDetail}
        onDelete={handleDeleteFromDetail}
      />

      <DeleteConfirmModal
        open={modals.deleteConfirm.open}
        eventId={modals.deleteConfirm.eventId}
        eventTitle={modals.deleteConfirm.eventTitle}
        onClose={() => closeModal('deleteConfirm')}
        onConfirm={handleDeleteEvent}
      />

      <MemberRegisterModal
        open={modals.memberRegister}
        onClose={() => closeModal('memberRegister')}
        onRegister={handleRegisterMember}
      />

      <MemberEditModal
        open={modals.memberEdit.open}
        memberKey={modals.memberEdit.memberKey}
        members={members}
        events={events}
        responsesMap={responsesMap}
        onClose={handleMemberEditClose}
        onSave={handleBulkUpdateResponses}
        onEditMemberInfo={handleOpenMemberInfoEdit}
        onDeleteMember={handleDeleteFromMemberModal}
      />

      <MemberInfoEditModal
        open={modals.memberInfoEdit}
        member={editingMember}
        onClose={() => closeModal('memberInfoEdit')}
        onSave={handleSaveMemberInfo}
      />

      <MemberDeleteConfirmModal
        open={modals.memberDeleteConfirm.open}
        memberKey={modals.memberDeleteConfirm.memberKey}
        memberName={modals.memberDeleteConfirm.memberName}
        onClose={() => closeModal('memberDeleteConfirm')}
        onConfirm={handleDeleteMember}
      />

      <DisplayPeriodModal
        open={modals.displayPeriod}
        config={config}
        onClose={() => closeModal('displayPeriod')}
        onSave={handleSaveDisplayPeriod}
        onClearConfirm={() => openModal('clearDisplayPeriodConfirm', true)}
      />

      <ClearDisplayPeriodConfirmModal
        open={modals.clearDisplayPeriodConfirm}
        onClose={() => closeModal('clearDisplayPeriodConfirm')}
        onConfirm={handleClearDisplayPeriod}
      />

      <CleanupMembersResponsesModal
        open={modals.cleanupMembersResponses}
        onClose={() => closeModal('cleanupMembersResponses')}
        onNext={() => {
          closeModal('cleanupMembersResponses')
          openModal('cleanupMembersResponsesFinalConfirm', true)
        }}
      />

      <CleanupMembersResponsesFinalConfirmModal
        open={modals.cleanupMembersResponsesFinalConfirm}
        onClose={() => closeModal('cleanupMembersResponsesFinalConfirm')}
        onConfirm={handleCleanupMembersAndResponses}
      />

      <AddToCalendarModal
        open={modals.addToCalendar}
        config={config}
        onClose={() => closeModal('addToCalendar')}
      />

      <AdminManageModal
        open={modals.adminManage}
        onClose={() => closeModal('adminManage')}
        onInviteClick={() => openModal('adminInvite', true)}
        onDeleteClick={(userId, adminName) => openModal('adminDeleteConfirm', { open: true, userId, adminName })}
        onListAdmins={handleAdminListAdmins}
        onListInvitations={handleAdminListInvitations}
        onCancelInvitation={handleAdminCancelInvitation}
      />

      <AdminInviteModal
        open={modals.adminInvite}
        onClose={() => closeModal('adminInvite')}
        onInvite={handleAdminInviteAdmin}
      />

      <AdminDeleteConfirmModal
        open={modals.adminDeleteConfirm.open}
        userId={modals.adminDeleteConfirm.userId}
        adminName={modals.adminDeleteConfirm.adminName}
        onClose={() => closeModal('adminDeleteConfirm')}
        onConfirm={handleAdminRemoveAdmin}
      />

      {/* Toast notification */}
      {toast && <Toast toast={toast} />}

      {/* Fullscreen loader */}
      {fullscreenLoader && <FullscreenLoader loader={fullscreenLoader} />}
    </div>
  )
}
