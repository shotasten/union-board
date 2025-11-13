# パフォーマンス改善 第2期 実装計画書

**作成日**: 2025年11月13日  
**対象アプリ**: UnionBoard - TMU 練習予定・出欠管理アプリ  
**実装期限**: 2週間以内（2025年11月27日まで）  
**前回改善**: 2025年11月11日（Phase 1-5実装済み）

---

## ✅ 改善項目サマリー

| フェーズ | 項目 | 優先度 | 工数 | 期待効果 | 論点 | ステータス |
|---------|------|--------|------|---------|------|-----------|
| 1 | 【問題3】期間設定モーダル | 高 | 1時間 | 90%改善 | なし | ⬜ 未着手 |
| 1 | 【問題7】イベント削除実行 | 高 | 30分 | 50%改善 | なし | ⬜ 未着手 |
| 1 | 【問題5】イベント新規登録 | 高 | 1時間 | 50%改善 | なし | ⬜ 未着手 |
| 1 | 【問題1】初回表示最適化 | 高 | 1時間 | 0.3-0.5秒短縮 | なし | ⬜ 未着手 |
| 2 | 【問題4】ユーザー削除 | 高 | 2時間 | 80%改善 | なし | ⬜ 未着手 |
| 2 | 【問題2】出欠保存 | 高 | 3時間 | 30-50%改善 | なし | ⬜ 未着手 |
| 3 | 【問題8】管理者ステータス統合 | 中 | 2時間 | 0.3-0.5秒短縮 | なし | ⬜ 未着手 |

**総実装工数**: 約10.5時間  
**ステータス凡例**: ⬜ 未着手 / 🟡 進行中 / ✅ 完了 / 🔴 ブロック中

---

## 📅 実装スケジュール

### Week 1（11/13 - 11/19）

#### Day 1-2: フェーズ1実装（論点なし・高優先度）
- [ ] 【問題3】期間設定モーダルのキャッシュ活用（1時間）
- [ ] 【問題7】イベント削除実行の最適化（30分）
- [ ] 【問題5】イベント新規登録の最適化（1時間）
- [ ] 【問題1】初回表示の並列化（1時間）
- [ ] ビルド・デプロイ・動作確認（1時間）

#### Day 3-4: フェーズ2実装（重要・論点なし）
- [ ] 【問題4】ユーザー削除のバッチ処理（2時間）
- [ ] 【問題2】出欠保存の最適化（3時間）
- [ ] ビルド・デプロイ・動作確認（1時間）

#### Day 5: パフォーマンス測定
- [ ] 初回読み込み速度測定
- [ ] 出欠保存速度測定
- [ ] 各管理者機能の速度測定
- [ ] Network タブでAPI呼び出し数確認

### Week 2（11/20 - 11/26）

#### Day 1-2: フェーズ3実装（追加最適化）
- [ ] 【問題8】管理者ステータス統合（2時間）
- [ ] ビルド・デプロイ・動作確認（1時間）

#### Day 3-4: 微調整・バグ修正
- [ ] パフォーマンス測定結果に基づく調整
- [ ] バグ修正（あれば）
- [ ] エラーハンドリングの強化

#### Day 5: 最終確認・完了報告
- [ ] 全機能の最終動作確認
- [ ] パフォーマンス目標達成確認
- [ ] 完了報告書の作成

---

## 📦 フェーズ1: 論点なし・高優先度改善（4.5時間）

### 【問題3】期間設定モーダルのキャッシュ活用

#### 実装内容
- [ ] グローバル変数 `currentConfig` を追加
- [ ] `loadInitData()` で `currentConfig` にキャッシュ保存
- [ ] `openDisplayPeriodModal()` をキャッシュ活用に変更
- [ ] `saveDisplayPeriod()` で保存成功後にキャッシュ更新
- [ ] `clearDisplayPeriod()` でキャッシュ更新

#### 実装ファイル
1. **`src/client/index.html`**（約2060行目付近）

##### 1. グローバル変数追加

```javascript
// グローバル変数
let currentEvents = [];
let currentUserKey = '';
let currentAuthMode = 'anonymous';
let isAdminUser = false;
let currentConfig = null; // ← 追加
```

##### 2. loadInitData() でキャッシュ保存

