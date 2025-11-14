/// <reference path="../types/models.ts" />
/// <reference path="./calendar.ts" />

// calendar.tsからエクスポートされた関数の型宣言
declare function getOrCreateCalendar(): string;
declare function upsertCalendarEvent(event: AttendanceEvent, forceCreate?: boolean): string | null;

/**
 * イベント管理モジュール
 */

/**
 * Eventsシートを取得
 * @returns Eventsシート
 */
function getEventsSheet(): GoogleAppsScript.Spreadsheet.Sheet {
  const spreadsheet = getOrCreateSpreadsheet();
  const sheet = spreadsheet.getSheetByName('Events');
  
  if (!sheet) {
    throw new Error('Eventsシートが見つかりません。initializeSpreadsheet()を実行してください。');
  }
  
  return sheet;
}

/**
 * イベントを作成
 * @param title タイトル（必須、最大100文字）
 * @param start 開始日時（ISO 8601形式）
 * @param end 終了日時（ISO 8601形式）
 * @param location 場所（オプション）
 * @param description 説明（オプション）
 * @param skipCalendarSync カレンダー同期をスキップするか（デフォルト: false）
 * @returns イベントID（成功時）、null（失敗時）
 */
function createEvent(
  title: string,
  start: string,
  end: string,
  location?: string,
  description?: string,
  skipCalendarSync: boolean = false
): string | null {
  try {
    // バリデーション
    if (!title || title.trim().length === 0) {
      Logger.log('❌ エラー: タイトルが空です');
      return null;
    }
    
    if (title.length > 100) {
      Logger.log('❌ エラー: タイトルが100文字を超えています');
      return null;
    }
    
    if (!start || !end) {
      Logger.log('❌ エラー: 開始日時または終了日時が指定されていません');
      return null;
    }
    
    // 日時の妥当性チェック
    try {
      const startDate = new Date(start);
      const endDate = new Date(end);
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        Logger.log('❌ エラー: 日時の形式が不正です（ISO 8601形式で指定してください）');
        return null;
      }
      
      if (startDate >= endDate) {
        Logger.log('❌ エラー: 開始日時が終了日時以降になっています');
        return null;
      }
    } catch (error) {
      Logger.log(`❌ エラー: 日時の解析に失敗しました - ${(error as Error).message}`);
      return null;
    }
    
    // イベント作成
    const sheet = getEventsSheet();
    const eventId = generateUuid();
    const now = new Date().toISOString();
    
    // 終日イベント判定
    const allDay = isAllDayEvent(start, end);
    
    // 終日イベントの場合、startとendを日付のみ（時刻00:00:00）に正規化
    let normalizedStart = start;
    let normalizedEnd = end;
    if (allDay) {
      const startDate = new Date(start);
      const endDate = new Date(end);
      // 日本時間（JST）で日付を取得
      const jstOffset = 9 * 60 * 60 * 1000;
      const jstStart = new Date(startDate.getTime() + jstOffset);
      const jstEnd = new Date(endDate.getTime() + jstOffset);
      // 日付のみ（時刻00:00:00 UTC）に正規化
      const startDateOnly = new Date(Date.UTC(jstStart.getUTCFullYear(), jstStart.getUTCMonth(), jstStart.getUTCDate()));
      const endDateOnly = new Date(Date.UTC(jstEnd.getUTCFullYear(), jstEnd.getUTCMonth(), jstEnd.getUTCDate()));
      normalizedStart = startDateOnly.toISOString();
      normalizedEnd = endDateOnly.toISOString();
    }
    
    // カラム: id, title, start, end, isAllDay, location, description, calendarEventId, notesHash, status, createdAt, updatedAt, lastSynced
    sheet.appendRow([
      eventId,
      title,
      normalizedStart,
      normalizedEnd,
      allDay, // isAllDay
      location || '',
      description || '',
      '', // calendarEventId
      '', // notesHash
      'active',
      now,
      now,
      '' // lastSynced
    ]);
    
    Logger.log(`✅ イベント作成成功: ${eventId} - ${title}`);
    
    // カレンダーに同期（skipCalendarSync=falseの場合のみ実行）
    // カレンダーから新規追加する場合は、skipCalendarSync=trueを渡して複製を防止
    if (!skipCalendarSync) {
      Logger.log(`🔄 カレンダー同期実行: ${eventId}`);
    try {
      const event = getEventById(eventId);
      if (event) {
          const calendarEventId = upsertCalendarEvent(event);
          if (calendarEventId) {
            Logger.log(`✅ カレンダーイベントIDを即座に設定: ${eventId} - ${calendarEventId}`);
            
            // calendarEventIdをスプレッドシートに即座に保存（複製防止のため）
            // この更新により、pullFromCalendar()の後続処理で「calendarEventId未設定」として
            // 検出されることを防ぐ
            Logger.log(`🔄 calendarEventIdをスプレッドシートに即座に保存: ${eventId}`);
            const data = sheet.getDataRange().getValues();
            for (let i = 1; i < data.length; i++) {
              if (data[i][0] === eventId) {
                const rowIndex = i + 1;
                // calendarEventId (列8) と lastSynced (列13) を更新
                const now = new Date().toISOString();
                sheet.getRange(rowIndex, 8).setValue(calendarEventId);
                sheet.getRange(rowIndex, 13).setValue(now);
                Logger.log(`✅ calendarEventIdをスプレッドシートに保存完了: ${eventId} - ${calendarEventId}`);
                break;
              }
            }
          }
      }
    } catch (error) {
      Logger.log(`⚠️ カレンダー同期失敗（イベントは作成済み）: ${(error as Error).message}`);
      }
    } else {
      Logger.log(`⏭️ カレンダー同期スキップ（skipCalendarSync=true）: ${eventId}`);
    }
    
    return eventId;
    
  } catch (error) {
    Logger.log(`❌ エラー: イベント作成失敗 - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
    return null;
  }
}

/**
 * イベント一覧を取得
 * @param filter フィルター条件（upcoming: 今後のイベント, past: 過去のイベント, all: すべて）
 * @param displayStartDateStr 表示開始日（ISO 8601形式、オプション、性能改善：Configシートの再読み込みを回避）
 * @param displayEndDateStr 表示終了日（ISO 8601形式、オプション、性能改善：Configシートの再読み込みを回避）
 * @returns イベント配列
 */
function getEvents(filter?: 'upcoming' | 'past' | 'all', displayStartDateStr?: string, displayEndDateStr?: string): AttendanceEvent[] {
  try {
    const sheet = getEventsSheet();
    const data = sheet.getDataRange().getValues();
    
    // ヘッダー行をスキップ
    const events: AttendanceEvent[] = [];
    const now = new Date();
    
    // 表示期間の設定を取得（引数で渡されていない場合はConfigシートから取得、後方互換性のため）
    let displayStartDate: Date | null = null;
    let displayEndDate: Date | null = null;
    
    // 引数で渡された場合はそれを使用（性能改善：Configシートの再読み込みを回避）
    const startStr = displayStartDateStr !== undefined ? displayStartDateStr : getConfig('DISPLAY_START_DATE', '');
    const endStr = displayEndDateStr !== undefined ? displayEndDateStr : getConfig('DISPLAY_END_DATE', '');
    
    if (startStr) {
      displayStartDate = new Date(startStr);
      if (isNaN(displayStartDate.getTime())) {
        displayStartDate = null;
      }
    }
    
    if (endStr) {
      displayEndDate = new Date(endStr);
      if (isNaN(displayEndDate.getTime())) {
        displayEndDate = null;
      }
      // 終了日の23:59:59まで含める
      if (displayEndDate) {
        displayEndDate.setHours(23, 59, 59, 999);
      }
    }
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      // status が deleted のイベントは除外
      if (row[9] === 'deleted') {
        continue;
      }
      
      // isAllDayカラムが存在することを前提とする
      // 存在しない場合はinitializeSpreadsheet()を実行してカラムを追加する必要がある
      const isAllDayValue = row[4];
      const isAllDay = isAllDayValue === true || isAllDayValue === 'TRUE' || isAllDayValue === 1 || isAllDayValue === '1' ? true : 
                      (isAllDayValue === false || isAllDayValue === 'FALSE' || isAllDayValue === 0 || isAllDayValue === '0' ? false : undefined);
      
      const event: AttendanceEvent = {
        id: row[0],
        title: row[1],
        start: row[2],
        end: row[3],
        location: row[5],
        description: row[6],
        calendarEventId: row[7] || undefined,
        notesHash: row[8] || undefined,
        status: row[9],
        createdAt: row[10],
        updatedAt: row[11],
        lastSynced: row[12] || undefined,
        isAllDay: isAllDay
      };
      
      // 表示期間フィルター適用
      if (displayStartDate || displayEndDate) {
        const eventStartDate = new Date(event.start);
        const eventEndDate = new Date(event.end);
        
        // イベントが表示期間外の場合は除外
        if (displayStartDate && eventEndDate < displayStartDate) {
          continue;
        }
        if (displayEndDate && eventStartDate > displayEndDate) {
          continue;
        }
      }
      
      // フィルター適用
      if (filter === 'upcoming') {
        const endDate = new Date(event.end);
        if (endDate < now) {
          continue;
        }
      } else if (filter === 'past') {
        const endDate = new Date(event.end);
        if (endDate >= now) {
          continue;
        }
      }
      
      events.push(event);
    }
    
    Logger.log(`✅ イベント取得成功: ${events.length}件（フィルター: ${filter || 'all'}${displayStartDate || displayEndDate ? `, 表示期間: ${displayStartDate ? displayStartDate.toISOString() : 'なし'} ～ ${displayEndDate ? displayEndDate.toISOString() : 'なし'}` : ''}）`);
    return events;
    
  } catch (error) {
    Logger.log(`❌ エラー: イベント一覧取得失敗 - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
    return [];
  }
}

