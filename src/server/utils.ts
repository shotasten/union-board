/// <reference path="./calendar.ts" />

// calendar.tsからエクスポートされた関数の型宣言
declare function setupBandCalendar(): string;
declare function getOrCreateCalendar(): string;

/**
 * ユーティリティ関数
 * Spreadsheet管理、設定管理など
 */

/**
 * Spreadsheetを取得または作成
 * @returns Spreadsheetオブジェクト
 */
function getOrCreateSpreadsheet(): GoogleAppsScript.Spreadsheet.Spreadsheet {
  try {
    const scriptProperties = PropertiesService.getScriptProperties();
    let spreadsheetId = scriptProperties.getProperty('SPREADSHEET_ID');
    
    if (spreadsheetId) {
      try {
        return SpreadsheetApp.openById(spreadsheetId);
      } catch (error) {
        Logger.log(`⚠️ エラー: 既存のSpreadsheetを開けませんでした (ID: ${spreadsheetId})`);
        Logger.log(`新しいSpreadsheetを作成します`);
        Logger.log(`エラー詳細: ${(error as Error).message}`);
      }
    }
    
    // 新規作成
    const spreadsheet = SpreadsheetApp.create('UnionBoard - データベース');
    spreadsheetId = spreadsheet.getId();
    scriptProperties.setProperty('SPREADSHEET_ID', spreadsheetId);
    
    return spreadsheet;
  } catch (error) {
    Logger.log(`❌ エラー: Spreadsheet取得・作成失敗 - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
    throw error; // 呼び出し元で処理できるように再スロー
  }
}

/**
 * Spreadsheetを初期化
 * 4つのシート（Events, Responses, Config, Members）を作成し、
 * ヘッダー行と初期データを設定
 * 注意: AuditLogシートとSessionsシートは削除済み（ログイン機能が不要なため）
 */
function initializeSpreadsheet(): void {
  const spreadsheet = getOrCreateSpreadsheet();
  
  // 既存のシートを削除（デフォルトのSheet1など）
  const existingSheets = spreadsheet.getSheets();
  // シートの順序: Events, Members, Responses, Config
  const sheetNames = ['Events', 'Members', 'Responses', 'Config'];
  
  // 必要なシートが既に存在するか確認
  const existingSheetNames = existingSheets.map(s => s.getName());
  const hasAllSheets = sheetNames.every(name => existingSheetNames.includes(name));
  
  if (hasAllSheets) {
    Logger.log('⚠️ すべてのシートが既に存在します。初期化をスキップします。');
    Logger.log('再初期化する場合は、手動でシートを削除してください。');
    return;
  }
  
  // 1. Eventsシート作成
  let sheet = spreadsheet.getSheetByName('Events') || spreadsheet.insertSheet('Events');
  const eventsHasData = sheet.getLastRow() > 1;
  if (!eventsHasData) {
    sheet.clear();
    sheet.getRange('A1:M1').setValues([[
      'id', 'title', 'start', 'end', 'isAllDay', 'location', 'description', 
      'calendarEventId', 'notesHash', 'status', 'createdAt', 'updatedAt', 'lastSynced'
    ]]);
    sheet.getRange('A1:M1').setFontWeight('bold').setBackground('#667eea').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  } else {
    // ヘッダーのみ確認・更新（isAllDayカラムを追加・移動）
    const lastColumn = sheet.getLastColumn();
    const headerRange = sheet.getRange(1, 1, 1, Math.max(13, lastColumn));
    const headerValues = headerRange.getValues()[0];
    const expectedHeaders = ['id', 'title', 'start', 'end', 'isAllDay', 'location', 'description', 'calendarEventId', 'notesHash', 'status', 'createdAt', 'updatedAt', 'lastSynced'];
    
    // isAllDayカラムの現在位置を確認
    const currentIsAllDayIndex = headerValues.indexOf('isAllDay');
    const expectedIsAllDayIndex = 4; // start(2), end(3)の次（0ベースなので4）
    
    // 既存のヘッダーにisAllDayがない場合は追加
    if (currentIsAllDayIndex === -1) {
      // isAllDayカラムが存在しない場合、最後に追加してから移動
      if (headerValues.length < 13) {
        // ヘッダー行を13列に拡張
        const newHeaderRange = sheet.getRange('A1:M1');
        newHeaderRange.setValues([expectedHeaders]);
        newHeaderRange.setFontWeight('bold').setBackground('#667eea').setFontColor('#ffffff');
      } else {
        // 既に13列以上ある場合、最後の列をisAllDayに変更してから移動
        const lastCol = sheet.getLastColumn();
        sheet.getRange(1, lastCol).setValue('isAllDay');
        // 列を移動
        const lastRow = sheet.getLastRow();
        if (lastRow > 1) {
          const sourceRange = sheet.getRange(1, lastCol, lastRow, 1);
          const values = sourceRange.getValues();
          // endの後に列を挿入
          sheet.insertColumnAfter(4);
          // データを新しい位置に書き込む
          sheet.getRange(1, 5, lastRow, 1).setValues(values);
          // 元の位置の列を削除
          sheet.deleteColumn(lastCol + 1); // 挿入したので+1
        }
        // ヘッダーを更新
        headerRange.setValues([expectedHeaders]);
        headerRange.setFontWeight('bold').setBackground('#667eea').setFontColor('#ffffff');
      }
    } else if (currentIsAllDayIndex !== expectedIsAllDayIndex) {
      // isAllDayカラムが存在するが、正しい位置にない場合、移動
      
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        // データがある場合、列全体を移動
        const sourceCol = currentIsAllDayIndex + 1; // 1ベース
        const sourceRange = sheet.getRange(1, sourceCol, lastRow, 1);
        const values = sourceRange.getValues();
        
        // 正しい位置に列を挿入
        sheet.insertColumnAfter(4); // endの後に挿入（列E、1ベースで5）
        const targetCol = 5; // 挿入後のisAllDayの位置
        sheet.getRange(1, targetCol, lastRow, 1).setValues(values);
        
        // 元の位置の列を削除
        // 挿入した位置によって削除する列番号が変わる
        if (currentIsAllDayIndex < expectedIsAllDayIndex) {
          // 右に移動する場合、元の位置はそのまま
          sheet.deleteColumn(sourceCol);
        } else {
          // 左に移動する場合、挿入した分だけ右にずれる
          sheet.deleteColumn(sourceCol + 1);
        }
      }
      
      // ヘッダーを更新
      headerRange.setValues([expectedHeaders]);
      headerRange.setFontWeight('bold').setBackground('#667eea').setFontColor('#ffffff');
      Logger.log('✅ EventsシートのisAllDayカラムをstart/endの後に移動しました');
    } else {
      // 既に正しい位置にある場合、ヘッダーのみ確認
      if (JSON.stringify(headerValues.slice(0, 13)) !== JSON.stringify(expectedHeaders)) {
        headerRange.setValues([expectedHeaders]);
        headerRange.setFontWeight('bold').setBackground('#667eea').setFontColor('#ffffff');
      }
    }
    sheet.setFrozenRows(1);
    Logger.log('⚠️ Eventsシートは既にデータが存在するため、データを保持しました');
  }
  
  // 2. Membersシート作成
  sheet = spreadsheet.getSheetByName('Members') || spreadsheet.insertSheet('Members');
  const membersHasData = sheet.getLastRow() > 1;
  if (!membersHasData) {
    sheet.clear();
    sheet.getRange('A1:F1').setValues([[
      'userKey', 'part', 'name', 'displayName', 'createdAt', 'updatedAt'
    ]]);
    sheet.getRange('A1:F1').setFontWeight('bold').setBackground('#667eea').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  } else {
    // ヘッダーのみ確認・更新
    const headerRange = sheet.getRange('A1:F1');
    const headerValues = headerRange.getValues()[0];
    const expectedHeaders = ['userKey', 'part', 'name', 'displayName', 'createdAt', 'updatedAt'];
    if (JSON.stringify(headerValues) !== JSON.stringify(expectedHeaders)) {
      headerRange.setValues([expectedHeaders]);
      headerRange.setFontWeight('bold').setBackground('#667eea').setFontColor('#ffffff');
    }
    sheet.setFrozenRows(1);
    Logger.log('⚠️ Membersシートは既にデータが存在するため、データを保持しました');
  }
  
  // 3. Responsesシート作成
  sheet = spreadsheet.getSheetByName('Responses') || spreadsheet.insertSheet('Responses');
  const responsesHasData = sheet.getLastRow() > 1;
  if (!responsesHasData) {
    sheet.clear();
    sheet.getRange('A1:F1').setValues([[
      'eventId', 'userKey', 'status', 'comment', 'createdAt', 'updatedAt'
    ]]);
    sheet.getRange('A1:F1').setFontWeight('bold').setBackground('#667eea').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  } else {
    // ヘッダーのみ確認・更新
    const headerRange = sheet.getRange('A1:F1');
    const headerValues = headerRange.getValues()[0];
    const expectedHeaders = ['eventId', 'userKey', 'status', 'comment', 'createdAt', 'updatedAt'];
    if (JSON.stringify(headerValues) !== JSON.stringify(expectedHeaders)) {
      headerRange.setValues([expectedHeaders]);
      headerRange.setFontWeight('bold').setBackground('#667eea').setFontColor('#ffffff');
    }
    sheet.setFrozenRows(1);
    Logger.log('⚠️ Responsesシートは既にデータが存在するため、データを保持しました');
  }
  
  // 4. Configシート作成と初期値設定
  sheet = spreadsheet.getSheetByName('Config') || spreadsheet.insertSheet('Config');
  const configHasData = sheet.getLastRow() > 1;
  if (!configHasData) {
    sheet.clear();
    sheet.getRange('A1:B1').setValues([['key', 'value']]);
    sheet.getRange('A1:B1').setFontWeight('bold').setBackground('#667eea').setFontColor('#ffffff');
    
    const configData = [
      ['ADMIN_TOKEN', generateAdminToken()],
      ['CALENDAR_ID', 'primary'],
      ['DISPLAY_START_DATE', ''],
      ['DISPLAY_END_DATE', ''],
      ['CALENDAR_SHOW_PART_BREAKDOWN', 'false']
    ];
    sheet.getRange(2, 1, configData.length, 2).setValues(configData);
    sheet.setFrozenRows(1);
  } else {
    // ヘッダーのみ確認・更新
    const headerRange = sheet.getRange('A1:B1');
    const headerValues = headerRange.getValues()[0];
    if (JSON.stringify(headerValues) !== JSON.stringify(['key', 'value'])) {
      headerRange.setValues([['key', 'value']]);
      headerRange.setFontWeight('bold').setBackground('#667eea').setFontColor('#ffffff');
    }
    // 必要なConfig値が存在しない場合は追加（既存の値は上書きしない）
    const existingConfig = sheet.getDataRange().getValues();
    const existingKeys = existingConfig.slice(1).map(row => row[0]);
    const requiredConfig = [
      ['ADMIN_TOKEN', generateAdminToken()],
      ['CALENDAR_ID', 'primary'],
      ['DISPLAY_START_DATE', ''],
      ['DISPLAY_END_DATE', ''],
      ['CALENDAR_SHOW_PART_BREAKDOWN', 'false']
    ];
    requiredConfig.forEach(([key, defaultValue]) => {
      if (!existingKeys.includes(key)) {
        const nextRow = sheet.getLastRow() + 1;
        // ADMIN_TOKENの場合は毎回生成
        const value = key === 'ADMIN_TOKEN' ? generateAdminToken() : defaultValue;
        sheet.getRange(nextRow, 1, 1, 2).setValues([[key, value]]);
      }
    });
    sheet.setFrozenRows(1);
    Logger.log('⚠️ Configシートは既にデータが存在するため、既存の値を保持しました');
  }
  
  // シートの順序を調整（Events, Members, Responses, Config の順）
  try {
    const allSheets = spreadsheet.getSheets();
    const targetOrder = ['Events', 'Members', 'Responses', 'Config'];
    
    // 各シートを正しい位置に移動
    for (let i = targetOrder.length - 1; i >= 0; i--) {
      const targetName = targetOrder[i];
      const targetSheet = spreadsheet.getSheetByName(targetName);
      if (targetSheet) {
        const currentIndex = allSheets.findIndex(s => s.getName() === targetName);
        if (currentIndex !== -1 && currentIndex !== i) {
          // シートを正しい位置に移動
          spreadsheet.setActiveSheet(targetSheet);
          spreadsheet.moveActiveSheet(i + 1);
        }
      }
    }
  } catch (error) {
    Logger.log(`⚠️ シート順序調整中にエラーが発生しました: ${(error as Error).message}`);
    // エラーが発生しても処理を続行
  }
  
  // デフォルトのSheet1を削除（新しいシートがある場合のみ）
  try {
    // シート名を安全に取得
    const currentSheetNames: string[] = [];
    try {
      const currentSheets = spreadsheet.getSheets();
      for (let i = 0; i < currentSheets.length; i++) {
        try {
          const sheetName = currentSheets[i].getName();
          if (sheetName) {
            currentSheetNames.push(sheetName);
          }
        } catch (error) {
          // 個別のシート名取得に失敗しても続行
          Logger.log(`⚠️ シート名取得失敗（スキップ）: ${(error as Error).message}`);
        }
      }
    } catch (error) {
      Logger.log(`⚠️ シート一覧取得失敗: ${(error as Error).message}`);
      // エラーが発生しても処理を続行
    }
    
    if (currentSheetNames.length > sheetNames.length) {
      // 削除対象のシート名を先にリストアップ（AuditLogも削除対象）
      const sheetsToDelete = currentSheetNames.filter(name => !sheetNames.includes(name) && name !== 'Sheet1');
      
      // リストアップしたシートを削除
      for (const sheetName of sheetsToDelete) {
        try {
          const sheetToDelete = spreadsheet.getSheetByName(sheetName);
          if (sheetToDelete) {
            spreadsheet.deleteSheet(sheetToDelete);
          } else {
            Logger.log(`⚠️ ${sheetName}シートが見つかりません（既に削除されている可能性があります）`);
          }
        } catch (error) {
          Logger.log(`⚠️ ${sheetName}シートの削除をスキップ: ${(error as Error).message}`);
        }
      }
      
      // Sheet1も削除（必要なシートがすべて存在する場合のみ）
      if (currentSheetNames.includes('Sheet1')) {
        try {
          const sheet1 = spreadsheet.getSheetByName('Sheet1');
          if (sheet1 && sheetNames.every(name => currentSheetNames.includes(name))) {
            spreadsheet.deleteSheet(sheet1);
          }
        } catch (error) {
          Logger.log(`⚠️ Sheet1シートの削除をスキップ: ${(error as Error).message}`);
        }
      }
    }
  } catch (error) {
    Logger.log(`⚠️ シート削除処理中にエラーが発生しました: ${(error as Error).message}`);
    // エラーが発生しても処理を続行
  }
  
  Logger.log('=== Spreadsheet初期化完了 ===');
  Logger.log(`Spreadsheet URL: ${spreadsheet.getUrl()}`);
}

/**
 * アプリケーション全体の初期セットアップ
 * - Spreadsheetの初期化
 * - 専用カレンダーの作成とCALENDAR_IDの設定
 * 初回デプロイ時に1回だけ実行
 */
function setupApplication(): void {
  Logger.log('=== アプリケーション初期セットアップ開始 ===');
  
  try {
    // 1. Spreadsheetの初期化
    Logger.log('--- Spreadsheet初期化 ---');
    initializeSpreadsheet();
    
    // 2. 専用カレンダーの作成とCALENDAR_IDの設定
    Logger.log('--- 専用カレンダー作成 ---');
    const calendarId = setupBandCalendar();
    
    
  } catch (error) {
    Logger.log(`❌ エラー: アプリケーション初期セットアップ失敗 - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
    throw error;
  }
}

/**
 * Config値を取得
 * @param key 設定キー
 * @param defaultValue デフォルト値
 * @returns 設定値
 */
function getConfig(key: string, defaultValue: string = ''): string {
  try {
    if (!key || key.trim() === '') {
      Logger.log(`⚠️ 警告: Configキーが空です`);
      return defaultValue;
    }
    
    const spreadsheet = getOrCreateSpreadsheet();
    const sheet = spreadsheet.getSheetByName('Config');
    
    if (!sheet) {
      Logger.log(`⚠️ 警告: Configシートが存在しません。デフォルト値を返します: ${key}`);
      return defaultValue;
    }
    
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === key) {
        return String(data[i][1]);
      }
    }
    
    return defaultValue;
  } catch (error) {
    Logger.log(`❌ エラー: Config取得失敗 (key: ${key}) - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
    return defaultValue; // エラー時はデフォルト値を返す
  }
}

/**
 * 全Config値を一度に取得（性能改善：Configシートを1回だけ読み込む）
 * @returns Config値のマップ {key: value}
 */
function getAllConfig(): { [key: string]: string } {
  try {
    const spreadsheet = getOrCreateSpreadsheet();
    const sheet = spreadsheet.getSheetByName('Config');
    
    if (!sheet) {
      Logger.log('⚠️ 警告: Configシートが存在しません。空のオブジェクトを返します');
      return {};
    }
    
    const data = sheet.getDataRange().getValues();
    const configMap: { [key: string]: string } = {};
    
    // ヘッダー行をスキップして、すべての設定値を取得
    for (let i = 1; i < data.length; i++) {
      const key = data[i][0];
      const value = data[i][1];
      if (key) {
        configMap[String(key)] = String(value || '');
      }
    }
    
    return configMap;
  } catch (error) {
    Logger.log(`❌ エラー: 全Config取得失敗 - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
    return {};
  }
}

