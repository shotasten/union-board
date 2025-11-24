/// <reference path="../types/models.ts" />

/**
 * カレンダー連携モジュール
 */

/**
 * 楽団専用カレンダーを作成i
 * - 初回デプロイ時に1回だけ実行
 * - 作成したカレンダーIDをConfigシートに保存
 * @returns カレンダーID
 */
function setupBandCalendar(): string {
  try {
    
    // カレンダーを作成
    const calendar = CalendarApp.createCalendar('Tokyo Music Union イベントカレンダー');
    calendar.setTimeZone('Asia/Tokyo');
    
    const calendarId = calendar.getId();
    
    // Configシートに保存
    setConfig('CALENDAR_ID', calendarId);
    
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
          return calendarId;
        }
      } catch (error) {
        // 既存カレンダーが見つからない場合は新規作成
      }
    }
    
    // カレンダーが存在しない場合は新規作成
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
 * 出欠サマリーを含む説明文を生成（キャッシュデータ使用版）
 * パフォーマンス最適化のため、データベースアクセスを最小限に抑える
 * @param eventId イベントID
 * @param userDescription ユーザーが入力した説明（オプション）
 * @param eventResponses キャッシュされた出欠データ
 * @param memberMap キャッシュされたメンバーデータマップ
 * @param includePartBreakdown パート別内訳を含めるか（デフォルト: false）
 * @returns 説明文
 */
function buildDescriptionWithMemberMap(
  eventId: string,
  userDescription: string | undefined,
  eventResponses: Response[],
  memberMap: Map<string, any>,
  includePartBreakdown: boolean = false
): string {
  try {
    // 出欠を集計（キャッシュデータから）
    let attendCount = 0;
    let maybeCount = 0;
    let absentCount = 0;
    let unselectedCount = 0;
    
    eventResponses.forEach(response => {
      if (response.status === '○') attendCount++;
      else if (response.status === '△') maybeCount++;
      else if (response.status === '×') absentCount++;
      else if (response.status === '-') unselectedCount++;
    });
    
    const totalCount = attendCount + maybeCount + absentCount + unselectedCount;
    
    const now = new Date();
    const formattedDate = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
    
    let description = '';
    
    // ユーザーが入力した説明があれば先頭に追加
    if (userDescription && userDescription.trim()) {
      description += userDescription.trim() + '\n\n';
    }
    
    // 出欠サマリーを追加
    description += '【出欠状況】\n';
    description += `○ 参加: ${attendCount}人\n`;
    description += `△ 遅早: ${maybeCount}人\n`;
    description += `× 欠席: ${absentCount}人\n`;
    description += `- 未定: ${unselectedCount}人\n`;
    description += `合計: ${totalCount}人\n\n`;
    
    // パート別内訳を追加（includePartBreakdown=trueの場合）
    if (includePartBreakdown) {
      description += '【パート別内訳】\n';
      
      // ステータスごとのパート内訳を集計
      const statusBreakdown: { [status: string]: { [part: string]: string[] } } = {
        '○': {},
        '△': {},
        '×': {},
        '-': {}
      };
      
      eventResponses.forEach(response => {
        if (response.status === '○' || response.status === '△' || response.status === '×' || response.status === '-') {
          // メンバー情報を取得（キャッシュから）
          const member = memberMap.get(response.userKey);
          let part = '';
          let name = '';
          
          if (member) {
            part = member.part || '';
            name = member.name || member.displayName || '不明';
          } else {
            // メンバーが見つからない場合、userKeyから推測を試みる
            if (response.userKey && response.userKey.startsWith('anon-')) {
              const userName = response.userKey.replace('anon-', '');
              // 簡易的なパース（パート名で始まる場合）
              const partOrder = ['Fl', 'Ob', 'Cl', 'Sax', 'Hr', 'Tp', 'Tb', 'Bass', 'Perc'];
              for (const p of partOrder) {
                if (userName.startsWith(p)) {
                  part = p;
                  name = userName.substring(p.length) || userName;
                  break;
                }
              }
              if (!part) {
                part = '';
                name = userName;
              }
            } else {
              part = '';
              name = '不明';
            }
          }
          
          // パートが空の場合は「その他」として扱う
          const partKey = part || 'その他';
          if (!statusBreakdown[response.status][partKey]) {
            statusBreakdown[response.status][partKey] = [];
          }
          statusBreakdown[response.status][partKey].push(name);
        }
      });
      
      // パートの順序を定義
      const partOrder = ['Fl', 'Ob', 'Cl', 'Sax', 'Hr', 'Tp', 'Tb', 'Bass', 'Perc', 'その他'];
      
      // パートをソートする関数
      const sortParts = (parts: string[]): string[] => {
        return parts.sort((a, b) => {
          const indexA = partOrder.indexOf(a);
          const indexB = partOrder.indexOf(b);
          if (indexA !== -1 && indexB !== -1) return indexA - indexB;
          if (indexA === -1 && indexB !== -1) return 1;
          if (indexA !== -1 && indexB === -1) return -1;
          return a.localeCompare(b, 'ja');
        });
      };
      
      // 各ステータスごとの内訳を表示
      const statusConfig = [
        { status: '○', label: '出席' },
        { status: '△', label: '遅早' },
        { status: '×', label: '欠席' },
        { status: '-', label: '未定' }
      ];
      
      statusConfig.forEach(({ status, label }) => {
        const partData = statusBreakdown[status];
        const sortedParts = sortParts(Object.keys(partData));
        
        if (sortedParts.length === 0) {
          return; // このステータスの回答がない場合はスキップ
        }
        
        description += `${status} (${label}) の内訳\n`;
        
        sortedParts.forEach(part => {
          const names = partData[part];
          if (names.length === 0) return;
          
          description += `${part || 'その他'} (${names.length}人): ${names.join('、')}\n`;
        });
        
        description += '\n';
      });
    }
    
    // コメント一覧を追加
    const comments = eventResponses.filter(r => r.comment && r.comment.trim());
    
    if (comments.length > 0) {
      description += '【コメント】\n';
      comments.forEach(response => {
        // メンバー情報を取得（キャッシュから）
        const member = memberMap.get(response.userKey);
        const displayName = member?.displayName || member?.name || '不明';
        
        // ステータス、名前、コメントを表示
        const statusLabel = response.status === '○' ? '○' : response.status === '△' ? '△' : response.status === '×' ? '×' : '-';
        description += `${statusLabel} ${displayName}: ${response.comment}\n`;
      });
    }
    
    description += `\n最終更新: ${formattedDate}`;
    
    return description;
  } catch (error) {
    Logger.log(`❌ エラー: 説明文生成失敗 (buildDescriptionWithMemberMap) - ${(error as Error).message}`);
    Logger.log(`❌ スタックトレース: ${(error as Error).stack}`);
    return '';
  }
}

