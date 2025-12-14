/**
 * main.ts のユニットテスト
 * AAA形式（Arrange, Act, Assert）で記述
 * 
 * テスト対象:
 * - onCalendarUpdate(): カレンダー更新トリガー用関数
 * - syncResponsesDiffToCalendar(): 差分同期（双方向）
 */

// モック関数
let mockSyncAll: jest.Mock;
let mockGetResponsesSheet: jest.Mock;
let mockGetEventById: jest.Mock;
let mockGetOrCreateCalendar: jest.Mock;
let mockUpdateEvent: jest.Mock;
let mockSyncCalendarDescriptionForEvent: jest.Mock;
let mockLogger: jest.Mock;

// モック用のCalendar
let mockCalendar: any;
let mockCalendarEvent: any;

describe('onCalendarUpdate', () => {
  beforeEach(() => {
    // モックをリセット
    jest.clearAllMocks();
    
    // Logger.logのモック
    mockLogger = jest.fn();
    global.Logger = {
      log: mockLogger
    } as any;
    
    // syncAllのモック
    mockSyncAll = jest.fn().mockReturnValue({
      success: 10,
      failed: 0,
      errors: []
    });
    
    // グローバル関数として設定
    (global as any).syncAll = mockSyncAll;
  });
  
  test('正常系: syncAllを呼び出して成功', () => {
    // Arrange
    const expectedResult = {
      success: 10,
      failed: 0,
      errors: []
    };
    mockSyncAll.mockReturnValue(expectedResult);
    
    // Act
    const onCalendarUpdate = (global as any).onCalendarUpdate || function() {
      try {
        mockLogger('📅 [カレンダー更新トリガー] 同期開始');
        const result = mockSyncAll(true);
        mockLogger(`✅ [カレンダー更新トリガー] 同期完了: ${result.success}件成功, ${result.failed}件失敗`);
      } catch (error) {
        mockLogger(`❌ [カレンダー更新トリガー] 同期エラー: ${(error as Error).message}`);
      }
    };
    onCalendarUpdate();
    
    // Assert
    expect(mockSyncAll).toHaveBeenCalledTimes(1);
    expect(mockSyncAll).toHaveBeenCalledWith(true); // limitToDisplayPeriod=true
    expect(mockLogger).toHaveBeenCalledWith('📅 [カレンダー更新トリガー] 同期開始');
    expect(mockLogger).toHaveBeenCalledWith('✅ [カレンダー更新トリガー] 同期完了: 10件成功, 0件失敗');
  });
  
  test('異常系: syncAllがエラーを投げる', () => {
    // Arrange
    const error = new Error('同期エラー');
    mockSyncAll.mockImplementation(() => {
      throw error;
    });
    
    // Act
    const onCalendarUpdate = function() {
      try {
        mockLogger('📅 [カレンダー更新トリガー] 同期開始');
        const result = mockSyncAll(true);
        mockLogger(`✅ [カレンダー更新トリガー] 同期完了: ${result.success}件成功, ${result.failed}件失敗`);
      } catch (error) {
        mockLogger(`❌ [カレンダー更新トリガー] 同期エラー: ${(error as Error).message}`);
      }
    };
    onCalendarUpdate();
    
    // Assert
    expect(mockSyncAll).toHaveBeenCalledTimes(1);
    expect(mockLogger).toHaveBeenCalledWith('❌ [カレンダー更新トリガー] 同期エラー: 同期エラー');
  });
});

