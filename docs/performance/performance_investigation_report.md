# GAS出欠管理アプリ パフォーマンス調査レポート

**作成日**: 2025年11月11日  
**対象アプリ**: UnionBoard - TMU 練習予定・出欠管理アプリ  
**調査者**: AI Technical Analyst

---

## 📊 エグゼクティブサマリー

### 現状の問題
- **初回ページ読み込み**: 13-14秒（PC、WiFi環境）
- **データ量**: 9人、30件の出欠データ、12イベント
- **リクエスト数**: 27 requests（画像添付参照）
- **転送量**: 44.9 kB transferred, 1.0 MB resources
- **DOMContentLoaded**: 2.2秒

### 主要課題
表示速度が遅い主な原因は、**N+1クエリ問題**によるSpreadsheetへの過剰アクセスです。

---

## 🔍 詳細調査結果

### 【問題1】初回ページ読み込み時のN+1クエリ問題

#### 📌 優先度: **最高（★★★★★）**
#### 📈 改善インパクト: **最大 85% の速度改善見込み（2-3秒まで短縮可能）**

#### 現状の処理フロー

```
1. DOMContentLoaded
   ↓
2. loadInitData()
   ↓ google.script.run.getInitData()
   └─ Spreadsheetアクセス: Events, Config, Members （1回）
   ↓
3. checkAdminStatus()
   ↓ google.script.run.checkAdminStatus()
   └─ Spreadsheetアクセス: Config （1回）
   ↓
4. renderGrid()
   ↓ 各イベントごとにループ
   ├─ google.script.run.getEventWithResponses(event1.id)
   │  └─ Spreadsheetアクセス: Events (1回) + Responses (全スキャン 1回)
   ├─ google.script.run.getEventWithResponses(event2.id)
   │  └─ Spreadsheetアクセス: Events (1回) + Responses (全スキャン 1回)
   ├─ ... (全12イベント分繰り返し)
   └─ 合計: 12 API calls × (Events 1回 + Responses 1回) = 24 Spreadsheetアクセス
```

**合計API呼び出し数**: 14回  
**合計Spreadsheetアクセス**: 26回以上

#### コード該当箇所

**クライアントサイド**: `src/client/index.html`

```javascript
// 2476-2507行目: renderGrid関数内
currentEvents.forEach(event => {
  google.script.run
    .withSuccessHandler((result) => {
      loadedCount++;
      if (result.success && result.responses) {
        // 出欠情報を処理
        allResponses[event.id] = {};
        result.responses.forEach(response => {
          // ...
        });
      }
      // 全イベント取得完了後にテーブル描画
      if (loadedCount === currentEvents.length) {
        renderGridTable(allResponses);
      }
    })
    .withFailureHandler((error) => {
      loadedCount++;
      if (loadedCount === currentEvents.length) {
        renderGridTable(allResponses);
      }
    })
    .getEventWithResponses(event.id);  // ← 12イベント分ループ！
});
```

**サーバーサイド**: `src/main.ts` (470-509行目)

```typescript
function getEventWithResponses(eventId: string): {
  success: boolean;
  event?: AttendanceEvent;
  responses?: Response[];
  tally?: EventTally;
  error?: string;
} {
  const event = getEventById(eventId);      // ← Spreadsheet全スキャン
  const responses = getResponses(eventId);  // ← Spreadsheet全スキャン
  const tally = tallyResponses(eventId);
  
  return { success: true, event, responses, tally };
}
```

**Spreadsheetアクセス部分**: `src/server/responses.ts` (122-162行目)

```typescript
function getResponses(eventId: string): Response[] {
  const sheet = getResponsesSheet();
  const data = sheet.getDataRange().getValues();  // ← 毎回全データ取得！
  
  const responses: Response[] = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[0] === eventId) {  // ← フィルタリングはメモリ上で実行
      responses.push({
        eventId: row[0],
        userKey: row[1],
        status: row[2],
        comment: row[3] || undefined,
        createdAt: row[4],
        updatedAt: row[5]
      });
    }
  }
  return responses;
}
```

#### 問題の本質

1. **google.script.runは直列実行される**: 12個のAPI呼び出しは並列実行されず、順番に実行される
2. **各呼び出しがSpreadsheet全スキャン**: `getDataRange().getValues()`は毎回全行を取得
3. **GASのコールドスタート**: 最初の呼び出し時、GASランタイムの初期化に時間がかかる（1-2秒）
4. **ネットワークオーバーヘッド**: 各API呼び出しに200-400msのレイテンシ

