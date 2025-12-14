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
 * @returns HTMLページまたは画像データ
 */
function doGet(e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.HTML.HtmlOutput {
  // URLパラメータから管理者トークンを取得
  const adminToken = e.parameter.admin;
  
  // HTMLファイルを読み込む
  let htmlOutput = HtmlService.createHtmlOutputFromFile('index')
    .setTitle('UnionBoard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  
  // faviconを設定（Google DriveのURLを直接使用）
  try {
    const faviconUrl = 'https://drive.google.com/uc?id=1SC3-gvHVF115ONOFgOVAvz0IDjFa9v6C&.png';
    htmlOutput.setFaviconUrl(faviconUrl);
  } catch (error) {
    Logger.log('⚠️ favicon設定エラー: ' + (error as Error).message);
  }
  
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
    
    // 管理者トークン処理後もfaviconを再設定
    try {
      const faviconUrl = 'https://drive.google.com/uc?id=1SC3-gvHVF115ONOFgOVAvz0IDjFa9v6C&.png';
      htmlOutput.setFaviconUrl(faviconUrl);
    } catch (error) {
      Logger.log('⚠️ favicon設定エラー: ' + (error as Error).message);
    }
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
    // 性能改善：Configシートを1回だけ読み込む
    const allConfig = getAllConfig();
    
    const config: Config = {
      AUTH_MODE: 'anonymous' as 'google' | 'anonymous',
      ADMIN_TOKEN: allConfig['ADMIN_TOKEN'] || '',
      CALENDAR_ID: allConfig['CALENDAR_ID'] || 'primary',
      CACHE_EXPIRE_HOURS: '6',
      TIMEZONE: 'Asia/Tokyo',
      DISPLAY_START_DATE: allConfig['DISPLAY_START_DATE'] || '',
      DISPLAY_END_DATE: allConfig['DISPLAY_END_DATE'] || ''
    };
    
    // 表示期間の設定値をgetEvents()に渡す（Configシートの再読み込みを回避）
    const events = getEvents('all', config.DISPLAY_START_DATE, config.DISPLAY_END_DATE);
    
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
    
    // カレンダー同期は定期同期（cron）に任せる（性能改善）
    
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
 * cron用: Responsesシートの差分をカレンダーに同期
 * - 前回同期以降に更新された出欠データのみを同期
 * - 15分ごとまたは5分ごとのトリガーで実行可能
 * - 重複実行防止: 10分以内の再実行を自動的にスキップ
 */
function scheduledSyncResponsesToCalendar(): void {
  const PROPERTY_KEY = 'LAST_CRON_CALENDAR_SYNC_TIMESTAMP';
  const DUPLICATE_PREVENTION_MINUTES = 10; // 10分以内の再実行を防止
  
  try {
    const now = new Date();
    
    // 重複実行の防止チェック
    const properties = PropertiesService.getScriptProperties();
    const lastSyncStr = properties.getProperty(PROPERTY_KEY);
    
    if (lastSyncStr) {
      const lastSync = new Date(lastSyncStr);
      const diffMinutes = (now.getTime() - lastSync.getTime()) / (1000 * 60);
      
      if (diffMinutes < DUPLICATE_PREVENTION_MINUTES) {
        return;
      }
    }
    
    // 差分同期を実行
    const result = syncResponsesDiffToCalendar(lastSyncStr);
    
    // 同期時刻を保存
    properties.setProperty(PROPERTY_KEY, now.toISOString());
  } catch (error) {
    Logger.log(`❌ [cron] 同期エラー: ${(error as Error).message}`);
    Logger.log((error as Error).stack);
  }
}

/**
 * カレンダー更新トリガー用: カレンダー側の変更をアプリに同期
 * - GASのカレンダー更新トリガー（onCalendarUpdate）から呼び出される
 * - カレンダー → アプリ（新規イベント検知、イベント情報の変更反映）
 * - アプリ → カレンダー（出欠状況の反映）
 * - 表示期間のみに制限して効率化
 */
function onCalendarUpdate(): void {
  try {
    Logger.log('📅 [カレンダー更新トリガー] 同期開始');
    
    const result = syncAll(true); // limitToDisplayPeriod=true
    
    Logger.log(`✅ [カレンダー更新トリガー] 同期完了: ${result.success}件成功, ${result.failed}件失敗`);
    
    if (result.errors.length > 0) {
      Logger.log(`⚠️ エラー詳細: ${result.errors.join('; ')}`);
    }
  } catch (error) {
    Logger.log(`❌ [カレンダー更新トリガー] 同期エラー: ${(error as Error).message}`);
    Logger.log((error as Error).stack);
  }
}

/**
 * cron用: 1時間ごとの全体同期（双方向）
 * - カレンダー → アプリ（新規イベント検知、イベント情報の変更反映）
 * - アプリ → カレンダー（出欠状況の反映）
 * - 表示期間のみに制限して効率化
 * - 差分同期で漏れた変更も確実に反映
 * 
 * ⚠️ 非推奨: カレンダー更新トリガー（onCalendarUpdate）を使用することを推奨
 * このcron関数は、カレンダー更新トリガーが正しく動作しない場合のフォールバックとして残しています
 */
function scheduledFullSync(): void {
  try {
    Logger.log('📅 [cron 1時間ごと] 全体同期開始');
    
    const result = syncAll(true); // limitToDisplayPeriod=true
    
    Logger.log(`✅ [cron 1時間ごと] 全体同期完了: ${result.success}件成功, ${result.failed}件失敗`);
    
    if (result.errors.length > 0) {
      Logger.log(`⚠️ エラー詳細: ${result.errors.join('; ')}`);
    }
  } catch (error) {
    Logger.log(`❌ [cron 1時間ごと] 全体同期エラー: ${(error as Error).message}`);
    Logger.log((error as Error).stack);
  }
}

/**
 * cron用: メンバーが存在しないレスポンスを定期的に掃除
 * - 深夜バッチなどの時間主導トリガーで実行
 */
function scheduledCleanupUnlinkedResponses(): void {
  try {
    const result = cleanupUnlinkedResponses();
    Logger.log(`[cleanup] リンク切れレスポンス削除: ${result.deleted}件 / 全${result.total}件`);
  } catch (error) {
    Logger.log(`❌ [cleanup] リンク切れレスポンス削除失敗 - ${(error as Error).message}`);
    Logger.log((error as Error).stack);
  }
}

/**
 * Responsesシートの差分をカレンダーに同期（双方向）
 * - アプリ側の出欠更新をカレンダーに反映
 * - カレンダー側の変更（タイトル、日時、説明など）もアプリに反映
 * @param lastSyncTimestamp 前回同期時刻（ISO 8601形式）
 * @returns 同期結果
 */
function syncResponsesDiffToCalendar(
  lastSyncTimestamp: string | null
): { synced: number; failed: number; skipped: number; errors: string[] } {
  const result = {
    synced: 0,
    failed: 0,
    skipped: 0,
    errors: [] as string[]
  };
  
  try {
    // Responsesシートを取得
    const sheet = getResponsesSheet();
    const data = sheet.getDataRange().getValues();
    
    if (data.length <= 1) {
      return result;
    }
    
    // 前回同期時刻
    const lastSync = lastSyncTimestamp ? new Date(lastSyncTimestamp) : null;
    
    // 更新されたイベントIDを収集
    const updatedEventIds = new Set<string>();
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const eventId = row[0]; // A列: eventId
      const updatedAtStr = row[5]; // F列: updatedAt
      
      if (!eventId || !updatedAtStr) {
        continue;
      }
      
      // updatedAt を Date に変換
      let updatedAt: Date;
      try {
        updatedAt = new Date(updatedAtStr);
        if (isNaN(updatedAt.getTime())) {
          Logger.log(`⚠️ 不正な日付形式: 行${i + 1}, updatedAt="${updatedAtStr}"`);
          continue;
        }
      } catch (error) {
        Logger.log(`⚠️ 日付変換エラー: 行${i + 1}, ${(error as Error).message}`);
        continue;
      }
      
      // 前回同期以降に更新されたか確認
      if (!lastSync || updatedAt > lastSync) {
        updatedEventIds.add(eventId);
      }
    }
    
    if (updatedEventIds.size === 0) {
      return result;
    }
    
    // カレンダーを取得
    const calendarId = getOrCreateCalendar();
    const calendar = CalendarApp.getCalendarById(calendarId);
    
    if (!calendar) {
      const errorMsg = `カレンダーが見つかりません: ${calendarId}`;
      Logger.log(`❌ ${errorMsg}`);
      result.errors.push(errorMsg);
      return result;
    }
    
    // 各イベントを双方向同期
    for (const eventId of updatedEventIds) {
      try {
        // イベント情報を取得
        const event = getEventById(eventId);
        if (!event) {
          Logger.log(`⚠️ イベントが見つかりません: ${eventId}`);
          result.failed++;
          continue;
        }
        
        // カレンダーイベントIDがある場合、カレンダー側の変更もチェック
        if (event.calendarEventId) {
          try {
            const calendarEvent = calendar.getEventById(event.calendarEventId);
            if (calendarEvent) {
              const calendarUpdated = calendarEvent.getLastUpdated();
              const eventLastSynced = event.lastSynced ? new Date(event.lastSynced) : new Date(0);
              
              // カレンダー側が新しい場合、アプリに反映
              if (calendarUpdated.getTime() > eventLastSynced.getTime()) {
                // 説明欄から出欠サマリーを除去してdescriptionとして保存
                const calendarDescription = calendarEvent.getDescription() || '';
                let userDescription = calendarDescription;
                const attendanceIndex = userDescription.indexOf('【出欠状況】');
                if (attendanceIndex >= 0) {
                  userDescription = userDescription.substring(0, attendanceIndex).trim();
                }
                
                // カレンダーイベントIDが含まれている場合は除去（@google.com で終わる文字列）
                userDescription = userDescription.replace(/[a-z0-9]+@google\.com/gi, '').trim();
                
                // イベント情報を更新
                updateEvent(event.id, {
                  title: calendarEvent.getTitle(),
                  start: calendarEvent.getStartTime().toISOString(),
                  end: calendarEvent.getEndTime().toISOString(),
                  location: calendarEvent.getLocation() || '',
                  description: userDescription,
                  lastSynced: calendarUpdated.toISOString()
                }, true); // skipCalendarSync: true（カレンダー同期をスキップ）
                
                Logger.log(`✅ カレンダー→アプリ同期: ${eventId}`);
              }
            }
          } catch (error) {
            Logger.log(`⚠️ カレンダーイベント取得失敗: ${event.calendarEventId} - ${(error as Error).message}`);
            // カレンダーイベントが見つからない場合でも、アプリ→カレンダー同期は続行
          }
        }
        
        // アプリ→カレンダーの出欠同期
        syncCalendarDescriptionForEvent(eventId);
        result.synced++;
      } catch (error) {
        result.failed++;
        const errorMsg = `同期失敗: ${eventId} - ${(error as Error).message}`;
        result.errors.push(errorMsg);
        Logger.log(`❌ ${errorMsg}`);
      }
    }
    
    result.skipped = 0; // 差分検知でフィルタ済み
    
  } catch (error) {
    Logger.log(`❌ 差分同期エラー: ${(error as Error).message}`);
    Logger.log((error as Error).stack);
    result.errors.push((error as Error).message);
  }
  
  return result;
}


/**
 * カレンダーIDを取得（カレンダー共有用）
 * Script Propertiesにキャッシュして高速化
 * @returns カレンダーID
 */
function getCalendarIdForSharing(): { success: boolean; calendarId?: string; error?: string } {
  try {
    const PROPERTY_KEY = 'CALENDAR_ID_CACHE';
    const properties = PropertiesService.getScriptProperties();
    
    // まずScript Propertiesから取得を試みる（高速）
    let calendarId = properties.getProperty(PROPERTY_KEY);
    
    if (!calendarId) {
      // Script Propertiesにない場合はConfigシートから取得
      calendarId = getConfig('CALENDAR_ID', '');
      
      if (calendarId) {
        // Configシートから取得できた場合はScript Propertiesにキャッシュ
        properties.setProperty(PROPERTY_KEY, calendarId);
      }
    }
    
    if (!calendarId) {
      Logger.log('❌ エラー: カレンダーIDが設定されていません');
      return {
        success: false,
        error: 'カレンダーIDが設定されていません。管理者に連絡してください。'
      };
    }
    
    return {
      success: true,
      calendarId: calendarId
    };
  } catch (error) {
    Logger.log(`❌ エラー: カレンダーID取得失敗 - ${(error as Error).message}`);
    return {
      success: false,
      error: (error as Error).message
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
 * 管理者用: リンク切れレスポンス削除API
 * @param userKey ユーザー識別子（オプション、管理者判定用）
 * @param adminToken 管理者トークン（オプション、匿名モード時）
 * @returns 削除結果
 */
function adminCleanupUnlinkedResponses(
  userKey?: string,
  adminToken?: string
): { success: boolean; deleted?: number; total?: number; error?: string } {
  try {
    if (userKey && !isAdmin(userKey, adminToken)) {
      return {
        success: false,
        error: '管理者権限が必要です'
      };
    }
    
    const result = cleanupUnlinkedResponses();
    return {
      success: true,
      deleted: result.deleted,
      total: result.total
    };
  } catch (error) {
    Logger.log(`❌ エラー: リンク切れレスポンス削除API失敗 - ${(error as Error).message}`);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * 統合テスト関数
 */