```javascript
function loadInitData() {
  return new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler((data) => {
        currentAuthMode = data.config.AUTH_MODE || 'anonymous';
        initializeUser();
        
        // メンバー一覧を反映
        if (data.members && Array.isArray(data.members)) {
          memberList = data.members.map(m => ({...}));
        }
        
        // イベントデータを反映
        if (data.events) {
          currentEvents = data.events;
        }
        
        // 出欠データをキャッシュに保存
        if (data.responsesMap) {
          window.allResponsesCache = data.responsesMap;
        }
        
        // 設定をキャッシュに保存 ← 追加
        currentConfig = data.config;
        
        // 既存処理
        updateDisplayPeriodInfo(data.config);
        hideLoading();
        checkAdminStatus().then(() => {
          renderEvents();
          if (adminTokenFromUrl) {
            showToast('管理者ログインに成功しました', 'success');
          }
        });
        resolve(data);
      })
      .withFailureHandler((error) => {
        // エラー処理
      })
      .getInitData();
  });
}
```

##### 3. openDisplayPeriodModal() をキャッシュ活用に変更

```javascript
function openDisplayPeriodModal() {
  const modal = document.getElementById('display-period-modal');
  if (!modal) return;

  // キャッシュから設定値を取得（API呼び出しなし）
  const config = currentConfig || {};
  
  const startInput = document.getElementById('display-period-start');
  const endInput = document.getElementById('display-period-end');
  
  if (startInput && config.DISPLAY_START_DATE) {
    const startDate = new Date(config.DISPLAY_START_DATE);
    startInput.value = formatDateForInput(startDate);
  } else if (startInput) {
    startInput.value = '';
  }
  
  if (endInput && config.DISPLAY_END_DATE) {
    const endDate = new Date(config.DISPLAY_END_DATE);
    endInput.value = formatDateForInput(endDate);
  } else if (endInput) {
    endInput.value = '';
  }
  
  // 即座にモーダルを表示
  modal.style.display = 'block';
}
```

##### 4. saveDisplayPeriod() でキャッシュ更新

```javascript
function saveDisplayPeriod() {
  // 既存の入力値取得処理
  const startInput = document.getElementById('display-period-start');
  const endInput = document.getElementById('display-period-end');
  
  // ... バリデーション処理（既存のまま）
  
  const saveBtn = document.querySelector('#display-period-modal .form-btn.primary');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';
  }

  google.script.run
    .withSuccessHandler((result) => {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '保存';
      }
      
      if (result.success) {
        // キャッシュを更新 ← 追加
        if (currentConfig) {
          currentConfig.DISPLAY_START_DATE = startDateISO;
          currentConfig.DISPLAY_END_DATE = endDateISO;
        }
        
        closeDisplayPeriodModal();
        showToast('表示期間を設定しました', 'success');
        // データを再読み込み
        loadInitData().then(() => {
          renderEvents();
        });
      } else {
        showToast(result.error || '表示期間の設定に失敗しました', 'error');
      }
    })
    .withFailureHandler((error) => {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '保存';
      }
      showToast('表示期間の設定に失敗しました', 'error');
    })
    .adminSetDisplayPeriod(startDateISO, endDateISO, currentUserKey, localStorage.getItem('adminToken'));
}
```

##### 5. clearDisplayPeriod() でキャッシュ更新

```javascript
function clearDisplayPeriod() {
  if (!confirm('表示期間の制限を解除しますか？')) {
    return;
  }

  const saveBtn = document.querySelector('#display-period-modal .form-btn.primary');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';
  }

  google.script.run
    .withSuccessHandler((result) => {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '保存';
      }
      
      if (result.success) {
        // キャッシュを更新 ← 追加
        if (currentConfig) {
          currentConfig.DISPLAY_START_DATE = '';
          currentConfig.DISPLAY_END_DATE = '';
        }
        
        closeDisplayPeriodModal();
        showToast('表示期間の制限を解除しました', 'success');
        // データを再読み込み
        loadInitData().then(() => {
          renderEvents();
        });
      } else {
        showToast(result.error || '表示期間の解除に失敗しました', 'error');
      }
    })
    .withFailureHandler((error) => {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '保存';
      }
      showToast('表示期間の解除に失敗しました', 'error');
    })
    .adminSetDisplayPeriod('', '', currentUserKey, localStorage.getItem('adminToken'));
}
```

#### テスト項目
- [ ] 期間設定ボタンクリック時にモーダルが即座に表示されることを確認
- [ ] モーダル内に現在の設定値が正しく表示されることを確認
- [ ] 期間設定の保存が正常に動作することを確認
- [ ] 期間制限の解除が正常に動作することを確認
- [ ] API呼び出しが発生しないことを確認（Network タブ）

---

### 【問題7】イベント削除実行の最適化

