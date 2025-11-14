/// <reference path="types/models.ts" />
/// <reference path="server/auth.ts" /> // isAdmin を参照するため追加
/// <reference path="server/utils.ts" /> // checkRateLimit, resetRateLimit を参照するため追加
/// <reference path="server/calendar.ts" /> // upsertCalendarEvent を参照するため追加
/// <reference path="server/members.ts" /> // メンバー管理関数を参照するため追加
/// <reference path="server/responses.ts" /> // getAllResponses を参照するため追加

// calendar.tsからエクスポートされた関数の型宣言
declare function upsertCalendarEvent(event: AttendanceEvent, forceCreate?: boolean): string | null;
declare function syncCalendarDescriptionForEvent(eventId: string): void;
declare function syncAll(limitToDisplayPeriod?: boolean): { success: number, failed: number, errors: string[] };

/**
 * メインエントリーポイント
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
    .setTitle('UnionBoard')
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
          } catch (e) {
            // localStorageへの保存に失敗（エラーは無視）
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
    
    const events = getEvents('all');
    
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
    
    // 全出欠データを取得してイベントIDごとにグループ化
    const allResponses = getAllResponses();
    
    const responsesMap: { [eventId: string]: Response[] } = {};
    allResponses.forEach(response => {
      if (!responsesMap[response.eventId]) {
        responsesMap[response.eventId] = [];
      }
      responsesMap[response.eventId].push(response);
    });
    
    
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
): { success: boolean; eventId?: string; event?: AttendanceEvent; error?: string } {
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
      // 作成されたイベントを取得（性能改善：クライアント側でキャッシュに追加するため）
      const event = getEventById(eventId);
      
      return {
        success: true,
        eventId: eventId,
        event: event || undefined
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
  }>,
  skipCalendarSync: boolean = false
): { success: number; failed: number; errors: string[] } {
  let successCount = 0;
  let failedCount = 0;
  const errors: string[] = [];
  
  
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
    
    // 性能改善：更新と追加を1回のバッチ操作で実行
    if (rowsToUpdate.length > 0 || rowsToAdd.length > 0) {
      // 既存の全データを取得
      const allData = data.slice(); // dataのコピー
      
      // 既存データを更新
      rowsToUpdate.forEach(update => {
        allData[update.row] = update.data;
      });
      
      // 新規データを追加
      if (rowsToAdd.length > 0) {
        allData.push(...rowsToAdd);
      }
      
      // 1回のAPI呼び出しで全データを書き込み
      sheet.clear();
      if (allData.length > 0) {
        sheet.getRange(1, 1, allData.length, allData[0].length)
          .setValues(allData);
        
        // ヘッダー行のスタイルを復元
        sheet.getRange(1, 1, 1, allData[0].length)
          .setFontWeight('bold')
          .setBackground('#667eea')
          .setFontColor('#ffffff');
        sheet.setFrozenRows(1);
      }
    }
    
    Logger.log(`✅ バッチ保存完了: 成功 ${successCount}件, 失敗 ${failedCount}件`);
    
    // 出欠データ保存後、関連イベントのカレンダー説明欄を同期
    // 性能改善：カレンダー同期をスキップして、定期同期（cron）に任せる
    if (successCount > 0 && !skipCalendarSync) {
      const syncedEventIds = new Set<string>();
      
      responses.forEach(response => {
        // 各イベントについて1回だけ同期（重複を避ける）
        if (!syncedEventIds.has(response.eventId)) {
          try {
            syncCalendarDescriptionForEvent(response.eventId);
            syncedEventIds.add(response.eventId);
          } catch (error) {
            Logger.log(`⚠️ カレンダー同期失敗: ${response.eventId} - ${(error as Error).message}`);
            // カレンダー同期失敗してもエラーカウントには含めない（出欠データは保存済み）
          }
        }
      });
    }
    
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
    
    // イベント一覧を取得（既存関数を使用）
    const events = getEvents('all');
    
    // 全出欠データを1回で取得
    const allResponses = getAllResponses();
    
    // イベントIDごとにグループ化
    const responsesMap: { [eventId: string]: Response[] } = {};
    allResponses.forEach(response => {
      if (!responsesMap[response.eventId]) {
        responsesMap[response.eventId] = [];
      }
      responsesMap[response.eventId].push(response);
    });
    
    
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
 * @param limitToDisplayPeriod 表示期間のみに制限するか（デフォルト: true）
 * @returns 同期結果
 */
function syncAllEvents(userKey?: string, adminToken?: string, limitToDisplayPeriod: boolean = true): { success: number; failed: number; errors: string[] } {
  try {
    // 管理者権限チェック
    if (userKey && !isAdmin(userKey, adminToken)) {
      return {
        success: 0,
        failed: 1,
        errors: ['管理者権限が必要です']
      };
    }
    
    Logger.log(`📅 全イベント同期: 表示期間制限=${limitToDisplayPeriod}`);
    return syncAll(limitToDisplayPeriod);
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
 * 定期的にカレンダーから表示期間のイベントを同期（cron用）
 * Google Apps Script のトリガーで実行することを想定
 * 表示期間（DISPLAY_START_DATE ～ DISPLAY_END_DATE）のイベントのみを同期
 */
function scheduledSync(): void {
  try {
    const result = syncAll(true); // 表示期間のみに制限
    Logger.log(`✅ 定期同期完了: 成功 ${result.success}件, 失敗 ${result.failed}件`);
    
    if (result.errors.length > 0) {
      Logger.log(`⚠️ エラー詳細: ${result.errors.join(', ')}`);
    }
  } catch (error) {
    Logger.log(`❌ 定期同期エラー: ${(error as Error).message}`);
    Logger.log((error as Error).stack);
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
 */

