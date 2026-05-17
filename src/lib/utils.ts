import type { Member } from '../types/models'

export const PART_ORDER = ['Fl', 'Ob', 'Cl', 'Sax', 'Hr', 'Tp', 'Tb', 'Bass', 'Perc', 'その他']

export const PART_LABELS: Record<string, string> = {
  'Fl': 'Fl (フルート)',
  'Ob': 'Ob (オーボエ)',
  'Cl': 'Cl (クラリネット)',
  'Sax': 'Sax (サックス)',
  'Hr': 'Hr (ホルン)',
  'Tp': 'Tp (トランペット)',
  'Tb': 'Tb (トロンボーン)',
  'Bass': 'Bass (バス)',
  'Perc': 'Perc (打楽器)',
  'その他': 'その他'
}

export const PART_OPTIONS = [
  { value: 'Fl', label: 'Fl (フルート)' },
  { value: 'Ob', label: 'Ob (オーボエ)' },
  { value: 'Cl', label: 'Cl (クラリネット)' },
  { value: 'Sax', label: 'Sax (サックス)' },
  { value: 'Hr', label: 'Hr (ホルン)' },
  { value: 'Tp', label: 'Tp (トランペット)' },
  { value: 'Tb', label: 'Tb (トロンボーン)' },
  { value: 'Bass', label: 'Bass (バス)' },
  { value: 'Perc', label: 'Perc (打楽器)' },
  { value: 'その他', label: 'その他' },
]

export function getMemberDisplayName(member: Member): string {
  return (member.part || '') + (member.name || '')
}

export function sortMembers(members: Member[]): Member[] {
  return [...members].sort((a, b) => {
    const indexA = PART_ORDER.indexOf(a.part)
    const indexB = PART_ORDER.indexOf(b.part)

    if (indexA !== -1 && indexB !== -1) {
      if (indexA !== indexB) return indexA - indexB
    } else if (indexA === -1 && indexB !== -1) {
      return 1
    } else if (indexA !== -1 && indexB === -1) {
      return -1
    }

    return (a.name || '').localeCompare(b.name || '', 'ja')
  })
}

export function sortMembersByPart(members: Member[]): Map<string, Member[]> {
  const sorted = sortMembers(members)
  const map = new Map<string, Member[]>()
  sorted.forEach(member => {
    const part = member.part || 'その他'
    if (!map.has(part)) map.set(part, [])
    map.get(part)!.push(member)
  })
  return map
}

export function formatMemberNameForDisplay(name: string): string {
  if (!name) return ''
  if (name.length <= 6) return name
  return name.substring(0, 2) + '\n' + name.substring(2, 5) + '...'
}

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土']

export function formatDateShort(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}(${DAY_NAMES[date.getDay()]})`
}

export function formatDateLong(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日(${DAY_NAMES[date.getDay()]})`
}

export function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function formatDateTimeLocal(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export function formatDateForInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getIsAllDay(isAllDay: unknown): boolean {
  return isAllDay === true || isAllDay === 'TRUE' || isAllDay === 1 || isAllDay === '1'
}

export function cleanDescription(description: string): string {
  if (!description) return ''
  let cleaned = description.replace(/[a-z0-9]+@google\.com/gi, '').trim()
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
  cleaned = cleaned.replace(/[ \t]+/g, ' ')
  return cleaned.trim()
}

export function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