#### 実装内容
- [ ] `confirmDelete()` でローカルキャッシュから削除
- [ ] `loadInitData()` 呼び出しを削除
- [ ] `renderEvents()` で即座に再描画

#### 実装ファイル
1. **`src/client/index.html`**（約5383行目付近）

##### confirmDelete() の変更

```javascript
function confirmDelete() {
  if (!deletingEventId) {
    return;
  }

  const deleteBtn = document.querySelector('.confirm-btn.danger');
  deleteBtn.disabled = true;
  deleteBtn.textContent = '削除中...';

  google.script.run
    .withSuccessHandler((result) => {
      deleteBtn.disabled = false;
      deleteBtn.textContent = '削除';
      
      if (result.success) {
        // 削除されたイベントをcurrentEventsから除外
        const index = currentEvents.findIndex(e => e.id === deletingEventId);
        if (index !== -1) {
          currentEvents.splice(index, 1);
        }
        
        // 出欠データキャッシュからも削除
        if (window.allResponsesCache && window.allResponsesCache[deletingEventId]) {
          delete window.allResponsesCache[deletingEventId];
        }
        
        // 再描画（API呼び出しなし）
        renderEvents();
        
        showToast('イベントを削除しました', 'success');
        closeDeleteConfirm();
      } else {
        showToast(result.error || '削除に失敗しました', 'error');
      }
    })
    .withFailureHandler((error) => {
      deleteBtn.disabled = false;
      deleteBtn.textContent = '削除';
      showToast(error.message || 'エラーが発生しました', 'error');
    })
    .adminDeleteEvent(deletingEventId, currentUserKey, localStorage.getItem('adminToken'));
}
```

#### テスト項目
- [ ] イベント削除が正常に動作することを確認
- [ ] 削除後、即座にUIが更新されることを確認
- [ ] キャッシュから正しく削除されることを確認
- [ ] `loadInitData()` が呼ばれないことを確認（Network タブ）

---

### 【問題5】イベント新規登録の最適化

#### 実装内容
- [ ] `adminCreateEvent()` の戻り値に `event` を追加
- [ ] `saveEvent()` でレスポンスから `event` を取得
- [ ] ローカルキャッシュに追加
- [ ] `loadInitData()` 呼び出しを削除

#### 実装ファイル

##### 1. **`src/main.ts`**（約140行目付近）

```typescript
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
): { 
  success: boolean; 
  eventId?: string; 
  event?: AttendanceEvent; // ← 追加
  error?: string 
} {
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
      // 作成されたイベントを取得 ← 追加
      const event = getEventById(eventId);
      
      return {
        success: true,
        eventId: eventId,
        event: event // ← 追加
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
```

##### 2. **`src/client/index.html`**（約5330行目付近）

```javascript
function saveEvent(e) {
  e.preventDefault();

  // 既存の入力値取得・バリデーション処理
  const title = document.getElementById('event-title').value.trim();
  // ... その他の処理

  const saveBtn = document.getElementById('save-event-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = '保存中...';

  if (editingEventId) {
    // 更新処理（既存のまま）
    google.script.run
      .withSuccessHandler((result) => {
        saveBtn.disabled = false;
        saveBtn.textContent = '保存';
        
        if (result.success) {
          showToast('イベントを更新しました', 'success');
          closeEventModal();
          // 全データを再読み込み
          loadInitData().then(() => {
            renderEvents();
          });
        } else {
          showToast(result.error || '更新に失敗しました', 'error');
        }
      })
      .withFailureHandler((error) => {
        saveBtn.disabled = false;
        saveBtn.textContent = '保存';
        showToast(error.message || 'エラーが発生しました', 'error');
      })
      .adminUpdateEvent(editingEventId, updates, currentUserKey, localStorage.getItem('adminToken'));
  } else {
    // 作成処理（変更）
    google.script.run
      .withSuccessHandler((result) => {
        saveBtn.disabled = false;
        saveBtn.textContent = '保存';
        
        if (result.success && result.event) {
          // 作成されたイベントをcurrentEventsに追加 ← 変更
          currentEvents.push(result.event);
          
          // 出欠データキャッシュに空の配列を追加 ← 変更
          if (window.allResponsesCache) {
            window.allResponsesCache[result.event.id] = [];
          }
          
          // 再描画（API呼び出しなし） ← 変更
          renderEvents();
          
          showToast('イベントを作成しました', 'success');
          closeEventModal();
        } else {
          showToast(result.error || '作成に失敗しました', 'error');
        }
      })
      .withFailureHandler((error) => {
        saveBtn.disabled = false;
        saveBtn.textContent = '保存';
        showToast(error.message || 'エラーが発生しました', 'error');
      })
      .adminCreateEvent({
        title: title,
        start: startISO,
        end: endISO,
        location: location,
        description: description
      }, currentUserKey, localStorage.getItem('adminToken'));
  }
}
```