/**
 * 出欠サマリーを含む説明文を生成
 * @param eventId イベントID
 * @param userDescription ユーザーが入力した説明（オプション）
 * @param includePartBreakdown パート別内訳を含めるか（デフォルト: false）
 * @returns 説明文
 */
function buildDescription(eventId: string, userDescription?: string, includePartBreakdown: boolean = false): string {
  try {
    const tally = tallyResponses(eventId);
    const now = new Date();
    const formattedDate = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
    
    let description = '';
    
    // ユーザーが入力した説明があれば先頭に追加
    if (userDescription && userDescription.trim()) {
      description += userDescription.trim() + '\n\n';
    }
    
    // 出欠サマリーを追加
    description += '【出欠状況】\n';
    description += `○ 参加: ${tally.attendCount}人\n`;
    description += `△ 遅早: ${tally.maybeCount}人\n`;
    description += `× 欠席: ${tally.absentCount}人\n`;
    description += `- 未定: ${tally.unselectedCount}人\n`;
    description += `合計: ${tally.totalCount}人\n\n`;
    
    // パート別内訳を追加（includePartBreakdown=trueの場合）
    if (includePartBreakdown) {
      try {
        const responses = getResponses(eventId);
        const members = getMembers();
        const memberMap = new Map<string, Member>();
        members.forEach(m => {
          memberMap.set(m.userKey, m);
        });
        
        description += '【パート別内訳】\n';
        
        // ステータスごとのパート内訳を集計
        const statusBreakdown: { [status: string]: { [part: string]: string[] } } = {
          '○': {},
          '△': {},
          '×': {},
          '-': {}
        };
        
        responses.forEach(response => {
          if (response.status === '○' || response.status === '△' || response.status === '×' || response.status === '-') {
            // メンバー情報を取得
            const member = memberMap.get(response.userKey);
            let part = '';
            let name = '';
            
            if (member) {
              part = member.part || '';
              name = member.name || member.displayName || '不明';
            } else {
              // メンバーが見つからない場合、userKeyから推測を試みる
              if (response.userKey && response.userKey.startsWith('anon-')) {
                const userName = response.userKey.replace('anon-', '');
                // 簡易的なパース（パート名で始まる場合）
                const partOrder = ['Fl', 'Ob', 'Cl', 'Sax', 'Hr', 'Tp', 'Tb', 'Bass', 'Perc'];
                for (const p of partOrder) {
                  if (userName.startsWith(p)) {
                    part = p;
                    name = userName.substring(p.length) || userName;
                    break;
                  }
                }
                if (!part) {
                  part = '';
                  name = userName;
                }
              } else {
                part = '';
                name = '不明';
              }
            }
            
            // パートが空の場合は「その他」として扱う
            const partKey = part || 'その他';
            if (!statusBreakdown[response.status][partKey]) {
              statusBreakdown[response.status][partKey] = [];
            }
            statusBreakdown[response.status][partKey].push(name);
          }
        });
        
        // パートの順序を定義
        const partOrder = ['Fl', 'Ob', 'Cl', 'Sax', 'Hr', 'Tp', 'Tb', 'Bass', 'Perc', 'その他'];
        
        // パートをソートする関数
        const sortParts = (parts: string[]): string[] => {
          return parts.sort((a, b) => {
            const indexA = partOrder.indexOf(a);
            const indexB = partOrder.indexOf(b);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA === -1 && indexB !== -1) return 1;
            if (indexA !== -1 && indexB === -1) return -1;
            return a.localeCompare(b, 'ja');
          });
        };
        
        // 各ステータスごとの内訳を表示
        const statusConfig = [
          { status: '○', label: '出席' },
          { status: '△', label: '遅早' },
          { status: '×', label: '欠席' },
          { status: '-', label: '未定' }
        ];
        
        statusConfig.forEach(({ status, label }) => {
          const partData = statusBreakdown[status];
          const sortedParts = sortParts(Object.keys(partData));
          
          if (sortedParts.length === 0) {
            return; // このステータスの回答がない場合はスキップ
          }
          
          description += `${status} (${label}) の内訳\n`;
          
          sortedParts.forEach(part => {
            const names = partData[part];
            if (names.length === 0) return;
            
            description += `${part || 'その他'} (${names.length}人): ${names.join('、')}\n`;
          });
          
          description += '\n';
        });
      } catch (error) {
        Logger.log(`⚠️ パート別内訳取得エラー（処理は続行）: ${(error as Error).message}`);
        Logger.log(`⚠️ スタックトレース: ${(error as Error).stack}`);
        description += '（パート別内訳取得エラー）\n';
      }
    }
    
    // コメント一覧を追加
    try {
      const responses = getResponses(eventId);
      const comments = responses.filter(r => r.comment && r.comment.trim());
      
      if (comments.length > 0) {
        description += '【コメント】\n';
        // メンバー情報を取得（キャッシュ用）
        const members = getMembers();
        const memberMap = new Map<string, Member>();
        members.forEach(m => {
          memberMap.set(m.userKey, m);
        });
        
        comments.forEach(response => {
          // メンバー情報を取得
          const member = memberMap.get(response.userKey);
          const displayName = member?.displayName || member?.name || '不明';
          
          // ステータス、名前、コメントを表示
          const statusLabel = response.status === '○' ? '○' : response.status === '△' ? '△' : response.status === '×' ? '×' : '-';
          description += `${statusLabel} ${displayName}: ${response.comment}\n`;
        });
      }
    } catch (error) {
      Logger.log(`⚠️ コメント取得エラー（処理は続行）: ${(error as Error).message}`);
      Logger.log(`⚠️ スタックトレース: ${(error as Error).stack}`);
      description += '（コメント取得エラー）\n';
    }
    
    description += `\n最終更新: ${formattedDate}`;
    
    return description;
  } catch (error) {
    Logger.log(`❌ エラー: 説明文生成失敗 - ${(error as Error).message}`);
    return '';
  }
}