/**
 * Config値を設定
 * @param key 設定キー
 * @param value 設定値
 */
function setConfig(key: string, value: string): void {
  try {
    if (!key || key.trim() === '') {
      Logger.log(`❌ エラー: Configキーが空です`);
      return;
    }
    
    const spreadsheet = getOrCreateSpreadsheet();
    const sheet = spreadsheet.getSheetByName('Config');
    
    if (!sheet) {
      Logger.log(`❌ エラー: Configシートが存在しません`);
      return;
    }
    
    const data = sheet.getDataRange().getValues();
    let updated = false;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === key) {
        sheet.getRange(i + 1, 2).setValue(value);
        updated = true;
        break;
      }
    }
    
    if (!updated) {
      sheet.appendRow([key, value]);
    }
    
    // CALENDAR_IDの場合はScript Propertiesにもキャッシュ（性能改善）
    if (key === 'CALENDAR_ID') {
      try {
        const properties = PropertiesService.getScriptProperties();
        properties.setProperty('CALENDAR_ID_CACHE', value);
        Logger.log(`⚡ CALENDAR_IDをScript Propertiesにキャッシュしました: ${value}`);
      } catch (cacheError) {
        Logger.log(`⚠️ Script Propertiesへのキャッシュ保存に失敗しました（無視）: ${(cacheError as Error).message}`);
      }
    }
  } catch (error) {
    Logger.log(`❌ エラー: Config設定失敗 (key: ${key}, value: ${value}) - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
  }
}

/**
 * 管理者トークンを生成
 * @returns ランダムな管理者トークン
 */
function generateAdminToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * UUIDを生成（簡易版）
 * @returns UUID文字列
 */
function generateUuid(): string {
  return Utilities.getUuid();
}

/**
 * 現在のタイムスタンプを取得（ISO 8601形式）
 * @returns タイムスタンプ文字列
 */
function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * カレンダーとスプレッドシートの全データを削除（お掃除用）
 * 注意: この関数は全てのデータを削除します。実行には注意が必要です。
 * @returns 削除結果
 */
function cleanupAllData(): { 
  calendarDeleted: number; 
  eventsDeleted: number; 
  responsesDeleted: number; 
  success: boolean;
  errors: string[];
} {
  const result = {
    calendarDeleted: 0,
    eventsDeleted: 0,
    responsesDeleted: 0,
    success: true,
    errors: [] as string[]
  };

  try {
    Logger.log('=== 全データ削除開始 ===');

    // 1. カレンダーの全イベントを削除
    try {
      const calendarId = getOrCreateCalendar();
      const calendar = CalendarApp.getCalendarById(calendarId);
      
      if (calendar) {
        // 過去10年から未来10年までの全イベントを取得
        const now = new Date();
        const startDate = new Date(now.getTime() - 10 * 365 * 24 * 60 * 60 * 1000); // 10年前
        const endDate = new Date(now.getTime() + 10 * 365 * 24 * 60 * 60 * 1000); // 10年後
        
        Logger.log(`カレンダーイベント取得範囲: ${startDate.toISOString()} ～ ${endDate.toISOString()}`);
        const calendarEvents = calendar.getEvents(startDate, endDate);
        
        // 全イベントを削除
        for (const event of calendarEvents) {
          try {
            event.deleteEvent();
            result.calendarDeleted++;
          } catch (error) {
            const errorMsg = `カレンダーイベント削除失敗: ${event.getId()} - ${(error as Error).message}`;
            result.errors.push(errorMsg);
            Logger.log(`❌ ${errorMsg}`);
          }
        }
        
      }
    } catch (error) {
      const errorMsg = `カレンダー削除エラー: ${(error as Error).message}`;
      result.errors.push(errorMsg);
      Logger.log(`❌ ${errorMsg}`);
    }

    // 2. スプレッドシートのデータを削除（ヘッダー行は残す）
    try {
      const spreadsheet = getOrCreateSpreadsheet();

      // Eventsシートをクリア
      const eventsSheet = spreadsheet.getSheetByName('Events');
      if (eventsSheet) {
        const lastRow = eventsSheet.getLastRow();
        if (lastRow > 1) {
          eventsSheet.deleteRows(2, lastRow - 1); // ヘッダー行（1行目）を残して削除
          result.eventsDeleted = lastRow - 1;
        } else {
        }
      }

      // Responsesシートをクリア
      const responsesSheet = spreadsheet.getSheetByName('Responses');
      if (responsesSheet) {
        const lastRow = responsesSheet.getLastRow();
        if (lastRow > 1) {
          responsesSheet.deleteRows(2, lastRow - 1); // ヘッダー行（1行目）を残して削除
          result.responsesDeleted = lastRow - 1;
        } else {
        }
      }

      // Configシートは設定情報なので残す（必要に応じてリセット可能）

    } catch (error) {
      const errorMsg = `スプレッドシート削除エラー: ${(error as Error).message}`;
      result.errors.push(errorMsg);
      Logger.log(`❌ ${errorMsg}`);
      result.success = false;
    }

    Logger.log('=== 全データ削除完了 ===');
    Logger.log(`カレンダー: ${result.calendarDeleted}件削除`);
    Logger.log(`Events: ${result.eventsDeleted}件削除`);
    Logger.log(`Responses: ${result.responsesDeleted}件削除`);
    if (result.errors.length > 0) {
      Logger.log(`⚠️ エラー: ${result.errors.length}件`);
    }

    return result;

  } catch (error) {
    Logger.log(`❌ エラー: 全データ削除失敗 - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
    result.success = false;
    result.errors.push((error as Error).message);
    return result;
  }
}