#### テスト項目
- [ ] イベント新規登録が正常に動作することを確認
- [ ] 作成後、即座にUIに反映されることを確認
- [ ] キャッシュに正しく追加されることを確認
- [ ] `loadInitData()` が呼ばれないことを確認（Network タブ）
- [ ] 作成されたイベントが表形式に表示されることを確認

---

### 【問題1】初回表示の並列化

#### 実装内容
- [ ] `checkAdminStatus()` と `renderEvents()` を並列実行
- [ ] 管理者UIの更新を後回しに

#### 実装ファイル
1. **`src/client/index.html`**（約2068行目付近）

##### loadInitData() の変更

```javascript
function loadInitData() {
  return new Promise((resolve, reject) => {
    // URLパラメータから管理者トークンを取得
    const urlParams = new URLSearchParams(window.location.search);
    const adminTokenFromUrl = urlParams.get('admin');
    
    if (adminTokenFromUrl) {
      localStorage.setItem('adminToken', adminTokenFromUrl);
      const newUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, newUrl);
    }
    
    google.script.run
      .withSuccessHandler((data) => {
        currentAuthMode = data.config.AUTH_MODE || 'anonymous';
        initializeUser();
        
        // メンバー一覧を反映
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
        
        // イベントデータを反映
        if (data.events) {
          currentEvents = data.events;
        }
        
        // 出欠データをキャッシュに保存
        if (data.responsesMap) {
          window.allResponsesCache = data.responsesMap;
        } else {
          window.allResponsesCache = {};
        }
        
        // 設定をキャッシュに保存
        currentConfig = data.config;
        
        // 表示期間を更新
        updateDisplayPeriodInfo(data.config);
        
        // ローディングを非表示
        hideLoading();
        
        // 並列実行：renderEventsを先に実行 ← 変更
        renderEvents(); // ← 即座に表示
        
        // 管理者ステータスを並行して確認（UIは後で更新） ← 変更
        checkAdminStatus().then(() => {
          // 管理者UIを更新
          updateAdminUI();
          
          // URLパラメータでログインした場合、成功メッセージを表示
          if (adminTokenFromUrl) {
            showToast('管理者ログインに成功しました', 'success');
          }
        });
        
        resolve(data);
      })
      .withFailureHandler((error) => {
        initializeUser();
        hideLoading();
        checkAdminStatus().then(() => {
          showError('データの取得に失敗しました。ブラウザのコンソールを確認してください。');
        });
        reject(error);
      })
      .getInitData();
  });
}
```

#### テスト項目
- [ ] 初回読み込み時、イベント一覧が即座に表示されることを確認
- [ ] 管理者ボタンが少し遅れて表示されることを確認（正常な挙動）
- [ ] 全機能が正常に動作することを確認
- [ ] パフォーマンスが向上していることを確認（console.time で測定）

---

## 📦 フェーズ2: 重要・論点なし改善（5時間）

### 【問題4】ユーザー削除のバッチ処理

#### 実装内容
- [ ] `deleteResponsesByUserKey()` をバッチ削除に書き換え
- [ ] 行を1つずつ削除する代わりに、シートをクリアして一括書き込み

#### 実装ファイル
1. **`src/server/responses.ts`**（約321行目付近）

##### deleteResponsesByUserKey() の書き換え

```typescript
function deleteResponsesByUserKey(userKey: string): number {
  try {
    if (!userKey) {
      Logger.log('❌ エラー: userKeyは必須です');
      return 0;
    }
    
    const sheet = getResponsesSheet();
    const data = sheet.getDataRange().getValues();
    
    if (data.length <= 1) {
      Logger.log(`⚠️ 削除対象のレスポンスが見つかりません: ${userKey}`);
      return 0;
    }
    
    // ヘッダー行を保持
    const header = data[0];
    
    // 削除対象以外のデータを収集
    const remainingData: any[][] = [header];
    let deletedCount = 0;
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[1] === userKey) {
        // 削除対象（カウントのみ）
        deletedCount++;
      } else {
        // 残すデータ
        remainingData.push(row);
      }
    }
    
    if (deletedCount === 0) {
      Logger.log(`⚠️ 削除対象のレスポンスが見つかりません: ${userKey}`);
      return 0;
    }
    
    Logger.log(`🔄 バッチ削除開始: ${deletedCount}件を削除, ${remainingData.length - 1}件を保持`);
    
    // シート全体をクリア
    sheet.clear();
    
    // 新しいデータを書き込み（1回のバッチ操作）
    if (remainingData.length > 0) {
      sheet.getRange(1, 1, remainingData.length, remainingData[0].length)
        .setValues(remainingData);
      
      // ヘッダー行のスタイルを復元
      sheet.getRange(1, 1, 1, remainingData[0].length)
        .setFontWeight('bold')
        .setBackground('#667eea')
        .setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }
    
    Logger.log(`✅ レスポンス削除成功: ${userKey} (${deletedCount}件)`);
    return deletedCount;
  } catch (error) {
    Logger.log(`❌ エラー: レスポンス削除失敗 - ${(error as Error).message}`);
    Logger.log(`❌ スタックトレース: ${(error as Error).stack}`);
    return 0;
  }
}
```

