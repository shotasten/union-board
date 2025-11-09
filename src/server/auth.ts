/// <reference path="../types/models.ts" />
/// <reference path="utils.ts" /> // getConfig, setConfig を参照するため追加

/**
 * 認証処理モジュール
 * Phase 3: 認証・セキュリティ実装
 * 注意: Google認証機能は削除済み（GASのWebアプリ環境では動作しないため）
 * 現在は匿名モードのみサポート
 */

/**
 * 認証処理（匿名モードのみ）
 * @param authInfo 認証情報（userName）
 * @returns userKey（成功時）、null（失敗時）
 */
function authenticate(authInfo: { userName?: string }): string | null {
  try {
    // 匿名モードのみ
    if (!authInfo.userName || authInfo.userName.trim() === '') {
      Logger.log('❌ エラー: ユーザー名が提供されていません');
      return null;
    }

    // ニックネームからuserKeyを生成（anon-xxx形式）
    const userKey = `anon-${authInfo.userName.trim()}`;
    Logger.log(`✅ 匿名認証成功: ${userKey}`);
    return userKey;

  } catch (error) {
    Logger.log(`❌ エラー: 認証処理失敗 - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
    return null;
  }
}

/**
 * 管理者判定（匿名モードのみ）
 * @param userKey ユーザー識別子（userKey）
 * @param adminToken 管理者トークン
 * @returns 管理者の場合: true, それ以外: false
 */
function isAdmin(userKey: string, adminToken?: string): boolean {
  try {
    // 匿名モード: トークンで判定
    if (!adminToken) {
      return false;
    }

    return verifyAdminToken(adminToken);

  } catch (error) {
    Logger.log(`❌ エラー: 管理者判定失敗 - ${(error as Error).message}`);
    return false;
  }
}

/**
 * 管理者トークンを検証
 * @param token 管理者トークン
 * @returns 有効な場合: true, 無効な場合: false
 */
function verifyAdminToken(token: string): boolean {
  try {
    if (!token || token.trim() === '') {
      return false;
    }
    
    const adminToken = getConfig('ADMIN_TOKEN', '');
    return adminToken !== '' && adminToken === token;
  } catch (error) {
    Logger.log(`❌ エラー: 管理者トークン検証失敗 - ${(error as Error).message}`);
    return false; // エラー時は安全のためfalseを返す
  }
}

/**
 * テスト関数: 認証基盤テスト
 */
function testAuthBase(): void {
  Logger.log('=== testAuthBase 開始 ===');

  try {
    // テスト1: 匿名モード認証
    Logger.log(' --- テスト1: 匿名モード認証 ---');
    const userKey = authenticate({ userName: 'テストユーザー' });
    if (userKey && userKey.startsWith('anon-')) {
      Logger.log(`✅ 匿名認証成功: ${userKey}`);
      Logger.log('✅ テスト1: 成功');
    } else {
      Logger.log('❌ テスト1: 失敗 - userKeyが正しく生成されませんでした');
    }

    // テスト2: 管理者トークン検証
    Logger.log(' --- テスト2: 管理者トークン検証 ---');
    const adminToken = getConfig('ADMIN_TOKEN', '');
    if (adminToken) {
      const isValid = verifyAdminToken(adminToken);
      if (isValid) {
        Logger.log('✅ 管理者トークン検証成功');
        Logger.log('✅ テスト2: 成功');
      } else {
        Logger.log('❌ テスト2: 失敗 - 管理者トークン検証に失敗しました');
      }
    } else {
      Logger.log('⚠️ テスト2: スキップ - ADMIN_TOKENが設定されていません');
    }

    // テスト3: 管理者判定（匿名モード）
    Logger.log(' --- テスト3: 管理者判定（匿名モード） ---');
    const isAdminResult = isAdmin('test-user', adminToken);
    Logger.log(`管理者判定結果: ${isAdminResult}`);
    Logger.log('✅ テスト3: 成功');

    Logger.log('=== testAuthBase 終了 ===');
    Logger.log('✅ すべてのテストが完了しました');

  } catch (error) {
    Logger.log(`❌ エラー: テスト実行中にエラーが発生しました - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
  }
}