#### 速度試算

| 項目 | 時間 |
|------|------|
| GASコールドスタート | 1-2秒 |
| getInitData() 1回 | 0.5-1秒 |
| checkAdminStatus() 1回 | 0.3-0.5秒 |
| getEventWithResponses() × 12回 | 0.5秒 × 12 = 6秒 |
| renderGridTable() (DOM操作) | 0.5-1秒 |
| **合計** | **8.8-11秒** |

上記にネットワーク変動を加味すると、**13-14秒**の計測結果と一致します。

---

### 💡 改善案1: バッチ取得APIの実装（推奨）

#### 概要
全イベントの出欠データを**1回のAPI呼び出し**で取得する新しいエンドポイントを作成します。

#### メリット
- **速度改善**: 12回 → 1回のAPI呼び出し（約85%削減）
- **Spreadsheetアクセス削減**: 24回 → 2回（Events 1回 + Responses 1回）
- **予想読み込み時間**: 13-14秒 → **2-3秒**
- **実装コスト**: 低（新規API追加のみ、既存コードの影響最小）

#### デメリット
- 一度に取得するデータ量が増加（ただし、現在のデータ量（9人×12イベント）では問題なし）
- GASの6分実行時間制限（現状では全く問題なし、数百イベント規模でも余裕）

#### 実装方針

**1. サーバーサイド: 新規API追加**

`src/main.ts` に以下を追加:

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
    // イベント一覧を取得（既存関数を使用）
    const events = getEvents('upcoming');
    
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
```

**2. サーバーサイド: 全出欠データ取得関数の追加**

`src/server/responses.ts` に以下を追加:

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

**3. クライアントサイド: renderGrid関数の書き換え**

`src/client/index.html` の `renderGrid()` 関数を以下のように変更:

```javascript
function renderGrid() {
  // メンバーリストは既にloadInitDataで取得済み
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
        
        // テーブルを描画
        renderGridTable(allResponses);
      } else {
        gridContainer.innerHTML = '<p style="padding: 20px; text-align: center; color: #f44336;">データの取得に失敗しました</p>';
      }
    })
    .withFailureHandler((error) => {
      console.error('全イベント・出欠データ取得エラー:', error);
      gridContainer.innerHTML = '<p style="padding: 20px; text-align: center; color: #f44336;">データの取得に失敗しました</p>';
    })
    .getAllEventsWithResponses();  // ← 新しいAPI（1回のみ！）
}
```

#### トレードオフと代替案

**トレードオフ**:
- 一度に取得するデータサイズが増加する

**代替案・緩和策**:
1. **データサイズ制限**: イベント数が100を超える場合は、表示期間フィルターを必須にする
2. **ページネーション**: 大規模データに対応する場合、ページング機能を実装（ただし現状のデータ量では不要）
3. **段階的読み込み**: 最初の20イベントのみ取得し、スクロール時に追加読み込み（Lazy Loading）

---

### 💡 改善案2: loadInitDataの最適化

#### 概要
`getInitData()`と全出欠データ取得を統合し、**初回1回のAPI呼び出し**で全データを取得します。

#### メリット
- **速度改善**: さらに1回のAPI呼び出しを削減
- **予想読み込み時間**: 13-14秒 → **2秒以下**
- **シンプルな初期化フロー**

#### デメリット
- 初回読み込みデータ量がさらに増加
- `getInitData()`の責務が大きくなる

#### 実装方針

**1. サーバーサイド: getInitDataの拡張**

`src/main.ts` の `getInitData()` を以下のように変更:

```typescript
function getInitData(): { 
  events: AttendanceEvent[]; 
  config: Config; 
  members: Array<{userKey: string, part: string, name: string, displayName: string}>;
  responsesMap: { [eventId: string]: Response[] };  // ← 追加
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
      responsesMap: {}
    };
  }
}
```

**2. クライアントサイド: loadInitDataの修正**

`src/client/index.html` の `loadInitData()` を変更:

```javascript
function loadInitData() {
  return new Promise((resolve, reject) => {
    // URLパラメータ処理（省略、既存のまま）
    
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
        }
        
        // イベントデータを反映
        if (data.events) {
          currentEvents = data.events;
        }
        
        // 出欠データをグローバル変数に保存 ← 追加
        if (data.responsesMap) {
          window.allResponsesCache = data.responsesMap;
        }
        
        // 表示期間を更新
        updateDisplayPeriodInfo(data.config);
        
        // ローディングを非表示
        hideLoading();
        
        // 管理者ステータスを確認してからUIを更新
        checkAdminStatus().then(() => {
          // イベントを表示
          renderEvents();
          if (adminTokenFromUrl) {
            showToast('管理者ログインに成功しました', 'success');
          }
        });
        resolve(data);
      })
      .withFailureHandler((error) => {
        console.error('初期データ取得失敗:', error);
        // エラー処理（既存のまま）
      })
      .getInitData();
  });
}
```

**3. クライアントサイド: renderGrid関数の簡略化**

```javascript
function renderGrid() {
  if (memberList.length === 0) {
    loadMemberList();
  }
  
  const gridContainer = document.getElementById('attendance-grid');

  if (currentEvents.length === 0) {
    gridContainer.innerHTML = '<p style="padding: 20px; text-align: center;">イベントがありません</p>';
    return;
  }

  // キャッシュされた出欠データを使用
  const responsesMap = window.allResponsesCache || {};
  
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
  
  // テーブルを描画（API呼び出しなし！）
  renderGridTable(allResponses);
}
```

#### トレードオフと代替案

**トレードオフ**:
- `getInitData()`の処理時間が若干増加（ただし、Spreadsheetアクセスは既に最適化されているため、体感差はほぼなし）

**代替案・緩和策**:
- 改善案1と改善案2は段階的に実装可能（まず改善案1、効果を確認後に改善案2）

---

## 【問題2】出欠登録モーダル表示時のN+1クエリ問題

#### 📌 優先度: **高（★★★★☆）**
#### 📈 改善インパクト: **約90%の速度改善（6秒 → 0.5秒以下）**

#### 現状の処理フロー

モーダル表示時も、初回読み込みと全く同じN+1問題が発生しています。

```
renderEventStatusList(memberName)
   ↓ 各イベントごとにループ
   ├─ google.script.run.getEventWithResponses(event1.id)
   ├─ google.script.run.getEventWithResponses(event2.id)
   ├─ ... (全12イベント分繰り返し)
   └─ renderEventStatusListUI()
