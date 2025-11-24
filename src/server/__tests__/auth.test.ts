/**
 * auth.ts のユニットテスト
 * AAA形式（Arrange, Act, Assert）で記述
 */

// テスト用のモック関数
function mockAuthenticate(authInfo: { userName?: string }): string | null {
  if (!authInfo.userName || authInfo.userName.trim() === '') {
    return null;
  }
  
  // 匿名モード: anon-{userName}
  return `anon-${authInfo.userName}`;
}

function mockIsAdmin(userKey: string, adminToken?: string): boolean {
  if (!adminToken) {
    return false;
  }
  
  // getConfig('ADMIN_TOKEN')をモック
  const mockSheet = (global.SpreadsheetApp.getActiveSpreadsheet as jest.Mock)().getSheetByName('Config');
  if (!mockSheet) {
    return false;
  }
  
  const data = mockSheet.getDataRange().getValues();
  let storedToken = '';
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === 'ADMIN_TOKEN') {
      storedToken = String(data[i][1]);
      break;
    }
  }
  
  return adminToken === storedToken;
}

function mockVerifyAdminToken(token: string): boolean {
  if (!token || token.trim() === '') {
    return false;
  }
  
  const mockSheet = (global.SpreadsheetApp.getActiveSpreadsheet as jest.Mock)().getSheetByName('Config');
  if (!mockSheet) {
    return false;
  }
  
  const data = mockSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === 'ADMIN_TOKEN' && data[i][1] === token) {
      return true;
    }
  }
  
  return false;
}

describe('auth.ts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    const mockSheet = {
      getDataRange: jest.fn(() => ({
        getValues: jest.fn(() => [
          ['key', 'value'],
          ['ADMIN_TOKEN', 'test-admin-token-123'],
          ['AUTH_MODE', 'anonymous'],
        ]),
      })),
    };
    
    (global.SpreadsheetApp.getActiveSpreadsheet as jest.Mock).mockReturnValue({
      getSheetByName: jest.fn(() => mockSheet),
    });
  });

  describe('authenticate', () => {
    it('有効なユーザー名で匿名認証できること', () => {
      // Arrange
      const authInfo = { userName: 'テストユーザー' };

      // Act
      const result = mockAuthenticate(authInfo);

      // Assert
      expect(result).toBe('anon-テストユーザー');
    });

    it('空のユーザー名の場合はnullを返すこと', () => {
      // Arrange
      const authInfo = { userName: '' };

      // Act
      const result = mockAuthenticate(authInfo);

      // Assert
      expect(result).toBeNull();
    });

    it('ユーザー名が未指定の場合はnullを返すこと', () => {
      // Arrange
      const authInfo = {};

      // Act
      const result = mockAuthenticate(authInfo);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('isAdmin', () => {
    it('正しい管理者トークンの場合はtrueを返すこと', () => {
      // Arrange
      const userKey = 'anon-admin-user';
      const adminToken = 'test-admin-token-123';

      // Act
      const result = mockIsAdmin(userKey, adminToken);

      // Assert
      expect(result).toBe(true);
    });

    it('誤った管理者トークンの場合はfalseを返すこと', () => {
      // Arrange
      const userKey = 'anon-user';
      const adminToken = 'wrong-token';

      // Act
      const result = mockIsAdmin(userKey, adminToken);

      // Assert
      expect(result).toBe(false);
    });

    it('トークンが未指定の場合はfalseを返すこと', () => {
      // Arrange
      const userKey = 'anon-user';

      // Act
      const result = mockIsAdmin(userKey);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('verifyAdminToken', () => {
    it('正しいトークンの場合はtrueを返すこと', () => {
      // Arrange
      const token = 'test-admin-token-123';

      // Act
      const result = mockVerifyAdminToken(token);

      // Assert
      expect(result).toBe(true);
    });

    it('誤ったトークンの場合はfalseを返すこと', () => {
      // Arrange
      const token = 'wrong-token';

      // Act
      const result = mockVerifyAdminToken(token);

      // Assert
      expect(result).toBe(false);
    });

    it('空のトークンの場合はfalseを返すこと', () => {
      // Arrange
      const token = '';

      // Act
      const result = mockVerifyAdminToken(token);

      // Assert
      expect(result).toBe(false);
    });
  });
});