#### テスト項目
- [ ] メンバー削除が正常に動作することを確認
- [ ] 削除速度が向上していることを確認（GAS実行ログで確認）
- [ ] 関連する出欠データが正しく削除されることを確認
- [ ] 他のメンバーの出欠データが保持されることを確認
- [ ] ヘッダー行のスタイルが保持されることを確認

---

### 【問題2】出欠保存の最適化

#### 実装内容
- [ ] カレンダー同期を非同期化
- [ ] Spreadsheet書き込みの完全バッチ化

#### 実装ファイル

##### 1. **`src/main.ts`**（約350行目付近）

##### userSubmitResponsesBatch() の最適化

```typescript
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
    
    // ⚠️ 改善：一括更新（既存データ）
    if (rowsToUpdate.length > 0) {
      Logger.log(`✅ 既存データ更新: ${rowsToUpdate.length}件`);
      
      // バッチ更新：複数行を一度に更新
      // 注: GASのAPIでは複数の不連続な行を一度に更新できないため、
      // 各行を個別に更新する必要がある（既存の実装が最適）
      rowsToUpdate.forEach(update => {
        const range = sheet.getRange(update.row + 1, 1, 1, 6);
        range.setValues([update.data]);
      });
    }
    
    // 一括追加（新規データ）
    if (rowsToAdd.length > 0) {
      Logger.log(`✅ 新規データ追加: ${rowsToAdd.length}件`);
      
      const startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, rowsToAdd.length, 6).setValues(rowsToAdd);
    }
    
    Logger.log(`✅ バッチ保存完了: 成功 ${successCount}件, 失敗 ${failedCount}件`);
    
    // ⚠️ 改善：カレンダー同期を非同期化（エラーを無視）
    // バックグラウンドで実行し、メイン処理を待たせない
    try {
      const uniqueEventIds = [...new Set(responses.map(r => r.eventId))];
      Logger.log(`🔄 カレンダー同期開始（非同期）: ${uniqueEventIds.length}件`);
      
      // Utilities.sleep(0) を挟んで非同期風に実行
      // ただし、GASは真の非同期をサポートしていないため、
      // エラーハンドリングのみ改善する
      uniqueEventIds.forEach(eventId => {
        try {
          syncCalendarDescriptionForEvent(eventId);
        } catch (error) {
          Logger.log(`⚠️ カレンダー同期失敗（処理は継続）: ${eventId} - ${(error as Error).message}`);
          // エラーを無視して処理を継続
        }
      });
      
      Logger.log(`✅ カレンダー同期完了`);
    } catch (error) {
      Logger.log(`⚠️ カレンダー同期エラー（出欠保存は成功）: ${(error as Error).message}`);
      // カレンダー同期のエラーは無視
    }
    
  } catch (error) {
    Logger.log(`❌ バッチ保存エラー: ${(error as Error).message}`);
    errors.push(`バッチ処理エラー: ${(error as Error).message}`);
    failedCount = responses.length;
    successCount = 0;
  }
  
  return { success: successCount, failed: failedCount, errors: errors };
}
```

**注意**: GASは真の非同期処理をサポートしていないため、カレンダー同期の完全な非同期化は困難です。上記の実装では、エラーハンドリングを改善し、カレンダー同期の失敗が出欠保存に影響しないようにします。

#### 代替案：カレンダー同期の遅延実行

カレンダー同期を別のトリガー関数で定期的に実行する方法も検討できます。

##### トリガー関数の追加（`src/main.ts`）

