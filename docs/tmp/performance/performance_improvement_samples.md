# パフォーマンス改善 実装サンプルコード集

このドキュメントは、`performance_investigation_report.md`で提案した改善案の**具体的な実装コード**をまとめたものです。

---

## 📦 Phase 1: バッチ取得API実装

### 1. サーバーサイド: 全出欠データ取得関数の追加

**ファイル**: `src/server/responses.ts`

**追加場所**: `getResponses()` 関数の後に追加

```typescript
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
```

---

### 2. サーバーサイド: バッチ取得API追加

**ファイル**: `src/main.ts`

**追加場所**: `getEventWithResponses()` 関数の後に追加

```typescript
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
```

---

### 3. クライアントサイド: renderGrid関数の書き換え

**ファイル**: `src/client/index.html`

**変更箇所**: `renderGrid()` 関数（約2458-2508行目）

**変更前**:
```javascript
function renderGrid() {
  // メンバーリストは既にloadInitDataで取得済み（必要に応じて再取得）
  if (memberList.length === 0) {
    loadMemberList();
  }
  
  const gridContainer = document.getElementById('attendance-grid');
  gridContainer.innerHTML = '<div style="padding: 20px; text-align: center;">読み込み中...</div>';

  if (currentEvents.length === 0) {
    gridContainer.innerHTML = '<p style="padding: 20px; text-align: center;">イベントがありません</p>';
    return;
  }

  // 全てのイベントの出欠情報を取得
  let loadedCount = 0;
  const allResponses = {}; // {eventId: {memberName: status}}
  currentEvents.forEach(event => {
    google.script.run
      .withSuccessHandler((result) => {
        loadedCount++;
        
        if (result.success && result.responses) {
          // このイベントの出欠情報を保存
          allResponses[event.id] = {};
          result.responses.forEach(response => {
            // userKeyからメンバー情報を取得してdisplayNameを取得
            const member = memberList.find(m => m.userKey === response.userKey);
            if (member) {
              const displayName = getMemberDisplayName(member);
              allResponses[event.id][displayName] = response.status;
            }
          });
        }
        
        // 全てのイベントの情報を取得したら、テーブルを描画
        if (loadedCount === currentEvents.length) {
          renderGridTable(allResponses);
        }
      })
      .withFailureHandler((error) => {
        loadedCount++;
        console.error('出欠情報取得エラー:', error);
        if (loadedCount === currentEvents.length) {
          renderGridTable(allResponses);
        }
      })
      .getEventWithResponses(event.id);
  });
}
```

**変更後**:
```javascript
function renderGrid() {
  // メンバーリストは既にloadInitDataで取得済み（必要に応じて再取得）
  if (memberList.length === 0) {
    loadMemberList();
  }
  
  const gridContainer = document.getElementById('attendance-grid');
  gridContainer.innerHTML = '<div style="padding: 20px; text-align: center;">読み込み中...</div>';

  if (currentEvents.length === 0) {
    gridContainer.innerHTML = '<p style="padding: 20px; text-align: center;">イベントがありません</p>';
    return;
  }

  // 1回のAPI呼び出しで全データを取得
  google.script.run
    .withSuccessHandler((result) => {
      if (result.success && result.responsesMap) {
        console.log('✅ バッチデータ取得成功:', {
          イベント数: result.events.length,
          出欠データあるイベント数: Object.keys(result.responsesMap).length
        });
        
        // responsesMapをallResponses形式に変換
        const allResponses = {}; // {eventId: {displayName: status}}
        
        Object.keys(result.responsesMap).forEach(eventId => {
          allResponses[eventId] = {};
          result.responsesMap[eventId].forEach(response => {
            // userKeyからメンバー情報を取得してdisplayNameを取得
            const member = memberList.find(m => m.userKey === response.userKey);
            if (member) {
              const displayName = getMemberDisplayName(member);
              allResponses[eventId][displayName] = response.status;
            }
          });
        });
        
        // グローバルキャッシュに保存（他の機能でも使用）
        window.allResponsesCache = result.responsesMap;
        
        // テーブルを描画
        renderGridTable(allResponses);
      } else {
        gridContainer.innerHTML = '<p style="padding: 20px; text-align: center; color: #f44336;">データの取得に失敗しました</p>';
        console.error('❌ データ取得失敗:', result.error);
      }
    })
    .withFailureHandler((error) => {
      console.error('❌ 全イベント・出欠データ取得エラー:', error);
      gridContainer.innerHTML = '<p style="padding: 20px; text-align: center; color: #f44336;">データの取得に失敗しました</p>';
    })
    .getAllEventsWithResponses();  // ← 新しいバッチAPI（1回のみ！）
}
```

