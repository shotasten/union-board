/**
 * メンバー管理関数
 * Membersシートの操作
 */

/**
 * Membersシートを取得
 * @returns Membersシート
 */
function getMembersSheet(): GoogleAppsScript.Spreadsheet.Sheet {
  const spreadsheet = getOrCreateSpreadsheet();
  let sheet = spreadsheet.getSheetByName('Members');
  
  if (!sheet) {
    // シートが存在しない場合は作成
    sheet = spreadsheet.insertSheet('Members');
    sheet.getRange('A1:F1').setValues([[
      'userKey', 'part', 'name', 'displayName', 'createdAt', 'updatedAt'
    ]]);
    sheet.getRange('A1:F1').setFontWeight('bold').setBackground('#667eea').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  
  return sheet;
}

/**
 * メンバー情報の型定義
 */
interface Member {
  userKey: string;
  part: string;
  name: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 全メンバーを取得
 * @returns メンバー一覧
 */
function getMembers(): Member[] {
  try {
    const sheet = getMembersSheet();
    const data = sheet.getDataRange().getValues();
    
    if (data.length <= 1) {
      return [];
    }
    
    const members: Member[] = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[0]) { // userKeyが存在する場合のみ
        members.push({
          userKey: String(row[0]),
          part: String(row[1] || ''),
          name: String(row[2] || ''),
          displayName: String(row[3] || ''),
          createdAt: String(row[4] || ''),
          updatedAt: String(row[5] || '')
        });
      }
    }
    
    return members;
  } catch (error) {
    Logger.log(`❌ エラー: メンバー取得失敗 - ${(error as Error).message}`);
    return [];
  }
}

/**
 * メンバーを作成または更新
 * @param userKey ユーザーキー
 * @param part パート
 * @param name 名前
 * @param displayName 表示名
 * @returns 成功したかどうか
 */
function upsertMember(
  userKey: string,
  part: string,
  name: string,
  displayName: string
): boolean {
  try {
    if (!userKey || !part || !name || !displayName) {
      Logger.log(`❌ エラー: メンバー情報が不完全です`);
      return false;
    }
    
    const sheet = getMembersSheet();
    const data = sheet.getDataRange().getValues();
    
    // 既存のメンバーを検索
    let existingRowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === userKey) {
        existingRowIndex = i + 1; // 1ベースの行番号
        break;
      }
    }
    
    const now = new Date().toISOString();
    
    if (existingRowIndex > 0) {
      // 更新
      sheet.getRange(existingRowIndex, 2, 1, 4).setValues([[part, name, displayName, now]]);
    } else {
      // 新規作成
      const nextRow = sheet.getLastRow() + 1;
      sheet.getRange(nextRow, 1, 1, 6).setValues([[userKey, part, name, displayName, now, now]]);
    }
    
    return true;
  } catch (error) {
    Logger.log(`❌ エラー: メンバー保存失敗 - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
    return false;
  }
}

/**
 * メンバーを削除
 * @param userKey ユーザーキー
 * @returns 成功したかどうか
 */
function deleteMember(userKey: string): boolean {
  try {
    if (!userKey) {
      Logger.log(`❌ エラー: userKeyが指定されていません`);
      return false;
    }
    
    const sheet = getMembersSheet();
    const data = sheet.getDataRange().getValues();
    
    // 該当する行を検索
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === userKey) {
        sheet.deleteRow(i + 1); // 1ベースの行番号
        return true;
      }
    }
    
    Logger.log(`⚠️ メンバーが見つかりません: ${userKey}`);
    return false;
  } catch (error) {
    Logger.log(`❌ エラー: メンバー削除失敗 - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
    return false;
  }
}

/**
 * userKeyからメンバー情報を取得
 * @param userKey ユーザーキー
 * @returns メンバー情報（存在しない場合はnull）
 */
function getMemberByUserKey(userKey: string): Member | null {
  try {
    if (!userKey) {
      return null;
    }
    
    const sheet = getMembersSheet();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === userKey) {
        return {
          userKey: String(data[i][0]),
          part: String(data[i][1] || ''),
          name: String(data[i][2] || ''),
          displayName: String(data[i][3] || ''),
          createdAt: String(data[i][4] || ''),
          updatedAt: String(data[i][5] || '')
        };
      }
    }
    
    return null;
  } catch (error) {
    Logger.log(`❌ エラー: メンバー取得失敗 - ${(error as Error).message}`);
    return null;
  }
}

/**
 * displayNameからメンバー情報を取得
 * @param displayName 表示名
 * @returns メンバー情報（存在しない場合はnull）
 */
function getMemberByDisplayName(displayName: string): Member | null {
  try {
    if (!displayName) {
      return null;
    }
    
    const sheet = getMembersSheet();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][3] === displayName) { // displayNameは4列目（インデックス3）
        return {
          userKey: String(data[i][0]),
          part: String(data[i][1] || ''),
          name: String(data[i][2] || ''),
          displayName: String(data[i][3] || ''),
          createdAt: String(data[i][4] || ''),
          updatedAt: String(data[i][5] || '')
        };
      }
    }
    
    return null;
  } catch (error) {
    Logger.log(`❌ エラー: メンバー取得失敗 - ${(error as Error).message}`);
    return null;
  }
}

