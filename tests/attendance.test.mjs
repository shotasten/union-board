import { it as test } from 'vitest'
import assert from 'node:assert/strict'
import { tallyAttendance, changedResponses, eventDateLabel } from '../src/lib/attendance.ts'
const members = [{ userKey: 'fl-suzuki', part: 'Fl', name: '鈴木' }, { userKey: 'tp-suzuki', part: 'Tp', name: '鈴木' }, { userKey: 'cl3', part: 'Cl', name: 'Cl3' }]
test('同姓をIDで別人として集計し、未回答を未定に含め、退会者を除外する', () => {
  assert.deepEqual(tallyAttendance(members, [{ userKey: 'fl-suzuki', status: '○' }, { userKey: 'tp-suzuki', status: '△' }, { userKey: 'removed', status: '○' }]), { '○': 1, '△': 1, '×': 0, '-': 1 })
})
test('未回答を開いただけでは未定として書き込まない', () => {
  assert.deepEqual(changedResponses([{ id: 'a' }, { id: 'b' }], [], { a: { status: '-', comment: '' }, b: { status: '-', comment: '' } }), [])
})
test('その日の変更だけを保存対象にし、他の日の値を送らない', () => {
  const original = [{ eventId: 'a', status: '○', comment: '既存' }, { eventId: 'b', status: '×', comment: '' }]
  assert.deepEqual(changedResponses([{ id: 'a' }], original, { a: { status: '△', comment: '遅れます' }, b: { status: '○', comment: '' } }), [{ eventId: 'a', status: '△', comment: '遅れます' }])
})
test('コメントの削除も変更として保存できる', () => {
  assert.deepEqual(changedResponses([{ id: 'a' }], [{ eventId: 'a', status: '○', comment: '古い内容' }], { a: { status: '○', comment: '' } }), [{ eventId: 'a', status: '○', comment: '' }])
})
test('終日の複数日イベントは排他的終了日の前日まで表示する', () => {
  const label = eventDateLabel({ start: '2026-11-21T00:00:00', end: '2026-11-24T00:00:00', isAllDay: true })
  assert.match(label, /11.*21/); assert.match(label, /11.*23/); assert.doesNotMatch(label, /24/)
})
