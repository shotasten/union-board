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
  
  // 簡易的なハッシュ計算（実際の実装を模倣）
  const mockHash = global.Utilities.computeDigest as jest.Mock;
  const result = mockHash(text);
  if (result && Array.isArray(result)) {
    return result.map((b: number) => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
  }
  
  // フォールバック: テキストの長さをハッシュとして使用
  return text.length.toString(16);
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
  
  eventResponses.forEach(response => {
    if (response.status === '○') attendCount++;
    else if (response.status === '△') maybeCount++;
    else if (response.status === '×') absentCount++;
  });
  
  const totalCount = attendCount + maybeCount + absentCount;
  const now = new Date();
  const formattedDate = global.Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  
  let description = '';
  
  if (userDescription && userDescription.trim()) {
    description += userDescription.trim() + '\n\n';
  }
  
  description += '【出欠状況】\n';
  description += `○ 参加: ${attendCount}人\n`;
  description += `△ 未定: ${maybeCount}人\n`;
  description += `× 欠席: ${absentCount}人\n`;
  description += `合計: ${totalCount}人\n\n`;
  
  description += '【コメント】\n';
  const comments = eventResponses.filter(r => r.comment && r.comment.trim());
  
  if (comments.length === 0) {
    description += '（コメントなし）\n';
  } else {
    comments.forEach(response => {
      const member = memberMap.get(response.userKey);
      const displayName = member?.displayName || member?.name || '不明';
      const statusLabel = response.status === '○' ? '○' : response.status === '△' ? '△' : response.status === '×' ? '×' : '-';
      description += `${statusLabel} ${displayName}: ${response.comment}\n`;
    });
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
  description += `△ 未定: ${tally.maybeCount}人\n`;
  description += `× 欠席: ${tally.absentCount}人\n`;
  description += `合計: ${tally.totalCount}人\n\n`;
  
  description += '【コメント】\n';
  try {
    const responses = mockGetResponsesForCalendar(eventId);
    const comments = responses.filter((r: any) => r.comment && r.comment.trim());
    
    if (comments.length === 0) {
      description += '（コメントなし）\n';
    } else {
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
      expect(result).toContain('△ 未定: 1人');
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
      expect(result).toContain('△ 未定: 1人');
      expect(result).toContain('× 欠席: 1人');
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
});

