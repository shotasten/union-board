import { useRef, useEffect, useCallback } from 'react'
import type { AttendanceEvent, AttendanceResponse, Member, ResponseStatus } from '../types/models'
import {
  sortMembers,
  getMemberDisplayName,
  formatMemberNameForDisplay,
  formatDateShort,
  formatTime,
  getIsAllDay,
  PART_ORDER,
} from '../lib/utils'

interface Props {
  events: AttendanceEvent[]
  members: Member[]
  responsesMap: Record<string, AttendanceResponse[]>
  selectedMember: string | null
  isAdmin: boolean
  localStatusOverrides: Record<string, Record<string, ResponseStatus | '-'>>
  onMemberClick: (displayName: string) => void
  onEventClick: (eventId: string) => void
}

function getStatusClass(status: string | null | undefined, hasData: boolean): string {
  if (!hasData) return 'status-cell status-unregistered'
  if (!status || status === '-') return 'status-cell status-none'
  if (status === '○') return 'status-cell status-attend'
  if (status === '△') return 'status-cell status-maybe'
  if (status === '×') return 'status-cell status-absent'
  return 'status-cell status-none'
}

export function AttendanceGrid({
  events,
  members,
  responsesMap,
  selectedMember,
  localStatusOverrides,
  onMemberClick,
  onEventClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const topScrollbarRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Sort events ascending by start date
  const sortedEvents = [...events].sort((a, b) => {
    const dateA = new Date(a.start)
    const dateB = new Date(b.start)
    if (isNaN(dateA.getTime())) return 1
    if (isNaN(dateB.getTime())) return -1
    return dateA.getTime() - dateB.getTime()
  })

  const sortedMembers = sortMembers(members)

  // Build responses lookup: { eventId: { userKey: response } }
  const responsesLookup: Record<string, Record<string, AttendanceResponse>> = {}
  Object.keys(responsesMap).forEach(eventId => {
    responsesLookup[eventId] = {}
    ;(responsesMap[eventId] || []).forEach(r => {
      responsesLookup[eventId][r.userKey] = r
    })
  })

  // Build a map: eventId -> displayName -> status
  const allResponses: Record<string, Record<string, string>> = {}
  Object.keys(responsesMap).forEach(eventId => {
    allResponses[eventId] = {}
    ;(responsesMap[eventId] || []).forEach(r => {
      const member = members.find(m => m.userKey === r.userKey)
      if (member) {
        const displayName = getMemberDisplayName(member)
        allResponses[eventId][displayName] = r.status
      }
    })
  })

  // Group members by part
  const membersByPart: Record<string, Member[]> = {}
  sortedMembers.forEach(member => {
    const part = member.part || 'その他'
    if (!membersByPart[part]) membersByPart[part] = []
    membersByPart[part].push(member)
  })
  const partKeys = Object.keys(membersByPart).sort((a, b) => {
    const ia = PART_ORDER.indexOf(a)
    const ib = PART_ORDER.indexOf(b)
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia === -1) return 1
    if (ib === -1) return -1
    return 0
  })

  // Scroll sync logic
  const updateScrollIndicators = useCallback(() => {
    const container = containerRef.current
    const topScrollbar = topScrollbarRef.current
    const wrapper = wrapperRef.current
    if (!container || !wrapper) return

    const isScrollable = container.scrollWidth > container.clientWidth
    const scrollLeft = container.scrollLeft
    const scrollRight = container.scrollWidth - container.scrollLeft - container.clientWidth

    wrapper.classList.remove('scrollable-left', 'scrollable-right')

    if (isScrollable) {
      if (topScrollbar) {
        topScrollbar.classList.add('visible')
        const table = container.querySelector('table')
        if (table) {
          const dummy = topScrollbar.querySelector('div')
          if (dummy) dummy.style.width = table.offsetWidth + 'px'
          topScrollbar.style.width = container.clientWidth + 'px'
          topScrollbar.scrollLeft = scrollLeft
        }
      }

      if (scrollLeft > 5) wrapper.classList.add('scrollable-left')
      if (scrollRight > 5) wrapper.classList.add('scrollable-right')
    } else {
      if (topScrollbar) topScrollbar.classList.remove('visible')
    }
  }, [])

  useEffect(() => {
    const container = containerRef.current
    const topScrollbar = topScrollbarRef.current
    if (!container) return

    const timer = setTimeout(() => {
      updateScrollIndicators()
      if (topScrollbar) {
        const table = container.querySelector('table')
        if (table) {
          const dummy = topScrollbar.querySelector('div')
          if (dummy) dummy.style.width = table.offsetWidth + 'px'
        }
      }
    }, 100)

    const onContainerScroll = () => {
      updateScrollIndicators()
      if (topScrollbar) topScrollbar.scrollLeft = container.scrollLeft
    }

    const onTopScrollbarScroll = () => {
      if (topScrollbar) container.scrollLeft = topScrollbar.scrollLeft
      updateScrollIndicators()
    }

    container.addEventListener('scroll', onContainerScroll)
    topScrollbar?.addEventListener('scroll', onTopScrollbarScroll)

    let resizeTimer: ReturnType<typeof setTimeout>
    const onResize = () => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        updateScrollIndicators()
        if (topScrollbar) {
          const table = container.querySelector('table')
          if (table) {
            const dummy = topScrollbar.querySelector('div')
            if (dummy) dummy.style.width = table.offsetWidth + 'px'
          }
        }
      }, 100)
    }

    window.addEventListener('resize', onResize)

    return () => {
      clearTimeout(timer)
      clearTimeout(resizeTimer)
      container.removeEventListener('scroll', onContainerScroll)
      topScrollbar?.removeEventListener('scroll', onTopScrollbarScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [updateScrollIndicators, sortedEvents, sortedMembers])

  if (sortedEvents.length === 0) {
    return <p style={{ padding: '20px', textAlign: 'center' }}>イベントがありません</p>
  }

  return (
    <div className="table-responsive attendance-grid-wrapper" ref={wrapperRef}>
<div id="attendance-grid-scrollbar-top" className="attendance-grid-scrollbar-top" ref={topScrollbarRef}>
        <div></div>
      </div>
      <div id="attendance-grid" className="attendance-grid-container" ref={containerRef}>
        <table
          className="attendance-grid"
          style={{ writingMode: 'horizontal-tb', textOrientation: 'mixed' } as React.CSSProperties}
        >
          <colgroup>
            <col style={{ width: '200px' }} />
            {[0, 1, 2].map(i => (
              <col key={i} style={{ width: '30px' }} />
            ))}
            {sortedMembers.map(m => (
              <col key={m.userKey} style={{ width: '45px' }} />
            ))}
          </colgroup>
          <thead>
            {/* Row 1: event header + legend + part headers */}
            <tr>
              <th rowSpan={2}>イベント</th>
              <th
                rowSpan={2}
                colSpan={3}
                style={{
                  minWidth: '90px',
                  width: '90px',
                  maxWidth: '90px',
                  borderRight: '1px solid #DDDDDD',
                }}
              >
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                  <span>○</span><span>△</span><span>×</span>
                </div>
              </th>
              {partKeys.map((part, partIndex) => (
                <th
                  key={part}
                  colSpan={membersByPart[part].length}
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: 'bold',
                    color: '#333',
                    padding: '4px 6px',
                    lineHeight: '1.2',
                    backgroundColor: '#f0f0f0',
                    borderLeft: partIndex === 0 ? '1px solid #DDDDDD' : undefined,
                    borderRight: partIndex < partKeys.length - 1 ? '1px solid #DDDDDD' : undefined,
                  }}
                >
                  {part || 'その他'}
                </th>
              ))}
            </tr>
            {/* Row 2: member name headers */}
            <tr style={{ writingMode: 'horizontal-tb', textOrientation: 'mixed' } as React.CSSProperties}>
              {sortedMembers.map((member, index) => {
                const displayName = getMemberDisplayName(member)
                const part = member.part || 'その他'
                const currentPartMembers = membersByPart[part] || []
                const isLastInPart = currentPartMembers.length > 0 &&
                  currentPartMembers[currentPartMembers.length - 1] === member
                const isLastPart = partKeys.indexOf(part) === partKeys.length - 1
                const isSelected = selectedMember === displayName

                return (
                  <th
                    key={member.userKey}
                    className="member-name-col"
                    style={{
                      width: '45px',
                      minWidth: '45px',
                      maxWidth: '45px',
                      boxSizing: 'border-box',
                      zIndex: 9,
                      writingMode: 'horizontal-tb',
                      textOrientation: 'mixed',
                      whiteSpace: 'normal',
                      borderLeft: index === 0 ? '1px solid #DDDDDD' : undefined,
                      borderRight: isLastInPart && !isLastPart ? '1px solid #DDDDDD' : undefined,
                    } as React.CSSProperties}
                  >
                    <div
                      className="member-name-wrapper"
                      style={{
                        display: '-webkit-box',
                        WebkitBoxOrient: 'vertical',
                        WebkitLineClamp: 2,
                        overflow: 'hidden',
                        wordBreak: 'break-word',
                        overflowWrap: 'break-word',
                        lineHeight: '1.3',
                        height: '2.6em',
                        minHeight: '2.6em',
                        maxHeight: '2.6em',
                        width: '100%',
                        boxSizing: 'border-box',
                        whiteSpace: 'normal',
                        textAlign: 'center',
                        writingMode: 'horizontal-tb',
                        textOrientation: 'mixed',
                      } as React.CSSProperties}
                    >
                      <a
                        href="#"
                        style={{
                          color: isSelected ? '#667eea' : '#0066cc',
                          textDecoration: 'underline',
                          fontSize: '0.7rem',
                          fontWeight: isSelected ? 'bold' : 'normal',
                          cursor: 'pointer',
                          display: 'block',
                          width: '100%',
                          whiteSpace: 'pre-line',
                          writingMode: 'horizontal-tb',
                          textOrientation: 'mixed',
                        } as React.CSSProperties}
                        title={member.name}
                        onClick={e => {
                          e.preventDefault()
                          e.stopPropagation()
                          onMemberClick(displayName)
                        }}
                      >
                        {formatMemberNameForDisplay(member.name || '')}
                      </a>
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sortedEvents.map(event => {
              const startDate = new Date(event.start)
              const endDate = new Date(event.end)
              const isAllDay = getIsAllDay(event.isAllDay)

              const displayEndDate = isAllDay
                ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() - 1)
                : endDate

              const isMultiDay = startDate.getFullYear() !== displayEndDate.getFullYear() ||
                startDate.getMonth() !== displayEndDate.getMonth() ||
                startDate.getDate() !== displayEndDate.getDate()

              let dateStrShort: string
              if (isMultiDay) {
                dateStrShort = formatDateShort(startDate) + '～' + formatDateShort(displayEndDate)
              } else {
                dateStrShort = formatDateShort(startDate)
              }

              const timeDisplay = isAllDay
                ? '終日'
                : `${formatTime(startDate)}～${formatTime(endDate)}`

              // Compute status counts
              const statusCounts: Record<string, number> = { '○': 0, '△': 0, '×': 0 }
              sortedMembers.forEach(member => {
                const displayName = getMemberDisplayName(member)
                const override = localStatusOverrides[event.id]?.[displayName]
                const serverStatus = allResponses[event.id]?.[displayName]
                const status = override !== undefined ? override : serverStatus
                if (status === '○' || status === '△' || status === '×') {
                  statusCounts[status]++
                }
              })

              return (
                <tr key={event.id}>
                  {/* Event info cell */}
                  <td style={{ verticalAlign: 'top', padding: '6px 8px' }}>
                    <div
                      className="event-name-clickable"
                      style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}
                      onClick={e => { e.stopPropagation(); onEventClick(event.id) }}
                    >
                      <div
                        style={{
                          fontSize: '0.85rem',
                          fontWeight: 500,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          lineHeight: '1.2',
                        }}
                        title={event.title && event.title.length > 25 ? event.title : undefined}
                      >
                        {event.title || '予定'}
                      </div>
                      {event.location && (
                        <div
                          style={{
                            fontSize: '0.85rem',
                            color: '#1976d2',
                            lineHeight: '1.2',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={'📍' + event.location}
                        >
                          {'📍' + event.location}
                        </div>
                      )}
                      <div style={{ fontSize: '0.8rem', color: '#1976d2', lineHeight: '1.2' }}>
                        {dateStrShort} {timeDisplay}
                      </div>
                    </div>
                  </td>

                  {/* Status count cells (○△×) */}
                  {(['○', '△', '×'] as const).map((status, index) => {
                    const count = statusCounts[status]
                    return (
                      <td
                        key={status}
                        style={{
                          textAlign: 'center',
                          verticalAlign: 'middle',
                          minWidth: '30px',
                          width: '30px',
                          maxWidth: '30px',
                          padding: '4px 2px',
                          borderTop: '1px solid #e0e0e0',
                          borderBottom: '1px solid #e0e0e0',
                          borderLeft: index === 0 ? '1px solid #e0e0e0' : 'none',
                          borderRight: index === 2 ? '1px solid #DDDDDD' : '1px solid #e0e0e0',
                        }}
                      >
                        {count > 0 ? (
                          <div
                            style={{
                              fontSize: '1.1rem',
                              fontWeight: 'bold',
                              lineHeight: '1.2',
                              color: status === '○' ? '#4caf50' : status === '△' ? '#ff9800' : '#f44336',
                            }}
                          >
                            {count}
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.9rem', color: '#ccc', lineHeight: '1.2' }}>-</div>
                        )}
                      </td>
                    )
                  })}

                  {/* Member status cells */}
                  {sortedMembers.map((member, memberIndex) => {
                    const displayName = getMemberDisplayName(member)
                    const part = member.part || 'その他'
                    const override = localStatusOverrides[event.id]?.[displayName]
                    const serverStatus = allResponses[event.id]?.[displayName]
                    const hasData = serverStatus !== undefined || override !== undefined
                    const existingStatus = override !== undefined ? override : (serverStatus !== undefined ? serverStatus : null)

                    const isSelected = selectedMember === displayName
                    const currentPartMembers = membersByPart[part] || []
                    const isLastInPart = currentPartMembers.length > 0 &&
                      currentPartMembers[currentPartMembers.length - 1] === member
                    const isLastPart = partKeys.indexOf(part) === partKeys.length - 1

                    const statusClass = getStatusClass(existingStatus, hasData)

                    const cellStyle: React.CSSProperties = {
                      cursor: 'default',
                      verticalAlign: 'middle',
                    }

                    if (isSelected) {
                      cellStyle.backgroundColor = '#e8f5e9'
                      cellStyle.borderLeft = '3px solid #667eea'
                      cellStyle.borderRight = '3px solid #667eea'
                    } else {
                      if (memberIndex === 0) cellStyle.borderLeft = '1px solid #DDDDDD'
                      if (isLastInPart && !isLastPart) cellStyle.borderRight = '1px solid #DDDDDD'
                    }

                    return (
                      <td
                        key={member.userKey}
                        className={statusClass}
                        style={cellStyle}
                        data-event-id={event.id}
                        data-member-name={displayName}
                      >
                        {hasData ? (existingStatus || '-') : '-'}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