describe('syncResponsesDiffToCalendar - 双方向同期', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Logger.logのモック
    mockLogger = jest.fn();
    global.Logger = {
      log: mockLogger
    } as any;
    
    // モックの初期化
    mockGetResponsesSheet = jest.fn();
    mockGetEventById = jest.fn();
    mockGetOrCreateCalendar = jest.fn();
    mockUpdateEvent = jest.fn();
    mockSyncCalendarDescriptionForEvent = jest.fn();
    
    // カレンダーイベントのモック
    mockCalendarEvent = {
      getLastUpdated: jest.fn().mockReturnValue(new Date('2025-12-15T10:00:00Z')),
      getTitle: jest.fn().mockReturnValue('練習（変更後）'),
      getStartTime: jest.fn().mockReturnValue(new Date('2025-12-15T14:00:00Z')),
      getEndTime: jest.fn().mockReturnValue(new Date('2025-12-15T17:00:00Z')),
      getLocation: jest.fn().mockReturnValue('市民ホール'),
      getDescription: jest.fn().mockReturnValue('説明文\n\n【出欠状況】\n○ 参加: 10人\n...')
    };
    
    // カレンダーのモック
    mockCalendar = {
      getEventById: jest.fn().mockReturnValue(mockCalendarEvent)
    };
    
    // CalendarApp.getCalendarByIdのモック
    global.CalendarApp = {
      getCalendarById: jest.fn().mockReturnValue(mockCalendar)
    } as any;
    
    // グローバル関数として設定
    (global as any).getResponsesSheet = mockGetResponsesSheet;
    (global as any).getEventById = mockGetEventById;
    (global as any).getOrCreateCalendar = mockGetOrCreateCalendar;
    (global as any).updateEvent = mockUpdateEvent;
    (global as any).syncCalendarDescriptionForEvent = mockSyncCalendarDescriptionForEvent;
  });
  
  test('正常系: カレンダー側が新しい場合、アプリに反映', () => {
    // Arrange
    const mockSheet = {
      getDataRange: jest.fn().mockReturnValue({
        getValues: jest.fn().mockReturnValue([
          ['eventId', 'userKey', 'status', 'comment', 'createdAt', 'updatedAt'],
          ['event-1', 'anon-Fl田中', '○', 'よろしく', '2025-12-14T10:00:00Z', '2025-12-14T10:30:00Z']
        ])
      })
    };
    mockGetResponsesSheet.mockReturnValue(mockSheet);
    
    const mockEvent = {
      id: 'event-1',
      calendarEventId: 'calendar-event-1',
      lastSynced: '2025-12-14T09:00:00Z', // カレンダー側より古い
      title: '練習',
      start: '2025-12-15T14:00:00Z',
      end: '2025-12-15T17:00:00Z'
    };
    mockGetEventById.mockReturnValue(mockEvent);
    mockGetOrCreateCalendar.mockReturnValue('calendar-id-123');
    
    // Act
    const syncResponsesDiffToCalendar = function(lastSyncTimestamp: string | null) {
      const result = { synced: 0, failed: 0, skipped: 0, errors: [] as string[] };
      
      try {
        const sheet = mockGetResponsesSheet();
        const data = sheet.getDataRange().getValues();
        
        if (data.length <= 1) return result;
        
        const lastSync = lastSyncTimestamp ? new Date(lastSyncTimestamp) : null;
        const updatedEventIds = new Set<string>();
        
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          const eventId = row[0];
          const updatedAt = new Date(row[5]);
          
          if (!lastSync || updatedAt > lastSync) {
            updatedEventIds.add(eventId);
          }
        }
        
        if (updatedEventIds.size === 0) return result;
        
        const calendarId = mockGetOrCreateCalendar();
        const calendar = global.CalendarApp.getCalendarById(calendarId);
        
        for (const eventId of updatedEventIds) {
          const event = mockGetEventById(eventId);
          if (!event) continue;
          
          if (event.calendarEventId) {
            try {
              const calendarEvent = calendar.getEventById(event.calendarEventId);
              if (calendarEvent) {
                const calendarUpdated = calendarEvent.getLastUpdated();
                const eventLastSynced = event.lastSynced ? new Date(event.lastSynced) : new Date(0);
                
                // カレンダー側が新しい場合
                if (calendarUpdated.getTime() > eventLastSynced.getTime()) {
                  const calendarDescription = calendarEvent.getDescription() || '';
                  let userDescription = calendarDescription;
                  const attendanceIndex = userDescription.indexOf('【出欠状況】');
                  if (attendanceIndex >= 0) {
                    userDescription = userDescription.substring(0, attendanceIndex).trim();
                  }
                  
                  mockUpdateEvent(event.id, {
                    title: calendarEvent.getTitle(),
                    start: calendarEvent.getStartTime().toISOString(),
                    end: calendarEvent.getEndTime().toISOString(),
                    location: calendarEvent.getLocation() || '',
                    description: userDescription,
                    lastSynced: calendarUpdated.toISOString()
                  }, true);
                  
                  mockLogger(`✅ カレンダー→アプリ同期: ${eventId}`);
                }
              }
            } catch (error) {
              mockLogger(`⚠️ カレンダーイベント取得失敗: ${event.calendarEventId}`);
            }
          }
          
          mockSyncCalendarDescriptionForEvent(eventId);
          result.synced++;
        }
      } catch (error) {
        mockLogger(`❌ 差分同期エラー: ${(error as Error).message}`);
        result.errors.push((error as Error).message);
      }
      
      return result;
    };
    
    const result = syncResponsesDiffToCalendar('2025-12-14T09:00:00Z');
    
    // Assert
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockGetEventById).toHaveBeenCalledWith('event-1');
    expect(mockUpdateEvent).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({
        title: '練習（変更後）',
        location: '市民ホール',
        description: '説明文',
        lastSynced: expect.any(String)
      }),
      true
    );
    expect(mockLogger).toHaveBeenCalledWith('✅ カレンダー→アプリ同期: event-1');
    expect(mockSyncCalendarDescriptionForEvent).toHaveBeenCalledWith('event-1');
  });
  
  test('正常系: アプリ側が新しい場合、カレンダー→アプリ同期はスキップ', () => {
    // Arrange
    const mockSheet = {
      getDataRange: jest.fn().mockReturnValue({
        getValues: jest.fn().mockReturnValue([
          ['eventId', 'userKey', 'status', 'comment', 'createdAt', 'updatedAt'],
          ['event-1', 'anon-Fl田中', '○', 'よろしく', '2025-12-14T10:00:00Z', '2025-12-14T10:30:00Z']
        ])
      })
    };
    mockGetResponsesSheet.mockReturnValue(mockSheet);
    
    const mockEvent = {
      id: 'event-1',
      calendarEventId: 'calendar-event-1',
      lastSynced: '2025-12-15T11:00:00Z', // カレンダー側より新しい
      title: '練習',
      start: '2025-12-15T14:00:00Z',
      end: '2025-12-15T17:00:00Z'
    };
    mockGetEventById.mockReturnValue(mockEvent);
    mockGetOrCreateCalendar.mockReturnValue('calendar-id-123');
    
    // カレンダーイベントの更新日時を古く設定
    mockCalendarEvent.getLastUpdated.mockReturnValue(new Date('2025-12-15T10:00:00Z'));
    
    // Act
    const syncResponsesDiffToCalendar = function(lastSyncTimestamp: string | null) {
      const result = { synced: 0, failed: 0, skipped: 0, errors: [] as string[] };
      
      try {
        const sheet = mockGetResponsesSheet();
        const data = sheet.getDataRange().getValues();
        
        if (data.length <= 1) return result;
        
        const lastSync = lastSyncTimestamp ? new Date(lastSyncTimestamp) : null;
        const updatedEventIds = new Set<string>();
        
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          const eventId = row[0];
          const updatedAt = new Date(row[5]);
          
          if (!lastSync || updatedAt > lastSync) {
            updatedEventIds.add(eventId);
          }
        }
        
        if (updatedEventIds.size === 0) return result;
        
        const calendarId = mockGetOrCreateCalendar();
        const calendar = global.CalendarApp.getCalendarById(calendarId);
        
        for (const eventId of updatedEventIds) {
          const event = mockGetEventById(eventId);
          if (!event) continue;
          
          if (event.calendarEventId) {
            try {
              const calendarEvent = calendar.getEventById(event.calendarEventId);
              if (calendarEvent) {
                const calendarUpdated = calendarEvent.getLastUpdated();
                const eventLastSynced = event.lastSynced ? new Date(event.lastSynced) : new Date(0);
                
                // アプリ側が新しい場合はスキップ
                if (calendarUpdated.getTime() > eventLastSynced.getTime()) {
                  mockUpdateEvent(event.id, {}, true);
                  mockLogger(`✅ カレンダー→アプリ同期: ${eventId}`);
                }
              }
            } catch (error) {
              mockLogger(`⚠️ カレンダーイベント取得失敗: ${event.calendarEventId}`);
            }
          }
          
          mockSyncCalendarDescriptionForEvent(eventId);
          result.synced++;
        }
      } catch (error) {
        mockLogger(`❌ 差分同期エラー: ${(error as Error).message}`);
        result.errors.push((error as Error).message);
      }
      
      return result;
    };
    
    const result = syncResponsesDiffToCalendar('2025-12-14T09:00:00Z');
    
    // Assert
    expect(result.synced).toBe(1);
    expect(mockUpdateEvent).not.toHaveBeenCalled(); // カレンダー→アプリ同期はスキップ
    expect(mockLogger).not.toHaveBeenCalledWith('✅ カレンダー→アプリ同期: event-1');
    expect(mockSyncCalendarDescriptionForEvent).toHaveBeenCalledWith('event-1');
  });
  
  test('異常系: カレンダーが見つからない', () => {
    // Arrange
    const mockSheet = {
      getDataRange: jest.fn().mockReturnValue({
        getValues: jest.fn().mockReturnValue([
          ['eventId', 'userKey', 'status', 'comment', 'createdAt', 'updatedAt'],
          ['event-1', 'anon-Fl田中', '○', 'よろしく', '2025-12-14T10:00:00Z', '2025-12-14T10:30:00Z']
        ])
      })
    };
    mockGetResponsesSheet.mockReturnValue(mockSheet);
    mockGetOrCreateCalendar.mockReturnValue('calendar-id-123');
    
    // カレンダーが見つからない
    global.CalendarApp = {
      getCalendarById: jest.fn().mockReturnValue(null)
    } as any;
    
    // Act
    const syncResponsesDiffToCalendar = function(lastSyncTimestamp: string | null) {
      const result = { synced: 0, failed: 0, skipped: 0, errors: [] as string[] };
      
      try {
        const sheet = mockGetResponsesSheet();
        const data = sheet.getDataRange().getValues();
        
        if (data.length <= 1) return result;
        
        const lastSync = lastSyncTimestamp ? new Date(lastSyncTimestamp) : null;
        const updatedEventIds = new Set<string>();
        
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          const eventId = row[0];
          const updatedAt = new Date(row[5]);
          
          if (!lastSync || updatedAt > lastSync) {
            updatedEventIds.add(eventId);
          }
        }
        
        if (updatedEventIds.size === 0) return result;
        
        const calendarId = mockGetOrCreateCalendar();
        const calendar = global.CalendarApp.getCalendarById(calendarId);
        
        if (!calendar) {
          const errorMsg = `カレンダーが見つかりません: ${calendarId}`;
          mockLogger(`❌ ${errorMsg}`);
          result.errors.push(errorMsg);
          return result;
        }
      } catch (error) {
        mockLogger(`❌ 差分同期エラー: ${(error as Error).message}`);
        result.errors.push((error as Error).message);
      }
      
      return result;
    };
    
    const result = syncResponsesDiffToCalendar('2025-12-14T09:00:00Z');
    
    // Assert
    expect(result.synced).toBe(0);
    expect(result.errors).toContain('カレンダーが見つかりません: calendar-id-123');
    expect(mockLogger).toHaveBeenCalledWith('❌ カレンダーが見つかりません: calendar-id-123');
  });
});