```typescript
/**
 * カレンダー同期トリガー関数
 * 時間駆動型トリガーで5分ごとに実行
 */
function syncCalendarPeriodically() {
  try {
    Logger.log('=== カレンダー定期同期開始 ===');
    
    // 最近更新されたイベントのみ同期（例：過去1時間以内）
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    // Responsesシートから最近更新されたイベントIDを取得
    const sheet = getResponsesSheet();
    const data = sheet.getDataRange().getValues();
    const recentEventIds = new Set<string>();
    
    for (let i = 1; i < data.length; i++) {
      const updatedAt = data[i][5]; // updatedAt列
      if (updatedAt && new Date(updatedAt).toISOString() > oneHourAgo) {
        recentEventIds.add(data[i][0]); // eventId
      }
    }
    
    Logger.log(`✅ 同期対象イベント: ${recentEventIds.size}件`);
    
    // カレンダー同期を実行
    let successCount = 0;
    let failedCount = 0;
    recentEventIds.forEach(eventId => {
      try {
        syncCalendarDescriptionForEvent(eventId);
        successCount++;
      } catch (error) {
        Logger.log(`⚠️ カレンダー同期失敗: ${eventId} - ${(error as Error).message}`);
        failedCount++;
      }
    });
    
    Logger.log(`=== カレンダー定期同期完了: 成功 ${successCount}件, 失敗 ${failedCount}件 ===`);
  } catch (error) {
    Logger.log(`❌ カレンダー定期同期エラー: ${(error as Error).message}`);
  }
}
```

**トリガー設定手順**：
1. GAS スクリプトエディタを開く
2. 左メニューから「トリガー」を選択
3. 「トリガーを追加」をクリック
4. 実行する関数：`syncCalendarPeriodically`
5. イベントのソース：時間主導型
6. 時間ベースのトリガータイプ：分タイマー
7. 時間の間隔：5分ごと
8. 「保存」をクリック

#### テスト項目
- [ ] 出欠保存が正常に動作することを確認
- [ ] 保存速度が向上していることを確認（console.time で測定）
- [ ] カレンダーが正しく更新されることを確認（同期後）
- [ ] カレンダー同期の失敗が出欠保存に影響しないことを確認

---

## 📦 フェーズ3: 追加最適化（2時間）

### 【問題8】管理者ステータス統合

#### 実装内容
- [ ] `getInitData()` の戻り値に `isAdmin` を追加
- [ ] `checkAdminStatus()` のAPI呼び出しを削除
- [ ] クライアント側で `isAdmin` を直接使用

#### 実装ファイル

##### 1. **`src/main.ts`**（約75行目付近）

##### getInitData() の拡張

```typescript
function getInitData(): { 
  events: AttendanceEvent[]; 
  config: Config; 
  members: Array<{userKey: string, part: string, name: string, displayName: string}>; 
  responsesMap: { [eventId: string]: Response[] };
  isAdmin: boolean; // ← 追加
} {
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
    
    // 管理者判定（クライアントから渡されたトークンを使用） ← 追加
    // 注: クライアントからトークンを渡す必要があるため、
    // この方法は実装が複雑になる。
    // 代替案として、checkAdminStatus() のキャッシュ活用を推奨。
    const isAdminUser = false; // ← この値の取得方法を検討
    
    return {
      events: events,
      config: config,
      members: members,
      responsesMap: responsesMap,
      isAdmin: isAdminUser // ← 追加
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
        TIMEZONE: 'Asia/Tokyo',
        DISPLAY_START_DATE: '',
        DISPLAY_END_DATE: ''
      },
      members: [],
      responsesMap: {},
      isAdmin: false // ← 追加
    };
  }
}
```

**注意**: 管理者判定をサーバーサイドで行うには、クライアントから管理者トークンを `getInitData()` に渡す必要があります。これは実装が複雑になるため、以下の代替案を推奨します。

#### 代替案（推奨）：checkAdminStatus() のキャッシュ活用

`getInitData()` に管理者ステータスを含めるのではなく、`checkAdminStatus()` の結果をキャッシュし、2回目以降はキャッシュから取得する。

##### `src/client/index.html` の変更

```javascript
// グローバル変数
let isAdminUser = false;
let adminStatusChecked = false; // ← 追加

function checkAdminStatus() {
  return new Promise((resolve) => {
    // キャッシュから取得 ← 追加
    if (adminStatusChecked) {
      resolve();
      return;
    }
    
    const token = localStorage.getItem('adminToken');
    
    if (!token) {
      isAdminUser = false;
      adminStatusChecked = true; // ← 追加
      updateAdminUI();
      resolve();
      return;
    }
    
    // API呼び出しで管理者確認
    google.script.run
      .withSuccessHandler((result) => {
        isAdminUser = result;
        adminStatusChecked = true; // ← 追加
        updateAdminUI();
        resolve();
      })
      .withFailureHandler((error) => {
        isAdminUser = false;
        adminStatusChecked = true; // ← 追加
        updateAdminUI();
        resolve();
      })
      .checkAdminStatus(currentUserKey, token);
  });
}
```