/**
 * テスト: Spreadsheet初期化
 */

/**
 * テスト: Config取得・設定
 */

/**
 * 入力文字列をサニタイズ（XSS対策）
 * HTML特殊文字をエスケープ
 * @param input 入力文字列
 * @returns サニタイズされた文字列
 */
function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // HTML特殊文字をエスケープ
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * レート制限チェック
 * 同一userKeyで1分間に5回まで
 * @param userKey ユーザー識別子
 * @param action アクション名（例: 'submit_response', 'create_event'）
 * @returns 許可される場合: true, 制限される場合: false
 */
function checkRateLimit(userKey: string, action: string): boolean {
  try {
    if (!userKey || !action) {
      return false;
    }

    const cache = CacheService.getScriptCache();
    const cacheKey = `ratelimit:${userKey}:${action}`;
    const cacheData = cache.get(cacheKey);

    if (!cacheData) {
      // 初回アクセス: カウント1で保存（60秒有効）
      cache.put(cacheKey, '1', 60);
      return true;
    }

    const count = parseInt(cacheData, 10);
    if (count >= 5) {
      // 制限超過
      Logger.log(`⚠️ レート制限: ${userKey} の ${action} が制限されました（${count}回/分）`);
      return false;
    }

    // カウントを増やして保存
    cache.put(cacheKey, (count + 1).toString(), 60);
    return true;

  } catch (error) {
    Logger.log(`❌ エラー: レート制限チェック失敗 - ${(error as Error).message}`);
    // エラー時は許可（サービス継続性を優先）
    return true;
  }
}

/**
 * レート制限をリセット（テスト用）
 * @param userKey ユーザー識別子
 * @param action アクション名
 */
function resetRateLimit(userKey: string, action: string): void {
  try {
    const cache = CacheService.getScriptCache();
    const cacheKey = `ratelimit:${userKey}:${action}`;
    cache.remove(cacheKey);
  } catch (error) {
    Logger.log(`❌ エラー: レート制限リセット失敗 - ${(error as Error).message}`);
  }
}

/**
 * テスト関数: セキュリティ対策テスト
 */

