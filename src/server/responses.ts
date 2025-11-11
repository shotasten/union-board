/// <reference path="../types/models.ts" />

/**
 * 出欠管理モジュール
 * Phase 1.4: 出欠登録実装
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
 * 出欠回答を登録または更新
 * 同一(eventId, userKey)の場合は上書き
 * @param eventId イベントID
 * @param userKey ユーザー識別子（hash-xxx または anon-xxx）
 * @param status 出欠ステータス（○: 出席, △: 未定, ×: 欠席）
 * @param comment コメント（オプション）
 * @returns 成功: true, 失敗: false
 */
function submitResponse(
  eventId: string,
  userKey: string,
  status: '○' | '△' | '×' | '-',
  comment?: string
): boolean {
  try {
    // バリデーション
    if (!eventId || !userKey) {
      Logger.log('❌ エラー: eventId, userKeyは必須です');
      return false;
    }
    
    if (status !== '○' && status !== '△' && status !== '×' && status !== '-') {
      Logger.log('❌ エラー: statusは○、△、×、-のいずれかである必要があります');
      return false;
    }
    
    // イベントの存在確認
    const event = getEventById(eventId);
    if (!event) {
      Logger.log(`❌ エラー: イベントが見つかりません: ${eventId}`);
      return false;
    }
    
    // 既存の回答を検索
    const sheet = getResponsesSheet();
    const data = sheet.getDataRange().getValues();
    const now = new Date().toISOString();
    
    // ヘッダー行をスキップして検索
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      // 同一(eventId, userKey)の回答が見つかった場合、更新
      if (row[0] === eventId && row[1] === userKey) {
        const rowIndex = i + 1; // Sheetの行番号（1始まり）
        
        // カラム: eventId, userKey, status, comment, createdAt, updatedAt
        // バッチ更新: 連続した列（3-4）をまとめて更新（パフォーマンス最適化）
        sheet.getRange(rowIndex, 3, 1, 2).setValues([[status, comment || '']]);
        sheet.getRange(rowIndex, 6).setValue(now); // updatedAt
        
        Logger.log(`✅ 出欠回答更新成功: ${eventId} - ${userKey} (${status})`);
        
        // カレンダーの説明欄を同期
        try {
          syncCalendarDescriptionForEvent(eventId);
        } catch (error) {
          Logger.log(`⚠️ カレンダー説明欄同期失敗（出欠回答は更新済み）: ${(error as Error).message}`);
        }
        
        return true;
      }
    }
    
    // 新規登録
    // カラム: eventId, userKey, status, comment, createdAt, updatedAt
    sheet.appendRow([
      eventId,
      userKey,
      status,
      comment || '',
      now, // createdAt
      now  // updatedAt
    ]);
    
    Logger.log(`✅ 出欠回答登録成功: ${eventId} - ${userKey} (${status})`);
    
    // カレンダーの説明欄を同期
    try {
      syncCalendarDescriptionForEvent(eventId);
    } catch (error) {
      Logger.log(`⚠️ カレンダー説明欄同期失敗（出欠回答は登録済み）: ${(error as Error).message}`);
    }
    
    return true;
    
  } catch (error) {
    Logger.log(`❌ エラー: 出欠回答登録失敗 - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
    return false;
  }
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
    
    Logger.log(`✅ 出欠回答取得成功: ${eventId} - ${responses.length}件`);
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
    
    Logger.log(`✅ 全出欠回答取得成功: ${responses.length}件`);
    return responses;
    
  } catch (error) {
    Logger.log(`❌ エラー: 全出欠回答取得失敗 - ${(error as Error).message}`);
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
        
        Logger.log(`✅ 出欠回答取得成功: ${eventId} - ${userKey}`);
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
        totalCount: 0,
        tallyAt: new Date().toISOString()
      };
    }
    
    const responses = getResponses(eventId);
    
    let attendCount = 0;
    let maybeCount = 0;
    let absentCount = 0;
    
    responses.forEach(response => {
      if (response.status === '○') {
        attendCount++;
      } else if (response.status === '△') {
        maybeCount++;
      } else if (response.status === '×') {
        absentCount++;
      }
    });
    
    const tally: EventTally = {
      eventId: eventId,
      attendCount: attendCount,
      maybeCount: maybeCount,
      absentCount: absentCount,
      totalCount: responses.length,
      tallyAt: new Date().toISOString()
    };
    
    Logger.log(`✅ 出欠集計完了: ${eventId} - 出席:${attendCount} 未定:${maybeCount} 欠席:${absentCount} 合計:${responses.length}`);
    return tally;
    
  } catch (error) {
    Logger.log(`❌ エラー: 出欠集計失敗 - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
    return {
      eventId: eventId || '',
      attendCount: 0,
      maybeCount: 0,
      absentCount: 0,
      totalCount: 0,
      tallyAt: new Date().toISOString()
    };
  }
}

/**
 * 特定ユーザーの全てのレスポンスを削除
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
    const rowsToDelete: number[] = [];
    
    // ヘッダー行をスキップして検索（下から上に削除するため、逆順で収集）
    for (let i = data.length - 1; i >= 1; i--) {
      const row = data[i];
      
      // 該当するuserKeyのレスポンスを削除対象に追加
      if (row[1] === userKey) {
        rowsToDelete.push(i + 1); // Sheetの行番号（1始まり）
      }
    }
    
    // 行を削除（上から削除すると行番号がずれるため、下から削除）
    let deletedCount = 0;
    for (const rowIndex of rowsToDelete) {
      try {
        sheet.deleteRow(rowIndex);
        deletedCount++;
      } catch (error) {
        Logger.log(`⚠️ 行削除エラー: ${rowIndex} - ${(error as Error).message}`);
      }
    }
    
    if (deletedCount > 0) {
      Logger.log(`✅ レスポンス削除成功: ${userKey} (${deletedCount}件)`);
    }
    
    return deletedCount;
  } catch (error) {
    Logger.log(`❌ エラー: レスポンス削除失敗 - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
    return 0;
  }
}

/**
 * テスト関数: 出欠登録機能
 */