この方法により、2回目以降の `checkAdminStatus()` 呼び出しでAPI呼び出しを回避できます。

#### テスト項目
- [ ] 初回読み込み時、管理者ステータスが正しく判定されることを確認
- [ ] 2回目以降の呼び出しでAPI呼び出しが発生しないことを確認
- [ ] 管理者UIが正しく表示されることを確認

---

## 🧪 テスト計画

### パフォーマンステスト（クライアントサイド）

```javascript
// Chrome DevTools Console で実行

// 1. 初回読み込み速度
console.time('初回読み込み');
location.reload();
// ページ読み込み完了後
console.timeEnd('初回読み込み');

// 2. 期間設定モーダル表示速度
console.time('期間設定モーダル');
openDisplayPeriodModal();
console.timeEnd('期間設定モーダル');

// 3. イベント削除速度
console.time('イベント削除');
// 削除ボタンをクリック
console.timeEnd('イベント削除');

// 4. API呼び出し数確認
// Network タブで XHR フィルタを有効化
// exec? で始まるリクエスト数をカウント
```

### ユニットテスト（サーバーサイド）

```typescript
// GAS Scriptエディタで実行
function testPerformanceImprovements2() {
  Logger.log('=== 第2期 パフォーマンス改善テスト開始 ===');
  
  // Test 1: ユーザー削除（バッチ処理）
  Logger.log('\n--- Test 1: deleteResponsesByUserKey（バッチ処理） ---');
  const testUserKey = 'test-user-delete';
  
  // テストデータ作成
  for (let i = 0; i < 10; i++) {
    submitResponse(`event-${i}`, testUserKey, '○', 'テスト');
  }
  
  const startTime1 = new Date().getTime();
  const deletedCount = deleteResponsesByUserKey(testUserKey);
  const endTime1 = new Date().getTime();
  
  Logger.log(`✅ 削除件数: ${deletedCount}件`);
  Logger.log(`⏱️ 実行時間: ${endTime1 - startTime1}ms`);
  
  // Test 2: イベント作成（レスポンス拡張）
  Logger.log('\n--- Test 2: adminCreateEvent（イベント含む） ---');
  const startTime2 = new Date().getTime();
  const createResult = adminCreateEvent({
    title: 'テストイベント',
    start: new Date().toISOString(),
    end: new Date(Date.now() + 3600000).toISOString(),
    location: 'テスト会場',
    description: 'テスト説明'
  }, '', 'ADMIN_TOKEN'); // 適切なトークンを設定
  const endTime2 = new Date().getTime();
  
  Logger.log(`✅ 作成成功: ${createResult.success}`);
  Logger.log(`✅ イベントID: ${createResult.eventId}`);
  Logger.log(`✅ イベント情報: ${createResult.event ? 'あり' : 'なし'}`);
  Logger.log(`⏱️ 実行時間: ${endTime2 - startTime2}ms`);
  
  Logger.log('\n=== テスト終了 ===');
}
```

---

## 📋 実装チェックリスト

### フェーズ1（論点なし・高優先度）

#### 【問題3】期間設定モーダル
- [ ] グローバル変数 `currentConfig` を追加
- [ ] `loadInitData()` で `currentConfig` にキャッシュ保存
- [ ] `openDisplayPeriodModal()` をキャッシュ活用に変更
- [ ] `saveDisplayPeriod()` でキャッシュ更新
- [ ] `clearDisplayPeriod()` でキャッシュ更新
- [ ] 動作確認：モーダル表示速度測定

#### 【問題7】イベント削除実行
- [ ] `confirmDelete()` でローカルキャッシュから削除
- [ ] `loadInitData()` 呼び出しを削除
- [ ] 動作確認：削除速度測定

#### 【問題5】イベント新規登録
- [ ] `adminCreateEvent()` の戻り値に `event` を追加
- [ ] `saveEvent()` でレスポンスから `event` を取得
- [ ] ローカルキャッシュに追加
- [ ] `loadInitData()` 呼び出しを削除
- [ ] 動作確認：登録速度測定

