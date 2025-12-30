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
  
  // 開始時刻が00:00:00、終了時刻が00:00:00（任意の日数後）または23:59:59（同じ日）の場合、終日イベントと判定
  const startHour = jstStart.getUTCHours();
  const startMinute = jstStart.getUTCMinutes();
  const startSecond = jstStart.getUTCSeconds();
  const endHour = jstEnd.getUTCHours();
  const endMinute = jstEnd.getUTCMinutes();
  const endSecond = jstEnd.getUTCSeconds();
  
  // 開始日と終了日が同じかどうか
  const startDateOnly = new Date(Date.UTC(jstStart.getUTCFullYear(), jstStart.getUTCMonth(), jstStart.getUTCDate()));
  const endDateOnly = new Date(Date.UTC(jstEnd.getUTCFullYear(), jstEnd.getUTCMonth(), jstEnd.getUTCDate()));
  const isSameDay = startDateOnly.getTime() === endDateOnly.getTime();
  
  // 終日イベントの判定:
  // 1. 開始が00:00:00であること
  // 2. 終了が00:00:00（複数日対応）または23:59:59（同じ日のみ）であること
  return (startHour === 0 && startMinute === 0 && startSecond === 0) &&
         ((endHour === 0 && endMinute === 0 && endSecond === 0) ||
          (isSameDay && endHour === 23 && endMinute === 59));
}