function testResponses() {
  Logger.log('=== testResponses 開始 ===');
  
  try {
    // テスト用のイベントを作成
    Logger.log('\n--- テスト準備: イベント作成 ---');
    const testEventId = createEvent(
      '出欠テストイベント',
      '2025-12-15T14:00:00+09:00',
      '2025-12-15T17:00:00+09:00',
      'テスト会場'
    );
    
    if (!testEventId) {
      Logger.log('❌ テスト準備失敗: イベント作成に失敗しました');
      return;
    }
    
    Logger.log(`✅ テストイベント作成成功: ${testEventId}`);
    
    // 1. 出欠回答登録（正常系）
    Logger.log('\n--- テスト1: 出欠回答登録（正常系） ---');
    const result1 = submitResponse(
      testEventId,
      'anon-田中太郎',
      '○',
      'よろしくお願いします'
    );
    
    if (result1) {
      Logger.log('✅ テスト1: 成功 - 出欠回答登録に成功しました');
    } else {
      Logger.log('❌ テスト1: 失敗 - 出欠回答登録に失敗しました');
      return;
    }
    
    // 2. 出欠回答登録（異常系: 存在しないイベントID）
    Logger.log('\n--- テスト2: 出欠回答登録（異常系: 存在しないイベントID） ---');
    const result2 = submitResponse(
      '存在しないイベントID',
      'anon-テストユーザー',
      '○'
    );
    
    if (!result2) {
      Logger.log('✅ テスト2: 成功 - 存在しないイベントIDは正しく拒否されました');
    } else {
      Logger.log('❌ テスト2: 失敗 - 存在しないイベントIDが受理されました');
    }
    
    // 3. 出欠回答更新（同一ユーザーが再度回答）
    Logger.log('\n--- テスト3: 出欠回答更新（同一ユーザーが再度回答） ---');
    const result3 = submitResponse(
      testEventId,
      'anon-田中太郎',
      '×',
      '都合により欠席します'
    );
    
    if (result3) {
      const updatedResponse = getResponseByUser(testEventId, 'anon-田中太郎');
      if (updatedResponse && updatedResponse.status === '×') {
        Logger.log(`更新後のステータス: ${updatedResponse.status}`);
        Logger.log(`更新後のコメント: ${updatedResponse.comment}`);
        Logger.log('✅ テスト3: 成功 - 出欠回答が正しく更新されました');
      } else {
        Logger.log('❌ テスト3: 失敗 - 出欠回答が更新されていません');
      }
    } else {
      Logger.log('❌ テスト3: 失敗 - 出欠回答更新に失敗しました');
    }
    
    // 4. 複数の出欠回答を登録
    Logger.log('\n--- テスト4: 複数の出欠回答を登録 ---');
    submitResponse(testEventId, 'anon-佐藤花子', '○', '参加します！');
    submitResponse(testEventId, 'anon-鈴木一郎', '△', '検討中です');
    submitResponse(testEventId, 'anon-高橋次郎', '×', '欠席します');
    
    const allResponses = getResponses(testEventId);
    Logger.log(`登録された回答数: ${allResponses.length}件`);
    
    if (allResponses.length >= 4) { // 田中太郎(×) + 佐藤花子(○) + 鈴木一郎(△) + 高橋次郎(×)
      Logger.log('✅ テスト4: 成功');
    } else {
      Logger.log(`❌ テスト4: 失敗 - 期待される回答数: 4件、実際: ${allResponses.length}件`);
    }
    
    // 5. 出欠集計
    Logger.log('\n--- テスト5: 出欠集計 ---');
    const tally = tallyResponses(testEventId);
    
    Logger.log(`出席(○): ${tally.attendCount}人`);
    Logger.log(`未定(△): ${tally.maybeCount}人`);
    Logger.log(`欠席(×): ${tally.absentCount}人`);
    Logger.log(`合計: ${tally.totalCount}人`);
    
    // 期待値: 出席2人（田中太郎は×に更新されたので、佐藤花子のみ）、未定1人、欠席2人（田中太郎、高橋次郎）
    // ただし、田中太郎は×に更新されているので、実際は出席1人、未定1人、欠席2人
    if (tally.attendCount >= 1 && tally.maybeCount >= 1 && tally.absentCount >= 2) {
      Logger.log('✅ テスト5: 成功 - 集計結果が正しいです');
    } else {
      Logger.log(`❌ テスト5: 失敗 - 集計結果が期待と異なります`);
    }
    
    // 6. 特定ユーザーの回答取得
    Logger.log('\n--- テスト6: 特定ユーザーの回答取得 ---');
    const userResponse = getResponseByUser(testEventId, 'anon-佐藤花子');
    
    if (userResponse && userResponse.status === '○') {
      Logger.log(`取得した回答: userKey=${userResponse.userKey}, status=${userResponse.status}`);
      Logger.log('✅ テスト6: 成功');
    } else {
      Logger.log('❌ テスト6: 失敗 - ユーザーの回答が取得できませんでした');
    }
    
    Logger.log('\n=== testResponses 終了 ===');
    Logger.log('✅ すべてのテストが完了しました');
    
  } catch (error) {
    Logger.log(`❌ エラー: テスト実行中にエラーが発生しました - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
  }
}
