/// <reference path="../types/models.ts" />

/**
 * イベント管理モジュール
 * Phase 1.3: イベントCRUD実装
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
 * @returns イベントID（成功時）、null（失敗時）
 */
function createEvent(
  title: string,
  start: string,
  end: string,
  location?: string,
  description?: string
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
    
    // カラム: id, title, start, end, location, description, calendarEventId, notesHash, status, createdAt, updatedAt, lastSynced
    sheet.appendRow([
      eventId,
      title,
      start,
      end,
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
    
    // カレンダーに同期
    try {
      const event = getEventById(eventId);
      if (event) {
        upsertCalendarEvent(event);
      }
    } catch (error) {
      Logger.log(`⚠️ カレンダー同期失敗（イベントは作成済み）: ${(error as Error).message}`);
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
 * @returns イベント配列
 */
function getEvents(filter?: 'upcoming' | 'past' | 'all'): AttendanceEvent[] {
  try {
    const sheet = getEventsSheet();
    const data = sheet.getDataRange().getValues();
    
    // ヘッダー行をスキップ
    const events: AttendanceEvent[] = [];
    const now = new Date();
    
    // 表示期間の設定を取得
    const displayStartDateStr = getConfig('DISPLAY_START_DATE', '');
    const displayEndDateStr = getConfig('DISPLAY_END_DATE', '');
    let displayStartDate: Date | null = null;
    let displayEndDate: Date | null = null;
    
    if (displayStartDateStr) {
      displayStartDate = new Date(displayStartDateStr);
      if (isNaN(displayStartDate.getTime())) {
        displayStartDate = null;
      }
    }
    
    if (displayEndDateStr) {
      displayEndDate = new Date(displayEndDateStr);
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
      if (row[8] === 'deleted') {
        continue;
      }
      
      const event: AttendanceEvent = {
        id: row[0],
        title: row[1],
        start: row[2],
        end: row[3],
        location: row[4],
        description: row[5],
        calendarEventId: row[6] || undefined,
        notesHash: row[7] || undefined,
        status: row[8],
        createdAt: row[9],
        updatedAt: row[10],
        lastSynced: row[11] || undefined
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
        if (row[8] === 'deleted') {
          Logger.log(`⚠️ イベントは削除済みです: ${eventId}`);
          return null;
        }
        
        const event: AttendanceEvent = {
          id: row[0],
          title: row[1],
          start: row[2],
          end: row[3],
          location: row[4],
          description: row[5],
          calendarEventId: row[6] || undefined,
          notesHash: row[7] || undefined,
          status: row[8],
          createdAt: row[9],
          updatedAt: row[10],
          lastSynced: row[11] || undefined
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
 * @returns 成功: true, 失敗: false
 */
function updateEvent(eventId: string, updates: Partial<AttendanceEvent>): boolean {
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
        if (row[8] === 'deleted') {
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
          updateValues.push({ col: 3, value: updates.start });
        }
        if (updates.end !== undefined) {
          updateValues.push({ col: 4, value: updates.end });
        }
        if (updates.location !== undefined) {
          updateValues.push({ col: 5, value: updates.location });
        }
        if (updates.description !== undefined) {
          updateValues.push({ col: 6, value: updates.description });
        }
        if (updates.calendarEventId !== undefined) {
          updateValues.push({ col: 7, value: updates.calendarEventId });
        }
        if (updates.notesHash !== undefined) {
          updateValues.push({ col: 8, value: updates.notesHash });
        }
        if (updates.status !== undefined) {
          updateValues.push({ col: 9, value: updates.status });
        }
        // updatedAtを自動更新
        updateValues.push({ col: 11, value: now });
        if (updates.lastSynced !== undefined) {
          updateValues.push({ col: 12, value: updates.lastSynced });
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
        
        // カレンダーに同期
        try {
          const event = getEventById(eventId);
          if (event) {
            upsertCalendarEvent(event);
          }
        } catch (error) {
          Logger.log(`⚠️ カレンダー同期失敗（イベントは更新済み）: ${(error as Error).message}`);
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
function testEventCrud() {
  Logger.log('=== testEventCrud 開始 ===');
  
  try {
    // 1. イベント作成（正常系）
    Logger.log('\n--- テスト1: イベント作成（正常系） ---');
    const eventId1 = createEvent(
      'テスト演奏会',
      '2025-12-10T14:00:00+09:00',
      '2025-12-10T17:00:00+09:00',
      '市民ホール',
      '年末の定期演奏会です'
    );
    
    if (eventId1) {
      Logger.log(`✅ テスト1: 成功 - イベントID: ${eventId1}`);
    } else {
      Logger.log('❌ テスト1: 失敗 - イベント作成に失敗しました');
      return;
    }
    
    // 2. イベント作成（異常系: 空タイトル）
    Logger.log('\n--- テスト2: イベント作成（異常系: 空タイトル） ---');
    const eventId2 = createEvent(
      '',
      '2025-12-11T14:00:00+09:00',
      '2025-12-11T17:00:00+09:00'
    );
    
    if (eventId2 === null) {
      Logger.log('✅ テスト2: 成功 - 空タイトルは正しく拒否されました');
    } else {
      Logger.log('❌ テスト2: 失敗 - 空タイトルが受理されました');
    }
    
    // 3. イベント作成（異常系: 開始日時 > 終了日時）
    Logger.log('\n--- テスト3: イベント作成（異常系: 開始日時 > 終了日時） ---');
    const eventId3 = createEvent(
      'テストイベント3',
      '2025-12-11T18:00:00+09:00',
      '2025-12-11T14:00:00+09:00'
    );
    
    if (eventId3 === null) {
      Logger.log('✅ テスト3: 成功 - 不正な日時は正しく拒否されました');
    } else {
      Logger.log('❌ テスト3: 失敗 - 不正な日時が受理されました');
    }
    
    // 4. イベント取得（全件）
    Logger.log('\n--- テスト4: イベント取得（全件） ---');
    const allEvents = getEvents('all');
    Logger.log(`取得したイベント数: ${allEvents.length}件`);
    
    if (allEvents.length > 0) {
      Logger.log(`最初のイベント: ${allEvents[0].title}`);
      Logger.log('✅ テスト4: 成功');
    } else {
      Logger.log('❌ テスト4: 失敗 - イベントが取得できませんでした');
    }
    
    // 5. イベント取得（単件）
    Logger.log('\n--- テスト5: イベント取得（単件） ---');
    const event = getEventById(eventId1);
    
    if (event && event.id === eventId1) {
      Logger.log(`イベントタイトル: ${event.title}`);
      Logger.log('✅ テスト5: 成功');
    } else {
      Logger.log('❌ テスト5: 失敗 - イベントが取得できませんでした');
    }
    
    // 6. イベント更新
    Logger.log('\n--- テスト6: イベント更新 ---');
    const updateResult = updateEvent(eventId1, {
      title: 'テスト演奏会（更新済み）',
      location: '県立文化ホール'
    });
    
    if (updateResult) {
      const updatedEvent = getEventById(eventId1);
      if (updatedEvent && updatedEvent.title === 'テスト演奏会（更新済み）') {
        Logger.log(`更新後のタイトル: ${updatedEvent.title}`);
        Logger.log(`更新後の場所: ${updatedEvent.location}`);
        Logger.log('✅ テスト6: 成功');
      } else {
        Logger.log('❌ テスト6: 失敗 - 更新内容が反映されていません');
      }
    } else {
      Logger.log('❌ テスト6: 失敗 - イベント更新に失敗しました');
    }
    
    // 7. イベント削除（論理削除）
    Logger.log('\n--- テスト7: イベント削除（論理削除） ---');
    const deleteResult = deleteEvent(eventId1);
    
    if (deleteResult) {
      const deletedEvent = getEventById(eventId1);
      if (deletedEvent === null) {
        Logger.log('✅ テスト7: 成功 - イベントは正しく削除されました');
      } else {
        Logger.log('❌ テスト7: 失敗 - 削除されたイベントが取得できてしまいました');
      }
    } else {
      Logger.log('❌ テスト7: 失敗 - イベント削除に失敗しました');
    }
    
    // 8. イベント取得（upcoming: 今後のイベント）
    Logger.log('\n--- テスト8: イベント取得（upcoming: 今後のイベント） ---');
    const eventId4 = createEvent(
      '未来のイベント',
      '2026-01-01T10:00:00+09:00',
      '2026-01-01T12:00:00+09:00'
    );
    const upcomingEvents = getEvents('upcoming');
    Logger.log(`今後のイベント数: ${upcomingEvents.length}件`);
    
    if (upcomingEvents.length > 0) {
      Logger.log('✅ テスト8: 成功');
    } else {
      Logger.log('⚠️ テスト8: 今後のイベントが0件です（テストデータによる）');
    }
    
    Logger.log('\n=== testEventCrud 終了 ===');
    Logger.log('✅ すべてのテストが完了しました');
    
  } catch (error) {
    Logger.log(`❌ エラー: テスト実行中にエラーが発生しました - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
  }
}
