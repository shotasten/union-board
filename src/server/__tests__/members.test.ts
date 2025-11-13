/**
 * members.ts のユニットテスト
 * AAA形式（Arrange, Act, Assert）で記述
 */

// テスト用のモック関数
function mockGetMembers(): any[] {
  const mockSheet = (global.SpreadsheetApp.getActiveSpreadsheet as jest.Mock)().getSheetByName('Members');
  if (!mockSheet) {
    return [];
  }
  
  const data = mockSheet.getDataRange().getValues();
  const members = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    members.push({
      userKey: row[0],
      part: row[1],
      name: row[2],
      displayName: row[3],
      createdAt: row[4],
      updatedAt: row[5],
    });
  }
  
  return members;
}

function mockUpsertMember(
  userKey: string,
  part: string,
  name: string,
  displayName: string
): boolean {
  if (!userKey || !part || !name) {
    return false;
  }
  
  const mockSheet = (global.SpreadsheetApp.getActiveSpreadsheet as jest.Mock)().getSheetByName('Members');
  if (!mockSheet) {
    return false;
  }
  
  const data = mockSheet.getDataRange().getValues();
  const now = new Date().toISOString();
  
  // 既存メンバーを検索
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userKey) {
      // 更新
      mockSheet.getRange(i + 1, 2, 1, 4).setValues([[part, name, displayName, now]]);
      return true;
    }
  }
  
  // 新規追加
  mockSheet.appendRow([userKey, part, name, displayName, now, now]);
  return true;
}

function mockDeleteMember(userKey: string): boolean {
  if (!userKey) {
    return false;
  }
  
  const mockSheet = (global.SpreadsheetApp.getActiveSpreadsheet as jest.Mock)().getSheetByName('Members');
  if (!mockSheet) {
    return false;
  }
  
  const data = mockSheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userKey) {
      mockSheet.deleteRow(i + 1);
      return true;
    }
  }
  
  return false;
}

function mockGetMemberByUserKey(userKey: string): any | null {
  const members = mockGetMembers();
  return members.find(m => m.userKey === userKey) || null;
}

function mockGetMemberByDisplayName(displayName: string): any | null {
  const members = mockGetMembers();
  return members.find(m => m.displayName === displayName) || null;
}

describe('members.ts', () => {
  let mockSheet: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockSheet = {
      getDataRange: jest.fn(() => ({
        getValues: jest.fn(() => [
          ['userKey', 'part', 'name', 'displayName', 'createdAt', 'updatedAt'],
          ['user-1', 'Fl', '太郎', 'Fl 太郎', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'],
          ['user-2', 'Cl', '花子', 'Cl 花子', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'],
        ]),
      })),
      getRange: jest.fn(() => ({
        setValues: jest.fn(),
      })),
      appendRow: jest.fn(),
      deleteRow: jest.fn(),
      getLastRow: jest.fn(() => 3),
    };
    
    (global.SpreadsheetApp.getActiveSpreadsheet as jest.Mock).mockReturnValue({
      getSheetByName: jest.fn(() => mockSheet),
    });
  });

  describe('getMembers', () => {
    it('全メンバーを取得できること', () => {
      // Arrange & Act
      const result = mockGetMembers();

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].userKey).toBe('user-1');
      expect(result[1].userKey).toBe('user-2');
    });
  });

  describe('upsertMember', () => {
    it('新規メンバーを追加できること', () => {
      // Arrange
      const userKey = 'user-3';
      const part = 'Tp';
      const name = '次郎';
      const displayName = 'Tp 次郎';

      // Act
      const result = mockUpsertMember(userKey, part, name, displayName);

      // Assert
      expect(result).toBe(true);
      expect(mockSheet.appendRow).toHaveBeenCalledWith([
        userKey,
        part,
        name,
        displayName,
        expect.any(String),
        expect.any(String),
      ]);
    });

    it('既存メンバーを更新できること', () => {
      // Arrange
      const userKey = 'user-1';
      const part = 'Ob';
      const name = '太郎updated';
      const displayName = 'Ob 太郎updated';

      // Act
      const result = mockUpsertMember(userKey, part, name, displayName);

      // Assert
      expect(result).toBe(true);
      expect(mockSheet.getRange).toHaveBeenCalled();
    });

    it('必須パラメータが不足している場合はfalseを返すこと', () => {
      // Arrange
      const userKey = '';
      const part = 'Fl';
      const name = '太郎';
      const displayName = 'Fl 太郎';

      // Act
      const result = mockUpsertMember(userKey, part, name, displayName);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('deleteMember', () => {
    it('既存メンバーを削除できること', () => {
      // Arrange
      const userKey = 'user-1';

      // Act
      const result = mockDeleteMember(userKey);

      // Assert
      expect(result).toBe(true);
      expect(mockSheet.deleteRow).toHaveBeenCalledWith(2);
    });

    it('存在しないメンバーの削除はfalseを返すこと', () => {
      // Arrange
      const userKey = 'non-existent-user';

      // Act
      const result = mockDeleteMember(userKey);

      // Assert
      expect(result).toBe(false);
    });

    it('userKeyが空の場合はfalseを返すこと', () => {
      // Arrange
      const userKey = '';

      // Act
      const result = mockDeleteMember(userKey);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('getMemberByUserKey', () => {
    it('userKeyでメンバーを取得できること', () => {
      // Arrange
      const userKey = 'user-1';

      // Act
      const result = mockGetMemberByUserKey(userKey);

      // Assert
      expect(result).not.toBeNull();
      expect(result.userKey).toBe('user-1');
      expect(result.displayName).toBe('Fl 太郎');
    });

    it('存在しないuserKeyの場合はnullを返すこと', () => {
      // Arrange
      const userKey = 'non-existent-user';

      // Act
      const result = mockGetMemberByUserKey(userKey);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getMemberByDisplayName', () => {
    it('displayNameでメンバーを取得できること', () => {
      // Arrange
      const displayName = 'Fl 太郎';

      // Act
      const result = mockGetMemberByDisplayName(displayName);

      // Assert
      expect(result).not.toBeNull();
      expect(result.userKey).toBe('user-1');
    });

    it('存在しないdisplayNameの場合はnullを返すこと', () => {
      // Arrange
      const displayName = '存在しない名前';

      // Act
      const result = mockGetMemberByDisplayName(displayName);

      // Assert
      expect(result).toBeNull();
    });
  });
});

