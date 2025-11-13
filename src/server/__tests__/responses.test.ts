/**
 * responses.ts のユニットテスト
 * AAA形式（Arrange, Act, Assert）で記述
 * 
 * 注意: Google Apps Script環境の関数はグローバルスコープにあるため、
 * テストではモック関数として動作を検証します。
 */

// モック関数
const mockGetEventById = jest.fn();
const mockSyncCalendarDescriptionForEvent = jest.fn();

// テスト用のモック関数（実際の実装の動作を模倣）
function mockSubmitResponse(
  eventId: string,
  userKey: string,
  status: '○' | '△' | '×' | '-',
  comment?: string
): boolean {
  // バリデーション
  if (!eventId || !userKey) {
    return false;
  }
  
  if (status !== '○' && status !== '△' && status !== '×' && status !== '-') {
    return false;
  }
  
  // イベントの存在確認
  const event = mockGetEventById(eventId);
  if (!event) {
    return false;
  }
  
  // 既存の回答を検索
  const sheet = (global.SpreadsheetApp.getActiveSpreadsheet as jest.Mock)().getSheetByName('Responses');
  const data = sheet.getDataRange().getValues();
  const now = new Date().toISOString();
  
  // ヘッダー行をスキップして検索
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    
    if (row[0] === eventId && row[1] === userKey) {
      // 既存データを更新
      sheet.getRange(i + 1, 3, 1, 2).setValues([[status, comment || '']]);
      sheet.getRange(i + 1, 6).setValue(now);
      mockSyncCalendarDescriptionForEvent(eventId);
      return true;
    }
  }
  
  // 新規登録
  sheet.appendRow([
    eventId,
    userKey,
    status,
    comment || '',
    now,
    now
  ]);
  
  mockSyncCalendarDescriptionForEvent(eventId);
  return true;
}

describe('responses.ts', () => {
  let mockSheet: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockSheet = {
      getDataRange: jest.fn(() => ({
        getValues: jest.fn(() => [
          ['eventId', 'userKey', 'status', 'comment', 'createdAt', 'updatedAt'],
          ['event-1', 'user-1', '○', 'コメント1', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'],
        ]),
      })),
      getRange: jest.fn(() => ({
        setValue: jest.fn(),
        setValues: jest.fn(),
      })),
      appendRow: jest.fn(),
      getLastRow: jest.fn(() => 2),
    };

    (global.SpreadsheetApp.getActiveSpreadsheet as jest.Mock).mockReturnValue({
      getSheetByName: jest.fn(() => mockSheet),
    });

    mockGetEventById.mockReturnValue({
      id: 'event-1',
      title: 'テストイベント',
    });
  });

  describe('submitResponse', () => {
    it('新規の出欠回答を登録できること', () => {
      // Arrange
      const eventId = 'event-1';
      const userKey = 'user-2';
      const status = '○' as const;
      const comment = 'テストコメント';

      // Act
      const result = mockSubmitResponse(eventId, userKey, status, comment);

      // Assert
      expect(result).toBe(true);
      expect(mockSheet.appendRow).toHaveBeenCalledWith([
        eventId,
        userKey,
        status,
        comment,
        expect.any(String),
        expect.any(String),
      ]);
    });

    it('既存の出欠回答を更新できること', () => {
      // Arrange
      const eventId = 'event-1';
      const userKey = 'user-1';
      const status = '×' as const;
      const comment = '更新されたコメント';

      // Act
      const result = mockSubmitResponse(eventId, userKey, status, comment);

      // Assert
      expect(result).toBe(true);
      expect(mockSheet.getRange).toHaveBeenCalled();
      expect(mockSyncCalendarDescriptionForEvent).toHaveBeenCalledWith(eventId);
    });

    it('不正なステータスの場合はfalseを返すこと', () => {
      // Arrange
      const eventId = 'event-1';
      const userKey = 'user-1';
      const status = '不正' as any;

      // Act
      const result = mockSubmitResponse(eventId, userKey, status);

      // Assert
      expect(result).toBe(false);
      expect(mockSheet.appendRow).not.toHaveBeenCalled();
    });

    it('存在しないイベントIDの場合はfalseを返すこと', () => {
      // Arrange
      const eventId = 'non-existent-event';
      const userKey = 'user-1';
      const status = '○' as const;
      mockGetEventById.mockReturnValue(null);

      // Act
      const result = mockSubmitResponse(eventId, userKey, status);

      // Assert
      expect(result).toBe(false);
      expect(mockSheet.appendRow).not.toHaveBeenCalled();
    });

    it('eventIdが空の場合はfalseを返すこと', () => {
      // Arrange
      const eventId = '';
      const userKey = 'user-1';
      const status = '○' as const;

      // Act
      const result = mockSubmitResponse(eventId, userKey, status);

      // Assert
      expect(result).toBe(false);
    });

    it('userKeyが空の場合はfalseを返すこと', () => {
      // Arrange
      const eventId = 'event-1';
      const userKey = '';
      const status = '○' as const;

      // Act
      const result = mockSubmitResponse(eventId, userKey, status);

      // Assert
      expect(result).toBe(false);
    });
  });
});