---

### 4. クライアントサイド: グローバルキャッシュの初期化

**ファイル**: `src/client/index.html`

**追加場所**: `<script>` タグ内の最初の変数宣言部分（約1830行目付近）

```javascript
// グローバル変数: キャッシュ用
let currentEvents = [];
let currentUserKey = '';
let currentAuthMode = 'anonymous';
let isAdminUser = false;

// ← ここに追加
/**
 * 全出欠データのキャッシュ
 * 構造: { [eventId: string]: Response[] }
 */
window.allResponsesCache = {};
```

---

## 📦 Phase 2: 出欠登録モーダルのキャッシュ活用

### クライアントサイド: renderEventStatusList関数の書き換え

**ファイル**: `src/client/index.html`

**変更箇所**: `renderEventStatusList()` 関数（約3245-3297行目）

**変更前**:
```javascript
function renderEventStatusList(memberName) {
  const container = document.getElementById('event-status-list');
  container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666; background-color: #f8f9fa; border-radius: 6px;">読み込み中...</div>';

  if (currentEvents.length === 0) {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666; background-color: #f8f9fa; border-radius: 6px; font-weight: 500;">イベントがありません</div>';
    return;
  }

  // 各イベントの出欠情報を取得
  let loadedCount = 0;
  const eventStatusMap = {}; // {eventId: {status, comment}}

  currentEvents.forEach(event => {
    // 既存の出欠情報を取得
    google.script.run
      .withSuccessHandler((result) => {
        loadedCount++;
        
        // このメンバーのuserKeyに一致する出欠情報を探す
        if (result.success && result.responses) {
          const selectedMemberObj = memberList.find(m => getMemberDisplayName(m) === memberName);
          const memberResponse = selectedMemberObj ? result.responses.find(r => r.userKey === selectedMemberObj.userKey) : null;
          if (memberResponse) {
            eventStatusMap[event.id] = {
              status: memberResponse.status,
              comment: memberResponse.comment || ''
            };
            // ... (userKey反映処理)
          }
        }
        
        // 全てのイベントの情報を取得したら、UIを生成
        if (loadedCount === currentEvents.length) {
          renderEventStatusListUI(memberName, eventStatusMap);
        }
      })
      .withFailureHandler((error) => {
        loadedCount++;
        console.error('出欠情報取得エラー:', error);
        if (loadedCount === currentEvents.length) {
          renderEventStatusListUI(memberName, eventStatusMap);
        }
      })
      .getEventWithResponses(event.id);
  });
}
```

**変更後**:
```javascript
function renderEventStatusList(memberName) {
  const container = document.getElementById('event-status-list');
  
  // キャッシュがない場合は読み込み表示
  if (!window.allResponsesCache || Object.keys(window.allResponsesCache).length === 0) {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666; background-color: #f8f9fa; border-radius: 6px;">読み込み中...</div>';
    
    // キャッシュがない場合は、バッチAPIで取得
    google.script.run
      .withSuccessHandler((result) => {
        if (result.success && result.responsesMap) {
          window.allResponsesCache = result.responsesMap;
          // 再帰的に呼び出し（キャッシュがある状態で）
          renderEventStatusList(memberName);
        } else {
          container.innerHTML = '<div style="padding: 20px; text-align: center; color: #f44336;">データの取得に失敗しました</div>';
        }
      })
      .withFailureHandler((error) => {
        console.error('❌ データ取得エラー:', error);
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #f44336;">データの取得に失敗しました</div>';
      })
      .getAllEventsWithResponses();
    
    return;
  }

  if (currentEvents.length === 0) {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666; background-color: #f8f9fa; border-radius: 6px; font-weight: 500;">イベントがありません</div>';
    return;
  }

  console.log('✅ キャッシュからデータを取得:', memberName);

  // キャッシュされた出欠データを使用（API呼び出しなし！）
  const responsesMap = window.allResponsesCache;
  const eventStatusMap = {}; // {eventId: {status, comment}}
  
  // 選択されたメンバーのuserKeyを取得
  const selectedMemberObj = memberList.find(m => getMemberDisplayName(m) === memberName);
  if (!selectedMemberObj) {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: #f44336;">メンバー情報が見つかりません</div>';
    return;
  }
  
  // 各イベントの出欠情報をキャッシュから取得
  currentEvents.forEach(event => {
    if (responsesMap[event.id]) {
      const memberResponse = responsesMap[event.id].find(r => r.userKey === selectedMemberObj.userKey);
      if (memberResponse) {
        eventStatusMap[event.id] = {
          status: memberResponse.status,
          comment: memberResponse.comment || ''
        };
        
        // userKeyをmemberListに反映（初回のみ）
        if (!selectedMemberObj.userKey) {
          selectedMemberObj.userKey = memberResponse.userKey;
        }
      }
    }
  });
  
  // UIを即座に描画（API呼び出しなし！）
  renderEventStatusListUI(memberName, eventStatusMap);
}
```

