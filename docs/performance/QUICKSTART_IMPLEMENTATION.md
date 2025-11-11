# パフォーマンス改善 クイックスタートガイド

**対象**: 実装担当エンジニア  
**所要時間**: 約7時間  
**前提知識**: TypeScript, GAS, HTML/JavaScript の基礎

---

## 🚀 今すぐ始める（5分で準備完了）

### Step 0: 準備

```bash
# 1. リポジトリのバックアップ
git add -A
git commit -m "パフォーマンス改善実装前のバックアップ"

# 2. 作業ブランチを作成
git checkout -b feature/performance-improvement

# 3. 必要なドキュメントを確認
# - docs/performance_implementation_plan.md（この計画書）
# - docs/performance_improvement_samples.md（コードサンプル）
```

---

## 📦 実装の流れ（Phase 1-5）

### Phase 1: バッチ取得API（3時間）⭐最重要

#### 1-1. サーバーサイド: `getAllResponses()` 追加（30分）

**ファイル**: `src/server/responses.ts`  
**追加場所**: `getResponses()` 関数の後

```typescript
/**
 * 全出欠回答を一括取得
 */
function getAllResponses(): Response[] {
  try {
    const sheet = getResponsesSheet();
    const data = sheet.getDataRange().getValues();
    const responses: Response[] = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      responses.push({
        eventId: row[0],
        userKey: row[1],
        status: row[2],
        comment: row[3] || undefined,
        createdAt: row[4],
        updatedAt: row[5]
      });
    }
    
    Logger.log(`✅ 全出欠回答取得成功: ${responses.length}件`);
    return responses;
  } catch (error) {
    Logger.log(`❌ エラー: 全出欠回答取得失敗 - ${(error as Error).message}`);
    return [];
  }
}
```

#### 1-2. サーバーサイド: `getAllEventsWithResponses()` 追加（30分）

**ファイル**: `src/main.ts`  
**追加場所**: `getEventWithResponses()` 関数の後

```typescript
/**
 * 全イベントと全出欠データを一括取得するAPI
 */
function getAllEventsWithResponses(): {
  success: boolean;
  events: AttendanceEvent[];
  responsesMap: { [eventId: string]: Response[] };
  error?: string;
} {
  try {
    const events = getEvents('upcoming');
    const allResponses = getAllResponses();
    
    // イベントIDごとにグループ化
    const responsesMap: { [eventId: string]: Response[] } = {};
    allResponses.forEach(response => {
      if (!responsesMap[response.eventId]) {
        responsesMap[response.eventId] = [];
      }
      responsesMap[response.eventId].push(response);
    });
    
    return { success: true, events, responsesMap };
  } catch (error) {
    Logger.log(`❌ エラー: ${(error as Error).message}`);
    return { success: false, events: [], responsesMap: {}, error: (error as Error).message };
  }
}
```

#### 1-3. クライアントサイド: グローバルキャッシュ追加（10分）

**ファイル**: `src/client/index.html`  
**追加場所**: `<script>` タグ内の先頭（約1830行目）

```javascript
// 既存のグローバル変数の後に追加
let currentEvents = [];
let currentUserKey = '';
let currentAuthMode = 'anonymous';
let isAdminUser = false;

// ← ここに追加
window.allResponsesCache = {};
```

#### 1-4. クライアントサイド: `renderGrid()` 書き換え（1時間）

**ファイル**: `src/client/index.html`  
**変更箇所**: `renderGrid()` 関数（約2458-2508行目）

**置き換え前**: 12個のループでAPI呼び出し  
**置き換え後**: 1回のAPI呼び出し

```javascript
function renderGrid() {
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
        const allResponses = {};
        Object.keys(result.responsesMap).forEach(eventId => {
          allResponses[eventId] = {};
          result.responsesMap[eventId].forEach(response => {
            const member = memberList.find(m => m.userKey === response.userKey);
            if (member) {
              const displayName = getMemberDisplayName(member);
              allResponses[eventId][displayName] = response.status;
            }
          });
        });
        
        window.allResponsesCache = result.responsesMap; // キャッシュ保存
        renderGridTable(allResponses);
      } else {
        gridContainer.innerHTML = '<p style="padding: 20px; text-align: center; color: #f44336;">データの取得に失敗しました</p>';
      }
    })
    .withFailureHandler((error) => {
      console.error('❌ データ取得エラー:', error);
      gridContainer.innerHTML = '<p style="padding: 20px; text-align: center; color: #f44336;">データの取得に失敗しました</p>';
    })
    .getAllEventsWithResponses();
}
```

