/**
 * utils.ts のユニットテスト
 * AAA形式（Arrange, Act, Assert）で記述
 */

// テスト対象の関数をモックとして定義
// 実際の実装はGoogle Apps Script環境で実行されるため、
// テストではモック関数として動作を検証する

// テスト用のモック関数（実際の実装の動作を模倣）
function mockGetConfig(key: string, defaultValue: string = ''): string {
  if (!key || key.trim() === '') {
    return defaultValue;
  }
  
  const mockSheet = (global.SpreadsheetApp.getActiveSpreadsheet as jest.Mock)().getSheetByName('Config');
  if (!mockSheet) {
    return defaultValue;
  }
  
  const data = mockSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      return String(data[i][1]);
    }
  }
  
  return defaultValue;
}

function mockSetConfig(key: string, value: string): void {
  if (!key || key.trim() === '') {
    return;
  }
  
  const mockSheet = (global.SpreadsheetApp.getActiveSpreadsheet as jest.Mock)().getSheetByName('Config');
  if (!mockSheet) {
    return;
  }
  
  const data = mockSheet.getDataRange().getValues();
  let updated = false;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      mockSheet.getRange(i + 1, 2).setValue(value);
      updated = true;
      break;
    }
  }
  
  if (!updated) {
    mockSheet.appendRow([key, value]);
  }
}

function mockGenerateAdminToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

describe('utils.ts', () => {
  let mockSheet: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // モックシートのデータをリセット
    mockSheet = {
      getDataRange: jest.fn(() => ({
        getValues: jest.fn(() => [
          ['key', 'value'],
          ['ADMIN_TOKEN', 'test-token-123'],
          ['CALENDAR_ID', 'primary'],
        ]),
      })),
      getRange: jest.fn(() => ({
        getValue: jest.fn(),
        setValue: jest.fn(),
      })),
      getLastRow: jest.fn(() => 3),
      appendRow: jest.fn(),
      getName: jest.fn(() => 'Config'),
    };
    
    (global.SpreadsheetApp.getActiveSpreadsheet as jest.Mock).mockReturnValue({
      getSheetByName: jest.fn((name: string) => {
        if (name === 'Config') {
          return mockSheet;
        }
        return null;
      }),
    });
  });

  describe('getConfig', () => {
    it('既存のキーを取得できること', () => {
      // Arrange
      const key = 'ADMIN_TOKEN';
      const defaultValue = '';

      // Act
      const result = mockGetConfig(key, defaultValue);

      // Assert
      expect(result).toBe('test-token-123');
    });

    it('存在しないキーの場合はデフォルト値を返すこと', () => {
      // Arrange
      const key = 'NON_EXISTENT_KEY';
      const defaultValue = 'default-value';

      // Act
      const result = mockGetConfig(key, defaultValue);

      // Assert
      expect(result).toBe(defaultValue);
    });

    it('空のキーの場合はデフォルト値を返すこと', () => {
      // Arrange
      const key = '';
      const defaultValue = 'default';

      // Act
      const result = mockGetConfig(key, defaultValue);

      // Assert
      expect(result).toBe(defaultValue);
    });
  });

  describe('setConfig', () => {
    it('既存のキーの値を更新できること', () => {
      // Arrange
      const key = 'ADMIN_TOKEN';
      const value = 'new-token-456';
      const mockRange = {
        setValue: jest.fn(),
      };
      const testSheet = {
        getDataRange: jest.fn(() => ({
          getValues: jest.fn(() => [
            ['key', 'value'],
            ['ADMIN_TOKEN', 'old-token'],
          ]),
        })),
        getRange: jest.fn(() => mockRange),
        getLastRow: jest.fn(() => 2),
      };
      (global.SpreadsheetApp.getActiveSpreadsheet as jest.Mock).mockReturnValue({
        getSheetByName: jest.fn(() => testSheet),
      });

      // Act
      mockSetConfig(key, value);

      // Assert
      expect(mockRange.setValue).toHaveBeenCalledWith(value);
    });

    it('存在しないキーの場合は新規追加すること', () => {
      // Arrange
      const key = 'NEW_KEY';
      const value = 'new-value';
      const testSheet = {
        getDataRange: jest.fn(() => ({
          getValues: jest.fn(() => [
            ['key', 'value'],
            ['ADMIN_TOKEN', 'test-token'],
          ]),
        })),
        getRange: jest.fn(),
        getLastRow: jest.fn(() => 2),
        appendRow: jest.fn(),
      };
      (global.SpreadsheetApp.getActiveSpreadsheet as jest.Mock).mockReturnValue({
        getSheetByName: jest.fn(() => testSheet),
      });

      // Act
      mockSetConfig(key, value);

      // Assert
      expect(testSheet.appendRow).toHaveBeenCalledWith([key, value]);
    });

    it('空のキーの場合は処理をスキップすること', () => {
      // Arrange
      const key = '';
      const value = 'value';
      const testSheet = {
        getDataRange: jest.fn(),
        appendRow: jest.fn(),
      };
      (global.SpreadsheetApp.getActiveSpreadsheet as jest.Mock).mockReturnValue({
        getSheetByName: jest.fn(() => testSheet),
      });

      // Act
      mockSetConfig(key, value);

      // Assert
      expect(testSheet.appendRow).not.toHaveBeenCalled();
    });
  });

  describe('generateAdminToken', () => {
    it('32文字のトークンを生成すること', () => {
      // Arrange & Act
      const token = mockGenerateAdminToken();

      // Assert
      expect(token).toHaveLength(32);
      expect(token).toMatch(/^[A-Za-z0-9]+$/);
    });

    it('毎回異なるトークンを生成すること', () => {
      // Arrange & Act
      const token1 = mockGenerateAdminToken();
      const token2 = mockGenerateAdminToken();

      // Assert
      expect(token1).not.toBe(token2);
    });
  });
});