---

## 📦 Phase 3: loadInitDataの統合

### 1. サーバーサイド: getInitDataの拡張

**ファイル**: `src/main.ts`

**変更箇所**: `getInitData()` 関数（71-111行目）

**変更前**:
```typescript
function getInitData(): { 
  events: AttendanceEvent[]; 
  config: Config; 
  members: Array<{userKey: string, part: string, name: string, displayName: string}> 
} {
  try {
    const events = getEvents('upcoming');
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
    
    return {
      events: events,
      config: config,
      members: members
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
      members: []
    };
  }
}
```

**変更後**:
```typescript
function getInitData(): { 
  events: AttendanceEvent[]; 
  config: Config; 
  members: Array<{userKey: string, part: string, name: string, displayName: string}>;
  responsesMap: { [eventId: string]: Response[] };  // ← 追加
} {
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
      responsesMap: responsesMap  // ← 追加
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
      responsesMap: {}  // ← 追加
    };
  }
}
```

---

### 2. クライアントサイド: loadInitDataの修正

**ファイル**: `src/client/index.html`

**変更箇所**: `loadInitData()` 関数（約1849-1933行目）

**変更内容**: `withSuccessHandler`内に以下を追加

```javascript
google.script.run
  .withSuccessHandler((data) => {
    currentAuthMode = data.config.AUTH_MODE || 'anonymous';
    initializeUser();
    
    // メンバー一覧をサーバーから取得してmemberListに反映
    if (data.members && Array.isArray(data.members)) {
      memberList = data.members.map(m => ({
        part: m.part || '',
        name: m.name || '',
        displayName: m.displayName || (m.part + m.name),
        userKey: m.userKey
      }));
    } else {
      memberList = [];
    }
    
    // イベントデータを直接使用
    if (data.events) {
      currentEvents = data.events;
    }
    
    // ← ここに追加
    // 出欠データをグローバルキャッシュに保存
    if (data.responsesMap) {
      window.allResponsesCache = data.responsesMap;
      console.log('✅ 出欠データキャッシュ保存:', {
        イベント数: Object.keys(data.responsesMap).length,
        合計出欠数: Object.values(data.responsesMap).reduce((sum, responses) => sum + responses.length, 0)
      });
    } else {
      window.allResponsesCache = {};
    }
    
    // 表示期間を更新
    updateDisplayPeriodInfo(data.config);
    
    // ローディングを非表示（初期データ取得完了）
    hideLoading();
    
    // 管理者ステータスを確認してからUIを更新
    checkAdminStatus().then(() => {
      // イベントを表示（既にデータは取得済み）
      renderEvents();
      // URLパラメータでログインした場合、成功メッセージを表示
      if (adminTokenFromUrl) {
        showToast('管理者ログインに成功しました', 'success');
      }
    });
    resolve(data);
  })
  .withFailureHandler((error) => {
    // エラー処理（既存のまま）
  })
  .getInitData();
```

---

### 3. クライアントサイド: renderGrid関数の最終形

**変更後の最終形**:

```javascript
function renderGrid() {
  // メンバーリストは既にloadInitDataで取得済み
  if (memberList.length === 0) {
    loadMemberList();
  }
  
  const gridContainer = document.getElementById('attendance-grid');

  if (currentEvents.length === 0) {
    gridContainer.innerHTML = '<p style="padding: 20px; text-align: center;">イベントがありません</p>';
    return;
  }

  // キャッシュからデータを取得（API呼び出しなし！）
  const responsesMap = window.allResponsesCache || {};
  
  console.log('✅ キャッシュからデータを描画:', {
    イベント数: currentEvents.length,
    キャッシュあるイベント数: Object.keys(responsesMap).length
  });
  
  // allResponses形式に変換
  const allResponses = {}; // {eventId: {displayName: status}}
  
  Object.keys(responsesMap).forEach(eventId => {
    allResponses[eventId] = {};
    responsesMap[eventId].forEach(response => {
      const member = memberList.find(m => m.userKey === response.userKey);
      if (member) {
        const displayName = getMemberDisplayName(member);
        allResponses[eventId][displayName] = response.status;
      }
    });
  });
  
  // テーブルを即座に描画（API呼び出しなし！）
  renderGridTable(allResponses);
}
```