/**
 * イベントIDでイベントを取得
 * @param eventId イベントID
 * @returns イベント（見つからない場合はnull）
 */
function getEventById(eventId: string): AttendanceEvent | null {
  try {
    if (!eventId) {
      Logger.log('❌ エラー: イベントIDが指定されていません');
      return null;
    }
    
    const sheet = getEventsSheet();
    const data = sheet.getDataRange().getValues();
    
    // ヘッダー行をスキップしてIDで検索
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      if (row[0] === eventId) {
        // status が deleted のイベントは除外
        if (row[9] === 'deleted') {
          Logger.log(`⚠️ イベントは削除済みです: ${eventId}`);
          return null;
        }
        
        // isAllDayカラムが存在することを前提とする
        const isAllDayValue = row[4];
        const isAllDay = isAllDayValue === true || isAllDayValue === 'TRUE' || isAllDayValue === 1 || isAllDayValue === '1' ? true : 
                        (isAllDayValue === false || isAllDayValue === 'FALSE' || isAllDayValue === 0 || isAllDayValue === '0' ? false : undefined);
        
        const event: AttendanceEvent = {
          id: row[0],
          title: row[1],
          start: row[2],
          end: row[3],
          location: row[5],
          description: row[6],
          calendarEventId: row[7] || undefined,
          notesHash: row[8] || undefined,
          status: row[9],
          createdAt: row[10],
          updatedAt: row[11],
          lastSynced: row[12] || undefined,
          isAllDay: isAllDay
        };
        
        Logger.log(`✅ イベント取得成功: ${eventId}`);
        return event;
      }
    }
    
    Logger.log(`⚠️ イベントが見つかりません: ${eventId}`);
    return null;
    
  } catch (error) {
    Logger.log(`❌ エラー: イベント取得失敗 - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
    return null;
  }
}

/**
 * イベントを更新
 * @param eventId イベントID
 * @param updates 更新データ（Partial<AttendanceEvent>）
 * @param skipCalendarSync カレンダー同期をスキップするか（デフォルト: false）
 * @returns 成功: true, 失敗: false
 */
function updateEvent(eventId: string, updates: Partial<AttendanceEvent>, skipCalendarSync: boolean = false): boolean {
  try {
    if (!eventId) {
      Logger.log('❌ エラー: イベントIDが指定されていません');
      return false;
    }
    
    const sheet = getEventsSheet();
    const data = sheet.getDataRange().getValues();
    
    // ヘッダー行をスキップしてIDで検索
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      if (row[0] === eventId) {
        // status が deleted のイベントは更新不可
        if (row[9] === 'deleted') {
          Logger.log(`❌ エラー: 削除済みのイベントは更新できません: ${eventId}`);
          return false;
        }
        
        // 更新データをマージ（カラム順: id, title, start, end, location, description, calendarEventId, notesHash, status, createdAt, updatedAt, lastSynced）
        const rowIndex = i + 1; // Sheetの行番号（1始まり）
        
        // タイトル検証
        if (updates.title !== undefined) {
          if (updates.title.length > 100) {
            Logger.log('❌ エラー: タイトルが100文字を超えています');
            return false;
          }
        }
        
        // 開始日時 < 終了日時のチェック
        const start = updates.start !== undefined ? updates.start : row[2];
        const end = updates.end !== undefined ? updates.end : row[3];
        const startDate = new Date(start);
        const endDate = new Date(end);
        
        if (startDate >= endDate) {
          Logger.log('❌ エラー: 開始日時が終了日時以降になっています');
          return false;
        }
        
        // バッチ更新: 更新が必要な列をまとめて更新（パフォーマンス最適化）
        const now = new Date().toISOString();
        const updateValues: { col: number; value: any }[] = [];
        
        if (updates.title !== undefined) {
          updateValues.push({ col: 2, value: updates.title });
        }
        if (updates.start !== undefined) {
          // 終日イベントの場合、startを日付のみに正規化
          let normalizedStart = updates.start;
          const currentIsAllDay = updates.isAllDay !== undefined ? updates.isAllDay : (row[4] === true || row[4] === 'TRUE' || row[4] === 1 || row[4] === '1');
          if (currentIsAllDay) {
            const startDate = new Date(updates.start);
            const jstOffset = 9 * 60 * 60 * 1000;
            const jstStart = new Date(startDate.getTime() + jstOffset);
            const startDateOnly = new Date(Date.UTC(jstStart.getUTCFullYear(), jstStart.getUTCMonth(), jstStart.getUTCDate()));
            normalizedStart = startDateOnly.toISOString();
          }
          updateValues.push({ col: 3, value: normalizedStart });
        }
        if (updates.end !== undefined) {
          // 終日イベントの場合、endを日付のみに正規化
          let normalizedEnd = updates.end;
          const currentIsAllDay = updates.isAllDay !== undefined ? updates.isAllDay : (row[4] === true || row[4] === 'TRUE' || row[4] === 1 || row[4] === '1');
          if (currentIsAllDay) {
            const endDate = new Date(updates.end);
            const jstOffset = 9 * 60 * 60 * 1000;
            const jstEnd = new Date(endDate.getTime() + jstOffset);
            const endDateOnly = new Date(Date.UTC(jstEnd.getUTCFullYear(), jstEnd.getUTCMonth(), jstEnd.getUTCDate()));
            normalizedEnd = endDateOnly.toISOString();
          }
          updateValues.push({ col: 4, value: normalizedEnd });
        }
        if (updates.isAllDay !== undefined) {
          updateValues.push({ col: 5, value: updates.isAllDay });
          // isAllDayがtrueに変更された場合、startとendも正規化
          if (updates.isAllDay === true) {
            const currentStart = updates.start !== undefined ? updates.start : row[2];
            const currentEnd = updates.end !== undefined ? updates.end : row[3];
            const startDate = new Date(currentStart);
            const endDate = new Date(currentEnd);
            const jstOffset = 9 * 60 * 60 * 1000;
            const jstStart = new Date(startDate.getTime() + jstOffset);
            const jstEnd = new Date(endDate.getTime() + jstOffset);
            const startDateOnly = new Date(Date.UTC(jstStart.getUTCFullYear(), jstStart.getUTCMonth(), jstStart.getUTCDate()));
            const endDateOnly = new Date(Date.UTC(jstEnd.getUTCFullYear(), jstEnd.getUTCMonth(), jstEnd.getUTCDate()));
            updateValues.push({ col: 3, value: startDateOnly.toISOString() });
            updateValues.push({ col: 4, value: endDateOnly.toISOString() });
          }
        }
        if (updates.location !== undefined) {
          updateValues.push({ col: 6, value: updates.location });
        }
        if (updates.description !== undefined) {
          updateValues.push({ col: 7, value: updates.description });
        }
        if (updates.calendarEventId !== undefined) {
          updateValues.push({ col: 8, value: updates.calendarEventId });
        }
        if (updates.notesHash !== undefined) {
          updateValues.push({ col: 9, value: updates.notesHash });
        }
        if (updates.status !== undefined) {
          updateValues.push({ col: 10, value: updates.status });
        }
        // updatedAtを自動更新
        updateValues.push({ col: 12, value: now });
        if (updates.lastSynced !== undefined) {
          updateValues.push({ col: 13, value: updates.lastSynced });
        }
        
        // バッチ更新: 可能な限りまとめて更新
        if (updateValues.length > 0) {
          // 列をソートして連続している部分をまとめて更新
          updateValues.sort((a, b) => a.col - b.col);
          
          let i = 0;
          while (i < updateValues.length) {
            let startCol = updateValues[i].col;
            let endCol = updateValues[i].col;
            const batchValues: any[] = [updateValues[i].value];
            let j = i + 1;
            
            // 連続した列を探す
            while (j < updateValues.length && updateValues[j].col === endCol + 1) {
              endCol = updateValues[j].col;
              batchValues.push(updateValues[j].value);
              j++;
            }
            
            if (batchValues.length > 1) {
              // 連続した列をまとめて更新
              sheet.getRange(rowIndex, startCol, 1, batchValues.length).setValues([batchValues]);
            } else {
              // 単一列の更新
              sheet.getRange(rowIndex, startCol).setValue(batchValues[0]);
            }
            
            i = j;
          }
        }
        
        Logger.log(`✅ イベント更新成功: ${eventId}`);
        
        // カレンダーに同期（スキップフラグがfalseの場合のみ）
        if (!skipCalendarSync) {
        try {
          const event = getEventById(eventId);
          if (event) {
            upsertCalendarEvent(event);
          }
        } catch (error) {
          Logger.log(`⚠️ カレンダー同期失敗（イベントは更新済み）: ${(error as Error).message}`);
          }
        } else {
          Logger.log(`⏭️ カレンダー同期をスキップしました: ${eventId}`);
        }
        
        return true;
      }
    }
    
    Logger.log(`❌ エラー: イベントが見つかりません: ${eventId}`);
    return false;
    
  } catch (error) {
    Logger.log(`❌ エラー: イベント更新失敗 - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
    return false;
  }
}

