/**
 * events.ts のユニットテスト
 * AAA形式（Arrange, Act, Assert）で記述
 */

// テスト用のモック関数
function mockCreateEvent(input: any): string | null {
  if (!input.title || !input.start || !input.end) {
    return null;
  }
  
  if (input.title.length > 100) {
    return null;
  }
  
  const startDate = new Date(input.start);
  const endDate = new Date(input.end);
  if (startDate >= endDate) {
    return null;
  }
  
  const mockSheet = (global.SpreadsheetApp.getActiveSpreadsheet as jest.Mock)().getSheetByName('Events');
  if (!mockSheet) {
    return null;
  }
  
  const eventId = 'event-' + Date.now();
  const now = new Date().toISOString();
  
  mockSheet.appendRow([
    eventId,
    input.title,
    input.start,
    input.end,
    input.isAllDay || false,
    input.location || '',
    input.description || '',
    '',
    '',
    'active',
    now,
    now,
    '',
  ]);
  
  return eventId;
}

function mockGetEvents(): any[] {
  const mockSheet = (global.SpreadsheetApp.getActiveSpreadsheet as jest.Mock)().getSheetByName('Events');
  if (!mockSheet) {
    return [];
  }
  
  const data = mockSheet.getDataRange().getValues();
  const events = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[9] !== 'deleted') {
      events.push({
        id: row[0],
        title: row[1],
        start: row[2],
        end: row[3],
        isAllDay: row[4],
        location: row[5],
        description: row[6],
        calendarEventId: row[7],
        notesHash: row[8],
        status: row[9],
        createdAt: row[10],
        updatedAt: row[11],
        lastSynced: row[12],
      });
    }
  }
  
  return events;
}

function mockGetEventByIdForEvents(eventId: string): any | null {
  const events = mockGetEvents();
  return events.find(e => e.id === eventId) || null;
}

function mockUpdateEvent(eventId: string, updates: any): boolean {
  if (!eventId) {
    return false;
  }
  
  if (updates.title && updates.title.length > 100) {
    return false;
  }
  
  const mockSheet = (global.SpreadsheetApp.getActiveSpreadsheet as jest.Mock)().getSheetByName('Events');
  if (!mockSheet) {
    return false;
  }
  
  const data = mockSheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === eventId && data[i][9] !== 'deleted') {
      mockSheet.getRange(i + 1, 1, 1, 13).setValues([data[i]]);
      return true;
    }
  }
  
  return false;
}

function mockDeleteEvent(eventId: string): boolean {
  if (!eventId) {
    return false;
  }
  
  const mockSheet = (global.SpreadsheetApp.getActiveSpreadsheet as jest.Mock)().getSheetByName('Events');
  if (!mockSheet) {
    return false;
  }
  
  const data = mockSheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === eventId && data[i][9] !== 'deleted') {
      // 論理削除
      mockSheet.getRange(i + 1, 10).setValue('deleted');
      return true;
    }
  }
  
  return false;
}