---

## 📦 Phase 4: イベント詳細モーダルのキャッシュ活用

### クライアントサイド: showEventDetailModal関数の書き換え

**ファイル**: `src/client/index.html`

**変更箇所**: `showEventDetailModal()` 関数（約3575-3880行目）

**変更前の主要部分**:
```javascript
function showEventDetailModal(eventId) {
  // ... (モーダル表示準備)
  
  // イベント情報を取得
  google.script.run
    .withSuccessHandler((result) => {
      if (!result.success || !result.event) {
        if (infoDiv) infoDiv.innerHTML = '<div style="padding: 20px; text-align: center; color: #f44336;">イベント情報の取得に失敗しました</div>';
        return;
      }
      
      const event = result.event;
      const responses = result.responses || [];
      const tally = result.tally || { attendCount: 0, maybeCount: 0, absentCount: 0, undecidedCount: 0 };
      
      // ... (表示処理)
    })
    .withFailureHandler((error) => {
      // エラー処理
    })
    .getEventWithResponses(eventId);
}
```

**変更後**:
```javascript
function showEventDetailModal(eventId) {
  const modal = document.getElementById('event-detail-modal');
  if (modal) modal.style.display = 'block';

  const titleDiv = document.getElementById('event-detail-title');
  const infoDiv = document.getElementById('event-detail-info');
  const breakdownDiv = document.getElementById('attendance-breakdown');
  const commentsDiv = document.getElementById('attendance-comments');
  
  // 初期化
  if (infoDiv) infoDiv.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">読み込み中...</div>';
  if (breakdownDiv) breakdownDiv.innerHTML = '';
  if (commentsDiv) commentsDiv.innerHTML = '';
  if (titleDiv) titleDiv.textContent = 'イベント詳細';

  // キャッシュからデータを取得（API呼び出しなし！）
  const event = currentEvents.find(e => e.id === eventId);
  const responses = (window.allResponsesCache && window.allResponsesCache[eventId]) || [];
  
  console.log('✅ キャッシュからイベント詳細を表示:', {
    eventId: eventId,
    eventTitle: event?.title,
    出欠数: responses.length
  });
  
  if (!event) {
    if (infoDiv) infoDiv.innerHTML = '<div style="padding: 20px; text-align: center; color: #f44336;">イベント情報の取得に失敗しました</div>';
    return;
  }
  
  // 集計処理（クライアントサイドで実行）
  const tally = {
    attendCount: responses.filter(r => r.status === '○').length,
    maybeCount: responses.filter(r => r.status === '△').length,
    absentCount: responses.filter(r => r.status === '×').length,
    undecidedCount: responses.filter(r => r.status === '-').length
  };
  
  // タイトル設定
  if (titleDiv) titleDiv.textContent = event.title || 'イベント詳細';

  // イベント情報を表示
  if (infoDiv) {
    // UTC日時をJSTに変換
    const startDate = utcToJST(event.start);
    const endDate = utcToJST(event.end);
    
    // 日付フォーマット
    const startDateStr = `${startDate.getFullYear()}年${startDate.getMonth() + 1}月${startDate.getDate()}日(${['日','月','火','水','木','金','土'][startDate.getDay()]})`;
    
    // 終日判定
    const isAllDay = event.isAllDay === true || event.isAllDay === 'TRUE' || event.isAllDay === 1 || event.isAllDay === '1';
    
    // 日付比較用の文字列を取得
    const startDateOnlyStr = getDateFromUTC(event.start);
    const endDateOnlyStr = getDateFromUTC(event.end);
    
    let isMultiDay = startDateOnlyStr !== endDateOnlyStr;
    
    // 終日イベントの場合、endが翌日00:00:00なら同日扱い
    if (isAllDay && isMultiDay) {
      const endDateUTC = new Date(event.end);
      if (endDateUTC.getUTCHours() === 0 && endDateUTC.getUTCMinutes() === 0 && endDateUTC.getUTCSeconds() === 0) {
        const expectedEndDate = new Date(event.start);
        expectedEndDate.setUTCDate(expectedEndDate.getUTCDate() + 1);
        if (endDateUTC.getTime() === expectedEndDate.getTime()) {
          isMultiDay = false;
        }
      }
    }
    
    let dateTimeDisplay;
    if (isMultiDay) {
      // 複数日イベント
      const endDateStr = `${endDate.getFullYear()}年${endDate.getMonth() + 1}月${endDate.getDate()}日(${['日','月','火','水','木','金','土'][endDate.getDay()]})`;
      dateTimeDisplay = `${startDateStr}～${endDateStr}`;
    } else if (isAllDay) {
      // 1日の終日イベント
      dateTimeDisplay = `${startDateStr} 終日`;
    } else {
      // 1日の時間指定イベント
      const startTimeStr = `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`;
      const endTimeStr = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;
      dateTimeDisplay = `${startDateStr} ${startTimeStr}～${endTimeStr}`;
    }
    
    infoDiv.innerHTML = `
      <div style="padding: 20px;">
        <div style="margin-bottom: 15px;">
          <div style="font-weight: bold; color: #555; margin-bottom: 5px;">📅 日時</div>
          <div style="font-size: 0.95rem; line-height: 1.5;">${dateTimeDisplay}</div>
        </div>
        ${event.location ? `
          <div style="margin-bottom: 15px;">
            <div style="font-weight: bold; color: #555; margin-bottom: 5px;">📍 場所</div>
            <div style="font-size: 0.95rem; line-height: 1.5;">${event.location}</div>
          </div>
        ` : ''}
        ${event.description ? `
          <div style="margin-bottom: 15px;">
            <div style="font-weight: bold; color: #555; margin-bottom: 5px;">📝 詳細</div>
            <div style="font-size: 0.95rem; line-height: 1.5; white-space: pre-wrap;">${event.description}</div>
          </div>
        ` : ''}
      </div>
    `;
  }

  // 集計を表示
  if (breakdownDiv) {
    breakdownDiv.innerHTML = `
      <div style="padding: 20px;">
        <div style="font-weight: bold; color: #555; margin-bottom: 10px;">📊 出欠集計</div>
        <div style="display: flex; gap: 20px; flex-wrap: wrap;">
          <div style="text-align: center; padding: 10px; background: #e8f5e9; border-radius: 6px; min-width: 80px;">
            <div style="font-size: 1.5rem; font-weight: bold; color: #2e7d32;">○ ${tally.attendCount}</div>
            <div style="font-size: 0.85rem; color: #666; margin-top: 4px;">出席</div>
          </div>
          <div style="text-align: center; padding: 10px; background: #fffde7; border-radius: 6px; min-width: 80px;">
            <div style="font-size: 1.5rem; font-weight: bold; color: #f57c00;">△ ${tally.maybeCount}</div>
            <div style="font-size: 0.85rem; color: #666; margin-top: 4px;">遅刻早退</div>
          </div>
          <div style="text-align: center; padding: 10px; background: #ffebee; border-radius: 6px; min-width: 80px;">
            <div style="font-size: 1.5rem; font-weight: bold; color: #c62828;">× ${tally.absentCount}</div>
            <div style="font-size: 0.85rem; color: #666; margin-top: 4px;">欠席</div>
          </div>
          <div style="text-align: center; padding: 10px; background: #f5f5f5; border-radius: 6px; min-width: 80px;">
            <div style="font-size: 1.5rem; font-weight: bold; color: #757575;">- ${tally.undecidedCount}</div>
            <div style="font-size: 0.85rem; color: #666; margin-top: 4px;">未定</div>
          </div>
        </div>
      </div>
    `;
  }

  // コメント一覧を表示
  if (commentsDiv) {
    const responsesWithComment = responses.filter(r => r.comment && r.comment.trim() !== '');
    
    if (responsesWithComment.length > 0) {
      let commentsHTML = '<div style="padding: 20px;"><div style="font-weight: bold; color: #555; margin-bottom: 10px;">💬 コメント</div>';
      
      responsesWithComment.forEach(response => {
        // userKeyからメンバー情報を取得
        const member = memberList.find(m => m.userKey === response.userKey);
        const displayName = member ? getMemberDisplayName(member) : 'メンバー';
        const part = member ? member.part : 'その他';
        const name = member ? member.name : '不明';
        
        // ステータスのアイコンと色
        let statusIcon = '';
        let statusColor = '';
        if (response.status === '○') {
          statusIcon = '○';
          statusColor = '#2e7d32';
        } else if (response.status === '△') {
          statusIcon = '△';
          statusColor = '#f57c00';
        } else if (response.status === '×') {
          statusIcon = '×';
          statusColor = '#c62828';
        } else {
          statusIcon = '-';
          statusColor = '#757575';
        }
        
        commentsHTML += `
          <div style="margin-bottom: 12px; padding: 12px; background: #fafafa; border-radius: 6px; border-left: 3px solid ${statusColor};">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
              <span style="font-weight: bold; color: ${statusColor}; font-size: 1.1rem;">${statusIcon}</span>
              <span style="font-weight: bold; font-size: 0.9rem;">${name}</span>
              <span style="font-size: 0.8rem; color: #999;">(${part})</span>
            </div>
            <div style="font-size: 0.9rem; line-height: 1.5; white-space: pre-wrap; color: #333;">${response.comment}</div>
          </div>
        `;
      });
      
      commentsHTML += '</div>';
      commentsDiv.innerHTML = commentsHTML;
    } else {
      commentsDiv.innerHTML = '<div style="padding: 20px; text-align: center; color: #999; font-size: 0.9rem;">コメントはありません</div>';
    }
  }

  // 削除ボタンの設定（管理者のみ表示）
  const deleteBtn = document.getElementById('event-detail-delete-btn');
  if (deleteBtn) {
    deleteBtn.onclick = () => {
      closeEventDetailModal();
      openDeleteConfirm(eventId, event.title || 'イベント');
    };
    
    // 管理者UIの表示/非表示を更新
    deleteBtn.style.display = isAdminUser ? 'inline-block' : 'none';
  }
}
```