#### 1-5. ビルド・デプロイ・動作確認（30分）

```bash
# ビルド
npm run build

# デプロイ
npm run push
# または
npx clasp push
```

**動作確認**:
1. ブラウザでアプリを開く
2. Network タブを開く
3. スーパーリロード（Ctrl+Shift+R）
4. `exec?` で始まるリクエストが **2-3回** になっていることを確認（目標）

---

### Phase 2: モーダルのキャッシュ活用（1時間）

#### 2-1. `renderEventStatusList()` 書き換え（1時間）

**ファイル**: `src/client/index.html`  
**変更箇所**: `renderEventStatusList()` 関数（約3245-3297行目）

```javascript
function renderEventStatusList(memberName) {
  const container = document.getElementById('event-status-list');
  
  // キャッシュがない場合は取得
  if (!window.allResponsesCache || Object.keys(window.allResponsesCache).length === 0) {
    container.innerHTML = '<div style="padding: 20px; text-align: center;">読み込み中...</div>';
    
    google.script.run
      .withSuccessHandler((result) => {
        if (result.success && result.responsesMap) {
          window.allResponsesCache = result.responsesMap;
          renderEventStatusList(memberName); // 再帰呼び出し
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
    container.innerHTML = '<div>イベントがありません</div>';
    return;
  }

  // キャッシュからデータを取得（API呼び出しなし！）
  const responsesMap = window.allResponsesCache;
  const eventStatusMap = {};
  
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

**動作確認**:
- メンバー名をクリック → モーダルが **即座に表示** されることを確認

---

### Phase 3: loadInitData統合（1時間）

#### 3-1. `getInitData()` 拡張（30分）

**ファイル**: `src/main.ts`  
**変更箇所**: `getInitData()` 関数（71-111行目）

返り値の型に `responsesMap` を追加:
```typescript
function getInitData(): { 
  events: AttendanceEvent[]; 
  config: Config; 
  members: Array<{...}>;
  responsesMap: { [eventId: string]: Response[] };  // ← 追加
}
```

関数内に以下を追加:
```typescript
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
```

#### 3-2. `loadInitData()` 修正（20分）

**ファイル**: `src/client/index.html`  
**変更箇所**: `loadInitData()` の `withSuccessHandler` 内（約1880-1918行目）

以下を追加:
```javascript
// 出欠データをグローバルキャッシュに保存
if (data.responsesMap) {
  window.allResponsesCache = data.responsesMap;
  console.log('✅ 出欠データキャッシュ保存:', Object.keys(data.responsesMap).length, 'イベント分');
} else {
  window.allResponsesCache = {};
}
```

#### 3-3. `renderGrid()` 最終形（10分）

**ファイル**: `src/client/index.html`

```javascript
function renderGrid() {
  if (memberList.length === 0) {
    loadMemberList();
  }
  
  const gridContainer = document.getElementById('attendance-grid');

  if (currentEvents.length === 0) {
    gridContainer.innerHTML = '<p>イベントがありません</p>';
    return;
  }

  // キャッシュからデータを取得（API呼び出しなし！）
  const responsesMap = window.allResponsesCache || {};
  const allResponses = {};
  
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
  
  // テーブルを即座に描画
  renderGridTable(allResponses);
}
```

**動作確認**:
- Network タブで `exec?` リクエストが **1回のみ** になることを確認

---

### Phase 4: イベント詳細モーダル（30分）

#### 4-1. `showEventDetailModal()` 書き換え

**ファイル**: `src/client/index.html`  
**変更箇所**: `showEventDetailModal()` 関数（約3575行目～）

既存のAPI呼び出し部分を削除し、以下に置き換え:

```javascript
function showEventDetailModal(eventId) {
  const modal = document.getElementById('event-detail-modal');
  if (modal) modal.style.display = 'block';

  const infoDiv = document.getElementById('event-detail-info');
  const breakdownDiv = document.getElementById('attendance-breakdown');
  const commentsDiv = document.getElementById('attendance-comments');
  
  // キャッシュからデータを取得
  const event = currentEvents.find(e => e.id === eventId);
  const responses = (window.allResponsesCache && window.allResponsesCache[eventId]) || [];
  
  if (!event) {
    if (infoDiv) infoDiv.innerHTML = '<div>イベント情報の取得に失敗しました</div>';
    return;
  }
  
  // 集計処理（クライアントサイドで実行）
  const tally = {
    attendCount: responses.filter(r => r.status === '○').length,
    maybeCount: responses.filter(r => r.status === '△').length,
    absentCount: responses.filter(r => r.status === '×').length,
    undecidedCount: responses.filter(r => r.status === '-').length
  };
  
  // 表示処理（既存のロジックを使用）
  // ... (イベント情報、集計、コメントの表示)
}
```

**詳細な実装コード**: `performance_improvement_samples.md` の Phase 4 参照

---

### Phase 5: 出欠保存のバッチ化（2時間）

#### 5-1. `userSubmitResponsesBatch()` 追加（1時間）

**ファイル**: `src/main.ts`  
**追加場所**: `userSubmitResponse()` 関数の後

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
        errors.push(`${index + 1}件目の保存に失敗`);
      }
    } catch (error) {
      failedCount++;
      errors.push(`${index + 1}件目: ${(error as Error).message}`);
    }
  });
  
  return { success: successCount, failed: failedCount, errors };
}
```