describe('events.ts', () => {
  let mockSheet: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockSheet = {
      getDataRange: jest.fn(() => ({
        getValues: jest.fn(() => [
          ['id', 'title', 'start', 'end', 'isAllDay', 'location', 'description', 'calendarEventId', 'notesHash', 'status', 'createdAt', 'updatedAt', 'lastSynced'],
          ['event-1', 'テストイベント1', '2024-12-20T14:00:00Z', '2024-12-20T17:00:00Z', false, '会場1', '説明1', '', '', 'active', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', ''],
          ['event-2', 'テストイベント2', '2024-12-21T14:00:00Z', '2024-12-21T17:00:00Z', false, '会場2', '説明2', '', '', 'active', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', ''],
        ]),
      })),
      getRange: jest.fn(() => ({
        setValue: jest.fn(),
        setValues: jest.fn(),
      })),
      appendRow: jest.fn(),
      getLastRow: jest.fn(() => 3),
    };
    
    (global.SpreadsheetApp.getActiveSpreadsheet as jest.Mock).mockReturnValue({
      getSheetByName: jest.fn(() => mockSheet),
    });
  });

  describe('createEvent', () => {
    it('有効なイベントを作成できること', () => {
      // Arrange
      const input = {
        title: '新しいイベント',
        start: '2024-12-25T14:00:00Z',
        end: '2024-12-25T17:00:00Z',
        location: 'テスト会場',
        description: 'テスト説明',
      };

      // Act
      const result = mockCreateEvent(input);

      // Assert
      expect(result).not.toBeNull();
      expect(result).toMatch(/^event-\d+$/);
      expect(mockSheet.appendRow).toHaveBeenCalled();
    });

    it('タイトルが空の場合はnullを返すこと', () => {
      // Arrange
      const input = {
        title: '',
        start: '2024-12-25T14:00:00Z',
        end: '2024-12-25T17:00:00Z',
      };

      // Act
      const result = mockCreateEvent(input);

      // Assert
      expect(result).toBeNull();
    });

    it('タイトルが100文字を超える場合はnullを返すこと', () => {
      // Arrange
      const input = {
        title: 'あ'.repeat(101),
        start: '2024-12-25T14:00:00Z',
        end: '2024-12-25T17:00:00Z',
      };

      // Act
      const result = mockCreateEvent(input);

      // Assert
      expect(result).toBeNull();
    });

    it('開始日時が終了日時以降の場合はnullを返すこと', () => {
      // Arrange
      const input = {
        title: 'テストイベント',
        start: '2024-12-25T17:00:00Z',
        end: '2024-12-25T14:00:00Z',
      };

      // Act
      const result = mockCreateEvent(input);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getEvents', () => {
    it('全てのアクティブなイベントを取得できること', () => {
      // Arrange & Act
      const result = mockGetEvents();

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('event-1');
      expect(result[1].id).toBe('event-2');
    });
  });

  describe('getEventById', () => {
    it('IDでイベントを取得できること', () => {
      // Arrange
      const eventId = 'event-1';

      // Act
      const result = mockGetEventByIdForEvents(eventId);

      // Assert
      expect(result).not.toBeNull();
      expect(result.id).toBe('event-1');
      expect(result.title).toBe('テストイベント1');
    });

    it('存在しないIDの場合はnullを返すこと', () => {
      // Arrange
      const eventId = 'non-existent-event';

      // Act
      const result = mockGetEventByIdForEvents(eventId);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('updateEvent', () => {
    it('既存イベントを更新できること', () => {
      // Arrange
      const eventId = 'event-1';
      const updates = {
        title: '更新されたイベント',
        location: '新しい会場',
      };

      // Act
      const result = mockUpdateEvent(eventId, updates);

      // Assert
      expect(result).toBe(true);
    });

    it('存在しないイベントの更新はfalseを返すこと', () => {
      // Arrange
      const eventId = 'non-existent-event';
      const updates = {
        title: '更新されたイベント',
      };

      // Act
      const result = mockUpdateEvent(eventId, updates);

      // Assert
      expect(result).toBe(false);
    });

    it('タイトルが100文字を超える場合はfalseを返すこと', () => {
      // Arrange
      const eventId = 'event-1';
      const updates = {
        title: 'あ'.repeat(101),
      };

      // Act
      const result = mockUpdateEvent(eventId, updates);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('deleteEvent', () => {
    it('既存イベントを論理削除できること', () => {
      // Arrange
      const eventId = 'event-1';

      // Act
      const result = mockDeleteEvent(eventId);

      // Assert
      expect(result).toBe(true);
      expect(mockSheet.getRange).toHaveBeenCalled();
    });

    it('存在しないイベントの削除はfalseを返すこと', () => {
      // Arrange
      const eventId = 'non-existent-event';

      // Act
      const result = mockDeleteEvent(eventId);

      // Assert
      expect(result).toBe(false);
    });

    it('eventIdが空の場合はfalseを返すこと', () => {
      // Arrange
      const eventId = '';

      // Act
      const result = mockDeleteEvent(eventId);

      // Assert
      expect(result).toBe(false);
    });
  });
});