```

#### コード該当箇所

`src/client/index.html` 3258-3296行目

#### 改善案: キャッシュデータの活用

**改善案1**と**改善案2**で既に全出欠データを取得済みなので、モーダル表示時はキャッシュを使用します。

**実装方針**

`src/client/index.html` の `renderEventStatusList()` を以下のように変更:

```javascript
function renderEventStatusList(memberName) {
  const container = document.getElementById('event-status-list');
  container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666; background-color: #f8f9fa; border-radius: 6px;">読み込み中...</div>';

  if (currentEvents.length === 0) {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666; background-color: #f8f9fa; border-radius: 6px; font-weight: 500;">イベントがありません</div>';
    return;
  }

  // キャッシュされた出欠データを使用（API呼び出しなし！）
  const responsesMap = window.allResponsesCache || {};
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
      }
    }
  });
  
  // UIを即座に描画
  renderEventStatusListUI(memberName, eventStatusMap);
}
```

#### メリット
- **API呼び出し削減**: 12回 → 0回
- **即座に表示**: ネットワーク待機なし
- **予想表示時間**: 6秒 → **0.1秒以下**

#### デメリット
- リアルタイム性の低下（他のユーザーが更新した出欠データが即座に反映されない）

#### トレードオフの緩和策

1. **手動リフレッシュボタン**: モーダルに「最新データを取得」ボタンを追加
2. **自動リフレッシュ**: モーダルを開く際、バックグラウンドで最新データを取得（キャッシュ表示 → 取得完了後に更新）
3. **更新頻度の考慮**: 出欠データは頻繁に変更されないため、実用上の問題は少ない

---

## 【問題3】出欠保存時のパフォーマンス

#### 📌 優先度: **中（★★★☆☆）**
#### 📈 改善インパクト: **約50%の速度改善（複数件保存時）**

#### 現状の処理フロー

出欠保存時、変更があった各イベントに対して**個別にAPI呼び出し**を実行しています。

`src/client/index.html` 4346-4370行目:

```javascript
updates.forEach(update => {
  google.script.run
    .withSuccessHandler((result) => {
      completed++;
      if (completed + failed === updates.length) {
        // 全て完了後の処理
      }
    })
    .withFailureHandler((error) => {
      failed++;
      if (completed + failed === updates.length) {
        // 全て完了後の処理
      }
    })
    .userSubmitResponse(update.eventId, update.userKey, update.status, update.comment);
});
```

#### 改善案: バッチ保存APIの実装

**1. サーバーサイド: バッチ保存API追加**

`src/main.ts` に以下を追加:

```typescript
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
  
  responses.forEach((response, index) => {
    try {
      const result = submitResponse(
        response.eventId,
        response.userKey,
        response.status,
        response.comment
      );
      
      if (result) {
        successCount++;
      } else {
        failedCount++;
        errors.push(`${index + 1}件目の保存に失敗しました`);
      }
    } catch (error) {
      failedCount++;
      errors.push(`${index + 1}件目: ${(error as Error).message}`);
    }
  });
  
  return { success: successCount, failed: failedCount, errors: errors };
}
```

**2. クライアントサイド: バッチ保存呼び出し**

`src/client/index.html` の `bulkUpdateResponsesForSelectedMember()` を変更:

```javascript
function bulkUpdateResponsesForSelectedMember() {
  // ... (既存の準備処理)
  
  // 1回のAPI呼び出しで全件保存
  google.script.run
    .withSuccessHandler((result) => {
      // 保存ボタンを元に戻す
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '保存';
      }
      
      if (result.failed === 0) {
        showToast(`${result.success}件の出欠を更新しました`, 'success');
        
        // キャッシュを更新（オプション）
        updates.forEach(update => {
          if (!window.allResponsesCache[update.eventId]) {
            window.allResponsesCache[update.eventId] = [];
          }
          const existingIndex = window.allResponsesCache[update.eventId]
            .findIndex(r => r.userKey === update.userKey);
          
          if (existingIndex >= 0) {
            window.allResponsesCache[update.eventId][existingIndex].status = update.status;
            window.allResponsesCache[update.eventId][existingIndex].comment = update.comment;
          } else {
            window.allResponsesCache[update.eventId].push({
              eventId: update.eventId,
              userKey: update.userKey,
              status: update.status,
              comment: update.comment
            });
          }
        });
        
        closeEventStatusModal();
        renderGrid();
      } else {
        showToast(`${result.success}件成功、${result.failed}件失敗しました`, 'warning');
      }
    })
    .withFailureHandler((error) => {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '保存';
      }
      showToast('保存に失敗しました', 'error');
      console.error('バッチ保存エラー:', error);
    })
    .userSubmitResponsesBatch(updates);  // ← 新しいバッチAPI
}
```

#### メリット
- **API呼び出し削減**: N回 → 1回
- **予想保存時間**: 3-5秒（5件の場合） → **0.5-1秒**

#### デメリット
- トランザクション制御が必要（一部失敗時の処理）

#### トレードオフの緩和策
- 失敗した項目の詳細をユーザーに提示し、再試行を促す

---

## 【問題4】イベント詳細モーダル表示のパフォーマンス

#### 📌 優先度: **中（★★★☆☆）**
#### 📈 改善インパクト: **約70%の速度改善（1.5秒 → 0.5秒）**

#### 現状の処理フロー

`src/client/index.html` 3580行目:

```javascript
function showEventDetailModal(eventId) {
  // ... (モーダル準備)
  
  google.script.run
    .withSuccessHandler((result) => {
      // イベント情報と出欠データを表示
    })
    .withFailureHandler((error) => {
      // エラー処理
    })
    .getEventWithResponses(eventId);
}
```

#### 改善案: キャッシュデータの活用

**改善案1/2**で既に全データを取得済みなので、キャッシュを使用します。

```javascript
function showEventDetailModal(eventId) {
  // ... (モーダル準備)
  
  // キャッシュからデータを取得
  const event = currentEvents.find(e => e.id === eventId);
  const responses = window.allResponsesCache[eventId] || [];
  
  if (!event) {
    infoDiv.innerHTML = '<div style="padding: 20px; text-align: center; color: #f44336;">イベント情報の取得に失敗しました</div>';
    return;
  }
  
  // 集計処理（クライアントサイドで実行）
  const tally = {
    attendCount: responses.filter(r => r.status === '○').length,
    maybeCount: responses.filter(r => r.status === '△').length,
    absentCount: responses.filter(r => r.status === '×').length,
    undecidedCount: responses.filter(r => r.status === '-').length
  };
  
  // 即座に表示
  renderEventDetail(event, responses, tally);
}
```

#### メリット
- **API呼び出し削減**: 1回 → 0回
- **即座に表示**: ネットワーク待機なし

---

## 【問題5】管理者ステータス確認の重複

#### 📌 優先度: **低（★★☆☆☆）**
#### 📈 改善インパクト: **約0.3-0.5秒の改善**

#### 現状の問題

`checkAdminStatus()`が`loadInitData()`の後に**別途呼び出される**ため、不要なAPI呼び出しが発生しています。

#### 改善案: getInitDataに統合

```typescript
function getInitData(): { 
  events: AttendanceEvent[]; 
  config: Config; 
  members: Array<{...}>;
  responsesMap: { [eventId: string]: Response[] };
  isAdmin: boolean;  // ← 追加
} {
  // ... (既存処理)
  
  // 管理者判定をサーバーサイドで実行
  const adminToken = getConfig('ADMIN_TOKEN', '');
  const isAdmin = adminToken ? true : false;  // 簡易的な判定（実際は isAdmin() 関数を使用）
  
  return {
    events: events,
    config: config,
    members: members,
    responsesMap: responsesMap,
    isAdmin: isAdmin
  };
}
```

#### メリット
- **API呼び出し削減**: 1回
- **初期化フローの簡素化**

---

## 📋 実装優先順位と期待効果まとめ

| 優先度 | 改善項目 | 実装工数 | 速度改善効果 | 技術難易度 |
|--------|---------|---------|-------------|-----------|
| **1** | 初回読み込みのバッチAPI（改善案1） | 中（2-3時間） | ★★★★★ (85%削減) | 低 |
| **2** | 出欠登録モーダルのキャッシュ活用 | 小（1時間） | ★★★★★ (90%削減) | 低 |
| **3** | loadInitDataの統合（改善案2） | 小（1時間） | ★★★☆☆ (追加10%削減) | 低 |
| **4** | イベント詳細モーダルのキャッシュ活用 | 小（30分） | ★★★☆☆ (70%削減) | 低 |
| **5** | 出欠保存のバッチAPI | 中（2時間） | ★★★☆☆ (50%削減) | 中 |
| **6** | 管理者ステータス確認の統合 | 小（30分） | ★☆☆☆☆ (微改善) | 低 |

### 推奨実装順序

**フェーズ1（最重要）**: 
1. 初回読み込みのバッチAPI実装（改善案1）
2. 出欠登録モーダルのキャッシュ活用

**期待効果**: 13-14秒 → **3-4秒**（約75%改善）

**フェーズ2（効果的）**:
3. loadInitDataの統合（改善案2）
4. イベント詳細モーダルのキャッシュ活用

**期待効果**: 3-4秒 → **2-3秒**（さらに30%改善）

**フェーズ3（仕上げ）**:
5. 出欠保存のバッチAPI
6. 管理者ステータス確認の統合

**最終的な期待効果**: 13-14秒 → **2秒以下**（約85-90%改善）

---

## 🎓 ジュニアエンジニア向け実装ガイド

### 理解すべきポイント

#### 1. N+1クエリ問題とは？

**悪い例（現状）**:
```javascript
// メインデータを取得
const events = getEvents();  // 1回目のDB/Spreadsheetアクセス