---

## 🧪 テスト方法

### 1. パフォーマンス計測（改善前）

```javascript
// Chrome DevTools Console で実行
console.time('renderGrid');
renderGrid();
// renderGridTable が完了するまで待つ
console.timeEnd('renderGrid');
```

### 2. パフォーマンス計測（改善後）

同じコードを実行して、時間を比較します。

### 3. Network タブでの確認

1. Chrome DevTools → Network → Filter: XHR
2. ページをリロード
3. `exec?` で始まるリクエスト数を確認

**改善前**: 14個  
**改善後（Phase 1）**: 2個  
**改善後（Phase 2）**: 1個

---

## 📝 チェックリスト

実装時は以下をチェックしてください：

### Phase 1
- [ ] `getAllResponses()` 関数を `src/server/responses.ts` に追加
- [ ] `getAllEventsWithResponses()` 関数を `src/main.ts` に追加
- [ ] `renderGrid()` 関数を書き換え
- [ ] `window.allResponsesCache` をグローバル変数として宣言
- [ ] デプロイして動作確認
- [ ] パフォーマンス計測（13-14秒 → 3-4秒になっているか）

### Phase 2
- [ ] `renderEventStatusList()` 関数を書き換え
- [ ] キャッシュがない場合の処理を実装
- [ ] デプロイして動作確認
- [ ] モーダル表示速度の確認（6秒 → 0.1秒になっているか）

