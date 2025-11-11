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
    Logger.log(`🔄 upsertCalendarEvent開始: ${event.id} - ${event.title} (calendarEventId: ${event.calendarEventId || '未設定'})`);
    
    if (!event || !event.id) {
      Logger.log('❌ エラー: イベントデータが不正です');
      return null;
    }
    
    const calendarId = getOrCreateCalendar();
    Logger.log(`📅 カレンダーID: ${calendarId}`);
    const calendar = CalendarApp.getCalendarById(calendarId);
    
    if (!calendar) {
      Logger.log(`❌ エラー: カレンダーが見つかりません: ${calendarId}`);
      return null;
    }
    
    const startDate = new Date(event.start);
    const endDate = new Date(event.end);
    Logger.log(`📅 イベント日時: ${startDate.toISOString()} ～ ${endDate.toISOString()}`);
    
    // 終日イベントかどうかを判定（フラグが保存されている場合はそれを使用、未設定の場合は計算）
    let isAllDay: boolean;
    let startDateOnly: Date | null = null;
    if (event.isAllDay !== undefined) {
      // フラグが保存されている場合はそれを使用
      isAllDay = event.isAllDay;
      Logger.log(`📅 終日イベントフラグ使用: ${isAllDay ? '終日' : '時間指定'}`);
      // 終日イベントの場合は日付のみを取得
      if (isAllDay) {
        const jstOffset = 9 * 60 * 60 * 1000;
        const jstStart = new Date(startDate.getTime() + jstOffset);
        startDateOnly = new Date(Date.UTC(jstStart.getUTCFullYear(), jstStart.getUTCMonth(), jstStart.getUTCDate()));
      }
    } else {
      // フラグが未設定の場合は計算（既存データの互換性のため）
      isAllDay = isAllDayEvent(event.start, event.end);
      Logger.log(`📅 終日イベント判定（計算）: ${isAllDay ? '終日' : '時間指定'}`);
      // 計算結果を直接スプレッドシートに保存（無限ループ防止：updateEventを呼ばない）
      try {
        const sheet = getEventsSheet();
        const data = sheet.getDataRange().getValues();
        for (let i = 1; i < data.length; i++) {
          if (data[i][0] === event.id) {
            const rowIndex = i + 1;
            // isAllDayカラム（列5）を更新
            sheet.getRange(rowIndex, 5).setValue(isAllDay);
            Logger.log(`✅ isAllDayフラグを直接更新: ${event.id} - ${isAllDay}`);
            break;
          }
        }
      } catch (error) {
        Logger.log(`⚠️ isAllDayフラグ更新失敗（処理は続行）: ${(error as Error).message}`);
      }
      // 終日イベントの場合は日付のみを取得
      if (isAllDay) {
        const jstOffset = 9 * 60 * 60 * 1000;
        const jstStart = new Date(startDate.getTime() + jstOffset);
        startDateOnly = new Date(Date.UTC(jstStart.getUTCFullYear(), jstStart.getUTCMonth(), jstStart.getUTCDate()));
      }
    }
    
    // 説明文を生成（出欠サマリーを含む）
    const description = buildDescription(event.id);
    Logger.log(`📝 説明文生成完了: ${description.length}文字`);
    
    // 説明文のハッシュを計算
    const notesHash = computeHash(description);
    Logger.log(`🔐 notesHash: ${notesHash}`);
    
    // 既存のカレンダーイベントIDがあるか確認
    let calendarEvent: GoogleAppsScript.Calendar.CalendarEvent | null = null;
    let eventFoundInCalendar = false;
    
    if (event.calendarEventId) {
      Logger.log(`🔍 [検索開始] 既存カレンダーイベントを検索: ${event.calendarEventId}`);
      Logger.log(`🔍 [検索詳細] イベントID: ${event.id}, タイトル: ${event.title}`);
      try {
        calendarEvent = calendar.getEventById(event.calendarEventId);
        eventFoundInCalendar = true;
        Logger.log(`✅ [検索成功] 既存カレンダーイベントが見つかりました: ${event.calendarEventId}`);
        Logger.log(`✅ [検索詳細] タイトル: ${calendarEvent.getTitle()}, 開始: ${calendarEvent.getStartTime().toISOString()}`);
      } catch (error) {
        Logger.log(`⚠️ [検索失敗] 既存のカレンダーイベントが見つかりません: ${event.calendarEventId}`);
        Logger.log(`⚠️ [エラー詳細] ${(error as Error).message}`);
        Logger.log(`⚠️ [エラースタック] ${(error as Error).stack}`);
        // 既存イベントが見つからない場合は新規作成
        Logger.log(`➕ [次の処理] 新規カレンダーイベントを作成します`);
      }
    } else {
      Logger.log(`➕ [未設定] calendarEventIdが未設定のため、新規カレンダーイベントを作成します`);
    }
    
    Logger.log(`📊 [検索結果] calendarEvent is ${calendarEvent ? 'not null' : 'null'}, eventFoundInCalendar: ${eventFoundInCalendar}`);
    
    if (calendarEvent) {
      // 既存イベントを更新
      // カレンダーイベントの現在の値を取得
      const currentTitle = calendarEvent.getTitle();
      const currentStart = calendarEvent.getStartTime();
      const currentEnd = calendarEvent.getEndTime();
      const currentLocation = calendarEvent.getLocation() || '';
      const isCurrentAllDay = calendarEvent.isAllDayEvent();
      
      Logger.log(`📅 既存イベント情報: 終日=${isCurrentAllDay}, 開始=${currentStart.toISOString()}, 終了=${currentEnd.toISOString()}`);
      
      // タイトル、日時、場所が変更されているか確認
      const titleChanged = currentTitle !== event.title;
      // 終日イベントの場合は時間比較を調整
      let timeChanged = false;
      if (isCurrentAllDay && isAllDay && startDateOnly) {
        // 両方とも終日イベントの場合、日付のみ比較
        const currentStartDate = new Date(currentStart.getFullYear(), currentStart.getMonth(), currentStart.getDate());
        const newStartDate = new Date(startDateOnly);
        timeChanged = currentStartDate.getTime() !== newStartDate.getTime();
        Logger.log(`📅 終日イベントの日付比較: ${currentStartDate.toISOString()} vs ${newStartDate.toISOString()}`);
      } else if (!isCurrentAllDay && !isAllDay) {
        // 両方とも時間指定イベントの場合、時刻も比較
        timeChanged = currentStart.getTime() !== startDate.getTime() || 
                     currentEnd.getTime() !== endDate.getTime();
      } else {
        // 終日と時間指定が異なる場合は変更あり
        timeChanged = true;
        Logger.log(`📅 終日/時間指定のタイプが変更: ${isCurrentAllDay} → ${isAllDay}`);
      }
      const locationChanged = currentLocation !== (event.location || '');
      
      // 説明文のハッシュが同じで、かつタイトル・日時・場所も同じ場合は更新をスキップ（無限ループ防止）
      if (event.notesHash === notesHash && !titleChanged && !timeChanged && !locationChanged) {
        Logger.log(`✅ カレンダーイベント更新スキップ（変更なし）: ${event.id}`);
        return event.calendarEventId || null;
      }
      
      // 終日と時間指定のタイプが異なる場合は、既存イベントを削除して新規作成
      if ((isCurrentAllDay && !isAllDay) || (!isCurrentAllDay && isAllDay)) {
        Logger.log(`🔄 終日/時間指定のタイプが変更されるため、既存イベントを削除して再作成`);
        try {
          calendarEvent.deleteEvent();
          calendarEvent = null; // 新規作成処理に進む
        } catch (error) {
          Logger.log(`⚠️ 既存イベント削除エラー: ${(error as Error).message}`);
        }
      } else {
        // 同じタイプ（終日または時間指定）の場合は直接更新
        if (titleChanged) {
          calendarEvent.setTitle(event.title);
        }
        if (timeChanged) {
          if (isAllDay && startDateOnly) {
            // 終日イベントの場合は日付のみ設定
            calendarEvent.setAllDayDate(startDateOnly);
          } else {
            calendarEvent.setTime(startDate, endDate);
          }
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
      }
      // calendarEventがnullの場合は、後続の新規作成処理に進む
    }
    
    // 新規イベントを作成（calendarEventがnullの場合、または既存イベントを削除した場合）
    Logger.log(`➕ [作成開始] カレンダーイベント作成中: ${event.title}`);
    Logger.log(`➕ [作成詳細] イベントID: ${event.id}`);
    Logger.log(`➕ [作成詳細] 日時: ${startDate.toISOString()} ～ ${endDate.toISOString()}`);
    Logger.log(`➕ [作成詳細] 終日判定: ${isAllDay ? '終日' : '時間指定'}`);
    Logger.log(`➕ [作成詳細] 場所: ${event.location || '未設定'}`);
    
    try {
      let newCalendarEvent: GoogleAppsScript.Calendar.CalendarEvent;
      
      if (isAllDay && startDateOnly) {
        // 終日イベントとして作成
        Logger.log(`📅 [終日作成] 終日イベントとして作成: ${startDateOnly.toISOString()}`);
        Logger.log(`📅 [終日作成] calendar.createAllDayEvent呼び出し開始`);
        newCalendarEvent = calendar.createAllDayEvent(
          event.title,
          startDateOnly,
          {
            location: event.location || '',
            description: description
          }
        );
        Logger.log(`📅 [終日作成] calendar.createAllDayEvent呼び出し完了`);
      } else {
        // 時間指定イベントとして作成
        Logger.log(`📅 [時間作成] 時間指定イベントとして作成`);
        Logger.log(`📅 [時間作成] calendar.createEvent呼び出し開始`);
        newCalendarEvent = calendar.createEvent(
          event.title,
          startDate,
          endDate,
          {
            location: event.location || '',
            description: description
          }
        );
        Logger.log(`📅 [時間作成] calendar.createEvent呼び出し完了`);
      }
      
      const newCalendarEventId = newCalendarEvent.getId();
      Logger.log(`✅ [作成成功] カレンダーイベント作成成功`);
      Logger.log(`✅ [作成成功] イベントID: ${event.id}`);
      Logger.log(`✅ [作成成功] カレンダーイベントID: ${newCalendarEventId}`);
      Logger.log(`✅ [作成成功] タイプ: ${isAllDay ? '終日' : '時間指定'}`);
      
      // EventsシートのcalendarEventIdとnotesHashを更新
      Logger.log(`🔄 [シート更新] スプレッドシートのcalendarEventIdを更新開始`);
      Logger.log(`🔄 [シート更新] イベントID: ${event.id}, カレンダーイベントID: ${newCalendarEventId}`);
      updateEventCalendarInfo(event.id, newCalendarEventId, notesHash);
      Logger.log(`🔄 [シート更新] スプレッドシートのcalendarEventIdを更新完了`);
      
      Logger.log(`✅ [完了] upsertCalendarEvent完了: ${event.id} - ${newCalendarEventId}`);
      return newCalendarEventId;
    } catch (error) {
      Logger.log(`❌ [エラー] カレンダーイベント作成エラー: ${event.id}`);
      Logger.log(`❌ [エラー詳細] ${(error as Error).message}`);
      Logger.log(`❌ [エラースタック] ${(error as Error).stack}`);
      throw error;
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
      // 終日イベントの場合は日付のみを使用
      let titleDateKey: string;
      if (event.isAllDay) {
        const eventStart = new Date(event.start);
        const dateOnly = `${eventStart.getFullYear()}-${String(eventStart.getMonth() + 1).padStart(2, '0')}-${String(eventStart.getDate()).padStart(2, '0')}`;
        titleDateKey = `${event.title}|${dateOnly}`;
      } else {
        titleDateKey = `${event.title}|${event.start}`;
      }
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
        // ただし、カレンダーに直接追加したイベントも同期できるようにするため、
        // 「【出欠状況】」マーカーがない場合でも、タイトルと日時で既存イベントとマッチする場合は処理する
        const isAppCreated = calendarEventDescription.includes('【出欠状況】');
        
        // アプリで作成されていないイベントの場合、タイトルと日時で既存イベントをチェック
        if (!isAppCreated) {
          // 終日イベントの場合は日付のみを使用
          const isCalendarEventAllDay = calendarEvent.isAllDayEvent();
          let titleDateKey: string;
          if (isCalendarEventAllDay) {
            const dateOnly = `${calendarEventStart.getFullYear()}-${String(calendarEventStart.getMonth() + 1).padStart(2, '0')}-${String(calendarEventStart.getDate()).padStart(2, '0')}`;
            titleDateKey = `${calendarEventTitle}|${dateOnly}`;
          } else {
            titleDateKey = `${calendarEventTitle}|${calendarEventStart.toISOString()}`;
          }
          const existingEventByTitle = spreadsheetEventByTitleAndDateMap.get(titleDateKey);
          
          if (existingEventByTitle) {
            // タイトルと日時が一致する既存イベントがある場合、calendarEventIdを設定して同期
            Logger.log(`🔄 カレンダーイベントを既存イベントに紐付け: ${existingEventByTitle.id} - ${calendarEventTitle}`);
            
            const updateResult = updateEvent(existingEventByTitle.id, {
              calendarEventId: calendarEventId,
              lastSynced: calendarEventUpdated.toISOString()
            }, true); // skipCalendarSync: true（カレンダー同期をスキップ）
            
            if (updateResult) {
              result.success++;
              Logger.log(`✅ カレンダーイベント紐付け成功: ${existingEventByTitle.id}`);
            } else {
              result.failed++;
              const errorMsg = `カレンダーイベント紐付け失敗: ${existingEventByTitle.id}`;
              result.errors.push(errorMsg);
              Logger.log(`❌ ${errorMsg}`);
            }
            continue;
          } else {
            // 既存イベントがない場合、より厳密な重複チェックを行う
            // タイトル、開始日時、終了日時、場所がすべて一致するイベントを検索
            // 終日イベントの場合は日付のみで比較
            const isCalendarEventAllDay = calendarEvent.isAllDayEvent();
            const duplicateEventByAllFields = spreadsheetEvents.find(event => {
              if (event.status !== 'active') return false;
              const eventStart = new Date(event.start);
              const eventEnd = new Date(event.end);
              
              // タイトルと場所の一致をチェック
              if (event.title !== calendarEventTitle || (event.location || '') !== calendarEventLocation) {
                return false;
              }
              
              // 終日イベントの場合は日付のみで比較
              if (isCalendarEventAllDay && event.isAllDay) {
                // 日付のみを比較（時刻部分を無視）
                const eventStartDate = new Date(eventStart.getFullYear(), eventStart.getMonth(), eventStart.getDate());
                const eventEndDate = new Date(eventEnd.getFullYear(), eventEnd.getMonth(), eventEnd.getDate());
                const calendarStartDate = new Date(calendarEventStart.getFullYear(), calendarEventStart.getMonth(), calendarEventStart.getDate());
                const calendarEndDate = new Date(calendarEventEnd.getFullYear(), calendarEventEnd.getMonth(), calendarEventEnd.getDate());
                return eventStartDate.getTime() === calendarStartDate.getTime() &&
                       eventEndDate.getTime() === calendarEndDate.getTime();
              } else if (!isCalendarEventAllDay && !event.isAllDay) {
                // 時間指定イベントの場合は時刻も含めて比較
                return eventStart.getTime() === calendarEventStart.getTime() &&
                       eventEnd.getTime() === calendarEventEnd.getTime();
              } else {
                // 終日と時間指定が異なる場合は一致しない
                return false;
              }
            });
            
            if (duplicateEventByAllFields) {
              // 完全一致するイベントが既に存在する場合、calendarEventIdを設定してスキップ
              Logger.log(`🔄 完全一致する既存イベントを発見: ${duplicateEventByAllFields.id} - ${calendarEventTitle}`);
              
              if (!duplicateEventByAllFields.calendarEventId) {
                // calendarEventIdが未設定の場合は設定
                const updateResult = updateEvent(duplicateEventByAllFields.id, {
                  calendarEventId: calendarEventId,
                  lastSynced: calendarEventUpdated.toISOString()
                }, true); // skipCalendarSync: true（カレンダー同期をスキップ）
                
                if (updateResult) {
                  result.success++;
                  Logger.log(`✅ calendarEventId設定成功（重複防止）: ${duplicateEventByAllFields.id}`);
                } else {
                  result.failed++;
                  const errorMsg = `calendarEventId設定失敗: ${duplicateEventByAllFields.id}`;
                  result.errors.push(errorMsg);
                  Logger.log(`❌ ${errorMsg}`);
                }
              } else {
                // calendarEventIdが既に設定されている場合はスキップ
                // ただし、lastSyncedが未設定または古い場合は更新する
                const lastSynced = duplicateEventByAllFields.lastSynced ? new Date(duplicateEventByAllFields.lastSynced) : new Date(0);
                if (!duplicateEventByAllFields.lastSynced || calendarEventUpdated.getTime() > lastSynced.getTime()) {
                  Logger.log(`🔄 lastSyncedを更新: ${duplicateEventByAllFields.id}`);
                  const updateResult = updateEvent(duplicateEventByAllFields.id, {
                    lastSynced: calendarEventUpdated.toISOString()
                  }, true); // skipCalendarSync: true（カレンダー同期をスキップ）
                  
                  if (updateResult) {
                    result.success++;
                    Logger.log(`✅ lastSynced更新成功: ${duplicateEventByAllFields.id}`);
                  } else {
                    result.failed++;
                    const errorMsg = `lastSynced更新失敗: ${duplicateEventByAllFields.id}`;
                    result.errors.push(errorMsg);
                    Logger.log(`❌ ${errorMsg}`);
                  }
                } else {
                  Logger.log(`⏭️ スキップ: 完全一致する既存イベントにcalendarEventIdが既に設定済み - ${duplicateEventByAllFields.id}`);
                  result.success++;
                }
              }
              continue;
            }
            
            // 既存イベントがない場合、新規イベントとして追加
            Logger.log(`➕ カレンダーイベントを新規イベントとして追加: ${calendarEventTitle}`);
            
            // 説明欄から出欠サマリーを除去してdescriptionとして保存
            let description = calendarEventDescription;
            
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
                }, true); // skipCalendarSync: true（カレンダー同期をスキップ）
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
            continue;
          }
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
            }, true); // skipCalendarSync: true（カレンダー同期をスキップ）
            
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
            // ただし、lastSyncedが未設定の場合は更新する（次回の同期で再度処理されないようにするため）
            if (!existingEvent.lastSynced) {
              Logger.log(`🔄 lastSyncedが未設定のため更新: ${existingEvent.id}`);
              const updateResult = updateEvent(existingEvent.id, {
                lastSynced: calendarEventUpdated.toISOString()
              }, true); // skipCalendarSync: true（カレンダー同期をスキップ）
              
              if (updateResult) {
                result.success++;
                Logger.log(`✅ lastSynced更新成功: ${existingEvent.id}`);
              } else {
                result.failed++;
                const errorMsg = `lastSynced更新失敗: ${existingEvent.id}`;
                result.errors.push(errorMsg);
                Logger.log(`❌ ${errorMsg}`);
              }
            } else {
              Logger.log(`⏭️ スキップ: Spreadsheetの方が新しい - ${existingEvent.id}`);
              result.success++; // スキップも成功としてカウント
            }
          }
        } else {
          // calendarEventIdで見つからなかった場合、タイトルと日時で重複チェック
          // 終日イベントの場合は日付のみを使用
          const isCalendarEventAllDay = calendarEvent.isAllDayEvent();
          let titleDateKey: string;
          if (isCalendarEventAllDay) {
            const dateOnly = `${calendarEventStart.getFullYear()}-${String(calendarEventStart.getMonth() + 1).padStart(2, '0')}-${String(calendarEventStart.getDate()).padStart(2, '0')}`;
            titleDateKey = `${calendarEventTitle}|${dateOnly}`;
          } else {
            titleDateKey = `${calendarEventTitle}|${calendarEventStart.toISOString()}`;
          }
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
              }, true); // skipCalendarSync: true（カレンダー同期をスキップ）
              
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
                }, true); // skipCalendarSync: true（カレンダー同期をスキップ）
                
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
              // ただし、lastSyncedが未設定または古い場合は更新する
              const lastSynced = duplicateEvent.lastSynced ? new Date(duplicateEvent.lastSynced) : new Date(0);
              if (!duplicateEvent.lastSynced || calendarEventUpdated.getTime() > lastSynced.getTime()) {
                Logger.log(`🔄 lastSyncedを更新: ${duplicateEvent.id}`);
                const updateResult = updateEvent(duplicateEvent.id, {
                  lastSynced: calendarEventUpdated.toISOString()
                }, true); // skipCalendarSync: true（カレンダー同期をスキップ）
                
                if (updateResult) {
                  result.success++;
                  Logger.log(`✅ lastSynced更新成功: ${duplicateEvent.id}`);
                } else {
                  result.failed++;
                  const errorMsg = `lastSynced更新失敗: ${duplicateEvent.id}`;
                  result.errors.push(errorMsg);
                  Logger.log(`❌ ${errorMsg}`);
                }
              } else {
                Logger.log(`⏭️ スキップ: 既に処理済み - ${duplicateEvent.id}`);
                result.success++;
              }
            }
          } else {
            // 新規イベントを追加する前に、より厳密な重複チェックを行う
            // タイトル、開始日時、終了日時、場所がすべて一致するイベントを検索
            // 終日イベントの場合は日付のみで比較
            const isCalendarEventAllDay = calendarEvent.isAllDayEvent();
            const duplicateEventByAllFields = spreadsheetEvents.find(event => {
              if (event.status !== 'active') return false;
              const eventStart = new Date(event.start);
              const eventEnd = new Date(event.end);
              
              // タイトルと場所の一致をチェック
              if (event.title !== calendarEventTitle || (event.location || '') !== calendarEventLocation) {
                return false;
              }
              
              // 終日イベントの場合は日付のみで比較
              if (isCalendarEventAllDay && event.isAllDay) {
                // 日付のみを比較（時刻部分を無視）
                const eventStartDate = new Date(eventStart.getFullYear(), eventStart.getMonth(), eventStart.getDate());
                const eventEndDate = new Date(eventEnd.getFullYear(), eventEnd.getMonth(), eventEnd.getDate());
                const calendarStartDate = new Date(calendarEventStart.getFullYear(), calendarEventStart.getMonth(), calendarEventStart.getDate());
                const calendarEndDate = new Date(calendarEventEnd.getFullYear(), calendarEventEnd.getMonth(), calendarEventEnd.getDate());
                return eventStartDate.getTime() === calendarStartDate.getTime() &&
                       eventEndDate.getTime() === calendarEndDate.getTime();
              } else if (!isCalendarEventAllDay && !event.isAllDay) {
                // 時間指定イベントの場合は時刻も含めて比較
                return eventStart.getTime() === calendarEventStart.getTime() &&
                       eventEnd.getTime() === calendarEventEnd.getTime();
              } else {
                // 終日と時間指定が異なる場合は一致しない
                return false;
              }
            });
            
            if (duplicateEventByAllFields) {
              // 完全一致するイベントが既に存在する場合、calendarEventIdを設定してスキップ
              Logger.log(`🔄 完全一致する既存イベントを発見: ${duplicateEventByAllFields.id} - ${calendarEventTitle}`);
              
              if (!duplicateEventByAllFields.calendarEventId) {
                // calendarEventIdが未設定の場合は設定
                const updateResult = updateEvent(duplicateEventByAllFields.id, {
                  calendarEventId: calendarEventId,
                  lastSynced: calendarEventUpdated.toISOString()
                }, true); // skipCalendarSync: true（カレンダー同期をスキップ）
                
                if (updateResult) {
                  result.success++;
                  Logger.log(`✅ calendarEventId設定成功（重複防止）: ${duplicateEventByAllFields.id}`);
                } else {
                  result.failed++;
                  const errorMsg = `calendarEventId設定失敗: ${duplicateEventByAllFields.id}`;
                  result.errors.push(errorMsg);
                  Logger.log(`❌ ${errorMsg}`);
                }
              } else {
                // calendarEventIdが既に設定されている場合はスキップ
                // ただし、lastSyncedが未設定または古い場合は更新する
                const lastSynced = duplicateEventByAllFields.lastSynced ? new Date(duplicateEventByAllFields.lastSynced) : new Date(0);
                if (!duplicateEventByAllFields.lastSynced || calendarEventUpdated.getTime() > lastSynced.getTime()) {
                  Logger.log(`🔄 lastSyncedを更新: ${duplicateEventByAllFields.id}`);
                  const updateResult = updateEvent(duplicateEventByAllFields.id, {
                    lastSynced: calendarEventUpdated.toISOString()
                  }, true); // skipCalendarSync: true（カレンダー同期をスキップ）
                  
                  if (updateResult) {
                    result.success++;
                    Logger.log(`✅ lastSynced更新成功: ${duplicateEventByAllFields.id}`);
                  } else {
                    result.failed++;
                    const errorMsg = `lastSynced更新失敗: ${duplicateEventByAllFields.id}`;
                    result.errors.push(errorMsg);
                    Logger.log(`❌ ${errorMsg}`);
                  }
                } else {
                  Logger.log(`⏭️ スキップ: 完全一致する既存イベントにcalendarEventIdが既に設定済み - ${duplicateEventByAllFields.id}`);
                  result.success++;
                }
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
                  }, true); // skipCalendarSync: true（カレンダー同期をスキップ）
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
        }
      } catch (error) {
        result.failed++;
        const errorMsg = `カレンダーイベント処理エラー: ${(error as Error).message}`;
        result.errors.push(errorMsg);
        Logger.log(`❌ ${errorMsg}`);
      }
    }
    
    // Spreadsheetにあってカレンダーにないイベントを処理
    // カレンダーイベント処理中に新規イベントが追加された可能性があるため、
    // カレンダーから最新のイベントリストを再取得する
    Logger.log(`📋 カレンダーに登録されていないイベントをチェック開始`);
    const nowForRevive = new Date();
    const startDateForRevive = new Date(nowForRevive.getTime() - 30 * 24 * 60 * 60 * 1000); // 30日前
    const endDateForRevive = new Date(nowForRevive.getTime() + 365 * 24 * 60 * 60 * 1000); // 1年後
    const calendarEventsForRevive = calendar.getEvents(startDateForRevive, endDateForRevive);
    Logger.log(`📋 復活チェック用カレンダーイベント取得: ${calendarEventsForRevive.length}件`);
    
    // カレンダーイベントIDのSetを構築（最新の状態を反映）
    const calendarEventIds = new Set<string>();
    for (const calendarEvent of calendarEventsForRevive) {
      try {
        const id = calendarEvent.getId();
        calendarEventIds.add(id);
      } catch (error) {
        Logger.log(`⚠️ カレンダーイベントID取得エラー: ${(error as Error).message}`);
      }
    }
    
    // Spreadsheetのイベントも再取得（カレンダーイベント処理中に新規追加された可能性があるため）
    const spreadsheetEventsForRevive = getEvents('all');
    Logger.log(`📋 カレンダーに登録されていないイベントをチェック: Spreadsheetイベント ${spreadsheetEventsForRevive.length}件, カレンダーイベント ${calendarEventsForRevive.length}件, カレンダーイベントID ${calendarEventIds.size}件`);
    
    let eventsToRevive = 0;
    let eventsChecked = 0;
    let eventsSkippedDueToExistingId = 0;
    
    Logger.log(`🔍 復活処理詳細チェック開始`);
    for (const event of spreadsheetEventsForRevive) {
      eventsChecked++;
      Logger.log(`🔍 [${eventsChecked}/${spreadsheetEventsForRevive.length}] イベントチェック: ${event.id} - ${event.title} (status: ${event.status}, calendarEventId: ${event.calendarEventId || '未設定'})`);
      
      if (event.status === 'active') {
        if (event.calendarEventId) {
          // calendarEventIdが設定されているが、カレンダーに存在しない場合
          // → カレンダーから削除された可能性があるが、同期で復活させる
          const existsInCalendar = calendarEventIds.has(event.calendarEventId);
          Logger.log(`🔍 calendarEventId存在チェック: ${event.calendarEventId} → ${existsInCalendar ? '存在する' : '存在しない'}`);
          
          if (!existsInCalendar) {
            eventsToRevive++;
            Logger.log(`⚠️ [復活対象 ${eventsToRevive}] カレンダーに存在しないイベント（同期で復活）: ${event.id} - ${event.title} (calendarEventId: ${event.calendarEventId})`);
            Logger.log(`📅 イベント詳細: start=${event.start}, end=${event.end}, isAllDay=${event.isAllDay}, location=${event.location || '未設定'}`);
            
            try {
              // カレンダーに再作成
              Logger.log(`🔄 カレンダーイベント復活処理開始: ${event.id}`);
              Logger.log(`🔄 upsertCalendarEvent呼び出し前の状態: calendarEventId=${event.calendarEventId}`);
              
              const newCalendarEventId = upsertCalendarEvent(event);
              
              Logger.log(`🔄 upsertCalendarEvent呼び出し後: 返り値=${newCalendarEventId || 'null'}`);
              
              if (newCalendarEventId) {
                result.success++;
                Logger.log(`✅ カレンダーイベント復活成功: ${event.id} - ${newCalendarEventId}`);
                
                // 新しいcalendarEventIdが返された場合、更新する
                if (newCalendarEventId !== event.calendarEventId) {
                  Logger.log(`🔄 calendarEventIdを更新: ${event.calendarEventId} → ${newCalendarEventId}`);
                  updateEvent(event.id, {
                    calendarEventId: newCalendarEventId
                  }, true); // skipCalendarSync: true（カレンダー同期をスキップ）
                } else {
                  Logger.log(`ℹ️ calendarEventIdは変更なし: ${newCalendarEventId}`);
                }
              } else {
                result.failed++;
                const errorMsg = `カレンダーイベント復活失敗: ${event.id} - upsertCalendarEventがnullを返しました`;
                result.errors.push(errorMsg);
                Logger.log(`❌ ${errorMsg}`);
              }
            } catch (error) {
              result.failed++;
              const errorMsg = `カレンダーイベント復活エラー: ${event.id} - ${(error as Error).message}`;
              result.errors.push(errorMsg);
              Logger.log(`❌ ${errorMsg}`);
              Logger.log((error as Error).stack);
            }
          } else {
            eventsSkippedDueToExistingId++;
            Logger.log(`✅ カレンダーイベント存在確認（スキップ）: ${event.id} - ${event.title} (calendarEventId: ${event.calendarEventId})`);
          }
        } else {
          // calendarEventIdが設定されていない場合 → カレンダーに追加
          Logger.log(`➕ カレンダーに追加: ${event.id} - ${event.title} (status: ${event.status})`);
          
          // statusがactiveでない場合はスキップ（既にチェック済みだが念のため）
          if (event.status !== 'active') {
            Logger.log(`⏭️ スキップ: statusがactiveでない - ${event.id} (status: ${event.status})`);
            continue;
          }
          
          try {
            const calendarEventId = upsertCalendarEvent(event);
            if (calendarEventId) {
              result.success++;
              Logger.log(`✅ カレンダーイベント追加成功: ${event.id} - ${calendarEventId}`);
            } else {
              result.failed++;
              const errorMsg = `カレンダーイベント追加失敗: ${event.id} - ${event.title} (upsertCalendarEventがnullを返しました)`;
              result.errors.push(errorMsg);
              Logger.log(`❌ ${errorMsg}`);
            }
          } catch (error) {
            result.failed++;
            const errorMsg = `カレンダーイベント追加エラー: ${event.id} - ${(error as Error).message}`;
            result.errors.push(errorMsg);
            Logger.log(`❌ ${errorMsg}`);
            Logger.log((error as Error).stack);
          }
        }
      } else {
        Logger.log(`⏭️ スキップ: statusがactiveでない - ${event.id} (status: ${event.status || 'undefined'})`);
      }
    }
    
    Logger.log(`📋 復活処理チェック完了サマリー:`);
    Logger.log(`  - チェックしたイベント総数: ${eventsChecked}件`);
    Logger.log(`  - 復活対象として検出: ${eventsToRevive}件`);
    Logger.log(`  - カレンダーに存在するためスキップ: ${eventsSkippedDueToExistingId}件`);
    Logger.log(`📋 カレンダー同期チェック完了: 復活対象 ${eventsToRevive}件`);
    Logger.log(`=== カレンダー → アプリ同期完了 ===`);
    Logger.log(`成功: ${result.success}件, 失敗: ${result.failed}件`);
    if (result.errors.length > 0) {
      Logger.log(`エラー詳細: ${result.errors.join('; ')}`);
    }
    
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