/**
 * カレンダーイベントを作成または更新
 * @param event イベントデータ
 * @param forceCreate 強制的に新規作成する（既存イベント検索をスキップ）
 * @returns カレンダーイベントID（成功時）、null（失敗時）
 */
function upsertCalendarEvent(event: AttendanceEvent, forceCreate: boolean = false): string | null {
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
    
    // 終日イベントかどうかを判定（フラグが保存されている場合はそれを使用、未設定の場合は計算）
    let isAllDay: boolean;
    let startDateOnly: Date | null = null;
    if (event.isAllDay !== undefined) {
      // フラグが保存されている場合はそれを使用
      isAllDay = event.isAllDay;
      // 終日イベントの場合は日付のみを取得
      if (isAllDay) {
        const jstOffset = 9 * 60 * 60 * 1000;
        const jstStart = new Date(startDate.getTime() + jstOffset);
        startDateOnly = new Date(Date.UTC(jstStart.getUTCFullYear(), jstStart.getUTCMonth(), jstStart.getUTCDate()));
      }
    } else {
      // フラグが未設定の場合は計算（既存データの互換性のため）
      isAllDay = isAllDayEvent(event.start, event.end);
      // 計算結果を直接スプレッドシートに保存（無限ループ防止：updateEventを呼ばない）
      try {
        const sheet = getEventsSheet();
        const data = sheet.getDataRange().getValues();
        for (let i = 1; i < data.length; i++) {
          if (data[i][0] === event.id) {
            const rowIndex = i + 1;
            // isAllDayカラム（列5）を更新
            sheet.getRange(rowIndex, 5).setValue(isAllDay);
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
    
    // 説明文を生成（ユーザーが入力した説明 + 出欠サマリーを含む）
    // Configからパート別内訳の表示設定を取得
    const showPartBreakdown = getConfig('CALENDAR_SHOW_PART_BREAKDOWN', 'false') === 'true';
    const description = buildDescription(event.id, event.description, showPartBreakdown);
    
    // 説明文のハッシュを計算
    const notesHash = computeHash(description);
    
    // 既存のカレンダーイベントIDがあるか確認
    let calendarEvent: GoogleAppsScript.Calendar.CalendarEvent | null = null;
    let eventFoundInCalendar = false;
    
    // forceCreateがtrueの場合は既存イベント検索をスキップ
    if (!forceCreate && event.calendarEventId) {
      try {
        calendarEvent = calendar.getEventById(event.calendarEventId);
        eventFoundInCalendar = true;
      } catch (error) {
        Logger.log(`⚠️ [検索失敗] 既存のカレンダーイベントが見つかりません: ${event.calendarEventId}`);
        Logger.log(`⚠️ [エラー詳細] ${(error as Error).message}`);
        Logger.log(`⚠️ [エラースタック] ${(error as Error).stack}`);
      }
    }
    
    if (calendarEvent) {
      // 既存イベントを更新
      // カレンダーイベントの現在の値を取得
      const currentTitle = calendarEvent.getTitle();
      const currentStart = calendarEvent.getStartTime();
      const currentEnd = calendarEvent.getEndTime();
      const currentLocation = calendarEvent.getLocation() || '';
      const isCurrentAllDay = calendarEvent.isAllDayEvent();
      
      // タイトル、日時、場所が変更されているか確認
      const titleChanged = currentTitle !== event.title;
      // 終日イベントの場合は時間比較を調整
      let timeChanged = false;
      if (isCurrentAllDay && isAllDay && startDateOnly) {
        // 両方とも終日イベントの場合、日付のみ比較
        const currentStartDate = new Date(currentStart.getFullYear(), currentStart.getMonth(), currentStart.getDate());
        const newStartDate = new Date(startDateOnly);
        timeChanged = currentStartDate.getTime() !== newStartDate.getTime();
      } else if (!isCurrentAllDay && !isAllDay) {
        // 両方とも時間指定イベントの場合、時刻も比較
        timeChanged = currentStart.getTime() !== startDate.getTime() || 
                     currentEnd.getTime() !== endDate.getTime();
      } else {
        // 終日と時間指定が異なる場合は変更あり
        timeChanged = true;
      }
      const locationChanged = currentLocation !== (event.location || '');
      
      // 説明文のハッシュが同じで、かつタイトル・日時・場所も同じ場合は更新をスキップ（無限ループ防止）
      if (event.notesHash === notesHash && !titleChanged && !timeChanged && !locationChanged) {
        return event.calendarEventId || null;
      }
      
      // 終日と時間指定のタイプが異なる場合は、既存イベントを削除して新規作成
      if ((isCurrentAllDay && !isAllDay) || (!isCurrentAllDay && isAllDay)) {
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
        
        return event.calendarEventId || null;
      }
      // calendarEventがnullの場合は、後続の新規作成処理に進む
    }
    
    // 新規イベントを作成（calendarEventがnullの場合、または既存イベントを削除した場合）
    try {
      let newCalendarEvent: GoogleAppsScript.Calendar.CalendarEvent;
      
      if (isAllDay && startDateOnly) {
        // 終日イベントとして作成
        newCalendarEvent = calendar.createAllDayEvent(
          event.title,
          startDateOnly,
          {
            location: event.location || '',
            description: description
          }
        );
      } else {
        // 時間指定イベントとして作成
        newCalendarEvent = calendar.createEvent(
          event.title,
          startDate,
          endDate,
          {
            location: event.location || '',
            description: description
          }
        );
      }
      
      const newCalendarEventId = newCalendarEvent.getId();
      
      // EventsシートのcalendarEventIdとnotesHashを更新
      updateEventCalendarInfo(event.id, newCalendarEventId, notesHash);
      
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
        // calendarEventId (列8) と notesHash (列9) を更新（バッチ更新: パフォーマンス最適化）
        const rowIndex = i + 1;
        sheet.getRange(rowIndex, 8, 1, 2).setValues([[calendarEventId, notesHash]]);
        // lastSynced (列13) も更新
        sheet.getRange(rowIndex, 13).setValue(new Date().toISOString());
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
      // Configからパート別内訳の表示設定を取得
      const showPartBreakdown = getConfig('CALENDAR_SHOW_PART_BREAKDOWN', 'false') === 'true';
      const description = buildDescription(eventId, event.description, showPartBreakdown);
      const notesHash = computeHash(description);
      
      // 説明文のハッシュが同じ場合は更新をスキップ（無限ループ防止）
      if (event.notesHash === notesHash) {
        return;
      }
      
      calendarEvent.setDescription(description);
      
      // notesHashを更新
      updateEventCalendarInfo(eventId, event.calendarEventId, notesHash);
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

/**
 * カレンダーからイベントを取得してSpreadsheetと同期
 * @param calendarId カレンダーID（省略時はConfigから取得）
 * @param startDate 取得開始日時（省略時はデフォルト：30日前）
 * @param endDate 取得終了日時（省略時はデフォルト：1年後）
 * @returns 同期結果
 */
function pullFromCalendar(calendarId?: string, startDate?: Date, endDate?: Date): { success: number, failed: number, errors: string[] } {
  const result = {
    success: 0,
    failed: 0,
    errors: [] as string[]
  };
  
  try {
    
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
    
    // カレンダーから全イベントを取得
    // パラメータが指定されていない場合はデフォルト期間（過去30日から未来1年まで）
    const now = new Date();
    const syncStartDate = startDate || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30日前
    const syncEndDate = endDate || new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1年後
    
    const calendarEvents = calendar.getEvents(syncStartDate, syncEndDate);
    
    // Spreadsheetの全イベントを取得
    const spreadsheetEvents = getEvents('all');
    
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
            const updateResult = updateEvent(existingEventByTitle.id, {
              calendarEventId: calendarEventId,
              lastSynced: calendarEventUpdated.toISOString()
            }, true); // skipCalendarSync: true（カレンダー同期をスキップ）
            
            if (updateResult) {
              result.success++;
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
              if (!duplicateEventByAllFields.calendarEventId) {
                // calendarEventIdが未設定の場合は設定
                const updateResult = updateEvent(duplicateEventByAllFields.id, {
                  calendarEventId: calendarEventId,
                  lastSynced: calendarEventUpdated.toISOString()
                }, true); // skipCalendarSync: true（カレンダー同期をスキップ）
                
                if (updateResult) {
                  result.success++;
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
                  const updateResult = updateEvent(duplicateEventByAllFields.id, {
                    lastSynced: calendarEventUpdated.toISOString()
                  }, true); // skipCalendarSync: true（カレンダー同期をスキップ）
                  
                  if (updateResult) {
                    result.success++;
                  } else {
                    result.failed++;
                    const errorMsg = `lastSynced更新失敗: ${duplicateEventByAllFields.id}`;
                    result.errors.push(errorMsg);
                    Logger.log(`❌ ${errorMsg}`);
                  }
                } else {
                  result.success++;
                }
              }
              continue;
            }
            
            // 既存イベントがない場合、新規イベントとして追加
            // 説明欄から出欠サマリーを除去してdescriptionとして保存
            // （説明欄は「【出欠状況】」以降を除去）
            let description = calendarEventDescription;
            const attendanceIndex = description.indexOf('【出欠状況】');
            if (attendanceIndex >= 0) {
              description = description.substring(0, attendanceIndex).trim();
            }
            
            // カレンダーイベントIDが含まれている場合は除去（@google.com で終わる文字列）
            description = description.replace(/[a-z0-9]+@google\.com/gi, '').trim();
            
            const newEventId = createEvent(
              calendarEventTitle,
              calendarEventStart.toISOString(),
              calendarEventEnd.toISOString(),
              calendarEventLocation,
              description,
              true // skipCalendarSync: true（カレンダーから追加する場合、既にカレンダーにあるため新規作成しない）
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
            // 説明欄から出欠サマリーを除去してdescriptionとして保存
            // （説明欄は「【出欠状況】」以降を除去）
            let userDescription = calendarEventDescription;
            const attendanceIndex = userDescription.indexOf('【出欠状況】');
            if (attendanceIndex >= 0) {
              userDescription = userDescription.substring(0, attendanceIndex).trim();
            }
            
            // カレンダーイベントIDが含まれている場合は除去（@google.com で終わる文字列）
            userDescription = userDescription.replace(/[a-z0-9]+@google\.com/gi, '').trim();
            
            // タイトル、日時、場所、説明欄を更新
            const updateResult = updateEvent(existingEvent.id, {
              title: calendarEventTitle,
              start: calendarEventStart.toISOString(),
              end: calendarEventEnd.toISOString(),
              location: calendarEventLocation,
              description: userDescription,
              lastSynced: calendarEventUpdated.toISOString()
            }, true); // skipCalendarSync: true（カレンダー同期をスキップ）
            
            if (updateResult) {
              result.success++;
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
              const updateResult = updateEvent(existingEvent.id, {
                lastSynced: calendarEventUpdated.toISOString()
              }, true); // skipCalendarSync: true（カレンダー同期をスキップ）
              
              if (updateResult) {
                result.success++;
              } else {
                result.failed++;
                const errorMsg = `lastSynced更新失敗: ${existingEvent.id}`;
                result.errors.push(errorMsg);
                Logger.log(`❌ ${errorMsg}`);
              }
            }
            // スキップは成功数に含めない（実際の同期処理が行われていないため）
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
              const updateResult = updateEvent(duplicateEvent.id, {
                calendarEventId: calendarEventId,
                lastSynced: calendarEventUpdated.toISOString()
              }, true); // skipCalendarSync: true（カレンダー同期をスキップ）
              
              if (updateResult) {
                result.success++;
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
                } else {
                  result.failed++;
                  const errorMsg = `calendarEventId更新失敗: ${duplicateEvent.id}`;
                  result.errors.push(errorMsg);
                  Logger.log(`❌ ${errorMsg}`);
                }
              } else {
                result.success++;
              }
            } else {
              // 同じcalendarEventIdの場合はスキップ（既に処理済み）
              // ただし、lastSyncedが未設定または古い場合は更新する
              const lastSynced = duplicateEvent.lastSynced ? new Date(duplicateEvent.lastSynced) : new Date(0);
              if (!duplicateEvent.lastSynced || calendarEventUpdated.getTime() > lastSynced.getTime()) {
                const updateResult = updateEvent(duplicateEvent.id, {
                  lastSynced: calendarEventUpdated.toISOString()
                }, true); // skipCalendarSync: true（カレンダー同期をスキップ）
                
                if (updateResult) {
                  result.success++;
                } else {
                  result.failed++;
                  const errorMsg = `lastSynced更新失敗: ${duplicateEvent.id}`;
                  result.errors.push(errorMsg);
                  Logger.log(`❌ ${errorMsg}`);
                }
              } else {
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
                  const updateResult = updateEvent(duplicateEventByAllFields.id, {
                    lastSynced: calendarEventUpdated.toISOString()
                  }, true); // skipCalendarSync: true（カレンダー同期をスキップ）
                  
                  if (updateResult) {
                    result.success++;
                  } else {
                    result.failed++;
                    const errorMsg = `lastSynced更新失敗: ${duplicateEventByAllFields.id}`;
                    result.errors.push(errorMsg);
                    Logger.log(`❌ ${errorMsg}`);
                  }
                } else {
                  result.success++;
                }
              }
            } else {
              // 新規イベントをSpreadsheetに追加
              // 説明欄から出欠サマリーを除去してdescriptionとして保存
              // （説明欄は「【出欠状況】」以降を除去）
              let description = calendarEventDescription;
              const attendanceIndex = description.indexOf('【出欠状況】');
              if (attendanceIndex >= 0) {
                description = description.substring(0, attendanceIndex).trim();
              }
              
              // カレンダーイベントIDが含まれている場合は除去（@google.com で終わる文字列）
              description = description.replace(/[a-z0-9]+@google\.com/gi, '').trim();
              
              const newEventId = createEvent(
                calendarEventTitle,
                calendarEventStart.toISOString(),
                calendarEventEnd.toISOString(),
                calendarEventLocation,
                description,
                true // skipCalendarSync: true（カレンダーから追加する場合、既にカレンダーにあるため新規作成しない）
              );
              
              if (newEventId) {
                // calendarEventIdとlastSyncedを設定
                updateEvent(newEventId, {
                  calendarEventId: calendarEventId,
                  lastSynced: calendarEventUpdated.toISOString()
                }, true); // skipCalendarSync: true（カレンダー同期をスキップ）
                result.success++;
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
    const nowForRevive = new Date();
    const startDateForRevive = new Date(nowForRevive.getTime() - 30 * 24 * 60 * 60 * 1000); // 30日前
    const endDateForRevive = new Date(nowForRevive.getTime() + 365 * 24 * 60 * 60 * 1000); // 1年後
    const calendarEventsForRevive = calendar.getEvents(startDateForRevive, endDateForRevive);
    
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
    
    let eventsToRevive = 0;
    let eventsChecked = 0;
    let eventsSkippedDueToExistingId = 0;
    
    for (const event of spreadsheetEventsForRevive) {
      eventsChecked++;
      
      if (event.status === 'active') {
        if (event.calendarEventId) {
          // calendarEventIdが設定されているが、カレンダーに存在しない場合
          // → カレンダーから削除された可能性があるが、同期で復活させる
          const existsInCalendar = calendarEventIds.has(event.calendarEventId);
          
          if (!existsInCalendar) {
            eventsToRevive++;
            
            try {
              // カレンダーに再作成
              // forceCreate=trueを渡して、既存イベント検索をスキップし強制的に新規作成
              // これにより、Google Calendar APIの遅延（getEventsで削除済みと判定されても
              // getEventByIdでキャッシュから見つかる問題）を回避
              const newCalendarEventId = upsertCalendarEvent(event, true);
              
              if (newCalendarEventId) {
                result.success++;
                
                // 新しいcalendarEventIdが返された場合、更新する
                if (newCalendarEventId !== event.calendarEventId) {
                  updateEvent(event.id, {
                    calendarEventId: newCalendarEventId
                  }, true); // skipCalendarSync: true（カレンダー同期をスキップ）
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
          }
        } else {
          // calendarEventIdが設定されていない場合 → カレンダーに追加
          // statusがactiveでない場合はスキップ（既にチェック済みだが念のため）
          if (event.status !== 'active') {
            continue;
          }
          
          try {
            const calendarEventId = upsertCalendarEvent(event);
            if (calendarEventId) {
              result.success++;
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
      }
    }
    
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
 * 全イベントの同期処理（カレンダー → アプリ、アプリ → カレンダー説明欄）
 * @param limitToDisplayPeriod 表示期間のみに制限するか（デフォルト: false）
 * @returns 同期結果
 */
function syncAll(limitToDisplayPeriod: boolean = false): { success: number, failed: number, errors: string[] } {
  
  // 表示期間の設定を取得（limitToDisplayPeriod=trueの場合のみ）
  let syncStartDate: Date | undefined = undefined;
  let syncEndDate: Date | undefined = undefined;
  
  if (limitToDisplayPeriod) {
    const displayStartDateStr = getConfig('DISPLAY_START_DATE', '');
    const displayEndDateStr = getConfig('DISPLAY_END_DATE', '');
    
    if (displayStartDateStr) {
      syncStartDate = new Date(displayStartDateStr);
      if (isNaN(syncStartDate.getTime())) {
        Logger.log(`⚠️ 警告: DISPLAY_START_DATEが不正な値です: ${displayStartDateStr}`);
        syncStartDate = undefined;
      }
    }
    
    if (displayEndDateStr) {
      syncEndDate = new Date(displayEndDateStr);
      if (isNaN(syncEndDate.getTime())) {
        Logger.log(`⚠️ 警告: DISPLAY_END_DATEが不正な値です: ${displayEndDateStr}`);
        syncEndDate = undefined;
      } else {
        // 終了日の23:59:59まで含める
        syncEndDate.setHours(23, 59, 59, 999);
      }
    }
    
    if (!syncStartDate && !syncEndDate) {
      Logger.log(`⚠️ 表示期間の設定が見つかりません。全期間を同期します。`);
    }
  }
  
  // カレンダー → アプリ同期
  const pullResult = pullFromCalendar(undefined, syncStartDate, syncEndDate);
  
  // アプリ → カレンダー説明欄同期
  let descriptionSyncSuccess = 0;
  let descriptionSyncFailed = 0;
  
  try {
    // イベントを取得（表示期間に制限する場合は自動的にフィルタリングされる）
    const events = getEvents('all');
    
    // 🚀 パフォーマンス最適化: 全データを一括取得
    const startTime = new Date().getTime();
    
    let allResponses: Response[] = [];
    let allMembers: any[] = [];
    let calendar: GoogleAppsScript.Calendar.Calendar | null = null;
    let calendarId = '';
    
    try {
      allResponses = getAllResponses();
    } catch (error) {
      Logger.log(`❌ 出欠データ取得失敗: ${(error as Error).message}`);
      throw error;
    }
    
    try {
      allMembers = getMembers();
    } catch (error) {
      Logger.log(`❌ メンバーデータ取得失敗: ${(error as Error).message}`);
      throw error;
    }
    
    try {
      calendarId = getOrCreateCalendar();
      calendar = CalendarApp.getCalendarById(calendarId);
    } catch (error) {
      Logger.log(`❌ カレンダー取得失敗: ${(error as Error).message}`);
      throw error;
    }
    
    if (!calendar) {
      Logger.log(`❌ エラー: カレンダーが見つかりません`);
      return {
        success: pullResult.success,
        failed: pullResult.failed + events.filter(e => e.calendarEventId).length,
        errors: [...pullResult.errors, 'カレンダーが見つかりません']
      };
    }
    
    // 出欠データをイベントIDごとにマッピング（高速検索用）
    const responsesMap = new Map<string, Response[]>();
    allResponses.forEach(response => {
      if (!responsesMap.has(response.eventId)) {
        responsesMap.set(response.eventId, []);
      }
      responsesMap.get(response.eventId)!.push(response);
    });
    
    // メンバーデータのマッピング（高速検索用）
    const memberMap = new Map<string, any>();
    allMembers.forEach(member => {
      memberMap.set(member.userKey, member);
    });
    
    // 各イベントを処理
    events.forEach((event) => {
      if (event.calendarEventId) {
        try {
          // カレンダーイベントを取得
          const calendarEvent = calendar.getEventById(event.calendarEventId);
          if (!calendarEvent) {
            Logger.log(`⚠️ カレンダーイベントが見つかりません: ${event.calendarEventId}`);
            descriptionSyncFailed++;
            return;
          }
          
          // 該当イベントの出欠データを取得（キャッシュから）
          const eventResponses = responsesMap.get(event.id) || [];
          
          // 説明文を生成（キャッシュデータを使用）
          // Configからパート別内訳の表示設定を取得
          const showPartBreakdown = getConfig('CALENDAR_SHOW_PART_BREAKDOWN', 'false') === 'true';
          const description = buildDescriptionWithMemberMap(
            event.id,
            event.description,
            eventResponses,
            memberMap,
            showPartBreakdown
          );
          
          // notesHashを計算
          const notesHash = computeHash(description);
          
          // 説明文が変更されている場合のみ更新
          if (event.notesHash !== notesHash) {
            calendarEvent.setDescription(description);
            updateEventCalendarInfo(event.id, event.calendarEventId, notesHash);
            descriptionSyncSuccess++; // 実際に更新した場合のみ成功としてカウント
          }
          // 変更がない場合は成功数に含めない（実際の同期処理が行われていないため）
        } catch (error) {
          Logger.log(`⚠️ 説明欄同期失敗: ${event.id} - ${(error as Error).message}`);
          descriptionSyncFailed++;
        }
      }
    });
  } catch (error) {
    Logger.log(`❌ エラー: 説明欄同期処理失敗 - ${(error as Error).message}`);
    Logger.log(`❌ スタックトレース: ${(error as Error).stack}`);
  }
  
  // 合計を返す
  return {
    success: pullResult.success + descriptionSyncSuccess,
    failed: pullResult.failed + descriptionSyncFailed,
    errors: pullResult.errors
  };
}

/**
 * テスト関数: カレンダー → アプリ同期テスト
 */