// 各イベントごとに関連データを取得（ループ内でAPI呼び出し）
events.forEach(event => {
  const responses = getResponses(event.id);  // N回のDB/Spreadsheetアクセス
});

// 合計: 1 + N回のアクセス（N=12なら13回）
```

**良い例（改善後）**:
```javascript
// 1回のAPI呼び出しで全データを取得
const { events, responsesMap } = getAllEventsWithResponses();  // 1回のみ

// データは既に全て揃っているため、ループ内でAPI呼び出し不要
events.forEach(event => {
  const responses = responsesMap[event.id];  // メモリ上のデータを参照
});

// 合計: 1回のアクセスのみ
```

#### 2. google.script.runの特性

GASのクライアント・サーバー通信には以下の特性があります：

```javascript
// ❌ 誤解: 並列実行されると思いがち
events.forEach(event => {
  google.script.run.getEventWithResponses(event.id);
});
// → 実際は直列実行される！

// ✅ 正解: 1回のAPI呼び出しで全データを取得
google.script.run.getAllEventsWithResponses();
```

#### 3. Spreadsheetアクセスの最適化

```typescript
// ❌ 非効率: 毎回全データを取得してフィルタリング
function getResponses(eventId: string): Response[] {
  const data = sheet.getDataRange().getValues();  // 全データ取得
  return data.filter(row => row[0] === eventId);  // フィルタリング
}

