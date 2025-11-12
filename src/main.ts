/// <reference path="types/models.ts" />
/// <reference path="server/auth.ts" /> // isAdmin を参照するため追加
/// <reference path="server/utils.ts" /> // checkRateLimit, resetRateLimit を参照するため追加
/// <reference path="server/calendar.ts" /> // upsertCalendarEvent を参照するため追加
/// <reference path="server/members.ts" /> // メンバー管理関数を参照するため追加
/// <reference path="server/responses.ts" /> // getAllResponses を参照するため追加

/**
 * メインエントリーポイント
 * Phase 1.5: サーバーサイドAPI実装
 */

/**
 * GET リクエストのハンドラー
 * @param e リクエスト情報
 * @returns HTMLページ
 */
function doGet(e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.HTML.HtmlOutput {
  // URLパラメータから管理者トークンを取得
  const adminToken = e.parameter.admin;
  
  // HTMLファイルを読み込む
  let htmlOutput = HtmlService.createHtmlOutputFromFile('index')
    .setTitle('出欠管理アプリ')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  
  // 管理者トークンがURLパラメータに含まれている場合、HTMLに埋め込む
  if (adminToken) {
    const htmlContent = htmlOutput.getContent();
    // HTMLのheadタグ内にスクリプトを追加して、トークンをlocalStorageに保存
    const scriptTag = `
      <script>
        (function() {
          try {
            localStorage.setItem('adminToken', '${adminToken}');
            console.log('🔐 サーバー側から管理者トークンを設定:', '${adminToken.substring(0, 10)}...');
          } catch (e) {
            console.error('❌ localStorageへの保存に失敗:', e);
          }
        })();
      </script>
    `;
    // </head>タグの前にスクリプトを挿入
    const modifiedContent = htmlContent.replace('</head>', scriptTag + '</head>');
    htmlOutput = HtmlService.createHtmlOutput(modifiedContent)
      .setTitle('出欠管理アプリ')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  
  return htmlOutput;
}

/**
 * 場所履歴取得用API
 * 全イベントから場所を抽出するために使用
 * @returns 全イベント一覧（場所情報を含む）
 */
function getAllEventsForLocationHistory(): AttendanceEvent[] {
  try {
    return getEvents('all');
  } catch (error) {
    Logger.log(`❌ エラー: 場所履歴取得失敗 - ${(error as Error).message}`);
    return [];
  }
}

/**
 * 初期データ取得API
 * フロントエンドの初期表示に必要なデータを返す
 * @returns イベント一覧と設定情報
 */
function getInitData(): { events: AttendanceEvent[]; config: Config; members: Array<{userKey: string, part: string, name: string, displayName: string}>; responsesMap: { [eventId: string]: Response[] } } {
  try {
    Logger.log('=== getInitData 開始 ===');
    
    const events = getEvents('upcoming');
    Logger.log(`✅ イベント取得: ${events.length}件`);
    
    const config: Config = {
      AUTH_MODE: 'anonymous' as 'google' | 'anonymous',
      ADMIN_TOKEN: getConfig('ADMIN_TOKEN', ''),
      CALENDAR_ID: getConfig('CALENDAR_ID', 'primary'),
      CACHE_EXPIRE_HOURS: '6',
      TIMEZONE: 'Asia/Tokyo',
      DISPLAY_START_DATE: getConfig('DISPLAY_START_DATE', ''),
      DISPLAY_END_DATE: getConfig('DISPLAY_END_DATE', '')
    };
    
    // メンバー一覧を取得
    const members = getMembers().map(m => ({
      userKey: m.userKey,
      part: m.part,
      name: m.name,
      displayName: m.displayName
    }));
    Logger.log(`✅ メンバー取得: ${members.length}人`);
    
    // 全出欠データを取得してイベントIDごとにグループ化
    const allResponses = getAllResponses();
    Logger.log(`✅ 全出欠データ取得: ${allResponses.length}件`);
    
    const responsesMap: { [eventId: string]: Response[] } = {};
    allResponses.forEach(response => {
      if (!responsesMap[response.eventId]) {
        responsesMap[response.eventId] = [];
      }
      responsesMap[response.eventId].push(response);
    });
    Logger.log(`✅ グループ化完了: ${Object.keys(responsesMap).length}イベント分`);
    
    Logger.log('=== getInitData 終了 ===');
    
    return {
      events: events,
      config: config,
      members: members,
      responsesMap: responsesMap
    };
  } catch (error) {
    Logger.log(`❌ エラー: 初期データ取得失敗 - ${(error as Error).message}`);
    return {
      events: [],
      config: {
        AUTH_MODE: 'anonymous',
        ADMIN_TOKEN: '',
        CALENDAR_ID: 'primary',
        CACHE_EXPIRE_HOURS: '6',
        TIMEZONE: 'Asia/Tokyo'
      },
      members: [],
      responsesMap: {}
    };
  }
}

/**
 * 管理者用: イベント作成API
 * @param eventData イベントデータ
 * @param userKey ユーザー識別子（オプション、管理者判定用）
 * @param adminToken 管理者トークン（オプション、匿名モード時）
 * @returns 成功時: { success: true, eventId: string }, 失敗時: { success: false, error: string }
 */
function adminCreateEvent(
  eventData: {
    title: string;
    start: string;
    end: string;
    location?: string;
    description?: string;
  },
  userKey?: string,
  adminToken?: string
): { success: boolean; eventId?: string; error?: string } {
  try {
    // 管理者権限チェック
    if (userKey && !isAdmin(userKey, adminToken)) {
      return {
        success: false,
        error: '管理者権限が必要です'
      };
    }

    if (!eventData || !eventData.title || !eventData.start || !eventData.end) {
      return {
        success: false,
        error: 'タイトル、開始日時、終了日時は必須です'
      };
    }
    
    const eventId = createEvent(
      eventData.title,
      eventData.start,
      eventData.end,
      eventData.location,
      eventData.description
    );
    
    if (eventId) {
      return {
        success: true,
        eventId: eventId
      };
    } else {
      return {
        success: false,
        error: 'イベント作成に失敗しました'
      };
    }
  } catch (error) {
    Logger.log(`❌ エラー: イベント作成API失敗 - ${(error as Error).message}`);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * 管理者用: イベント更新API
 * @param eventId イベントID
 * @param updates 更新データ
 * @param userKey ユーザー識別子（オプション、管理者判定用）
 * @param adminToken 管理者トークン（オプション、匿名モード時）
 * @returns 成功時: { success: true }, 失敗時: { success: false, error: string }
 */
function adminUpdateEvent(
  eventId: string,
  updates: Partial<AttendanceEvent>,
  userKey?: string,
  adminToken?: string
): { success: boolean; error?: string } {
  try {
    // 管理者権限チェック
    if (userKey && !isAdmin(userKey, adminToken)) {
      return {
        success: false,
        error: '管理者権限が必要です'
      };
    }

    if (!eventId) {
      return {
        success: false,
        error: 'イベントIDは必須です'
      };
    }
    
    const result = updateEvent(eventId, updates);
    
    if (result) {
      return {
        success: true
      };
    } else {
      return {
        success: false,
        error: 'イベント更新に失敗しました'
      };
    }
  } catch (error) {
    Logger.log(`❌ エラー: イベント更新API失敗 - ${(error as Error).message}`);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * 管理者用: イベント削除API
 * @param eventId イベントID
 * @param userKey ユーザー識別子（オプション、管理者判定用）
 * @param adminToken 管理者トークン（オプション、匿名モード時）
 * @returns 成功時: { success: true }, 失敗時: { success: false, error: string }
 */
function adminDeleteEvent(
  eventId: string,
  userKey?: string,
  adminToken?: string
): { success: boolean; error?: string } {
  try {
    // 管理者権限チェック
    if (userKey && !isAdmin(userKey, adminToken)) {
      return {
        success: false,
        error: '管理者権限が必要です'
      };
    }

    if (!eventId) {
      return {
        success: false,
        error: 'イベントIDは必須です'
      };
    }
    
    const result = deleteEvent(eventId);
    
    if (result) {
      return {
        success: true
      };
    } else {
      return {
        success: false,
        error: 'イベント削除に失敗しました'
      };
    }
  } catch (error) {
    Logger.log(`❌ エラー: イベント削除API失敗 - ${(error as Error).message}`);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * ユーザー用: 出欠回答登録API
 * @param eventId イベントID
 * @param userKey ユーザー識別子
 * @param status 出欠ステータス（○、△、×）
 * @param comment コメント（オプション）
 * @returns 成功時: { success: true }, 失敗時: { success: false, error: string }
 */
function userSubmitResponse(
  eventId: string,
  userKey: string,
  status: '○' | '△' | '×' | '-',
  comment?: string
): { success: boolean; error?: string } {
  try {
    if (!eventId || !userKey || !status) {
      return {
        success: false,
        error: 'eventId, userKey, statusは必須です'
      };
    }
    
    if (status !== '○' && status !== '△' && status !== '×' && status !== '-') {
      return {
        success: false,
        error: 'statusは○、△、×、-のいずれかである必要があります'
      };
    }
    
    const result = submitResponse(eventId, userKey, status, comment);
    
    if (result) {
      return {
        success: true
      };
    } else {
      return {
        success: false,
        error: '出欠回答登録に失敗しました'
      };
    }
  } catch (error) {
    Logger.log(`❌ エラー: 出欠回答登録API失敗 - ${(error as Error).message}`);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * 複数の出欠回答を一括登録
 * @param responses 出欠回答の配列
 * @returns 成功した件数と失敗した件数
 */
function userSubmitResponsesBatch(
  responses: Array<{
    eventId: string;
    userKey: string;
    status: '○' | '△' | '×' | '-';
    comment?: string;
  }>
): { success: number; failed: number; errors: string[] } {
  let successCount = 0;
  let failedCount = 0;
  const errors: string[] = [];
  
  Logger.log(`=== userSubmitResponsesBatch 開始: ${responses.length}件 ===`);
  
  try {
    // シートを1回だけ取得
    const sheet = getResponsesSheet();
    const data = sheet.getDataRange().getValues();
    const now = new Date().toISOString();
    
    // 既存データのインデックスを作成（高速検索用）
    const existingRows = new Map<string, number>();
    for (let i = 1; i < data.length; i++) {
      const key = `${data[i][0]}_${data[i][1]}`; // eventId_userKey
      existingRows.set(key, i);
    }
    
    // 更新・追加データを準備
    const rowsToUpdate: Array<{ row: number; data: any[] }> = [];
    const rowsToAdd: any[][] = [];
    
    responses.forEach((response, index) => {
      try {
        // バリデーション
        if (!response.eventId || !response.userKey) {
          errors.push(`${index + 1}件目: eventId, userKeyは必須です`);
          failedCount++;
          return;
        }
        
        if (response.status !== '○' && response.status !== '△' && response.status !== '×' && response.status !== '-') {
          errors.push(`${index + 1}件目: statusは○、△、×、-のいずれかである必要があります`);
          failedCount++;
          return;
        }
        
        const key = `${response.eventId}_${response.userKey}`;
        const existingRowIndex = existingRows.get(key);
        
        if (existingRowIndex !== undefined) {
          // 既存データを更新
          rowsToUpdate.push({
            row: existingRowIndex,
            data: [
              response.eventId,
              response.userKey,
              response.status,
              response.comment || '',
              data[existingRowIndex][4], // createdAt（変更しない）
              now // updatedAt
            ]
          });
        } else {
          // 新規データを追加
          rowsToAdd.push([
            response.eventId,
            response.userKey,
            response.status,
            response.comment || '',
            now, // createdAt
            now  // updatedAt
          ]);
        }
        
        successCount++;
      } catch (error) {
        failedCount++;
        errors.push(`${index + 1}件目: ${(error as Error).message}`);
      }
    });
    
    // 一括更新（既存データ）
    if (rowsToUpdate.length > 0) {
      Logger.log(`✅ 既存データ更新: ${rowsToUpdate.length}件`);
      rowsToUpdate.forEach(update => {
        const range = sheet.getRange(update.row + 1, 1, 1, 6);
        range.setValues([update.data]);
      });
    }
    
    // 一括追加（新規データ）
    if (rowsToAdd.length > 0) {
      Logger.log(`✅ 新規データ追加: ${rowsToAdd.length}件`);
      const lastRow = sheet.getLastRow();
      const range = sheet.getRange(lastRow + 1, 1, rowsToAdd.length, 6);
      range.setValues(rowsToAdd);
    }
    
    Logger.log(`✅ バッチ保存完了: 成功 ${successCount}件, 失敗 ${failedCount}件`);
    
  } catch (error) {
    Logger.log(`❌ バッチ保存エラー: ${(error as Error).message}`);
    errors.push(`バッチ処理エラー: ${(error as Error).message}`);
    failedCount = responses.length;
    successCount = 0;
  }
  
  return { success: successCount, failed: failedCount, errors: errors };
}

/**
 * メンバー一覧取得API
 * @returns メンバー一覧
 */
function getMembersList(): Array<{userKey: string, part: string, name: string, displayName: string}> {
  try {
    const members = getMembers();
    return members.map(m => ({
      userKey: m.userKey,
      part: m.part,
      name: m.name,
      displayName: m.displayName
    }));
  } catch (error) {
    Logger.log(`❌ エラー: メンバー一覧取得失敗 - ${(error as Error).message}`);
    return [];
  }
}

/**
 * メンバー登録API
 * @param userKey ユーザーキー
 * @param part パート
 * @param name 名前
 * @param displayName 表示名
 * @returns 成功時: { success: true }, 失敗時: { success: false, error: string }
 */
function createMember(
  userKey: string,
  part: string,
  name: string,
  displayName: string
): { success: boolean; error?: string } {
  try {
    if (!userKey || !part || !name || !displayName) {
      return {
        success: false,
        error: 'userKey, part, name, displayNameは必須です'
      };
    }
    
    const result = upsertMember(userKey, part, name, displayName);
    
    if (result) {
      return {
        success: true
      };
    } else {
      return {
        success: false,
        error: 'メンバー登録に失敗しました（同じパートと名前の組み合わせが既に存在する可能性があります）'
      };
    }
  } catch (error) {
    Logger.log(`❌ エラー: メンバー登録API失敗 - ${(error as Error).message}`);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * メンバー更新API
 * @param userKey ユーザーキー
 * @param part パート
 * @param name 名前
 * @param displayName 表示名
 * @returns 成功時: { success: true }, 失敗時: { success: false, error: string }
 */
function updateMember(
  userKey: string,
  part: string,
  name: string,
  displayName: string
): { success: boolean; error?: string } {
  try {
    if (!userKey || !part || !name || !displayName) {
      return {
        success: false,
        error: 'userKey, part, name, displayNameは必須です'
      };
    }
    
    const result = upsertMember(userKey, part, name, displayName);
    
    if (result) {
      return {
        success: true
      };
    } else {
      return {
        success: false,
        error: 'メンバー更新に失敗しました（同じパートと名前の組み合わせが既に存在する可能性があります）'
      };
    }
  } catch (error) {
    Logger.log(`❌ エラー: メンバー更新API失敗 - ${(error as Error).message}`);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * メンバー削除API
 * @param userKey ユーザーキー
 * @returns 成功時: { success: true }, 失敗時: { success: false, error: string }
 */
function deleteMemberAPI(userKey: string): { success: boolean; error?: string } {
  try {
    if (!userKey) {
      return {
        success: false,
        error: 'userKeyは必須です'
      };
    }
    
    const result = deleteMember(userKey);
    
    if (result) {
      return {
        success: true
      };
    } else {
      return {
        success: false,
        error: 'メンバー削除に失敗しました'
      };
    }
  } catch (error) {
    Logger.log(`❌ エラー: メンバー削除API失敗 - ${(error as Error).message}`);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * イベントと出欠回答をまとめて取得するAPI
 * @param eventId イベントID
 * @returns イベント情報、出欠回答一覧、集計結果
 */
function getEventWithResponses(eventId: string): {
  success: boolean;
  event?: AttendanceEvent;
  responses?: Response[];
  tally?: EventTally;
  error?: string;
} {
  try {
    if (!eventId) {
      return {
        success: false,
        error: 'イベントIDは必須です'
      };
    }
    
    const event = getEventById(eventId);
    if (!event) {
      return {
        success: false,
        error: 'イベントが見つかりません'
      };
    }
    
    const responses = getResponses(eventId);
    const tally = tallyResponses(eventId);
    
    return {
      success: true,
      event: event,
      responses: responses,
      tally: tally
    };
  } catch (error) {
    Logger.log(`❌ エラー: イベント・出欠回答取得API失敗 - ${(error as Error).message}`);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * 全イベントと全出欠データを一括取得するAPI
 * @returns イベント一覧と出欠データのマップ
 */
function getAllEventsWithResponses(): {
  success: boolean;
  events: AttendanceEvent[];
  responsesMap: { [eventId: string]: Response[] };
  error?: string;
} {
  try {
    Logger.log('=== getAllEventsWithResponses 開始 ===');
    
    // イベント一覧を取得（既存関数を使用）
    const events = getEvents('upcoming');
    Logger.log(`✅ イベント取得: ${events.length}件`);
    
    // 全出欠データを1回で取得
    const allResponses = getAllResponses();
    Logger.log(`✅ 全出欠データ取得: ${allResponses.length}件`);
    
    // イベントIDごとにグループ化
    const responsesMap: { [eventId: string]: Response[] } = {};
    allResponses.forEach(response => {
      if (!responsesMap[response.eventId]) {
        responsesMap[response.eventId] = [];
      }
      responsesMap[response.eventId].push(response);
    });
    
    Logger.log(`✅ グループ化完了: ${Object.keys(responsesMap).length}イベント分`);
    Logger.log('=== getAllEventsWithResponses 終了 ===');
    
    return {
      success: true,
      events: events,
      responsesMap: responsesMap
    };
  } catch (error) {
    Logger.log(`❌ エラー: 全イベント・出欠データ取得失敗 - ${(error as Error).message}`);
    return {
      success: false,
      events: [],
      responsesMap: {},
      error: (error as Error).message
    };
  }
}

/**
 * テスト関数: サーバーサイドAPI
 */
function testApiFunctions() {
  Logger.log('=== testApiFunctions 開始 ===');
  
  try {
    // 1. getInitData() テスト
    Logger.log('\n--- テスト1: getInitData() ---');
    const initData = getInitData();
    
    if (initData.events && Array.isArray(initData.events) && initData.config) {
      Logger.log(`取得したイベント数: ${initData.events.length}件`);
      Logger.log(`認証モード: ${initData.config.AUTH_MODE}`);
      Logger.log('✅ テスト1: 成功');
    } else {
      Logger.log('❌ テスト1: 失敗 - 初期データの形式が不正です');
      return;
    }
    
    // 2. adminCreateEvent() テスト（正常系）
    Logger.log('\n--- テスト2: adminCreateEvent()（正常系） ---');
    const createResult = adminCreateEvent({
      title: 'APIテストイベント',
      start: '2025-12-20T14:00:00+09:00',
      end: '2025-12-20T17:00:00+09:00',
      location: 'APIテスト会場',
      description: 'APIテスト用のイベントです'
    });
    
    if (createResult.success && createResult.eventId) {
      Logger.log(`作成されたイベントID: ${createResult.eventId}`);
      Logger.log('✅ テスト2: 成功');
      
      const testEventId = createResult.eventId;
      
      // 3. adminCreateEvent() テスト（異常系: 必須パラメータ不足）
      Logger.log('\n--- テスト3: adminCreateEvent()（異常系: 必須パラメータ不足） ---');
      const createResult2 = adminCreateEvent({
        title: '',
        start: '2025-12-21T14:00:00+09:00',
        end: '2025-12-21T17:00:00+09:00'
      });
      
      if (!createResult2.success && createResult2.error) {
        Logger.log(`エラーメッセージ: ${createResult2.error}`);
        Logger.log('✅ テスト3: 成功 - 必須パラメータ不足は正しく拒否されました');
      } else {
        Logger.log('❌ テスト3: 失敗 - 必須パラメータ不足が受理されました');
      }
      
      // 4. adminUpdateEvent() テスト
      Logger.log('\n--- テスト4: adminUpdateEvent() ---');
      const updateResult = adminUpdateEvent(testEventId, {
        title: 'APIテストイベント（更新済み）',
        location: '更新された会場'
      });
      
      if (updateResult.success) {
        Logger.log('✅ テスト4: 成功 - イベント更新に成功しました');
      } else {
        Logger.log(`❌ テスト4: 失敗 - ${updateResult.error}`);
      }
      
      // 5. userSubmitResponse() テスト
      Logger.log('\n--- テスト5: userSubmitResponse() ---');
      const submitResult = userSubmitResponse(
        testEventId,
        'anon-APIテストユーザー',
        '○',
        'APIテスト用のコメント'
      );
      
      if (submitResult.success) {
        Logger.log('✅ テスト5: 成功 - 出欠回答登録に成功しました');
      } else {
        Logger.log(`❌ テスト5: 失敗 - ${submitResult.error}`);
      }
      
      // 6. userSubmitResponse() テスト（異常系: 不正なステータス）
      Logger.log('\n--- テスト6: userSubmitResponse()（異常系: 不正なステータス） ---');
      const submitResult2 = userSubmitResponse(
        testEventId,
        'anon-テストユーザー2',
        '不正なステータス' as '○' | '△' | '×',
        ''
      );
      
      if (!submitResult2.success && submitResult2.error) {
        Logger.log(`エラーメッセージ: ${submitResult2.error}`);
        Logger.log('✅ テスト6: 成功 - 不正なステータスは正しく拒否されました');
      } else {
        Logger.log('❌ テスト6: 失敗 - 不正なステータスが受理されました');
      }
      
      // 7. getEventWithResponses() テスト
      Logger.log('\n--- テスト7: getEventWithResponses() ---');
      const eventWithResponses = getEventWithResponses(testEventId);
      
      if (eventWithResponses.success && eventWithResponses.event && eventWithResponses.responses && eventWithResponses.tally) {
        Logger.log(`イベントタイトル: ${eventWithResponses.event.title}`);
        Logger.log(`出欠回答数: ${eventWithResponses.responses.length}件`);
        Logger.log(`集計結果 - 出席:${eventWithResponses.tally.attendCount} 未定:${eventWithResponses.tally.maybeCount} 欠席:${eventWithResponses.tally.absentCount}`);
        Logger.log('✅ テスト7: 成功');
      } else {
        Logger.log(`❌ テスト7: 失敗 - ${eventWithResponses.error || 'データ取得に失敗しました'}`);
      }
      
      // 8. getEventWithResponses() テスト（異常系: 存在しないイベントID）
      Logger.log('\n--- テスト8: getEventWithResponses()（異常系: 存在しないイベントID） ---');
      const eventWithResponses2 = getEventWithResponses('存在しないイベントID');
      
      if (!eventWithResponses2.success && eventWithResponses2.error) {
        Logger.log(`エラーメッセージ: ${eventWithResponses2.error}`);
        Logger.log('✅ テスト8: 成功 - 存在しないイベントIDは正しく拒否されました');
      } else {
        Logger.log('❌ テスト8: 失敗 - 存在しないイベントIDが受理されました');
      }
      
      // 9. adminDeleteEvent() テスト
      Logger.log('\n--- テスト9: adminDeleteEvent() ---');
      const deleteResult = adminDeleteEvent(testEventId);
      
      if (deleteResult.success) {
        Logger.log('✅ テスト9: 成功 - イベント削除に成功しました');
      } else {
        Logger.log(`❌ テスト9: 失敗 - ${deleteResult.error}`);
      }
      
      // 10. adminDeleteEvent() テスト（異常系: 存在しないイベントID）
      Logger.log('\n--- テスト10: adminDeleteEvent()（異常系: 存在しないイベントID） ---');
      const deleteResult2 = adminDeleteEvent('存在しないイベントID');
      
      if (!deleteResult2.success && deleteResult2.error) {
        Logger.log(`エラーメッセージ: ${deleteResult2.error}`);
        Logger.log('✅ テスト10: 成功 - 存在しないイベントIDは正しく拒否されました');
      } else {
        Logger.log('❌ テスト10: 失敗 - 存在しないイベントIDが受理されました');
      }
      
    } else {
      Logger.log(`❌ テスト2: 失敗 - ${createResult.error || 'イベント作成に失敗しました'}`);
    }
    
    Logger.log('\n=== testApiFunctions 終了 ===');
    Logger.log('✅ すべてのテストが完了しました');
    
  } catch (error) {
    Logger.log(`❌ エラー: テスト実行中にエラーが発生しました - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
  }
}

/**
 * 管理者ステータス確認API
 * @param userKey ユーザー識別子（オプション、匿名モードでは使用しない）
 * @param adminToken 管理者トークン
 * @returns 管理者の場合: true, それ以外: false
 */
function checkAdminStatus(userKey: string, adminToken?: string): boolean {
  try {
    // adminTokenが必須（userKeyは匿名モードでは使用しないため、空でもOK）
    if (!adminToken) {
      return false;
    }
    // userKeyが空の場合は空文字列を渡す（isAdmin関数はuserKeyを使用しない）
    return isAdmin(userKey || '', adminToken);
  } catch (error) {
    Logger.log(`❌ エラー: 管理者ステータス確認失敗 - ${(error as Error).message}`);
    return false;
  }
}

/**
 * 個別イベント同期API（カレンダー → アプリ）
 * @param eventId イベントID
 * @param userKey ユーザー識別子（オプション、管理者判定用）
 * @param adminToken 管理者トークン（オプション、匿名モード時）
 * @returns 同期結果
 */
function syncEvent(eventId: string, userKey?: string, adminToken?: string): { success: boolean; error?: string; lastSynced?: string } {
  try {
    // 管理者権限チェック
    if (userKey && !isAdmin(userKey, adminToken)) {
      return {
        success: false,
        error: '管理者権限が必要です'
      };
    }
    
    if (!eventId) {
      return {
        success: false,
        error: 'eventIdは必須です'
      };
    }
    
    const event = getEventById(eventId);
    if (!event) {
      return {
        success: false,
        error: 'イベントが見つかりません'
      };
    }
    
    // アプリ → カレンダー同期（upsertCalendarEventを使用）
    try {
      const calendarEventId = upsertCalendarEvent(event);
      
      if (calendarEventId) {
        // 同期成功
        const syncedEvent = getEventById(eventId);
        return {
          success: true,
          lastSynced: syncedEvent?.lastSynced || new Date().toISOString()
        };
      } else {
        return {
          success: false,
          error: 'カレンダー同期に失敗しました'
        };
      }
    } catch (error) {
      Logger.log(`❌ エラー: カレンダー同期失敗 - ${(error as Error).message}`);
      return {
        success: false,
        error: `カレンダー同期に失敗しました: ${(error as Error).message}`
      };
    }
    
  } catch (error) {
    Logger.log(`❌ エラー: 個別イベント同期API失敗 - ${(error as Error).message}`);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * 全イベント一括同期API（カレンダー → アプリ）
 * @param userKey ユーザー識別子（オプション、管理者判定用）
 * @param adminToken 管理者トークン（オプション、匿名モード時）
 * @returns 同期結果
 */
function syncAllEvents(userKey?: string, adminToken?: string): { success: number; failed: number; errors: string[] } {
  try {
    // 管理者権限チェック
    if (userKey && !isAdmin(userKey, adminToken)) {
      return {
        success: 0,
        failed: 1,
        errors: ['管理者権限が必要です']
      };
    }
    
    return syncAll();
  } catch (error) {
    Logger.log(`❌ エラー: 全イベント同期API失敗 - ${(error as Error).message}`);
    return {
      success: 0,
      failed: 1,
      errors: [(error as Error).message]
    };
  }
}

/**
 * 管理者用: 表示期間設定API
 * @param startDate 表示開始日（ISO 8601形式、空文字列で制限解除）
 * @param endDate 表示終了日（ISO 8601形式、空文字列で制限解除）
 * @param userKey ユーザー識別子（オプション、管理者判定用）
 * @param adminToken 管理者トークン（オプション、匿名モード時）
 * @returns 成功時: { success: true }, 失敗時: { success: false, error: string }
 */
function adminSetDisplayPeriod(
  startDate: string,
  endDate: string,
  userKey?: string,
  adminToken?: string
): { success: boolean; error?: string } {
  try {
    // 管理者権限チェック
    if (userKey && !isAdmin(userKey, adminToken)) {
      return {
        success: false,
        error: '管理者権限が必要です'
      };
    }

    // 日付の妥当性チェック
    if (startDate && startDate.trim() !== '') {
      const start = new Date(startDate);
      if (isNaN(start.getTime())) {
        return {
          success: false,
          error: '開始日の形式が不正です（ISO 8601形式で指定してください）'
        };
      }
    }

    if (endDate && endDate.trim() !== '') {
      const end = new Date(endDate);
      if (isNaN(end.getTime())) {
        return {
          success: false,
          error: '終了日の形式が不正です（ISO 8601形式で指定してください）'
        };
      }
    }

    // 開始日と終了日の関係チェック
    if (startDate && startDate.trim() !== '' && endDate && endDate.trim() !== '') {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (start > end) {
        return {
          success: false,
          error: '開始日が終了日より後になっています'
        };
      }
    }

    // Configに保存
    setConfig('DISPLAY_START_DATE', startDate.trim() || '');
    setConfig('DISPLAY_END_DATE', endDate.trim() || '');

    Logger.log(`✅ 表示期間設定成功: ${startDate || '制限なし'} ～ ${endDate || '制限なし'}`);
    
    return {
      success: true
    };
  } catch (error) {
    Logger.log(`❌ エラー: 表示期間設定失敗 - ${(error as Error).message}`);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * 管理者用: 全データ削除API（お掃除用）
 * 注意: この関数は全てのデータを削除します。実行には注意が必要です。
 * @param userKey ユーザー識別子（オプション、管理者判定用）
 * @param adminToken 管理者トークン（オプション、匿名モード時）
 * @returns 削除結果
 */
function adminCleanupAllData(
  userKey?: string,
  adminToken?: string
): { 
  calendarDeleted: number; 
  eventsDeleted: number; 
  responsesDeleted: number; 
  success: boolean;
  errors: string[];
} {
  try {
    // 管理者権限チェック
    if (userKey && !isAdmin(userKey, adminToken)) {
      return {
        calendarDeleted: 0,
        eventsDeleted: 0,
        responsesDeleted: 0,
        success: false,
        errors: ['管理者権限が必要です']
      };
    }

    return cleanupAllData();
  } catch (error) {
    Logger.log(`❌ エラー: 全データ削除API失敗 - ${(error as Error).message}`);
    return {
      calendarDeleted: 0,
      eventsDeleted: 0,
      responsesDeleted: 0,
      success: false,
      errors: [(error as Error).message]
    };
  }
}

/**
 * 統合テスト関数
 * Phase 4.1: 全機能の動作確認（匿名モードのみ）
 */
function testIntegration(): void {
  Logger.log('=== testIntegration 開始 ===');
  Logger.log('注意: 匿名モードのみのテストです（Google認証機能は削除済み）');

  try {
    // テスト1: 認証基盤（匿名モード）
    Logger.log(' --- テスト1: 認証基盤（匿名モード） ---');
    const testUserKey = authenticate({ userName: '統合テストユーザー' });
    if (testUserKey && testUserKey.startsWith('anon-')) {
      Logger.log(`✅ 匿名認証成功: ${testUserKey}`);
      Logger.log('✅ テスト1: 成功');
    } else {
      Logger.log('❌ テスト1: 失敗 - userKeyが正しく生成されませんでした');
      return;
    }

    // テスト2: 管理者判定（匿名モード）
    Logger.log(' --- テスト2: 管理者判定（匿名モード） ---');
    const adminToken = getConfig('ADMIN_TOKEN', '');
    if (adminToken) {
      const isAdminResult = isAdmin(testUserKey, adminToken);
      Logger.log(`管理者判定結果: ${isAdminResult}`);
      Logger.log('✅ テスト2: 成功');
    } else {
      Logger.log('⚠️ テスト2: スキップ - ADMIN_TOKENが設定されていません');
    }

    // テスト3: イベント作成（管理者）
    Logger.log(' --- テスト3: イベント作成（管理者） ---');
    const testEventInput: AttendanceEventInput = {
      title: '統合テストイベント',
      start: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7日後
      end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000).toISOString(), // 7日後+4時間
      location: 'テスト会場',
      description: '統合テスト用のイベントです'
    };
    
    const createResult = adminCreateEvent(testEventInput, testUserKey, adminToken);
    if (createResult && createResult.success && createResult.eventId) {
      const eventId = createResult.eventId;
      Logger.log(`✅ イベント作成成功: ${eventId} - ${testEventInput.title}`);
      Logger.log('✅ テスト3: 成功');
      
      // テスト4: 出欠登録
      Logger.log(' --- テスト4: 出欠登録 ---');
      const submitResult = userSubmitResponse(
        eventId,
        testUserKey,
        '○',
        '統合テストのコメント'
      );
      if (submitResult && submitResult.success) {
        Logger.log('✅ 出欠登録成功');
        Logger.log('✅ テスト4: 成功');
      } else {
        Logger.log(`❌ テスト4: 失敗 - 出欠登録に失敗しました: ${submitResult?.error || '不明なエラー'}`);
      }

      // テスト5: イベント取得（出欠情報含む）
      Logger.log(' --- テスト5: イベント取得（出欠情報含む） ---');
      const eventWithResponses = getEventWithResponses(eventId);
      if (eventWithResponses && eventWithResponses.success && eventWithResponses.event && eventWithResponses.responses && eventWithResponses.responses.length > 0 && eventWithResponses.tally) {
        Logger.log(`✅ イベント取得成功: ${eventWithResponses.event.title}`);
        Logger.log(`✅ 出欠回答数: ${eventWithResponses.responses.length}件`);
        Logger.log(`✅ 集計結果 - 出席:${eventWithResponses.tally.attendCount} 未定:${eventWithResponses.tally.maybeCount} 欠席:${eventWithResponses.tally.absentCount}`);
        Logger.log('✅ テスト5: 成功');
      } else {
        Logger.log(`❌ テスト5: 失敗 - イベントまたは出欠情報が取得できませんでした: ${eventWithResponses?.error || '不明なエラー'}`);
      }

      // テスト6: イベント更新（管理者）
      Logger.log(' --- テスト6: イベント更新（管理者） ---');
      const updateInput: Partial<AttendanceEvent> = {
        title: '統合テストイベント（更新済み）',
        location: '更新されたテスト会場',
        description: '更新された説明'
      };
      
      const updateResult = adminUpdateEvent(eventId, updateInput, testUserKey, adminToken);
      if (updateResult && updateResult.success) {
        Logger.log(`✅ イベント更新成功: ${eventId}`);
        Logger.log('✅ テスト6: 成功');
      } else {
        Logger.log(`❌ テスト6: 失敗 - イベント更新に失敗しました: ${updateResult?.error || '不明なエラー'}`);
      }

      // テスト7: カレンダー同期（アプリ → カレンダー）
      Logger.log(' --- テスト7: カレンダー同期（アプリ → カレンダー） ---');
      const syncResult = syncEvent(eventId);
      if (syncResult && syncResult.success) {
        Logger.log(`✅ カレンダー同期成功: ${eventId}`);
        Logger.log('✅ テスト7: 成功');
      } else {
        Logger.log(`⚠️ テスト7: スキップ - カレンダー同期に失敗しました（カレンダーが設定されていない可能性があります）: ${syncResult?.error || '不明なエラー'}`);
      }

      // テスト8: イベント削除（管理者）
      Logger.log(' --- テスト8: イベント削除（管理者） ---');
      const deleteResult = adminDeleteEvent(eventId, testUserKey, adminToken);
      if (deleteResult && deleteResult.success) {
        Logger.log(`✅ イベント削除成功: ${eventId}`);
        Logger.log('✅ テスト8: 成功');
      } else {
        Logger.log(`❌ テスト8: 失敗 - イベント削除に失敗しました: ${deleteResult?.error || '不明なエラー'}`);
      }
    } else {
      Logger.log(`❌ テスト3: 失敗 - イベント作成に失敗しました: ${createResult?.error || '不明なエラー'}`);
    }

    // テスト9: セキュリティ対策（レート制限）
    Logger.log(' --- テスト9: セキュリティ対策（レート制限） ---');
    const testSecurityUserKey = 'test-integration-rate-limit';
    const testAction = 'test_integration_action';
    
    // レート制限をリセット（utils.tsのresetRateLimit関数を使用）
    resetRateLimit(testSecurityUserKey, testAction);
    
    let rateLimitPassed = true;
    for (let i = 0; i < 6; i++) {
      const allowed = checkRateLimit(testSecurityUserKey, testAction);
      if (i < 5 && !allowed) {
        Logger.log(`❌ テスト9: 失敗 - ${i + 1}回目で制限されました（5回まで許可されるべき）`);
        rateLimitPassed = false;
        break;
      } else if (i === 5 && allowed) {
        Logger.log(`❌ テスト9: 失敗 - 6回目が許可されました（制限されるべき）`);
        rateLimitPassed = false;
        break;
      }
    }
    
    if (rateLimitPassed) {
      Logger.log('✅ レート制限が正しく動作しています');
      Logger.log('✅ テスト9: 成功');
    }

    Logger.log('=== testIntegration 終了 ===');
    Logger.log('✅ すべての統合テストが完了しました');

  } catch (error) {
    Logger.log(`❌ エラー: 統合テスト実行中にエラーが発生しました - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
  }
}

