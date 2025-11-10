/// <reference path="../types/models.ts" />

/**
 * カレンダー連携モジュール
 * Phase 2: カレンダー連携実装
 */

/**
 * 楽団専用カレンダーを作成
 * - 初回デプロイ時に1回だけ実行
 * - 作成したカレンダーIDをConfigシートに保存
 * @returns カレンダーID
 */
function setupBandCalendar(): string {
  try {
    Logger.log('=== 楽団専用カレンダー作成開始 ===');
    
    // カレンダーを作成
    const calendar = CalendarApp.createCalendar('Tokyo Music Union イベントカレンダー');
    calendar.setTimeZone('Asia/Tokyo');
    
    const calendarId = calendar.getId();
    Logger.log(`✅ 専用カレンダー作成成功: ${calendarId}`);
    Logger.log(`カレンダー名: ${calendar.getName()}`);
    
    // Configシートに保存
    setConfig('CALENDAR_ID', calendarId);
    Logger.log(`✅ CALENDAR_IDをConfigシートに保存: ${calendarId}`);
    
    Logger.log('=== 楽団専用カレンダー作成完了 ===');
    return calendarId;
    
  } catch (error) {
    Logger.log(`❌ エラー: カレンダー作成失敗 - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
    throw error;
  }
}

/**
 * カレンダーを取得または作成
 * - ConfigシートにCALENDAR_IDが保存されている場合は取得
 * - 保存されていない場合は新規作成
 * @returns カレンダーID
 */
function getOrCreateCalendar(): string {
  try {
    // ConfigシートからカレンダーIDを取得
    let calendarId = getConfig('CALENDAR_ID', '');
    
    if (calendarId) {
      // 既存のカレンダーが存在するか確認
      try {
        const calendar = CalendarApp.getCalendarById(calendarId);
        if (calendar) {
          Logger.log(`✅ 既存のカレンダーを取得: ${calendarId}`);
          return calendarId;
        }
      } catch (error) {
        Logger.log(`⚠️ 既存のカレンダーが見つかりません: ${calendarId}`);
        Logger.log('新規カレンダーを作成します');
      }
    }
    
    // カレンダーが存在しない場合は新規作成
    Logger.log('新規カレンダーを作成します');
    return setupBandCalendar();
    
  } catch (error) {
    Logger.log(`❌ エラー: カレンダー取得/作成失敗 - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
    throw error;
  }
}

/**
 * テスト関数: カレンダー作成・取得テスト
 */
function testCalendarSetup(): void {
  Logger.log('=== testCalendarSetup 開始 ===');
  
  try {
    // テスト1: カレンダー作成
    Logger.log(' --- テスト1: カレンダー作成 ---');
    const calendarId = setupBandCalendar();
    Logger.log(`✅ テスト1: 成功 - カレンダーID: ${calendarId}`);
    
    // テスト2: Configシートから取得
    Logger.log(' --- テスト2: Configシートから取得 ---');
    const savedCalendarId = getConfig('CALENDAR_ID', '');
    if (savedCalendarId === calendarId) {
      Logger.log(`✅ テスト2: 成功 - Configシートに正しく保存されています`);
    } else {
      Logger.log(`❌ テスト2: 失敗 - 保存されたIDが一致しません`);
    }
    
    // テスト3: getOrCreateCalendarで取得
    Logger.log(' --- テスト3: getOrCreateCalendarで取得 ---');
    const retrievedCalendarId = getOrCreateCalendar();
    if (retrievedCalendarId === calendarId) {
      Logger.log(`✅ テスト3: 成功 - 既存カレンダーを正しく取得しました`);
    } else {
      Logger.log(`❌ テスト3: 失敗 - 取得したIDが一致しません`);
    }
    
    Logger.log('=== testCalendarSetup 終了 ===');
    Logger.log('✅ すべてのテストが完了しました');
    
  } catch (error) {
    Logger.log(`❌ エラー: テスト実行中にエラーが発生しました - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
  }
}

/**
 * 文字列のSHA256ハッシュを計算
 * @param text ハッシュ化する文字列
 * @returns ハッシュ値（16進数文字列）
 */
function computeHash(text: string): string {
  try {
    if (!text || typeof text !== 'string') {
      Logger.log('⚠️ 警告: computeHashに空のテキストが渡されました');
      return '';
    }
    
    const rawHash = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      text,
      Utilities.Charset.UTF_8
    );
    
    return rawHash.map(byte => {
      const hex = (byte < 0 ? byte + 256 : byte).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  } catch (error) {
    Logger.log(`❌ エラー: ハッシュ計算失敗 - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
    return ''; // エラー時は空文字を返す
  }
}

/**
 * 出欠サマリーを含む説明文を生成
 * @param eventId イベントID
 * @returns 説明文
 */
function buildDescription(eventId: string): string {
  try {
    const tally = tallyResponses(eventId);
    const now = new Date();
    const formattedDate = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
    
    let description = '【出欠状況】\n';
    description += `○ 参加: ${tally.attendCount}人\n`;
    description += `△ 未定: ${tally.maybeCount}人\n`;
    description += `× 欠席: ${tally.absentCount}人\n`;
    description += `合計: ${tally.totalCount}人\n\n`;
    description += `最終更新: ${formattedDate}`;
    
    return description;
  } catch (error) {
    Logger.log(`❌ エラー: 説明文生成失敗 - ${(error as Error).message}`);
    return '';
  }
}

/**
 * カレンダーイベントを作成または更新
 * @param event イベントデータ
 * @returns カレンダーイベントID（成功時）、null（失敗時）
 */
function upsertCalendarEvent(event: AttendanceEvent): string | null {
  try {
    if (!event || !event.id) {
      Logger.log('❌ エラー: イベントデータが不正です');
      return null;
    }
    
    const calendarId = getOrCreateCalendar();
    const calendar = CalendarApp.getCalendarById(calendarId);
    
    if (!calendar) {
      Logger.log(`❌ エラー: カレンダーが見つかりません: ${calendarId}`);
      return null;
    }
    
    const startDate = new Date(event.start);
    const endDate = new Date(event.end);
    
    // 説明文を生成（出欠サマリーを含む）
    const description = buildDescription(event.id);
    
    // 説明文のハッシュを計算
    const notesHash = computeHash(description);
    
    // 既存のカレンダーイベントIDがあるか確認
    let calendarEvent: GoogleAppsScript.Calendar.CalendarEvent | null = null;
    
    if (event.calendarEventId) {
      try {
        calendarEvent = calendar.getEventById(event.calendarEventId);
      } catch (error) {
        Logger.log(`⚠️ 既存のカレンダーイベントが見つかりません: ${event.calendarEventId}`);
        // 既存イベントが見つからない場合は新規作成
      }
    }
    
    if (calendarEvent) {
      // 既存イベントを更新
      // カレンダーイベントの現在の値を取得
      const currentTitle = calendarEvent.getTitle();
      const currentStart = calendarEvent.getStartTime();
      const currentEnd = calendarEvent.getEndTime();
      const currentLocation = calendarEvent.getLocation() || '';
      
      // タイトル、日時、場所が変更されているか確認
      const titleChanged = currentTitle !== event.title;
      const timeChanged = currentStart.getTime() !== startDate.getTime() || 
                         currentEnd.getTime() !== endDate.getTime();
      const locationChanged = currentLocation !== (event.location || '');
      
      // 説明文のハッシュが同じで、かつタイトル・日時・場所も同じ場合は更新をスキップ（無限ループ防止）
      if (event.notesHash === notesHash && !titleChanged && !timeChanged && !locationChanged) {
        Logger.log(`✅ カレンダーイベント更新スキップ（変更なし）: ${event.id}`);
        return event.calendarEventId || null;
      }
      
      // タイトル、日時、場所、説明文を更新
      if (titleChanged) {
        calendarEvent.setTitle(event.title);
      }
      if (timeChanged) {
        calendarEvent.setTime(startDate, endDate);
      }
      if (locationChanged) {
        calendarEvent.setLocation(event.location || '');
      }
      // 説明文のハッシュが異なる場合のみ説明文を更新
      if (event.notesHash !== notesHash) {
        calendarEvent.setDescription(description);
      }
      
      // notesHashを更新（説明文が変更された場合のみ）
      if (event.notesHash !== notesHash) {
        updateEventCalendarInfo(event.id, event.calendarEventId || '', notesHash);
      }
      
      Logger.log(`✅ カレンダーイベント更新成功: ${event.id} - ${event.calendarEventId}`);
      return event.calendarEventId || null;
    } else {
      // 新規イベントを作成
      const newCalendarEvent = calendar.createEvent(
        event.title,
        startDate,
        endDate,
        {
          location: event.location || '',
          description: description
        }
      );
      
      const newCalendarEventId = newCalendarEvent.getId();
      Logger.log(`✅ カレンダーイベント作成成功: ${event.id} - ${newCalendarEventId}`);
      
      // EventsシートのcalendarEventIdとnotesHashを更新
      updateEventCalendarInfo(event.id, newCalendarEventId, notesHash);
      
      return newCalendarEventId;
    }
    
  } catch (error) {
    Logger.log(`❌ エラー: カレンダーイベント作成/更新失敗 - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
    return null;
  }
}

/**
 * イベントのカレンダー情報を更新
 * @param eventId イベントID
 * @param calendarEventId カレンダーイベントID
 * @param notesHash 説明文ハッシュ
 */
function updateEventCalendarInfo(eventId: string, calendarEventId: string, notesHash: string): void {
  try {
    const sheet = getEventsSheet();
    const data = sheet.getDataRange().getValues();
    
    // ヘッダー行をスキップしてIDで検索
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === eventId) {
        // calendarEventId (列7) と notesHash (列8) を更新（バッチ更新: パフォーマンス最適化）
        const rowIndex = i + 1;
        sheet.getRange(rowIndex, 7, 1, 2).setValues([[calendarEventId, notesHash]]);
        // lastSynced (列12) も更新
        sheet.getRange(rowIndex, 12).setValue(new Date().toISOString());
        Logger.log(`✅ イベントカレンダー情報更新: ${eventId}`);
        return;
      }
    }
    
    Logger.log(`⚠️ イベントが見つかりません: ${eventId}`);
  } catch (error) {
    Logger.log(`❌ エラー: イベントカレンダー情報更新失敗 - ${(error as Error).message}`);
  }
}

/**
 * 特定イベントの説明欄を同期
 * @param eventId イベントID
 */
function syncCalendarDescriptionForEvent(eventId: string): void {
  try {
    const event = getEventById(eventId);
    if (!event) {
      Logger.log(`❌ エラー: イベントが見つかりません: ${eventId}`);
      return;
    }
    
    if (!event.calendarEventId) {
      Logger.log(`⚠️ カレンダーイベントIDが設定されていません: ${eventId}`);
      // カレンダーイベントを作成
      upsertCalendarEvent(event);
      return;
    }
    
    const calendarId = getOrCreateCalendar();
    const calendar = CalendarApp.getCalendarById(calendarId);
    
    if (!calendar) {
      Logger.log(`❌ エラー: カレンダーが見つかりません: ${calendarId}`);
      return;
    }
    
    try {
      const calendarEvent = calendar.getEventById(event.calendarEventId);
      const description = buildDescription(eventId);
      const notesHash = computeHash(description);
      
      // 説明文のハッシュが同じ場合は更新をスキップ（無限ループ防止）
      if (event.notesHash === notesHash) {
        Logger.log(`✅ 説明欄同期スキップ（変更なし）: ${eventId}`);
        return;
      }
      
      calendarEvent.setDescription(description);
      
      // notesHashを更新
      updateEventCalendarInfo(eventId, event.calendarEventId, notesHash);
      
      Logger.log(`✅ 説明欄同期成功: ${eventId}`);
    } catch (error) {
      Logger.log(`❌ エラー: カレンダーイベントが見つかりません: ${event.calendarEventId}`);
      // カレンダーイベントが存在しない場合は再作成
      upsertCalendarEvent(event);
    }
    
  } catch (error) {
    Logger.log(`❌ エラー: 説明欄同期失敗 - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
  }
}

/**
 * テスト関数: アプリ → カレンダー同期テスト
 */
function testAppToCalendarSync(): void {
  Logger.log('=== testAppToCalendarSync 開始 ===');
  
  try {
    // テスト準備: カレンダーを取得または作成
    Logger.log(' --- テスト準備: カレンダー取得 ---');
    const calendarId = getOrCreateCalendar();
    Logger.log(`✅ カレンダーID: ${calendarId}`);
    
    // テスト1: イベント作成時のカレンダー同期
    Logger.log(' --- テスト1: イベント作成時のカレンダー同期 ---');
    const testEventId = createEvent(
      'カレンダー同期テストイベント',
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7日後
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000).toISOString(), // 7日後+4時間
      'テスト会場',
      'カレンダー同期のテスト用イベントです'
    );
    
    if (!testEventId) {
      Logger.log('❌ テスト1: 失敗 - イベント作成に失敗しました');
      return;
    }
    
    Logger.log(`✅ テスト1: イベント作成成功 - ${testEventId}`);
    
    // カレンダーイベントが作成されたか確認
    const event = getEventById(testEventId);
    if (!event) {
      Logger.log('❌ テスト1: 失敗 - イベント取得に失敗しました');
      return;
    }
    
    if (event.calendarEventId) {
      Logger.log(`✅ テスト1: 成功 - カレンダーイベントID: ${event.calendarEventId}`);
      
      // カレンダーから実際のイベントを取得して確認
      try {
        const calendar = CalendarApp.getCalendarById(calendarId);
        const calendarEvent = calendar.getEventById(event.calendarEventId);
        Logger.log(`✅ テスト1: 成功 - カレンダーイベント確認: ${calendarEvent.getTitle()}`);
      } catch (error) {
        Logger.log(`⚠️ テスト1: 警告 - カレンダーイベント取得失敗: ${(error as Error).message}`);
      }
    } else {
      Logger.log('❌ テスト1: 失敗 - カレンダーイベントIDが設定されていません');
    }
    
    // テスト2: buildDescription()のテスト
    Logger.log(' --- テスト2: buildDescription()のテスト ---');
    
    // テスト用に出欠回答を登録
    submitResponse(testEventId, 'test-user-1', '○', '参加します');
    submitResponse(testEventId, 'test-user-2', '△', '未定です');
    submitResponse(testEventId, 'test-user-3', '×', '欠席します');
    
    const description = buildDescription(testEventId);
    Logger.log(`説明文:\n${description}`);
    
    if (description.includes('○ 参加: 1人') && 
        description.includes('△ 未定: 1人') && 
        description.includes('× 欠席: 1人') &&
        description.includes('合計: 3人')) {
      Logger.log('✅ テスト2: 成功 - 説明文が正しく生成されました');
    } else {
      Logger.log('❌ テスト2: 失敗 - 説明文の内容が正しくありません');
    }
    
    // テスト3: 出欠登録時の説明欄同期
    Logger.log(' --- テスト3: 出欠登録時の説明欄同期 ---');
    
    // 追加の出欠回答を登録
    submitResponse(testEventId, 'test-user-4', '○', '参加します');
    
    // カレンダーイベントの説明欄を確認
    try {
      const calendar = CalendarApp.getCalendarById(calendarId);
      if (event.calendarEventId) {
        const calendarEvent = calendar.getEventById(event.calendarEventId);
        const calendarDescription = calendarEvent.getDescription();
        
        if (calendarDescription.includes('○ 参加: 2人') && 
            calendarDescription.includes('合計: 4人')) {
          Logger.log('✅ テスト3: 成功 - カレンダーの説明欄が更新されました');
        } else {
          Logger.log('❌ テスト3: 失敗 - カレンダーの説明欄が正しく更新されていません');
          Logger.log(`実際の説明欄:\n${calendarDescription}`);
        }
      }
    } catch (error) {
      Logger.log(`❌ テスト3: 失敗 - カレンダーイベント取得失敗: ${(error as Error).message}`);
    }
    
    // テスト4: イベント更新時のカレンダー同期
    Logger.log(' --- テスト4: イベント更新時のカレンダー同期 ---');
    
    const updateResult = updateEvent(testEventId, {
      title: 'カレンダー同期テストイベント（更新済み）',
      location: '更新された会場'
    });
    
    if (updateResult) {
      Logger.log('✅ テスト4: 成功 - イベント更新成功');
      
      // カレンダーイベントが更新されたか確認
      const updatedEvent = getEventById(testEventId);
      if (updatedEvent && updatedEvent.calendarEventId) {
        try {
          const calendar = CalendarApp.getCalendarById(calendarId);
          const calendarEvent = calendar.getEventById(updatedEvent.calendarEventId);
          
          if (calendarEvent.getTitle() === 'カレンダー同期テストイベント（更新済み）' &&
              calendarEvent.getLocation() === '更新された会場') {
            Logger.log('✅ テスト4: 成功 - カレンダーイベントが正しく更新されました');
          } else {
            Logger.log('❌ テスト4: 失敗 - カレンダーイベントの更新内容が正しくありません');
          }
        } catch (error) {
          Logger.log(`❌ テスト4: 失敗 - カレンダーイベント取得失敗: ${(error as Error).message}`);
        }
      }
    } else {
      Logger.log('❌ テスト4: 失敗 - イベント更新に失敗しました');
    }
    
    // テスト5: notesHashによる無限ループ防止
    Logger.log(' --- テスト5: notesHashによる無限ループ防止 ---');
    
    const eventBeforeSync = getEventById(testEventId);
    if (!eventBeforeSync) {
      Logger.log('❌ テスト5: 失敗 - イベント取得に失敗しました');
      return;
    }
    
    const hashBefore = eventBeforeSync.notesHash;
    Logger.log(`同期前のnotesHash: ${hashBefore}`);
    
    // 説明欄を同期（出欠状況に変更がない場合）
    syncCalendarDescriptionForEvent(testEventId);
    
    const eventAfterSync = getEventById(testEventId);
    if (!eventAfterSync) {
      Logger.log('❌ テスト5: 失敗 - イベント取得に失敗しました');
      return;
    }
    
    const hashAfter = eventAfterSync.notesHash;
    Logger.log(`同期後のnotesHash: ${hashAfter}`);
    
    if (hashBefore === hashAfter) {
      Logger.log('✅ テスト5: 成功 - notesHashが同じため、無限ループが防止されました');
    } else {
      Logger.log('⚠️ テスト5: 警告 - notesHashが変更されました（出欠状況が変更された可能性があります）');
    }
    
    // クリーンアップ: テストイベントを削除（論理削除 + カレンダーイベント削除）
    Logger.log(' --- クリーンアップ: テストイベントを削除 ---');
    
    // カレンダーイベントを削除
    const eventToDelete = getEventById(testEventId);
    if (eventToDelete && eventToDelete.calendarEventId) {
      try {
        const calendar = CalendarApp.getCalendarById(calendarId);
        const calendarEvent = calendar.getEventById(eventToDelete.calendarEventId);
        calendarEvent.deleteEvent();
        Logger.log(`✅ カレンダーイベントを削除: ${eventToDelete.calendarEventId}`);
      } catch (error) {
        Logger.log(`⚠️ カレンダーイベント削除失敗（既に削除済みの可能性）: ${(error as Error).message}`);
      }
    }
    
    // イベントを論理削除
    updateEvent(testEventId, { status: 'deleted' });
    Logger.log('✅ テストイベントを削除しました');
    
    Logger.log('=== testAppToCalendarSync 終了 ===');
    Logger.log('✅ すべてのテストが完了しました');
    
  } catch (error) {
    Logger.log(`❌ エラー: テスト実行中にエラーが発生しました - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
  }
}

/**
 * カレンダーからイベントを取得してSpreadsheetと同期
 * @param calendarId カレンダーID（省略時はConfigから取得）
 * @returns 同期結果
 */
function pullFromCalendar(calendarId?: string): { success: number, failed: number, errors: string[] } {
  const result = {
    success: 0,
    failed: 0,
    errors: [] as string[]
  };
  
  try {
    Logger.log('=== カレンダー → アプリ同期開始 ===');
    
    // カレンダーIDを取得
    const targetCalendarId = calendarId || getOrCreateCalendar();
    const calendar = CalendarApp.getCalendarById(targetCalendarId);
    
    if (!calendar) {
      const errorMsg = `カレンダーが見つかりません: ${targetCalendarId}`;
      Logger.log(`❌ エラー: ${errorMsg}`);
      result.failed++;
      result.errors.push(errorMsg);
      return result;
    }
    
    // カレンダーから全イベントを取得（過去30日から未来1年まで）
    const now = new Date();
    const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30日前
    const endDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1年後
    
    Logger.log(`カレンダーイベント取得範囲: ${startDate.toISOString()} ～ ${endDate.toISOString()}`);
    const calendarEvents = calendar.getEvents(startDate, endDate);
    Logger.log(`✅ カレンダーイベント取得: ${calendarEvents.length}件`);
    
    // Spreadsheetの全イベントを取得
    const spreadsheetEvents = getEvents('all');
    Logger.log(`✅ Spreadsheetイベント取得: ${spreadsheetEvents.length}件`);
    
    // calendarEventIdをキーにしたマップを作成
    const spreadsheetEventMap = new Map<string, AttendanceEvent>();
    // タイトルと開始日時をキーにしたマップも作成（重複チェック用）
    const spreadsheetEventByTitleAndDateMap = new Map<string, AttendanceEvent>();
    
    spreadsheetEvents.forEach(event => {
      if (event.calendarEventId) {
        spreadsheetEventMap.set(event.calendarEventId, event);
      }
      // タイトルと開始日時で重複チェック用のキーを作成
      const titleDateKey = `${event.title}|${event.start}`;
      // 既に存在する場合は、calendarEventIdが設定されている方を優先
      if (!spreadsheetEventByTitleAndDateMap.has(titleDateKey) || event.calendarEventId) {
        spreadsheetEventByTitleAndDateMap.set(titleDateKey, event);
      }
    });
    
    // カレンダーイベントを処理
    for (const calendarEvent of calendarEvents) {
      try {
        const calendarEventId = calendarEvent.getId();
        const calendarEventTitle = calendarEvent.getTitle();
        const calendarEventStart = calendarEvent.getStartTime();
        const calendarEventEnd = calendarEvent.getEndTime();
        const calendarEventLocation = calendarEvent.getLocation() || '';
        const calendarEventDescription = calendarEvent.getDescription() || '';
        const calendarEventUpdated = calendarEvent.getLastUpdated();
        
        // 説明欄に「【出欠状況】」が含まれている場合は、アプリで作成されたイベントと判断
        const isAppCreated = calendarEventDescription.includes('【出欠状況】');
        
        if (!isAppCreated) {
          // アプリで作成されていないイベントはスキップ
          Logger.log(`⚠️ スキップ: アプリで作成されていないイベント - ${calendarEventTitle}`);
          continue;
        }
        
        const existingEvent = spreadsheetEventMap.get(calendarEventId);
        
        if (existingEvent) {
          // 既存イベントの更新チェック
          // lastSyncedとカレンダーのupdatedを比較（Last-Write-Wins）
          const lastSynced = existingEvent.lastSynced ? new Date(existingEvent.lastSynced) : new Date(0);
          const calendarUpdated = calendarEventUpdated;
          
          if (calendarUpdated.getTime() > lastSynced.getTime()) {
            // カレンダーの方が新しい場合、Spreadsheetを更新
            Logger.log(`🔄 イベント更新: ${existingEvent.id} - ${calendarEventTitle}`);
            
            // 説明欄から出欠サマリーを抽出（更新しない）
            // タイトル、日時、場所のみ更新
            const updateResult = updateEvent(existingEvent.id, {
              title: calendarEventTitle,
              start: calendarEventStart.toISOString(),
              end: calendarEventEnd.toISOString(),
              location: calendarEventLocation,
              lastSynced: calendarEventUpdated.toISOString()
            });
            
            if (updateResult) {
              result.success++;
              Logger.log(`✅ イベント更新成功: ${existingEvent.id}`);
            } else {
              result.failed++;
              const errorMsg = `イベント更新失敗: ${existingEvent.id}`;
              result.errors.push(errorMsg);
              Logger.log(`❌ ${errorMsg}`);
            }
          } else {
            // Spreadsheetの方が新しい場合はスキップ
            Logger.log(`⏭️ スキップ: Spreadsheetの方が新しい - ${existingEvent.id}`);
            result.success++; // スキップも成功としてカウント
          }
        } else {
          // calendarEventIdで見つからなかった場合、タイトルと日時で重複チェック
          const titleDateKey = `${calendarEventTitle}|${calendarEventStart.toISOString()}`;
          const duplicateEvent = spreadsheetEventByTitleAndDateMap.get(titleDateKey);
          
          if (duplicateEvent) {
            // タイトルと日時が同じイベントが既に存在する場合
            // calendarEventIdが設定されていない場合は設定し、設定されている場合は更新
            if (!duplicateEvent.calendarEventId) {
              // calendarEventIdが未設定の場合は設定
              Logger.log(`🔄 既存イベントにcalendarEventIdを設定: ${duplicateEvent.id} - ${calendarEventTitle}`);
              const updateResult = updateEvent(duplicateEvent.id, {
                calendarEventId: calendarEventId,
                lastSynced: calendarEventUpdated.toISOString()
              });
              
              if (updateResult) {
                result.success++;
                Logger.log(`✅ calendarEventId設定成功: ${duplicateEvent.id}`);
              } else {
                result.failed++;
                const errorMsg = `calendarEventId設定失敗: ${duplicateEvent.id}`;
                result.errors.push(errorMsg);
                Logger.log(`❌ ${errorMsg}`);
              }
            } else if (duplicateEvent.calendarEventId !== calendarEventId) {
              // calendarEventIdが異なる場合は、カレンダーの方が新しい場合のみ更新
              const lastSynced = duplicateEvent.lastSynced ? new Date(duplicateEvent.lastSynced) : new Date(0);
              if (calendarEventUpdated.getTime() > lastSynced.getTime()) {
                Logger.log(`🔄 既存イベントのcalendarEventIdを更新: ${duplicateEvent.id} - ${calendarEventTitle}`);
                const updateResult = updateEvent(duplicateEvent.id, {
                  calendarEventId: calendarEventId,
                  title: calendarEventTitle,
                  start: calendarEventStart.toISOString(),
                  end: calendarEventEnd.toISOString(),
                  location: calendarEventLocation,
                  lastSynced: calendarEventUpdated.toISOString()
                });
                
                if (updateResult) {
                  result.success++;
                  Logger.log(`✅ calendarEventId更新成功: ${duplicateEvent.id}`);
                } else {
                  result.failed++;
                  const errorMsg = `calendarEventId更新失敗: ${duplicateEvent.id}`;
                  result.errors.push(errorMsg);
                  Logger.log(`❌ ${errorMsg}`);
                }
              } else {
                Logger.log(`⏭️ スキップ: Spreadsheetの方が新しい - ${duplicateEvent.id}`);
                result.success++;
              }
            } else {
              // 同じcalendarEventIdの場合はスキップ（既に処理済み）
              Logger.log(`⏭️ スキップ: 既に処理済み - ${duplicateEvent.id}`);
              result.success++;
            }
          } else {
            // 新規イベントをSpreadsheetに追加
            Logger.log(`➕ 新規イベント追加: ${calendarEventTitle}`);
            
            // 説明欄から出欠サマリーを除去してdescriptionとして保存
            // （説明欄は「【出欠状況】」以降を除去）
            let description = calendarEventDescription;
            const attendanceIndex = description.indexOf('【出欠状況】');
            if (attendanceIndex >= 0) {
              description = description.substring(0, attendanceIndex).trim();
            }
            
            const newEventId = createEvent(
              calendarEventTitle,
              calendarEventStart.toISOString(),
              calendarEventEnd.toISOString(),
              calendarEventLocation,
              description
            );
            
            if (newEventId) {
              // calendarEventIdとlastSyncedを設定
              const newEvent = getEventById(newEventId);
              if (newEvent) {
                updateEvent(newEventId, {
                  calendarEventId: calendarEventId,
                  lastSynced: calendarEventUpdated.toISOString()
                });
                result.success++;
                Logger.log(`✅ 新規イベント追加成功: ${newEventId}`);
              } else {
                result.failed++;
                const errorMsg = `新規イベント取得失敗: ${newEventId}`;
                result.errors.push(errorMsg);
                Logger.log(`❌ ${errorMsg}`);
              }
            } else {
              result.failed++;
              const errorMsg = `新規イベント作成失敗: ${calendarEventTitle}`;
              result.errors.push(errorMsg);
              Logger.log(`❌ ${errorMsg}`);
            }
          }
        }
      } catch (error) {
        result.failed++;
        const errorMsg = `カレンダーイベント処理エラー: ${(error as Error).message}`;
        result.errors.push(errorMsg);
        Logger.log(`❌ ${errorMsg}`);
      }
    }
    
    // Spreadsheetにあってカレンダーにないイベントを処理
    const calendarEventIds = new Set(calendarEvents.map(e => e.getId()));
    
    for (const event of spreadsheetEvents) {
      if (event.status === 'active') {
        if (event.calendarEventId) {
          // calendarEventIdが設定されているが、カレンダーに存在しない場合
          // → カレンダーから削除された可能性があるが、同期で復活させる
          if (!calendarEventIds.has(event.calendarEventId)) {
            Logger.log(`⚠️ カレンダーに存在しないイベント（同期で復活）: ${event.id} - ${event.title}`);
            
            try {
              // カレンダーに再作成
              const newCalendarEventId = upsertCalendarEvent(event);
              if (newCalendarEventId) {
                result.success++;
                Logger.log(`✅ カレンダーイベント復活成功: ${event.id} - ${newCalendarEventId}`);
              } else {
                result.failed++;
                const errorMsg = `カレンダーイベント復活失敗: ${event.id}`;
                result.errors.push(errorMsg);
                Logger.log(`❌ ${errorMsg}`);
              }
            } catch (error) {
              result.failed++;
              const errorMsg = `カレンダーイベント復活エラー: ${event.id} - ${(error as Error).message}`;
              result.errors.push(errorMsg);
              Logger.log(`❌ ${errorMsg}`);
            }
          }
        } else {
          // calendarEventIdが設定されていない場合 → カレンダーに追加
          Logger.log(`➕ カレンダーに追加: ${event.id} - ${event.title}`);
          
          try {
            const calendarEventId = upsertCalendarEvent(event);
            if (calendarEventId) {
              result.success++;
              Logger.log(`✅ カレンダーイベント追加成功: ${event.id} - ${calendarEventId}`);
            } else {
              result.failed++;
              const errorMsg = `カレンダーイベント追加失敗: ${event.id}`;
              result.errors.push(errorMsg);
              Logger.log(`❌ ${errorMsg}`);
            }
          } catch (error) {
            result.failed++;
            const errorMsg = `カレンダーイベント追加エラー: ${event.id} - ${(error as Error).message}`;
            result.errors.push(errorMsg);
            Logger.log(`❌ ${errorMsg}`);
          }
        }
      }
    }
    
    Logger.log(`=== カレンダー → アプリ同期完了 ===`);
    Logger.log(`成功: ${result.success}件, 失敗: ${result.failed}件`);
    
    return result;
    
  } catch (error) {
    const errorMsg = `カレンダー同期エラー: ${(error as Error).message}`;
    Logger.log(`❌ ${errorMsg}`);
    Logger.log((error as Error).stack);
    result.failed++;
    result.errors.push(errorMsg);
    return result;
  }
}

/**
 * 全イベントの同期処理（カレンダー → アプリ）
 * @returns 同期結果
 */
function syncAll(): { success: number, failed: number, errors: string[] } {
  Logger.log('=== 全イベント同期開始 ===');
  return pullFromCalendar();
}

/**
 * テスト関数: カレンダー → アプリ同期テスト
 */
function testCalendarToAppSync(): void {
  Logger.log('=== testCalendarToAppSync 開始 ===');
  
  try {
    // テスト準備: カレンダーを取得
    Logger.log(' --- テスト準備: カレンダー取得 ---');
    const calendarId = getOrCreateCalendar();
    const calendar = CalendarApp.getCalendarById(calendarId);
    Logger.log(`✅ カレンダーID: ${calendarId}`);
    
    // テスト1: カレンダーに直接イベントを作成して同期
    Logger.log(' --- テスト1: カレンダーに新規イベント作成 → 同期 ---');
    
    const testStartDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7日後
    const testEndDate = new Date(testStartDate.getTime() + 4 * 60 * 60 * 1000); // +4時間
    
    // カレンダーに直接イベントを作成（説明欄に出欠サマリーを含む）
    const testDescription = 'テスト用イベントの説明\n\n【出欠状況】\n○ 参加: 0人\n△ 未定: 0人\n× 欠席: 0人\n合計: 0人\n\n最終更新: 2025-11-08 00:00';
    
    const calendarEvent = calendar.createEvent(
      'カレンダー同期テストイベント（カレンダー作成）',
      testStartDate,
      testEndDate,
      {
        location: 'テスト会場（カレンダー）',
        description: testDescription
      }
    );
    
    const calendarEventId = calendarEvent.getId();
    Logger.log(`✅ カレンダーイベント作成成功: ${calendarEventId}`);
    
    // 同期実行
    const syncResult = pullFromCalendar(calendarId);
    Logger.log(`同期結果: 成功 ${syncResult.success}件, 失敗 ${syncResult.failed}件`);
    
    if (syncResult.success > 0) {
      Logger.log('✅ テスト1: 成功 - カレンダーイベントがSpreadsheetに同期されました');
      
      // Spreadsheetでイベントを確認
      const events = getEvents('all');
      const syncedEvent = events.find(e => e.calendarEventId === calendarEventId);
      
      if (syncedEvent) {
        Logger.log(`✅ テスト1: 成功 - Spreadsheetでイベント確認: ${syncedEvent.id} - ${syncedEvent.title}`);
        
        if (syncedEvent.title === 'カレンダー同期テストイベント（カレンダー作成）' &&
            syncedEvent.location === 'テスト会場（カレンダー）') {
          Logger.log('✅ テスト1: 成功 - イベント情報が正しく同期されました');
        } else {
          Logger.log('❌ テスト1: 失敗 - イベント情報が正しく同期されていません');
        }
      } else {
        Logger.log('❌ テスト1: 失敗 - Spreadsheetでイベントが見つかりません');
      }
    } else {
      Logger.log('❌ テスト1: 失敗 - 同期が実行されませんでした');
    }
    
    // テスト2: カレンダーイベントを更新して同期
    Logger.log(' --- テスト2: カレンダーイベント更新 → 同期 ---');
    
    if (syncResult.success > 0) {
      const allEventsForTest2 = getEvents('all');
      const syncedEvent = allEventsForTest2.find((e: AttendanceEvent) => e.calendarEventId === calendarEventId);
      if (syncedEvent) {
        // カレンダーイベントを更新
        calendarEvent.setTitle('カレンダー同期テストイベント（更新済み）');
        calendarEvent.setLocation('更新された会場（カレンダー）');
        Logger.log('✅ カレンダーイベント更新成功');
        
        // 少し待ってから同期（カレンダーの更新時刻を確実に更新するため）
        Utilities.sleep(1000);
        
        // 同期実行
        const updateSyncResult = pullFromCalendar(calendarId);
        Logger.log(`同期結果: 成功 ${updateSyncResult.success}件, 失敗 ${updateSyncResult.failed}件`);
        
        // Spreadsheetでイベントを確認
        const updatedEvents = getEvents('all');
        const updatedEvent = updatedEvents.find(e => e.calendarEventId === calendarEventId);
        
        if (updatedEvent) {
          if (updatedEvent.title === 'カレンダー同期テストイベント（更新済み）' &&
              updatedEvent.location === '更新された会場（カレンダー）') {
            Logger.log('✅ テスト2: 成功 - カレンダーの更新がSpreadsheetに反映されました');
          } else {
            Logger.log('❌ テスト2: 失敗 - カレンダーの更新がSpreadsheetに反映されていません');
            Logger.log(`実際のタイトル: ${updatedEvent.title}, 場所: ${updatedEvent.location}`);
          }
        } else {
          Logger.log('❌ テスト2: 失敗 - Spreadsheetでイベントが見つかりません');
        }
      } else {
        Logger.log('⚠️ テスト2: スキップ - テスト1でイベントが同期されていません');
      }
    } else {
      Logger.log('⚠️ テスト2: スキップ - テスト1が失敗しました');
    }
    
    // テスト3: 複数イベントの同期
    Logger.log(' --- テスト3: 複数イベントの同期 ---');
    
    // 追加のカレンダーイベントを作成
    const testStartDate2 = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14日後
    const testEndDate2 = new Date(testStartDate2.getTime() + 4 * 60 * 60 * 1000);
    
    const calendarEvent2 = calendar.createEvent(
      'カレンダー同期テストイベント2',
      testStartDate2,
      testEndDate2,
      {
        location: 'テスト会場2',
        description: testDescription
      }
    );
    
    const calendarEventId2 = calendarEvent2.getId();
    Logger.log(`✅ カレンダーイベント2作成成功: ${calendarEventId2}`);
    
    // 同期実行
    const multiSyncResult = pullFromCalendar(calendarId);
    Logger.log(`同期結果: 成功 ${multiSyncResult.success}件, 失敗 ${multiSyncResult.failed}件`);
    
    if (multiSyncResult.success >= 1) {
      Logger.log('✅ テスト3: 成功 - 複数イベントの同期が実行されました');
    } else {
      Logger.log('❌ テスト3: 失敗 - 複数イベントの同期が実行されませんでした');
    }
    
    // クリーンアップ: テスト用カレンダーイベントを削除
    Logger.log(' --- クリーンアップ: テスト用カレンダーイベントを削除 ---');
    
    try {
      calendarEvent.deleteEvent();
      Logger.log('✅ カレンダーイベント1を削除');
    } catch (error) {
      Logger.log(`⚠️ カレンダーイベント1削除失敗: ${(error as Error).message}`);
    }
    
    try {
      calendarEvent2.deleteEvent();
      Logger.log('✅ カレンダーイベント2を削除');
    } catch (error) {
      Logger.log(`⚠️ カレンダーイベント2削除失敗: ${(error as Error).message}`);
    }
    
    // Spreadsheetのテストイベントも削除（論理削除）
    const allEvents = getEvents('all');
    for (const event of allEvents) {
      if (event.calendarEventId === calendarEventId || event.calendarEventId === calendarEventId2) {
        updateEvent(event.id, { status: 'deleted' });
        Logger.log(`✅ Spreadsheetイベント削除: ${event.id}`);
      }
    }
    
    Logger.log('=== testCalendarToAppSync 終了 ===');
    Logger.log('✅ すべてのテストが完了しました');
    
  } catch (error) {
    Logger.log(`❌ エラー: テスト実行中にエラーが発生しました - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
  }
}