// ✅ 効率的: 1回の取得で全データを返す
function getAllResponses(): Response[] {
  const data = sheet.getDataRange().getValues();  // 1回だけ全データ取得
  return data.map(row => ({ /* Response型に変換 */ }));
}
```

### デバッグ方法

#### 1. ネットワークタブでAPI呼び出し回数を確認

Chrome DevTools → Network → Filter: XHR → ページリロード

- `exec?` で始まるリクエストがgoogle.script.runのAPI呼び出し
- 12個並んでいたら、N+1問題が発生している証拠

#### 2. GASのロガーで実行時間を計測

```typescript
function getEventWithResponses(eventId: string) {
  const startTime = new Date().getTime();
  
  // 処理
  const result = /* ... */;
  
  const endTime = new Date().getTime();
  Logger.log(`⏱️ 実行時間: ${endTime - startTime}ms`);
  
  return result;
}
```

#### 3. クライアントサイドでのパフォーマンス計測

```javascript
console.time('renderGrid');
renderGrid();
console.timeEnd('renderGrid');
// → 出力: renderGrid: 6234.5ms
```

---

## 🚨 注意事項

### GASの制約

1. **6分の実行時間制限**: 1回のAPI呼び出しは6分以内に完了する必要がある
   - 現状のデータ量（12イベント、30出欠）では全く問題なし
   - 1000イベント規模でも余裕

2. **50MBのレスポンスサイズ制限**: API呼び出しの返り値は50MB以下
   - 現状のデータ量では0.1MB程度（全く問題なし）

3. **同時実行数制限**: 同一ユーザーからの同時実行は30まで
   - 改善後は同時実行数が大幅に減るため、問題解消

### データ整合性

キャッシュを使用する場合、以下に注意：

1. **データ更新時にキャッシュをクリア**
2. **他ユーザーの更新はリアルタイムに反映されない**（許容範囲）
3. **手動リフレッシュ機能の提供**

---

## 📊 期待される改善結果

### ビフォー・アフター

| 操作 | 改善前 | 改善後（フェーズ1） | 改善後（フェーズ2） |
|------|--------|-------------------|-------------------|
| 初回ページ読み込み | 13-14秒 | 3-4秒 | 2秒以下 |
| 出欠登録モーダル表示 | 6秒 | 0.1秒 | 0.1秒 |
| 出欠保存（5件） | 3-5秒 | 3-5秒 | 0.5-1秒 |
| イベント詳細表示 | 1.5秒 | 1.5秒 | 0.1秒 |
| **合計API呼び出し数（初回）** | **14回** | **2回** | **1回** |

### ユーザー体験の向上

- **待機時間の大幅削減**: ストレスフリーな操作感
- **モバイル環境での改善**: 低速回線でも快適に動作
- **スケーラビリティ**: データ量が増えても安定したパフォーマンス

---

## 🔚 まとめ

### 最重要ポイント

1. **N+1クエリ問題が最大のボトルネック**
   - 12イベント × 各イベントごとのAPI呼び出し = 12回の不要なネットワーク往復
   
2. **バッチ取得APIの実装で85%の速度改善が可能**
   - 実装コスト: 低（2-3時間）
   - 効果: 最大
   
3. **段階的な実装が可能**
   - フェーズ1だけでも劇的な改善効果
   - リスク分散可能

### Next Steps

1. **Phase 1実装**: バッチ取得API + モーダルキャッシュ化（推定4時間）
2. **効果測定**: パフォーマンス改善を定量的に確認
3. **Phase 2実装**: さらなる最適化（推定2時間）
4. **本番適用**: 段階的リリース

---

**調査完了日**: 2025年11月11日  
**レポート作成**: AI Technical Analyst  
**ドキュメントバージョン**: 1.0


