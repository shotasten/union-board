/// <reference path="../types/models.ts" />

/**
 * 出欠管理モジュール
 */

/**
 * Responsesシートを取得
 * @returns Responsesシート
 */
function getResponsesSheet(): GoogleAppsScript.Spreadsheet.Sheet {
  const spreadsheet = getOrCreateSpreadsheet();
  const sheet = spreadsheet.getSheetByName('Responses');
  
  if (!sheet) {
    throw new Error('Responsesシートが見つかりません。initializeSpreadsheet()を実行してください。');
  }
  
  return sheet;
}


/**
 * 特定イベントの出欠回答一覧を取得
 * @param eventId イベントID
 * @returns 出欠回答配列
 */
function getResponses(eventId: string): Response[] {
  try {
    if (!eventId) {
      Logger.log('❌ エラー: イベントIDが指定されていません');
      return [];
    }
    
    const sheet = getResponsesSheet();
    const data = sheet.getDataRange().getValues();
    
    // ヘッダー行をスキップ
    const responses: Response[] = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      // 指定されたイベントIDの回答のみ取得
      if (row[0] === eventId) {
        // カラム: eventId, userKey, status, comment, createdAt, updatedAt
        const response: Response = {
          eventId: row[0],
          userKey: row[1],
          status: row[2],
          comment: row[3] || undefined,
          createdAt: row[4],
          updatedAt: row[5]
        };
        
        responses.push(response);
      }
    }
    
    return responses;
    
  } catch (error) {
    Logger.log(`❌ エラー: 出欠回答取得失敗 - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
    return [];
  }
}

/**
 * 全出欠回答を一括取得
 * @returns 全出欠回答配列
 */
function getAllResponses(): Response[] {
  try {
    const sheet = getResponsesSheet();
    const data = sheet.getDataRange().getValues();
    
    const responses: Response[] = [];
    
    // ヘッダー行をスキップ
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      // 空行をスキップ
      if (!row[0] || !row[1]) {
        continue;
      }
      
      const response: Response = {
        eventId: row[0],
        userKey: row[1],
        status: row[2],
        comment: row[3] || undefined,
        createdAt: row[4],
        updatedAt: row[5]
      };
      
      responses.push(response);
    }
    
    return responses;
    
  } catch (error) {
    Logger.log(`❌ エラー: 全出欠回答取得失敗 - ${(error as Error).message}`);
    Logger.log(`❌ スタックトレース: ${(error as Error).stack}`);
    return [];
  }
}

/**
 * 特定イベント・特定ユーザーの出欠回答を取得
 * @param eventId イベントID
 * @param userKey ユーザー識別子
 * @returns 出欠回答（見つからない場合はnull）
 */
function getResponseByUser(eventId: string, userKey: string): Response | null {
  try {
    if (!eventId || !userKey) {
      Logger.log('❌ エラー: イベントIDまたはユーザー識別子が指定されていません');
      return null;
    }
    
    const sheet = getResponsesSheet();
    const data = sheet.getDataRange().getValues();
    
    // ヘッダー行をスキップして検索
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      if (row[0] === eventId && row[1] === userKey) {
        // カラム: eventId, userKey, status, comment, createdAt, updatedAt
        const response: Response = {
          eventId: row[0],
          userKey: row[1],
          status: row[2],
          comment: row[3] || undefined,
          createdAt: row[4],
          updatedAt: row[5]
        };
        
        return response;
      }
    }
    
    Logger.log(`⚠️ 出欠回答が見つかりません: ${eventId} - ${userKey}`);
    return null;
    
  } catch (error) {
    Logger.log(`❌ エラー: 出欠回答取得失敗 - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
    return null;
  }
}

/**
 * 特定イベントの出欠集計
 * @param eventId イベントID
 * @returns 集計結果
 */
function tallyResponses(eventId: string): EventTally {
  try {
    if (!eventId) {
      Logger.log('❌ エラー: イベントIDが指定されていません');
      return {
        eventId: eventId || '',
        attendCount: 0,
        maybeCount: 0,
        absentCount: 0,
        unselectedCount: 0,
        totalCount: 0,
        tallyAt: new Date().toISOString()
      };
    }
    
    const responses = getResponses(eventId);
    
    let attendCount = 0;
  let maybeCount = 0;
  let absentCount = 0;
  let unselectedCount = 0;
    
    responses.forEach(response => {
      if (response.status === '○') {
        attendCount++;
      } else if (response.status === '△') {
        maybeCount++;
    } else if (response.status === '×') {
      absentCount++;
    } else if (response.status === '-') {
      unselectedCount++;
      }
    });
    
    const tally: EventTally = {
      eventId: eventId,
      attendCount: attendCount,
      maybeCount: maybeCount,
      absentCount: absentCount,
      unselectedCount: unselectedCount,
      totalCount: responses.length,
      tallyAt: new Date().toISOString()
    };
    
    return tally;
    
  } catch (error) {
    Logger.log(`❌ エラー: 出欠集計失敗 - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
    return {
      eventId: eventId || '',
      attendCount: 0,
      maybeCount: 0,
      absentCount: 0,
      unselectedCount: 0,
      totalCount: 0,
      tallyAt: new Date().toISOString()
    };
  }
}

/**
 * 特定ユーザーの全てのレスポンスを削除
 * 性能改善：バッチ削除（シートをクリアして一括書き込み）
 * @param userKey ユーザーキー
 * @returns 削除されたレスポンス数
 */
function deleteResponsesByUserKey(userKey: string): number {
  try {
    if (!userKey) {
      Logger.log('❌ エラー: userKeyは必須です');
      return 0;
    }
    
    const sheet = getResponsesSheet();
    const data = sheet.getDataRange().getValues();
    
    if (data.length <= 1) {
      Logger.log(`⚠️ 削除対象のレスポンスが見つかりません: ${userKey}`);
      return 0;
    }
    
    // ヘッダー行を保持
    const header = data[0];
    
    // 削除対象以外のデータを収集
    const remainingData: any[][] = [header];
    let deletedCount = 0;
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[1] === userKey) {
        // 削除対象（カウントのみ）
        deletedCount++;
      } else {
        // 残すデータ
        remainingData.push(row);
      }
    }
    
    if (deletedCount === 0) {
      Logger.log(`⚠️ 削除対象のレスポンスが見つかりません: ${userKey}`);
      return 0;
    }
    
    // シート全体をクリア
    sheet.clear();
    
    // 新しいデータを書き込み（1回のバッチ操作）
    if (remainingData.length > 0) {
      sheet.getRange(1, 1, remainingData.length, remainingData[0].length)
        .setValues(remainingData);
      
      // ヘッダー行のスタイルを復元
      sheet.getRange(1, 1, 1, remainingData[0].length)
        .setFontWeight('bold')
        .setBackground('#667eea')
        .setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }
    
    return deletedCount;
  } catch (error) {
    Logger.log(`❌ エラー: レスポンス削除失敗 - ${(error as Error).message}`);
    Logger.log(`❌ スタックトレース: ${(error as Error).stack}`);
    return 0;
  }
}

/**
 * テスト関数: 出欠登録機能
 */
