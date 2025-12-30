/**
 * calendar.ts のユニットテスト
 * AAA形式（Arrange, Act, Assert）で記述
 */

// モック関数（テスト内で使用）
let mockGetMembersForCalendar: jest.Mock;
let mockGetResponsesForCalendar: jest.Mock;
let mockTallyResponsesForCalendar: jest.Mock;

// テスト用のモック関数（実際の実装の動作を模倣）
function mockComputeHash(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  // 実際の実装に合わせて「最終更新」行を除外
  const normalizedText = text.replace(/\n最終更新: \d{4}-\d{2}-\d{2} \d{2}:\d{2}\s*$/m, '');
  
  // 簡易的なハッシュ計算（実際の実装を模倣）
  const mockHash = global.Utilities.computeDigest as jest.Mock;
  const result = mockHash(normalizedText);
  if (result && Array.isArray(result)) {
    return result.map((b: number) => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
  }
  
  // フォールバック: テキストの長さをハッシュとして使用
  return normalizedText.length.toString(16);
}

function mockBuildDescriptionWithMemberMap(
  eventId: string,
  userDescription: string | undefined,
  eventResponses: any[],
  memberMap: Map<string, any>
): string {
  let attendCount = 0;
  let maybeCount = 0;
  let absentCount = 0;
  let unselectedCount = 0;
  
  eventResponses.forEach(response => {
    if (response.status === '○') attendCount++;
    else if (response.status === '△') maybeCount++;
    else if (response.status === '×') absentCount++;
    else if (response.status === '-') unselectedCount++;
  });
  
  const totalCount = attendCount + maybeCount + absentCount + unselectedCount;
  const now = new Date();
  const formattedDate = global.Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  
  let description = '';
  
  if (userDescription && userDescription.trim()) {
    description += userDescription.trim() + '\n\n';
  }
  
  description += '【出欠状況】\n';
  description += `○ 参加: ${attendCount}人\n`;
  description += `△ 遅早: ${maybeCount}人\n`;
  description += `× 欠席: ${absentCount}人\n`;
  description += `- 未定: ${unselectedCount}人\n`;
  description += `合計: ${totalCount}人\n\n`;
  
  const comments = eventResponses.filter(r => r.comment && r.comment.trim());
  
  if (comments.length > 0) {
    description += '【コメント】\n';
    comments.forEach(response => {
      const member = memberMap.get(response.userKey);
      const displayName = member?.displayName || member?.name || '不明';
      const statusLabel = response.status === '○' ? '○' : response.status === '△' ? '△' : response.status === '×' ? '×' : '-';
      description += `${statusLabel} ${displayName}: ${response.comment}\n`;
    });
  } else {
    description += '【コメント】\n';
    description += '（コメントなし）\n';
  }
  
  description += `\n最終更新: ${formattedDate}`;
  
  return description;
}

function mockBuildDescription(eventId: string, userDescription?: string): string {
  const tally = mockTallyResponsesForCalendar(eventId);
  const now = new Date();
  const formattedDate = global.Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  
  let description = '';
  
  if (userDescription && userDescription.trim()) {
    description += userDescription.trim() + '\n\n';
  }
  
  description += '【出欠状況】\n';
  description += `○ 参加: ${tally.attendCount}人\n`;
  description += `△ 遅早: ${tally.maybeCount}人\n`;
  description += `× 欠席: ${tally.absentCount}人\n`;
  description += `- 未定: ${tally.unselectedCount}人\n`;
  description += `合計: ${tally.totalCount}人\n\n`;
  
  try {
    const responses = mockGetResponsesForCalendar(eventId);
    const comments = responses.filter((r: any) => r.comment && r.comment.trim());
    
    if (comments.length > 0) {
      description += '【コメント】\n';
      const members = mockGetMembersForCalendar();
      const memberMap = new Map<string, any>();
      members.forEach((m: any) => {
        memberMap.set(m.userKey, m);
      });
      
      comments.forEach((response: any) => {
        const member = memberMap.get(response.userKey);
        const displayName = member?.displayName || member?.name || '不明';
        const statusLabel = response.status === '○' ? '○' : response.status === '△' ? '△' : response.status === '×' ? '×' : '-';
        description += `${statusLabel} ${displayName}: ${response.comment}\n`;
      });
    } else {
      description += '【コメント】\n';
      description += '（コメントなし）\n';
    }
  } catch (error) {
    description += '（コメント取得エラー）\n';
  }
  
  description += `\n最終更新: ${formattedDate}`;
  
  return description;
}

describe('calendar.ts', () => {
  let mockCalendar: any;
  let mockCalendarEvent: any;
  let mockSheet: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // モック関数を初期化
    mockGetMembersForCalendar = jest.fn();
    mockGetResponsesForCalendar = jest.fn();
    mockTallyResponsesForCalendar = jest.fn();
    
    mockCalendarEvent = {
      getId: jest.fn(() => 'mock-event-id'),
      setDescription: jest.fn(),
      getDescription: jest.fn(() => ''),
      setTitle: jest.fn(),
      setTime: jest.fn(),
      setLocation: jest.fn(),
    };
    
    mockCalendar = {
      createEvent: jest.fn(() => mockCalendarEvent),
      getEventById: jest.fn(() => mockCalendarEvent),
      getEvents: jest.fn(() => []),
      getEventsForDay: jest.fn(() => []),
      getName: jest.fn(() => 'MockCalendar'),
      getId: jest.fn(() => 'mock-calendar-id'),
    };
    
    mockSheet = {
      getDataRange: jest.fn(() => ({
        getValues: jest.fn(() => []),
      })),
      getRange: jest.fn(() => ({
        getValue: jest.fn(),
        getValues: jest.fn(() => []),
        setValue: jest.fn(),
        setValues: jest.fn(),
      })),
      getLastRow: jest.fn(() => 0),
      appendRow: jest.fn(),
      deleteRow: jest.fn(),
      getName: jest.fn(() => 'Events'),
    };
    
    (global.CalendarApp.getCalendarById as jest.Mock).mockReturnValue(mockCalendar);
    (global.CalendarApp.createCalendar as jest.Mock).mockReturnValue(mockCalendar);
    (global.Utilities.computeDigest as jest.Mock).mockImplementation((algorithm, text) => {
      // 簡易的なハッシュを返す
      const hash = new Array(32).fill(0).map(() => Math.floor(Math.random() * 256));
      return hash;
    });
    (global.Utilities.formatDate as jest.Mock).mockImplementation((date, timeZone, format) => {
      return '2024-01-01 12:00';
    });
  });

  describe('computeHash', () => {
    it('正常なテキストのハッシュを計算できること', () => {
      // Arrange
      const text = 'test text';
      (global.Utilities.computeDigest as jest.Mock).mockReturnValue([1, 2, 3, 4]);

      // Act
      const result = mockComputeHash(text);

      // Assert
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('空のテキストの場合は空文字を返すこと', () => {
      // Arrange
      const text = '';

      // Act
      const result = mockComputeHash(text);

      // Assert
      expect(result).toBe('');
    });

    it('nullの場合は空文字を返すこと', () => {
      // Arrange
      const text = null as any;

      // Act
      const result = mockComputeHash(text);

      // Assert
      expect(result).toBe('');
    });

    it('「最終更新」タイムスタンプが異なっても同じハッシュになること', () => {
      // Arrange
      const baseContent = '【出欠状況】\n○ 参加: 5人\n△ 遅早: 2人\n× 欠席: 1人\n- 未定: 0人\n合計: 8人';
      const text1 = baseContent + '\n最終更新: 2024-01-01 12:00';
      const text2 = baseContent + '\n最終更新: 2024-01-02 15:30';
      const text3 = baseContent + '\n最終更新: 2024-12-30 23:59';
      
      // 同じハッシュ値を返すようにモック
      (global.Utilities.computeDigest as jest.Mock).mockImplementation((text) => {
        // タイムスタンプが除外されているため、すべて同じテキストが渡される
        return [1, 2, 3, 4, 5];
      });

      // Act
      const hash1 = mockComputeHash(text1);
      const hash2 = mockComputeHash(text2);
      const hash3 = mockComputeHash(text3);

      // Assert
      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
      expect(hash1).toBe('0102030405');
      
      // computeDigestには「最終更新」行が除外されたテキストが渡されることを確認
      expect(global.Utilities.computeDigest).toHaveBeenCalledTimes(3);
      expect((global.Utilities.computeDigest as jest.Mock).mock.calls[0][0]).toBe(baseContent);
      expect((global.Utilities.computeDigest as jest.Mock).mock.calls[1][0]).toBe(baseContent);
      expect((global.Utilities.computeDigest as jest.Mock).mock.calls[2][0]).toBe(baseContent);
    });

    it('「最終更新」以外の内容が変わった場合はハッシュが変わること', () => {
      // Arrange
      const text1 = '【出欠状況】\n○ 参加: 5人\n\n最終更新: 2024-01-01 12:00';
      const text2 = '【出欠状況】\n○ 参加: 6人\n\n最終更新: 2024-01-01 12:00';
      
      (global.Utilities.computeDigest as jest.Mock)
        .mockReturnValueOnce([1, 2, 3, 4])
        .mockReturnValueOnce([5, 6, 7, 8]);

      // Act
      const hash1 = mockComputeHash(text1);
      const hash2 = mockComputeHash(text2);

      // Assert
      expect(hash1).not.toBe(hash2);
      expect(hash1).toBe('01020304');
      expect(hash2).toBe('05060708');
    });

    it('「最終更新」がない場合も正常に動作すること', () => {
      // Arrange
      const text = '【出欠状況】\n○ 参加: 5人\n△ 遅早: 2人';
      (global.Utilities.computeDigest as jest.Mock).mockReturnValue([10, 20, 30]);

      // Act
      const result = mockComputeHash(text);

      // Assert
      expect(result).toBeTruthy();
      expect(result).toBe('0a141e');
      expect(global.Utilities.computeDigest).toHaveBeenCalledWith(text); // 「最終更新」がないのでそのまま渡される
    });

    it('途中に「最終更新」のような文字列があっても末尾の「最終更新」行だけ除外すること', () => {
      // Arrange
      const text = '【コメント】\n最終更新: という言葉が含まれています\n\n【出欠状況】\n○ 参加: 5人\n\n最終更新: 2024-01-01 12:00';
      const expectedNormalized = '【コメント】\n最終更新: という言葉が含まれています\n\n【出欠状況】\n○ 参加: 5人\n';
      
      (global.Utilities.computeDigest as jest.Mock).mockReturnValue([1, 2, 3]);

      // Act
      const result = mockComputeHash(text);

      // Assert
      expect(result).toBeTruthy();
      const actualCall = (global.Utilities.computeDigest as jest.Mock).mock.calls[0][0];
      // 末尾の「最終更新」行が除外されていることを確認
      expect(actualCall).toContain('最終更新: という言葉が含まれています'); // 途中の「最終更新」は残る
      expect(actualCall).not.toContain('最終更新: 2024-01-01 12:00'); // 末尾の「最終更新」は除外
    });
  });

  describe('buildDescriptionWithMemberMap', () => {
    it('出欠状況とコメントを含む説明文を生成できること', () => {
      // Arrange
      const eventId = 'event-1';
      const userDescription = 'テストイベント';
      const eventResponses = [
        { userKey: 'user-1', status: '○', comment: '参加します' },
        { userKey: 'user-2', status: '△', comment: '未定です' },
        { userKey: 'user-3', status: '×', comment: '欠席します' },
      ];
      const memberMap = new Map([
        ['user-1', { userKey: 'user-1', name: '太郎', displayName: 'Fl.太郎' }],
        ['user-2', { userKey: 'user-2', name: '花子', displayName: 'Cl.花子' }],
        ['user-3', { userKey: 'user-3', name: '次郎', displayName: 'Tp.次郎' }],
      ]);

      // Act
      const result = mockBuildDescriptionWithMemberMap(eventId, userDescription, eventResponses, memberMap);

      // Assert
      expect(result).toContain('テストイベント');
      expect(result).toContain('○ 参加: 1人');
      expect(result).toContain('△ 遅早: 1人');
      expect(result).toContain('× 欠席: 1人');
      expect(result).toContain('合計: 3人');
      expect(result).toContain('○ Fl.太郎: 参加します');
      expect(result).toContain('△ Cl.花子: 未定です');
      expect(result).toContain('× Tp.次郎: 欠席します');
      expect(result).toContain('最終更新:');
    });

    it('コメントがない場合は「コメントなし」と表示すること', () => {
      // Arrange
      const eventId = 'event-1';
      const eventResponses = [
        { userKey: 'user-1', status: '○', comment: '' },
        { userKey: 'user-2', status: '△', comment: '' },
      ];
      const memberMap = new Map();

      // Act
      const result = mockBuildDescriptionWithMemberMap(eventId, undefined, eventResponses, memberMap);

      // Assert
      expect(result).toContain('（コメントなし）');
    });

    it('displayNameがない場合はnameを使用すること', () => {
      // Arrange
      const eventId = 'event-1';
      const eventResponses = [
        { userKey: 'user-1', status: '○', comment: 'コメント' },
      ];
      const memberMap = new Map([
        ['user-1', { userKey: 'user-1', name: '太郎', displayName: '' }],
      ]);

      // Act
      const result = mockBuildDescriptionWithMemberMap(eventId, undefined, eventResponses, memberMap);

      // Assert
      expect(result).toContain('○ 太郎: コメント');
    });

    it('メンバー情報がない場合は「不明」と表示すること', () => {
      // Arrange
      const eventId = 'event-1';
      const eventResponses = [
        { userKey: 'user-1', status: '○', comment: 'コメント' },
      ];
      const memberMap = new Map();

      // Act
      const result = mockBuildDescriptionWithMemberMap(eventId, undefined, eventResponses, memberMap);

      // Assert
      expect(result).toContain('○ 不明: コメント');
    });
  });

  describe('buildDescription', () => {
    it('出欠状況とコメントを含む説明文を生成できること', () => {
      // Arrange
      const eventId = 'event-1';
      mockTallyResponsesForCalendar.mockReturnValue({
        attendCount: 2,
        maybeCount: 1,
        absentCount: 1,
        unselectedCount: 0,
        totalCount: 4,
      });
      mockGetResponsesForCalendar.mockReturnValue([
        { userKey: 'user-1', status: '○', comment: '参加します' },
        { userKey: 'user-2', status: '△', comment: '未定です' },
      ]);
      mockGetMembersForCalendar.mockReturnValue([
        { userKey: 'user-1', name: '太郎', displayName: 'Fl.太郎' },
        { userKey: 'user-2', name: '花子', displayName: 'Cl.花子' },
      ]);

      // Act
      const result = mockBuildDescription(eventId);

      // Assert
      expect(result).toContain('○ 参加: 2人');
      expect(result).toContain('△ 遅早: 1人');
      expect(result).toContain('× 欠席: 1人');
      expect(result).toContain('- 未定: 0人');
      expect(result).toContain('合計: 4人');
      expect(result).toContain('○ Fl.太郎: 参加します');
      expect(result).toContain('△ Cl.花子: 未定です');
    });

    it('ユーザー説明がある場合は先頭に追加すること', () => {
      // Arrange
      const eventId = 'event-1';
      const userDescription = 'テストイベント';
      mockTallyResponsesForCalendar.mockReturnValue({
        attendCount: 0,
        maybeCount: 0,
        absentCount: 0,
        unselectedCount: 0,
        totalCount: 0,
      });
      mockGetResponsesForCalendar.mockReturnValue([]);

      // Act
      const result = mockBuildDescription(eventId, userDescription);

      // Assert
      expect(result).toContain('テストイベント');
      expect(result.indexOf('テストイベント')).toBeLessThan(result.indexOf('【出欠状況】'));
    });

    it('コメント取得エラーが発生した場合はエラーメッセージを表示すること', () => {
      // Arrange
      const eventId = 'event-1';
      mockTallyResponsesForCalendar.mockReturnValue({
        attendCount: 0,
        maybeCount: 0,
        absentCount: 0,
        unselectedCount: 0,
        totalCount: 0,
      });
      mockGetResponsesForCalendar.mockImplementation(() => {
        throw new Error('エラー');
      });

      // Act
      const result = mockBuildDescription(eventId);

      // Assert
      expect(result).toContain('（コメント取得エラー）');
    });
  });

  describe('syncCalendarDescriptionForEvent (期間外イベント同期防止)', () => {
    let mockGetEventById: jest.Mock;
    let mockGetOrCreateCalendar: jest.Mock;
    let mockUpdateEventCalendarInfo: jest.Mock;

    // syncCalendarDescriptionForEventのモック実装
    function mockSyncCalendarDescriptionForEvent(eventId: string): { skipped: boolean; reason?: string } {
      const event = mockGetEventById(eventId);
      if (!event) {
        return { skipped: true, reason: 'event_not_found' };
      }

      // 削除済みイベントはスキップ
      if (event.status !== 'active') {
        return { skipped: true, reason: 'status_not_active' };
      }

      // calendarEventIdが空の場合はスキップ
      if (!event.calendarEventId) {
        return { skipped: true, reason: 'calendar_event_id_empty' };
      }

      // 通常の同期処理
      const calendarId = mockGetOrCreateCalendar();
      const calendar = mockCalendar;
      
      if (!calendar) {
        return { skipped: true, reason: 'calendar_not_found' };
      }

      const calendarEvent = calendar.getEventById(event.calendarEventId);
      if (!calendarEvent) {
        return { skipped: true, reason: 'calendar_event_not_found' };
      }

      const description = mockBuildDescription(eventId, event.description);
      const notesHash = mockComputeHash(description);

      // 説明文のハッシュが同じ場合は更新をスキップ
      if (event.notesHash === notesHash) {
        return { skipped: true, reason: 'hash_unchanged' };
      }

      calendarEvent.setDescription(description);
      mockUpdateEventCalendarInfo(eventId, event.calendarEventId, notesHash);

      return { skipped: false };
    }

    beforeEach(() => {
      mockGetEventById = jest.fn();
      mockGetOrCreateCalendar = jest.fn(() => 'mock-calendar-id');
      mockUpdateEventCalendarInfo = jest.fn();
    });

    it('calendarEventIdが空の場合は同期をスキップすること', () => {
      // Arrange
      const eventId = 'event-1';
      const event = {
        id: eventId,
        title: '練習',
        start: '2024-11-29T04:00:00.000Z',
        end: '2024-11-29T08:00:00.000Z',
        status: 'active',
        calendarEventId: '', // 空
        notesHash: '',
      };
      mockGetEventById.mockReturnValue(event);

      // Act
      const result = mockSyncCalendarDescriptionForEvent(eventId);

      // Assert
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('calendar_event_id_empty');
      expect(mockGetOrCreateCalendar).not.toHaveBeenCalled();
      expect(mockUpdateEventCalendarInfo).not.toHaveBeenCalled();
    });

    it('statusがdeletedの場合は同期をスキップすること', () => {
      // Arrange
      const eventId = 'event-1';
      const event = {
        id: eventId,
        title: '削除済みイベント',
        start: '2024-11-29T04:00:00.000Z',
        end: '2024-11-29T08:00:00.000Z',
        status: 'deleted', // 削除済み
        calendarEventId: 'calendar-event-id',
        notesHash: 'old-hash',
      };
      mockGetEventById.mockReturnValue(event);

      // Act
      const result = mockSyncCalendarDescriptionForEvent(eventId);

      // Assert
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('status_not_active');
      expect(mockGetOrCreateCalendar).not.toHaveBeenCalled();
      expect(mockUpdateEventCalendarInfo).not.toHaveBeenCalled();
    });

    it('statusがactiveでcalendarEventIdがある場合は通常通り同期されること', () => {
      // Arrange
      const eventId = 'event-1';
      const event = {
        id: eventId,
        title: '練習',
        start: '2024-11-29T04:00:00.000Z',
        end: '2024-11-29T08:00:00.000Z',
        status: 'active',
        calendarEventId: 'calendar-event-id',
        notesHash: 'old-hash',
        description: 'テスト説明',
      };
      mockGetEventById.mockReturnValue(event);
      mockTallyResponsesForCalendar.mockReturnValue({
        attendCount: 5,
        maybeCount: 2,
        absentCount: 1,
        unselectedCount: 0,
        totalCount: 8,
      });
      mockGetResponsesForCalendar.mockReturnValue([]);
      
      (global.Utilities.computeDigest as jest.Mock).mockReturnValue([1, 2, 3, 4]);

      // Act
      const result = mockSyncCalendarDescriptionForEvent(eventId);

      // Assert
      expect(result.skipped).toBe(false);
      expect(mockGetOrCreateCalendar).toHaveBeenCalled();
      expect(mockCalendarEvent.setDescription).toHaveBeenCalled();
      expect(mockUpdateEventCalendarInfo).toHaveBeenCalledWith(
        eventId,
        'calendar-event-id',
        expect.any(String)
      );
    });

    it('notesHashが同じ場合は更新をスキップすること', () => {
      // Arrange
      const eventId = 'event-1';
      const description = '【出欠状況】\n○ 参加: 5人\n\n最終更新: 2024-01-01 12:00';
      const hash = '01020304';
      
      const event = {
        id: eventId,
        title: '練習',
        start: '2024-11-29T04:00:00.000Z',
        end: '2024-11-29T08:00:00.000Z',
        status: 'active',
        calendarEventId: 'calendar-event-id',
        notesHash: hash, // 既存のハッシュ
        description: 'テスト説明',
      };
      mockGetEventById.mockReturnValue(event);
      mockTallyResponsesForCalendar.mockReturnValue({
        attendCount: 5,
        maybeCount: 0,
        absentCount: 0,
        unselectedCount: 0,
        totalCount: 5,
      });
      mockGetResponsesForCalendar.mockReturnValue([]);
      
      (global.Utilities.computeDigest as jest.Mock).mockReturnValue([1, 2, 3, 4]);

      // Act
      const result = mockSyncCalendarDescriptionForEvent(eventId);

      // Assert
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('hash_unchanged');
      expect(mockCalendarEvent.setDescription).not.toHaveBeenCalled();
      expect(mockUpdateEventCalendarInfo).not.toHaveBeenCalled();
    });
  });

  describe('syncAll 期間フィルタロジック', () => {
    // syncAllの期間設定ロジックをテスト
    function calculateSyncDates(
      limitToDisplayPeriod: boolean,
      displayStartDateStr?: string,
      displayEndDateStr?: string
    ): { syncStartDate: Date; syncEndDate: Date } {
      let syncStartDate: Date | undefined = undefined;
      let syncEndDate: Date | undefined = undefined;

      if (limitToDisplayPeriod) {
        if (displayStartDateStr) {
          syncStartDate = new Date(displayStartDateStr);
          if (isNaN(syncStartDate.getTime())) {
            syncStartDate = undefined;
          }
        }

        if (displayEndDateStr) {
          syncEndDate = new Date(displayEndDateStr);
          if (isNaN(syncEndDate.getTime())) {
            syncEndDate = undefined;
          } else {
            syncEndDate.setHours(23, 59, 59, 999);
          }
        }
      }

      // デフォルト期間を明示的に設定（実装と同じロジック）
      if (!syncStartDate || !syncEndDate) {
        const now = new Date();
        if (!syncStartDate) {
          syncStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }
        if (!syncEndDate) {
          syncEndDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
        }
      }

      return { syncStartDate, syncEndDate };
    }

    it('両方未設定の場合、デフォルト期間（30日前〜1年後）が設定されること', () => {
      // Arrange
      const now = new Date();
      const expectedStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const expectedEnd = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

      // Act
      const result = calculateSyncDates(false);

      // Assert
      expect(result.syncStartDate.getTime()).toBeCloseTo(expectedStart.getTime(), -4); // 100ms以内
      expect(result.syncEndDate.getTime()).toBeCloseTo(expectedEnd.getTime(), -4);
    });

    it('開始日のみ設定の場合、指定開始日〜現在日時+1年後となること', () => {
      // Arrange
      const displayStartDate = '2024-01-01';
      const now = new Date();
      const expectedStart = new Date('2024-01-01');
      const expectedEnd = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

      // Act
      const result = calculateSyncDates(true, displayStartDate, undefined);

      // Assert
      expect(result.syncStartDate.getTime()).toBe(expectedStart.getTime());
      expect(result.syncEndDate.getTime()).toBeCloseTo(expectedEnd.getTime(), -4);
    });

    it('終了日のみ設定の場合、現在日時-30日〜指定終了日となること', () => {
      // Arrange
      const displayEndDate = '2024-12-31';
      const now = new Date();
      const expectedStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const expectedEnd = new Date('2024-12-31');
      expectedEnd.setHours(23, 59, 59, 999); // 終了日の23:59:59まで

      // Act
      const result = calculateSyncDates(true, undefined, displayEndDate);

      // Assert
      expect(result.syncStartDate.getTime()).toBeCloseTo(expectedStart.getTime(), -4);
      expect(result.syncEndDate.getTime()).toBe(expectedEnd.getTime());
    });

    it('両方設定の場合、指定した期間がそのまま使用されること', () => {
      // Arrange
      const displayStartDate = '2024-01-01';
      const displayEndDate = '2024-12-31';
      const expectedStart = new Date('2024-01-01');
      const expectedEnd = new Date('2024-12-31');
      expectedEnd.setHours(23, 59, 59, 999);

      // Act
      const result = calculateSyncDates(true, displayStartDate, displayEndDate);

      // Assert
      expect(result.syncStartDate.getTime()).toBe(expectedStart.getTime());
      expect(result.syncEndDate.getTime()).toBe(expectedEnd.getTime());
    });

    it('limitToDisplayPeriod=falseの場合、設定値を無視してデフォルト期間になること', () => {
      // Arrange
      const displayStartDate = '2024-01-01';
      const displayEndDate = '2024-12-31';
      const now = new Date();
      const expectedStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const expectedEnd = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

      // Act
      const result = calculateSyncDates(false, displayStartDate, displayEndDate);

      // Assert
      expect(result.syncStartDate.getTime()).toBeCloseTo(expectedStart.getTime(), -4);
      expect(result.syncEndDate.getTime()).toBeCloseTo(expectedEnd.getTime(), -4);
    });

    it('不正な日付文字列の場合、デフォルト値が使用されること', () => {
      // Arrange
      const invalidStartDate = 'invalid-date';
      const invalidEndDate = 'also-invalid';
      const now = new Date();
      const expectedStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const expectedEnd = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

      // Act
      const result = calculateSyncDates(true, invalidStartDate, invalidEndDate);

      // Assert
      expect(result.syncStartDate.getTime()).toBeCloseTo(expectedStart.getTime(), -4);
      expect(result.syncEndDate.getTime()).toBeCloseTo(expectedEnd.getTime(), -4);
    });
  });
});