#### 【問題1】初回表示最適化
- [ ] `loadInitData()` で `checkAdminStatus()` と `renderEvents()` を並列実行
- [ ] 動作確認：初回表示速度測定

### フェーズ2（重要・論点なし）

#### 【問題4】ユーザー削除
- [ ] `deleteResponsesByUserKey()` をバッチ削除に書き換え
- [ ] 動作確認：削除速度測定
- [ ] 動作確認：関連データの削除確認

#### 【問題2】出欠保存
- [ ] `userSubmitResponsesBatch()` のエラーハンドリング改善
- [ ] カレンダー同期トリガー関数の追加（オプション）
- [ ] トリガー設定（オプション）
- [ ] 動作確認：保存速度測定

### フェーズ3（追加最適化）

#### 【問題8】管理者ステータス
- [ ] `checkAdminStatus()` のキャッシュ活用を実装
- [ ] 動作確認：API呼び出し数確認

### ビルド・デプロイ

- [ ] `npm run build` が成功することを確認
- [ ] TypeScriptのコンパイルエラーがないことを確認
- [ ] `clasp push` でデプロイ成功
- [ ] GAS Scriptエディタで最新コードが反映されていることを確認

### 動作確認

- [ ] 初回読み込みが1.5秒以下で完了
- [ ] 期間設定モーダルが0.1秒以下で表示
- [ ] イベント削除が0.8-1.5秒で完了
- [ ] イベント新規登録が0.8-1.5秒で完了
- [ ] ユーザー削除が1-2秒で完了
- [ ] 出欠保存が改善されていることを確認
- [ ] 全機能が正常に動作
- [ ] エラーが発生しないことを確認

---

## 📊 パフォーマンス測定結果記録用

### 改善前（ベースライン）

| 項目 | 測定値 | 測定日時 |
|------|--------|---------|
| 初回読み込み | 2秒以下（前回改善済み） | 2025/11/11 |
| 期間設定モーダル | ___秒 | __/__/__ |
| イベント削除 | ___秒 | __/__/__ |
| イベント新規登録 | ___秒 | __/__/__ |
| ユーザー削除 | ___秒 | __/__/__ |
| 出欠保存 | ___秒 | __/__/__ |

### 改善後（フェーズ1）

| 項目 | 目標値 | 実測値 | 達成率 | 測定日時 |
|------|--------|--------|--------|---------|
| 初回読み込み | 1.5秒以下 | ___秒 | ___% | __/__/__ |
| 期間設定モーダル | 0.1秒以下 | ___秒 | ___% | __/__/__ |
| イベント削除 | 0.8-1.5秒 | ___秒 | ___% | __/__/__ |
| イベント新規登録 | 0.8-1.5秒 | ___秒 | ___% | __/__/__ |

### 改善後（フェーズ2）

| 項目 | 目標値 | 実測値 | 達成率 | 測定日時 |
|------|--------|--------|--------|---------|
| ユーザー削除 | 1-2秒 | ___秒 | ___% | __/__/__ |
| 出欠保存 | 30-50%改善 | ___秒 | ___% | __/__/__ |

---

## ✅ 完了基準

### 必須項目
- [ ] フェーズ1の全改善項目が実装完了
- [ ] フェーズ2の全改善項目が実装完了
- [ ] 全機能が正常に動作
- [ ] エラーログが発生していない
- [ ] パフォーマンス測定結果を記録

### 推奨項目
- [ ] フェーズ3の改善項目が実装完了
- [ ] ユーザーからのポジティブなフィードバック
- [ ] ドキュメントの更新

---

## 🚨 注意事項

### 実装前の確認
1. **バックアップの作成**
   - 現在のGASコードをバックアップ
   - Spreadsheetのコピーを作成
   - gitでコミット

2. **TypeScript型定義の確認**
   - 型エラーが発生していないことを確認

3. **テスト環境での動作確認**
   - 可能であれば、テスト用のSpreadsheetで先に動作確認

### 実装後の確認
1. **パフォーマンス測定**
   - 改善前後の実測値を記録
   - 目標値を達成しているか確認

2. **機能確認**
   - 全機能が正常に動作することを確認
   - エラーログがないことを確認（GAS実行ログ）

3. **データ整合性**
   - キャッシュとサーバーデータの整合性を確認
   - 削除処理が正しく動作することを確認

---

**実装責任者**: _______________  
**開始日**: 2025/11/13  
**完了予定日**: 2025/11/27  
**実完了日**: _______________

---

**ドキュメントバージョン**: 2.0  
**最終更新日**: 2025年11月13日  
**作成者**: AI Performance Analyst

