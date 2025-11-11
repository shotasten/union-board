/// <reference path="../types/models.ts" />

/**
 * 終日イベント判定ヘルパー関数
 * @param start 開始日時（ISO 8601形式）
 * @param end 終了日時（ISO 8601形式）
 * @returns 終日イベントの場合true
 */
function isAllDayEvent(start: string, end: string): boolean {
  const startDate = new Date(start);
  const endDate = new Date(end);
  
  // 日本時間（JST）で判定（UTC+9時間）
  const jstOffset = 9 * 60 * 60 * 1000; // JSTはUTC+9時間
  const jstStartTime = startDate.getTime() + jstOffset;
  const jstEndTime = endDate.getTime() + jstOffset;
  const jstStart = new Date(jstStartTime);
  const jstEnd = new Date(jstEndTime);
  
  // 開始時刻が00:00:00、終了時刻が23:59:59（同じ日）または翌日の00:00:00の場合、終日イベントと判定
  const startHour = jstStart.getUTCHours();
  const startMinute = jstStart.getUTCMinutes();
  const startSecond = jstStart.getUTCSeconds();
  const endHour = jstEnd.getUTCHours();
  const endMinute = jstEnd.getUTCMinutes();
  const endSecond = jstEnd.getUTCSeconds();
  
  // 開始日と終了日が同じか、終了日が開始日の翌日で時刻が00:00:00の場合
  const startDateOnly = new Date(Date.UTC(jstStart.getUTCFullYear(), jstStart.getUTCMonth(), jstStart.getUTCDate()));
  const endDateOnly = new Date(Date.UTC(jstEnd.getUTCFullYear(), jstEnd.getUTCMonth(), jstEnd.getUTCDate()));
  const isSameDay = startDateOnly.getTime() === endDateOnly.getTime();
  const isNextDay = endDateOnly.getTime() - startDateOnly.getTime() === 24 * 60 * 60 * 1000;
  
  // 終日イベントの判定: 開始が00:00:00で、終了が23:59:59（同じ日）または翌日00:00:00
  return (startHour === 0 && startMinute === 0 && startSecond === 0) &&
         ((isSameDay && endHour === 23 && endMinute === 59) ||
          (isNextDay && endHour === 0 && endMinute === 0 && endSecond === 0));
}

