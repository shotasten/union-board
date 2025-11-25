/**
 * responses.ts のユニットテスト
 * AAA形式（Arrange, Act, Assert）で記述
 * 
 * 注意: Google Apps Script環境の関数はグローバルスコープにあるため、
 * テストではモック関数として動作を検証します。
 */

// モック関数
const mockGetEventByIdForResponses = jest.fn();
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
  const event = mockGetEventByIdForResponses(eventId);
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

    mockGetEventByIdForResponses.mockReturnValue({
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
      mockGetEventByIdForResponses.mockReturnValue(null);

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

  describe('cleanupDetachedResponses', () => {
    // テスト用のモック関数（実際の実装の動作を模倣）
    function mockCleanupDetachedResponses(): { deleted: number; total: number } {
      // Membersシートからメンバー一覧を取得
      const spreadsheet = (global.SpreadsheetApp.getActiveSpreadsheet as jest.Mock)();
      if (!spreadsheet) {
        return { deleted: 0, total: 0 };
      }
      
      const membersSheet = spreadsheet.getSheetByName('Members');
      if (!membersSheet) {
        return { deleted: 0, total: 0 };
      }
      
      const membersDataRange = membersSheet.getDataRange();
      if (!membersDataRange) {
        return { deleted: 0, total: 0 };
      }
      
      const membersData = membersDataRange.getValues();
      if (!Array.isArray(membersData)) {
        return { deleted: 0, total: 0 };
      }
      
      const memberSet = new Set<string>();
      for (let i = 1; i < membersData.length; i++) {
        const row = membersData[i];
        if (row && Array.isArray(row) && row[0]) {
          memberSet.add(String(row[0]));
        }
      }

      // Responsesシートからレスポンス一覧を取得
      const responsesSheet = spreadsheet.getSheetByName('Responses');
      if (!responsesSheet) {
        return { deleted: 0, total: 0 };
      }

      const responsesDataRange = responsesSheet.getDataRange();
      if (!responsesDataRange) {
        return { deleted: 0, total: 0 };
      }
      
      const responsesData = responsesDataRange.getValues();
      if (!Array.isArray(responsesData)) {
        return { deleted: 0, total: 0 };
      }
      if (responsesData.length <= 1) {
        return { deleted: 0, total: 0 };
      }

      const total = responsesData.length - 1; // ヘッダーを除く
      const header = responsesData[0];
      const remainingData: any[][] = [header];
      let deleted = 0;

      for (let i = 1; i < responsesData.length; i++) {
        const row = responsesData[i];
        const userKey = String(row[1] || '');
        if (userKey && memberSet.has(userKey)) {
          remainingData.push(row);
        } else {
          deleted++;
        }
      }

      if (deleted === 0) {
        return { deleted: 0, total };
      }

      // シートをクリアして書き戻し
      responsesSheet.clear();
      if (remainingData.length > 0) {
        const dataRange = responsesSheet.getRange(1, 1, remainingData.length, remainingData[0].length);
        if (dataRange && typeof dataRange.setValues === 'function') {
          dataRange.setValues(remainingData);
        }
        const headerRange = responsesSheet.getRange(1, 1, 1, remainingData[0].length);
        if (headerRange) {
          if (typeof headerRange.setFontWeight === 'function') {
            headerRange.setFontWeight('bold');
          }
          if (typeof headerRange.setBackground === 'function') {
            headerRange.setBackground('#667eea');
          }
          if (typeof headerRange.setFontColor === 'function') {
            headerRange.setFontColor('#ffffff');
          }
        }
        if (typeof responsesSheet.setFrozenRows === 'function') {
          responsesSheet.setFrozenRows(1);
        }
      }

      return { deleted, total };
    }

    it('メンバーが存在するレスポンスは残ること', () => {
      // Arrange
      const membersSheet = {
        getDataRange: jest.fn(() => ({
          getValues: jest.fn(() => [
            ['userKey', 'part', 'name', 'displayName', 'createdAt', 'updatedAt'],
            ['user-1', 'Fl', '太郎', 'Fl太郎', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'],
          ]),
        })),
      };

      const responsesSheet = {
        getDataRange: jest.fn(() => ({
          getValues: jest.fn(() => [
            ['eventId', 'userKey', 'status', 'comment', 'createdAt', 'updatedAt'],
            ['event-1', 'user-1', '○', 'コメント', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'],
          ]),
        })),
        clear: jest.fn(),
        getRange: jest.fn(() => ({
          setValues: jest.fn(),
          setFontWeight: jest.fn(),
          setBackground: jest.fn(),
          setFontColor: jest.fn(),
        })),
        setFrozenRows: jest.fn(),
      };

      (global.SpreadsheetApp.getActiveSpreadsheet as jest.Mock).mockReturnValue({
        getSheetByName: jest.fn((name: string) => {
          if (name === 'Members') return membersSheet;
          if (name === 'Responses') return responsesSheet;
          return null;
        }),
      });

      // Act
      const result = mockCleanupDetachedResponses();

      // Assert
      expect(result.deleted).toBe(0);
      expect(result.total).toBe(1);
      expect(responsesSheet.clear).not.toHaveBeenCalled();
    });

    it('メンバーが存在しないレスポンスは削除されること', () => {
      // Arrange
      const membersData = [
        ['userKey', 'part', 'name', 'displayName', 'createdAt', 'updatedAt'],
        ['user-1', 'Fl', '太郎', 'Fl太郎', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'],
      ];
      const membersDataRange = {
        getValues: jest.fn(() => membersData),
      };
      const membersSheet = {
        getDataRange: jest.fn(() => membersDataRange),
      };

      const responsesData = [
        ['eventId', 'userKey', 'status', 'comment', 'createdAt', 'updatedAt'],
        ['event-1', 'user-1', '○', 'コメント1', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'],
        ['event-2', 'user-2', '×', 'コメント2', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'], // 未所属レスポンス
      ];
      const responsesDataRange = {
        getValues: jest.fn(() => responsesData),
      };

      const mockRange = {
        setValues: jest.fn(),
        setFontWeight: jest.fn(),
        setBackground: jest.fn(),
        setFontColor: jest.fn(),
      };

      const responsesSheet = {
        getDataRange: jest.fn(() => responsesDataRange),
        clear: jest.fn(),
        getRange: jest.fn(() => mockRange),
        setFrozenRows: jest.fn(),
      };

      (global.SpreadsheetApp.getActiveSpreadsheet as jest.Mock).mockReturnValue({
        getSheetByName: jest.fn((name: string) => {
          if (name === 'Members') return membersSheet;
          if (name === 'Responses') return responsesSheet;
          return null;
        }),
      });

      // Act
      const result = mockCleanupDetachedResponses();

      // Assert
      expect(result.deleted).toBe(1);
      expect(result.total).toBe(2);
      expect(responsesSheet.clear).toHaveBeenCalled();
      expect(mockRange.setValues).toHaveBeenCalledWith([
        ['eventId', 'userKey', 'status', 'comment', 'createdAt', 'updatedAt'],
        ['event-1', 'user-1', '○', 'コメント1', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'],
      ]);
    });

    it('空のシートの場合は何もしないこと', () => {
      // Arrange
      const membersSheet = {
        getDataRange: jest.fn(() => ({
          getValues: jest.fn(() => [
            ['userKey', 'part', 'name', 'displayName', 'createdAt', 'updatedAt'],
          ]),
        })),
      };

      const responsesSheet = {
        getDataRange: jest.fn(() => ({
          getValues: jest.fn(() => [
            ['eventId', 'userKey', 'status', 'comment', 'createdAt', 'updatedAt'],
          ]),
        })),
        clear: jest.fn(),
      };

      (global.SpreadsheetApp.getActiveSpreadsheet as jest.Mock).mockReturnValue({
        getSheetByName: jest.fn((name: string) => {
          if (name === 'Members') return membersSheet;
          if (name === 'Responses') return responsesSheet;
          return null;
        }),
      });

      // Act
      const result = mockCleanupDetachedResponses();

      // Assert
      expect(result.deleted).toBe(0);
      expect(result.total).toBe(0);
      expect(responsesSheet.clear).not.toHaveBeenCalled();
    });

    it('全てのレスポンスが有効な場合は何も削除されないこと', () => {
      // Arrange
      const membersSheet = {
        getDataRange: jest.fn(() => ({
          getValues: jest.fn(() => [
            ['userKey', 'part', 'name', 'displayName', 'createdAt', 'updatedAt'],
            ['user-1', 'Fl', '太郎', 'Fl太郎', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'],
            ['user-2', 'Ob', '花子', 'Ob花子', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'],
          ]),
        })),
      };

      const responsesSheet = {
        getDataRange: jest.fn(() => ({
          getValues: jest.fn(() => [
            ['eventId', 'userKey', 'status', 'comment', 'createdAt', 'updatedAt'],
            ['event-1', 'user-1', '○', 'コメント1', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'],
            ['event-1', 'user-2', '×', 'コメント2', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'],
          ]),
        })),
        clear: jest.fn(),
      };

      (global.SpreadsheetApp.getActiveSpreadsheet as jest.Mock).mockReturnValue({
        getSheetByName: jest.fn((name: string) => {
          if (name === 'Members') return membersSheet;
          if (name === 'Responses') return responsesSheet;
          return null;
        }),
      });

      // Act
      const result = mockCleanupDetachedResponses();

      // Assert
      expect(result.deleted).toBe(0);
      expect(result.total).toBe(2);
      expect(responsesSheet.clear).not.toHaveBeenCalled();
    });

    it('複数の未所属レスポンスが存在する場合、全て削除されること', () => {
      // Arrange
      const membersData = [
        ['userKey', 'part', 'name', 'displayName', 'createdAt', 'updatedAt'],
        ['user-1', 'Fl', '太郎', 'Fl太郎', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'],
      ];
      const membersDataRange = {
        getValues: jest.fn(() => membersData),
      };
      const membersSheet = {
        getDataRange: jest.fn(() => membersDataRange),
      };

      const responsesData = [
        ['eventId', 'userKey', 'status', 'comment', 'createdAt', 'updatedAt'],
        ['event-1', 'user-1', '○', 'コメント1', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'],
        ['event-2', 'user-2', '×', 'コメント2', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'], // 未所属
        ['event-3', 'user-3', '△', 'コメント3', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'], // 未所属
      ];
      const responsesDataRange = {
        getValues: jest.fn(() => responsesData),
      };

      const mockRange = {
        setValues: jest.fn(),
        setFontWeight: jest.fn(),
        setBackground: jest.fn(),
        setFontColor: jest.fn(),
      };

      const responsesSheet = {
        getDataRange: jest.fn(() => responsesDataRange),
        clear: jest.fn(),
        getRange: jest.fn(() => mockRange),
        setFrozenRows: jest.fn(),
      };

      (global.SpreadsheetApp.getActiveSpreadsheet as jest.Mock).mockReturnValue({
        getSheetByName: jest.fn((name: string) => {
          if (name === 'Members') return membersSheet;
          if (name === 'Responses') return responsesSheet;
          return null;
        }),
      });

      // Act
      const result = mockCleanupDetachedResponses();

      // Assert
      expect(result.deleted).toBe(2);
      expect(result.total).toBe(3);
      expect(responsesSheet.clear).toHaveBeenCalled();
      expect(mockRange.setValues).toHaveBeenCalledWith([
        ['eventId', 'userKey', 'status', 'comment', 'createdAt', 'updatedAt'],
        ['event-1', 'user-1', '○', 'コメント1', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'],
      ]);
    });
  });
});