#### 5-2. `bulkUpdateResponsesForSelectedMember()` 書き換え（1時間）

**ファイル**: `src/client/index.html`  
**変更箇所**: 約4330-4380行目

既存の `forEach` ループを削除し、以下に置き換え:

```javascript
// 1回のAPI呼び出しで全件保存
google.script.run
  .withSuccessHandler((result) => {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = '保存';
    }
    
    if (result.failed === 0) {
      showToast(`${result.success}件の出欠を更新しました`, 'success');
      
      // キャッシュを更新
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
      showToast(`${result.success}件成功、${result.failed}件失敗`, 'warning');
    }
  })
  .withFailureHandler((error) => {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = '保存';
    }
    showToast('保存に失敗しました', 'error');
  })
  .userSubmitResponsesBatch(updates);
```

---

## 🧪 テストの実行

### 1. ビルド

```bash
npm run build
```

### 2. デプロイ

```bash
npm run push
```

### 3. パフォーマンス測定

**Chrome DevTools で実行**:

```javascript
// 1. 初回読み込み速度
console.time('初回読み込み');
location.reload();
// 読み込み完了後、Consoleで確認
console.timeEnd('初回読み込み');
// 目標: 2秒以下

// 2. Network タブ確認
// XHR フィルタを有効化
// exec? で始まるリクエスト数をカウント
// 目標: 1回のみ
```

---

## ✅ 完了チェックリスト

### 必須確認項目
- [ ] 初回読み込み: **2秒以下**
- [ ] API呼び出し数: **1回**
- [ ] モーダル表示: **0.5秒以下**
- [ ] エラーなく動作

### 実装完了！

全て ✅ になったら完了です。お疲れさまでした！🎉

---

## 🆘 困ったら

1. **エラーログを確認**
   - GAS: Apps Script エディタ → 実行ログ
   - ブラウザ: F12 → Console

2. **サンプルコードを参照**
   - `docs/performance_improvement_samples.md`

3. **段階的にデバッグ**
   - Phase 1 から順番に確認
   - `console.log()` でデータを確認

---

**所要時間の目安**:
- Phase 1: 3時間
- Phase 2: 1時間
- Phase 3: 1時間
- Phase 4: 30分
- Phase 5: 2時間
- **合計: 約7時間**

Good luck! 🚀


