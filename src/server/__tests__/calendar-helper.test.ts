/// <reference path="../../types/models.ts" />

/**
 * 終日イベント判定ヘルパー関数（テスト対象）
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
  // 2. 終了が00:00:00（異なる日のみ、複数日対応）または23:59:59（同じ日のみ）であること
  // 注意: 同じ日の00:00:00～00:00:00はゼロ時間長のため終日イベントではない
  return (startHour === 0 && startMinute === 0 && startSecond === 0) &&
         ((endHour === 0 && endMinute === 0 && endSecond === 0 && !isSameDay) ||
          (isSameDay && endHour === 23 && endMinute === 59));
}

describe('calendar-helper.ts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isAllDayEvent', () => {
    it('1日の終日イベント（00:00～23:59）を正しく判定すること', () => {
      // Arrange
      // JST 2026-01-02 00:00:00 = UTC 2026-01-01 15:00:00
      const start = '2026-01-01T15:00:00.000Z';
      // JST 2026-01-02 23:59:59 = UTC 2026-01-02 14:59:59
      const end = '2026-01-02T14:59:59.000Z';
      
      // Act
      const result = isAllDayEvent(start, end);
      
      // Assert
      expect(result).toBe(true);
    });

    it('1日の終日イベント（00:00～翌日00:00）を正しく判定すること', () => {
      // Arrange
      // JST 2026-01-02 00:00:00 = UTC 2026-01-01 15:00:00
      const start = '2026-01-01T15:00:00.000Z';
      // JST 2026-01-03 00:00:00 = UTC 2026-01-02 15:00:00
      const end = '2026-01-02T15:00:00.000Z';
      
      // Act
      const result = isAllDayEvent(start, end);
      
      // Assert
      expect(result).toBe(true);
    });

    it('複数日の終日イベント（3日間：00:00～3日後00:00）を正しく判定すること', () => {
      // Arrange
      // JST 2026-01-02 00:00:00 = UTC 2026-01-01 15:00:00
      const start = '2026-01-01T15:00:00.000Z';
      // JST 2026-01-05 00:00:00 = UTC 2026-01-04 15:00:00
      const end = '2026-01-04T15:00:00.000Z';
      
      // Act
      const result = isAllDayEvent(start, end);
      
      // Assert
      expect(result).toBe(true);
    });

    it('複数日の終日イベント（7日間：00:00～7日後00:00）を正しく判定すること', () => {
      // Arrange
      // JST 2026-02-01 00:00:00 = UTC 2026-01-31 15:00:00
      const start = '2026-01-31T15:00:00.000Z';
      // JST 2026-02-08 00:00:00 = UTC 2026-02-07 15:00:00
      const end = '2026-02-07T15:00:00.000Z';
      
      // Act
      const result = isAllDayEvent(start, end);
      
      // Assert
      expect(result).toBe(true);
    });

    it('時間指定イベント（13:00～17:00）は終日イベントと判定しないこと', () => {
      // Arrange
      // JST 2026-01-10 13:00:00 = UTC 2026-01-10 04:00:00
      const start = '2026-01-10T04:00:00.000Z';
      // JST 2026-01-10 17:00:00 = UTC 2026-01-10 08:00:00
      const end = '2026-01-10T08:00:00.000Z';
      
      // Act
      const result = isAllDayEvent(start, end);
      
      // Assert
      expect(result).toBe(false);
    });

    it('深夜イベント（23:00～翌日02:00）は終日イベントと判定しないこと', () => {
      // Arrange
      // JST 2026-01-10 23:00:00 = UTC 2026-01-10 14:00:00
      const start = '2026-01-10T14:00:00.000Z';
      // JST 2026-01-11 02:00:00 = UTC 2026-01-10 17:00:00
      const end = '2026-01-10T17:00:00.000Z';
      
      // Act
      const result = isAllDayEvent(start, end);
      
      // Assert
      expect(result).toBe(false);
    });

    it('開始が00:00でも終了が00:00でない場合は終日イベントと判定しないこと', () => {
      // Arrange
      // JST 2026-01-02 00:00:00 = UTC 2026-01-01 15:00:00
      const start = '2026-01-01T15:00:00.000Z';
      // JST 2026-01-05 12:00:00 = UTC 2026-01-05 03:00:00
      const end = '2026-01-05T03:00:00.000Z';
      
      // Act
      const result = isAllDayEvent(start, end);
      
      // Assert
      expect(result).toBe(false);
    });

    it('開始が00:00でない場合は終日イベントと判定しないこと', () => {
      // Arrange
      // JST 2026-01-02 09:00:00 = UTC 2026-01-02 00:00:00
      const start = '2026-01-02T00:00:00.000Z';
      // JST 2026-01-05 00:00:00 = UTC 2026-01-04 15:00:00
      const end = '2026-01-04T15:00:00.000Z';
      
      // Act
      const result = isAllDayEvent(start, end);
      
      // Assert
      expect(result).toBe(false);
    });

    it('ゼロ時間長のイベント（同じ日の00:00～00:00）は終日イベントと判定しないこと', () => {
      // Arrange
      // JST 2026-01-02 00:00:00 = UTC 2026-01-01 15:00:00
      const start = '2026-01-01T15:00:00.000Z';
      // JST 2026-01-02 00:00:00 = UTC 2026-01-01 15:00:00（同じ時刻）
      const end = '2026-01-01T15:00:00.000Z';
      
      // Act
      const result = isAllDayEvent(start, end);
      
      // Assert
      expect(result).toBe(false);
    });
  });
});