### Phase 3
- [ ] `getInitData()` 関数を拡張
- [ ] `loadInitData()` 関数でキャッシュ保存を追加
- [ ] `renderGrid()` 関数を最終形に変更
- [ ] デプロイして動作確認
- [ ] 初回読み込み速度の確認（3-4秒 → 2秒以下になっているか）

### Phase 4
- [ ] `showEventDetailModal()` 関数を書き換え
- [ ] 集計処理をクライアントサイドに移行
- [ ] デプロイして動作確認
- [ ] モーダル表示速度の確認（1.5秒 → 0.1秒になっているか）

---

## ⚠️ トラブルシューティング

### エラー: "getAllResponses is not defined"

**原因**: `getAllResponses()` 関数が `responses.ts` に追加されていないか、ビルドされていません。

**解決策**:
1. `src/server/responses.ts` に関数を追加
2. `npm run build` を実行
3. `clasp push` でデプロイ

### エラー: "allResponsesCache is not defined"

**原因**: グローバル変数が宣言されていません。

**解決策**:
`src/client/index.html` の `<script>` タグ内の最初に以下を追加:

```javascript
window.allResponsesCache = {};
```

### 速度が改善されない

**確認事項**:
1. Network タブで `exec?` リクエスト数を確認（減っているか）
2. Console で `window.allResponsesCache` を確認（データが入っているか）
3. GAS のログを確認（`getAllEventsWithResponses` が呼ばれているか）

---

**ドキュメントバージョン**: 1.0  
**最終更新日**: 2025年11月11日