/**
 * イベントを削除（スプレッドシートとカレンダーの両方から削除）
 * スプレッドシートは論理削除（statusを'deleted'に変更）
 * カレンダーは物理削除
 * @param eventId イベントID
 * @returns 成功: true, 失敗: false
 */
function deleteEvent(eventId: string): boolean {
  try {
    if (!eventId) {
      Logger.log('❌ エラー: イベントIDが指定されていません');
      return false;
    }
    
    // イベント情報を取得（カレンダー削除のため）
    const event = getEventById(eventId);
    if (!event) {
      Logger.log(`❌ エラー: イベントが見つかりません: ${eventId}`);
      return false;
    }
    
    // カレンダーからも削除（calendarEventIdが設定されている場合）
    if (event.calendarEventId) {
      try {
        const calendarId = getOrCreateCalendar();
        const calendar = CalendarApp.getCalendarById(calendarId);
        
        if (calendar) {
          try {
            const calendarEvent = calendar.getEventById(event.calendarEventId);
            calendarEvent.deleteEvent();
            Logger.log(`✅ カレンダーイベント削除成功: ${event.calendarEventId}`);
          } catch (error) {
            // カレンダーイベントが見つからない場合はスキップ（既に削除済みの可能性）
            Logger.log(`⚠️ カレンダーイベントが見つかりません（既に削除済みの可能性）: ${event.calendarEventId}`);
          }
        }
      } catch (error) {
        // カレンダー削除に失敗しても、スプレッドシートの削除は続行
        Logger.log(`⚠️ カレンダー削除失敗（スプレッドシートの削除は続行）: ${(error as Error).message}`);
      }
    }
    
    // スプレッドシートから論理削除（statusを'deleted'に変更）
    const result = updateEvent(eventId, { status: 'deleted' });
    
    if (result) {
      Logger.log(`✅ イベント削除成功（スプレッドシート: 論理削除, カレンダー: 物理削除）: ${eventId}`);
    } else {
      Logger.log(`❌ イベント削除失敗: ${eventId}`);
    }
    
    return result;
    
  } catch (error) {
    Logger.log(`❌ エラー: イベント削除失敗 - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
    return false;
  }
}

/**
 * テスト関数: イベントCRUD操作
 */

/**
 * 既存イベントのisAllDayフラグを一括設定
 * すべてのイベントに対して終日判定を行い、isAllDayフラグを設定します
 * @returns 処理結果（更新件数、エラー数など）
 */
function batchUpdateIsAllDayFlags(): { 
  total: number; 
  updated: number; 
  skipped: number; 
  errors: string[];
} {
  Logger.log('=== isAllDayフラグ一括設定開始 ===');
  
  const result = {
    total: 0,
    updated: 0,
    skipped: 0,
    errors: [] as string[]
  };
  
  try {
    // すべてのイベントを取得
    const events = getEvents('all');
    result.total = events.length;
    
    Logger.log(`📋 処理対象イベント数: ${result.total}件`);
    
    for (const event of events) {
      try {
        // 既にisAllDayフラグが設定されている場合はスキップ
        if (event.isAllDay !== undefined) {
          result.skipped++;
          Logger.log(`⏭️ スキップ: ${event.id} - ${event.title} (既にisAllDayが設定済み: ${event.isAllDay})`);
          continue;
        }
        
        // 終日イベント判定
        const isAllDay = isAllDayEvent(event.start, event.end);
        
        // フラグを更新
        const updateResult = updateEvent(event.id, { isAllDay: isAllDay });
        
        if (updateResult) {
          result.updated++;
          Logger.log(`✅ 更新: ${event.id} - ${event.title} (isAllDay: ${isAllDay})`);
        } else {
          result.errors.push(`更新失敗: ${event.id} - ${event.title}`);
          Logger.log(`❌ 更新失敗: ${event.id} - ${event.title}`);
        }
      } catch (error) {
        result.errors.push(`エラー: ${event.id} - ${event.title} - ${(error as Error).message}`);
        Logger.log(`❌ エラー: ${event.id} - ${event.title} - ${(error as Error).message}`);
      }
    }
    
    Logger.log(`\n=== isAllDayフラグ一括設定完了 ===`);
    Logger.log(`📊 処理結果:`);
    Logger.log(`  総数: ${result.total}件`);
    Logger.log(`  更新: ${result.updated}件`);
    Logger.log(`  スキップ: ${result.skipped}件`);
    Logger.log(`  エラー: ${result.errors.length}件`);
    
    if (result.errors.length > 0) {
      Logger.log(`\n❌ エラー詳細:`);
      result.errors.forEach((error, index) => {
        Logger.log(`  ${index + 1}. ${error}`);
      });
    }
    
  } catch (error) {
    Logger.log(`❌ エラー: 一括設定処理中にエラーが発生しました - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
    result.errors.push(`一括処理エラー: ${(error as Error).message}`);
  }
  
  return result;
}
