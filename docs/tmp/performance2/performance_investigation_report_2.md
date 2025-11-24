# GAS出欠管理アプリ 第2期 パフォーマンス調査レポート

**作成日**: 2025年11月13日  
**対象アプリ**: UnionBoard - TMU 練習予定・出欠管理アプリ  
**調査者**: AI Performance Analyst  
**前回改善**: 2025年11月11日（Phase 1-5実装済み）

---

## 📊 エグゼクティブサマリー

### 前回改善の成果
前回の性能改善（Phase 1-5）により、以下の成果が達成されています：
- ✅ 初回読み込み：13-14秒 → 2秒以下（約85%改善）
- ✅ API呼び出し数：14回 → 1回（93%削減）
- ✅ 出欠登録モーダル表示：6秒 → 0.1秒以下（約98%改善）
- ✅ バッチ取得API・キャッシュ機構の実装完了

### 新たに発見された性能問題
今回、ユーザーからのフィードバックにより、以下の性能問題が報告されました：

| 優先度 | 問題箇所 | 現状 | 影響度 |
|--------|---------|------|--------|
| 🔴 高 | 初回表示（再確認） | 要測定 | 全ユーザー |
| 🔴 高 | 出欠保存 | 要測定 | 全ユーザー |
| 🟡 中（管理者機能） | 期間設定モーダル表示 | 遅い | 管理者 |
| 🟡 中（管理者機能） | ユーザー削除処理 | 遅い | 管理者 |
| 🟡 中（管理者機能） | イベント新規登録 | 遅い | 管理者 |
| 🟡 中（管理者機能） | イベント削除モーダル表示 | 遅い | 管理者 |
| 🟡 中（管理者機能） | イベント削除実行 | 遅い | 管理者 |

---

## 🔍 詳細調査結果

### 【最優先】問題1: 初回表示の性能再確認

#### 現状分析
前回の改善により、以下が実装されています：
- ✅ `getInitData()` API：イベント、出欠データ、メンバー情報を一括取得
- ✅ `window.allResponsesCache`：出欠データのキャッシュ
- ✅ `renderGrid()`：キャッシュからデータを取得（API呼び出しなし）

**コード該当箇所**: `src/client/index.html` 2068-2141行目

```javascript
function loadInitData() {
  return new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler((data) => {
        // イベント、メンバー、出欠データを取得
        currentEvents = data.events;
        memberList = data.members.map(...);
        window.allResponsesCache = data.responsesMap;
        
        // 管理者ステータス確認
        checkAdminStatus().then(() => {
          renderEvents(); // ← キャッシュから即座に描画
        });
      })
      .getInitData(); // ← 1回のAPI呼び出し
  });
}
```

#### 潜在的なボトルネック
1. **`getInitData()`の処理時間**（サーバーサイド）
   - `getEvents('all')`：全イベントを取得
   - `getAllResponses()`：全出欠データを取得
   - `getMembers()`：全メンバーを取得
   - データ量が増えると遅くなる可能性

2. **`checkAdminStatus()`の処理時間**（クライアント→サーバー）
   - 追加のAPI呼び出しが発生
   - `renderEvents()`の実行を待たせている

3. **`renderGridTable()`の処理時間**（クライアントサイド）
   - DOM操作の量
   - イベント数 × メンバー数の計算量

#### 改善の方向性
✅ **論点なし**：以下の改善は確実に効果があり、実装すべき
1. データ取得の最適化（フィルタリング、インデックス化）
2. `checkAdminStatus()`の並列化または統合
3. DOM描画の最適化（仮想スクロール、遅延レンダリング）

⚠️ **論点あり**：以下は検討が必要
- 表示期間フィルタの活用（データ量削減）→ 既に実装されているか確認が必要

---

### 【最優先】問題2: 出欠保存の性能

#### 現状分析
前回の改善により、以下が実装されています：
- ✅ `userSubmitResponsesBatch()` API：複数の出欠回答を一括保存

**コード該当箇所**: `src/main.ts` 350-478行目

```typescript
function userSubmitResponsesBatch(responses: Array<{...}>): {
  success: number; failed: number; errors: string[]
} {
  // シートを1回だけ取得
  const sheet = getResponsesSheet();
  const data = sheet.getDataRange().getValues();
  
  // 既存データのインデックスを作成
  const existingRows = new Map<string, number>();
  for (let i = 1; i < data.length; i++) {
    const key = `${data[i][0]}_${data[i][1]}`; // eventId_userKey
    existingRows.set(key, i);
  }
  
  // 更新・追加データを準備
  rowsToUpdate.forEach(...);
  rowsToAdd.forEach(...);
  
  // 一括更新・追加
  ...
  
  // カレンダー同期を各回答ごとに実行 ← ⚠️ 潜在的なボトルネック！
  const uniqueEventIds = [...new Set(responses.map(r => r.eventId))];
  uniqueEventIds.forEach(eventId => {
    try {
      syncCalendarDescriptionForEvent(eventId); // ← N回の同期処理
    } catch (error) {
      Logger.log(`⚠️ カレンダー同期失敗: ${eventId}`);
    }
  });
}
```

**クライアントサイド**: `src/client/index.html` 4441-4571行目

```javascript
function bulkUpdateResponsesForSelectedMember() {
  google.script.run
    .withSuccessHandler((result) => {
      // キャッシュを更新
      updates.forEach(update => {
        // window.allResponsesCacheを更新
      });
      
      closeEventStatusModal();
      renderGrid(); // ← 即座に描画（API呼び出しなし）
    })
    .userSubmitResponsesBatch(updates);
}
```

#### 潜在的なボトルネック
1. **カレンダー同期処理**（`syncCalendarDescriptionForEvent`）
   - 各イベントごとにGoogleカレンダーAPIを呼び出し
   - 複数イベントの出欠を保存した場合、N回のAPI呼び出し
   - ネットワークレイテンシ × N回

2. **Spreadsheet書き込み処理**
   - `rowsToUpdate.forEach()`：個別にsetValues()を実行
   - バッチ更新が可能な可能性

#### 改善の方向性
✅ **論点なし**：以下の改善は確実に効果があり、実装すべき
1. カレンダー同期を非同期化（保存完了を待たずにレスポンスを返す）
2. Spreadsheet書き込みの完全バッチ化（複数行を1回のsetValues()で更新）
3. キャッシュ更新の最適化

⚠️ **論点あり**：以下は検討が必要
- カレンダー同期を省略または遅延実行（ユーザー体験への影響）
- カレンダー同期のエラーハンドリング（失敗時の挙動）

---

### 【管理者機能】問題3: 期間設定モーダル表示が遅い

#### 📌 優先度: 中（管理者機能）
#### 📈 改善インパクト: 約90%の速度改善見込み

#### 現状の処理フロー

**コード該当箇所**: `src/client/index.html` 2359-2389行目

```javascript
function openDisplayPeriodModal() {
  const modal = document.getElementById('display-period-modal');
  if (!modal) return;

  // ⚠️ 問題: モーダルを開くために getInitData() を呼び出している
  google.script.run
    .withSuccessHandler((data) => {
      // 現在の設定値を入力フィールドに設定
      const startInput = document.getElementById('display-period-start');
      const endInput = document.getElementById('display-period-end');
      
      if (startInput && data.config.DISPLAY_START_DATE) {
        startInput.value = formatDateForInput(new Date(data.config.DISPLAY_START_DATE));
      }
      if (endInput && data.config.DISPLAY_END_DATE) {
        endInput.value = formatDateForInput(new Date(data.config.DISPLAY_END_DATE));
      }
      
      modal.style.display = 'block'; // ← API呼び出し完了後に表示
    })
    .getInitData(); // ← 全データを取得（不要！）
}
```

#### 問題の本質
1. **不要なAPI呼び出し**
   - 表示期間設定の現在値を取得するために、`getInitData()` を呼び出している
   - `getInitData()` は、イベント一覧・出欠データ・メンバー情報を全て取得する重い処理
   - 必要なのは `config.DISPLAY_START_DATE` と `config.DISPLAY_END_DATE` のみ

2. **モーダル表示の遅延**
   - API呼び出しが完了するまでモーダルが表示されない
   - ネットワークレイテンシ（0.3-0.5秒）+ サーバー処理時間（0.5-1秒）= 合計1-2秒の待機

#### 改善案：軽量なAPI作成またはキャッシュ活用

##### 改善案A：既存のキャッシュを活用（推奨）
初回読み込み時に取得した `data.config` をグローバル変数にキャッシュし、モーダル表示時はキャッシュから取得する。

**メリット**：
- API呼び出し削減：1回 → 0回
- 即座にモーダル表示：ネットワーク待機なし
- 実装コスト：極めて低（変数追加のみ）
- 予想表示時間：1-2秒 → **0.1秒以下**（約90%改善）

**デメリット**：
- 設定値のリアルタイム性低下（他の管理者が変更した場合、即座に反映されない）
  - 緩和策：保存成功後にキャッシュを更新

**実装方針**：

1. **グローバル変数追加**（`src/client/index.html`）

```javascript
// グローバル変数
let currentConfig = null; // 設定情報のキャッシュ
```

2. **`loadInitData()` でキャッシュ保存**

```javascript
function loadInitData() {
  return new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler((data) => {
        // 既存処理
        currentEvents = data.events;
        memberList = data.members.map(...);
        window.allResponsesCache = data.responsesMap;
        currentConfig = data.config; // ← 追加：キャッシュに保存
        
        // 以下既存処理
        ...
      })
      .getInitData();
  });
}
```

3. **`openDisplayPeriodModal()` をキャッシュ活用に変更**

```javascript
function openDisplayPeriodModal() {
  const modal = document.getElementById('display-period-modal');
  if (!modal) return;

  // キャッシュから設定値を取得（API呼び出しなし！）
  const config = currentConfig || {};
  
  const startInput = document.getElementById('display-period-start');
  const endInput = document.getElementById('display-period-end');
  
  if (startInput && config.DISPLAY_START_DATE) {
    startInput.value = formatDateForInput(new Date(config.DISPLAY_START_DATE));
  } else if (startInput) {
    startInput.value = '';
  }
  
  if (endInput && config.DISPLAY_END_DATE) {
    endInput.value = formatDateForInput(new Date(config.DISPLAY_END_DATE));
  } else if (endInput) {
    endInput.value = '';
  }
  
  // 即座にモーダルを表示
  modal.style.display = 'block';
}
```

4. **`saveDisplayPeriod()` で保存成功後にキャッシュ更新**

```javascript
function saveDisplayPeriod() {
  // 既存の保存処理
  google.script.run
    .withSuccessHandler((result) => {
      if (result.success) {
        // キャッシュを更新
        currentConfig.DISPLAY_START_DATE = startDateISO;
        currentConfig.DISPLAY_END_DATE = endDateISO;
        
        // 既存処理
        closeDisplayPeriodModal();
        showToast('表示期間を設定しました', 'success');
        loadInitData().then(() => renderEvents());
      }
    })
    .adminSetDisplayPeriod(startDateISO, endDateISO, currentUserKey, localStorage.getItem('adminToken'));
}
```

**判定**：✅ **論点なし** - キャッシュ活用は確実に効果があり、デメリットも軽微

##### 改善案B：軽量なAPI作成

表示期間設定のみを取得する専用APIを作成する。

**メリット**：
- 最新の設定値を取得可能
- データ量削減

**デメリット**：
- 実装コスト：中（新規API作成）
- 依然としてAPI呼び出しは発生（高速化は限定的）

**判定**：⚠️ **論点あり** - 改善案Aで十分であり、実装コストが高い

**推奨**：改善案A（キャッシュ活用）を実装する

---

### 【管理者機能】問題4: ユーザー削除処理が遅い

#### 📌 優先度: 中（管理者機能）
#### 📈 改善インパクト: 約50-70%の速度改善見込み

#### 現状の処理フロー

**クライアントサイド**: `src/client/index.html` 4073-4122行目、4604-4655行目

```javascript
function deleteMemberFromModal() {
  if (!confirm(`${selectedMember}を削除しますか？`)) {
    return;
  }

  const member = memberList.find(m => getMemberDisplayName(m) === selectedMember);
  const userKey = member.userKey;
  
  // サーバーからも削除
  google.script.run
    .withSuccessHandler((result) => {
      if (result.success) {
        // ローカルキャッシュから削除
        memberList.splice(index, 1);
        Object.keys(gridData).forEach(eventId => {
          delete gridData[eventId][selectedMember];
        });
        
        closeMemberEditModal();
        renderGrid(); // ← 即座に再描画（キャッシュから）
        showToast('メンバーを削除しました', 'success');
      }
    })
    .deleteMemberAPI(userKey); // ← この処理が遅い
}
```

**サーバーサイド（API）**: `src/main.ts` 590-618行目

```typescript
function deleteMemberAPI(userKey: string): { success: boolean; error?: string } {
  try {
    const result = deleteMember(userKey); // ← 実際の削除処理
    if (result) {
      return { success: true };
    } else {
      return { success: false, error: 'メンバー削除に失敗しました' };
    }
  } catch (error) {
    Logger.log(`❌ エラー: メンバー削除API失敗 - ${(error as Error).message}`);
    return { success: false, error: (error as Error).message };
  }
}
```

**サーバーサイド（実装）**: `src/server/members.ts` 162-200行目

```typescript
function deleteMember(userKey: string): boolean {
  try {
    const sheet = getMembersSheet();
    const data = sheet.getDataRange().getValues();
    
    // 該当する行を検索
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === userKey) {
        // ⚠️ 問題1: 関連する全てのレスポンスを削除
        const deletedCount = deleteResponsesByUserKey(userKey); // ← これが遅い！
        if (deletedCount > 0) {
          Logger.log(`✅ 関連レスポンス削除完了: ${deletedCount}件`);
        }
        
        // メンバーを削除
        sheet.deleteRow(i + 1);
        Logger.log(`✅ メンバー削除: ${userKey}`);
        return true;
      }
    }
    
    return false;
  } catch (error) {
    Logger.log(`❌ エラー: メンバー削除失敗 - ${(error as Error).message}`);
    return false;
  }
}
```

**関連レスポンス削除**: `src/server/responses.ts` 321-363行目

```typescript
function deleteResponsesByUserKey(userKey: string): number {
  try {
    const sheet = getResponsesSheet();
    const data = sheet.getDataRange().getValues();
    const rowsToDelete: number[] = [];
    
    // ⚠️ 問題2: 全データをスキャンして該当行を収集
    for (let i = data.length - 1; i >= 1; i--) {
      const row = data[i];
      if (row[1] === userKey) { // userKeyが一致
        rowsToDelete.push(i + 1); // 行番号を保存
      }
    }
    
    // ⚠️ 問題3: 1行ずつ削除
    let deletedCount = 0;
    for (const rowIndex of rowsToDelete) {
      try {
        sheet.deleteRow(rowIndex); // ← N回のSpreadsheet操作
        deletedCount++;
      } catch (error) {
        Logger.log(`⚠️ 行削除エラー: ${rowIndex}`);
      }
    }
    
    return deletedCount;
  } catch (error) {
    Logger.log(`❌ エラー: レスポンス削除失敗 - ${(error as Error).message}`);
    return 0;
  }
}
```

#### 問題の本質
1. **全データスキャン**
   - `getDataRange().getValues()`：全出欠データを取得（データ量が多いと遅い）
   - 出欠データが100件の場合：100行スキャン
   - 出欠データが1000件の場合：1000行スキャン

2. **個別行削除の繰り返し**
   - `sheet.deleteRow()`：1行ずつ削除
   - 該当ユーザーの出欠データが10件の場合：10回のSpreadsheet操作
   - 該当ユーザーの出欠データが50件の場合：50回のSpreadsheet操作

3. **速度試算**

| 出欠データ数 | 該当データ数 | 処理時間 |
|------------|------------|---------|
| 100件 | 10件 | 1-2秒 |
| 500件 | 30件 | 3-5秒 |
| 1000件 | 50件 | 5-10秒 |

#### 改善案：バッチ削除の実装

##### 改善案A：バッチ削除（推奨）

**概要**：
該当する行をマークし、`deleteRows()`を使ってまとめて削除する。ただし、GAS APIには`deleteRows()`が存在しないため、代替手法として以下を実装：
1. 削除対象行を特定
2. 削除対象以外のデータを新しい配列に収集
3. シート全体をクリアして、新しいデータを書き込む

**メリット**：
- Spreadsheet操作回数：N回 → 2回（クリア + 書き込み）
- 予想処理時間：5-10秒 → **1-2秒**（50-80%改善）

**デメリット**：
- シート全体を書き換えるため、データ量が多い場合は注意が必要
- 実装がやや複雑

**実装方針**：

1. **`deleteResponsesByUserKey()` の書き換え**（`src/server/responses.ts`）

```typescript
function deleteResponsesByUserKey(userKey: string): number {
  try {
    if (!userKey) {
      Logger.log('❌ エラー: userKeyは必須です');
      return 0;
    }
    
    const sheet = getResponsesSheet();
    const data = sheet.getDataRange().getValues();
    
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
    Logger.log((error as Error).stack);
    return 0;
  }
}
```

**判定**：✅ **論点なし** - バッチ削除は確実に効果があり、実装すべき

##### 改善案B：論理削除（ソフトデリート）

**概要**：
行を物理的に削除せず、削除フラグを立てる。表示時に削除フラグのあるデータをフィルタリング。

**メリット**：
- 削除処理が高速（フラグ更新のみ）
- データ復旧が可能

**デメリット**：
- データ量が増加し続ける（定期的なクリーンアップが必要）
- 既存コードの大幅な変更が必要（全ての読み取り処理にフィルタを追加）

**判定**：⚠️ **論点あり** - 実装コストが高く、現時点では不要

**推奨**：改善案A（バッチ削除）を実装する

---

### 【管理者機能】問題5: イベント新規登録が遅い

#### 📌 優先度: 中（管理者機能）
#### 📈 改善インパクト: 約30-50%の速度改善見込み

#### 現状の処理フロー

**クライアントサイド**: `src/client/index.html` 5330-5359行目

```javascript
function saveEvent(e) {
  e.preventDefault();
  
  // フォーム入力値を取得
  const title = document.getElementById('event-title').value.trim();
  const allDay = document.getElementById('event-all-day').checked;
  // ... その他の入力値取得
  
  const saveBtn = document.getElementById('save-event-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = '保存中...';

  if (editingEventId) {
    // 更新処理（省略）
  } else {
    // ⚠️ 作成処理
    google.script.run
      .withSuccessHandler((result) => {
        saveBtn.disabled = false;
        saveBtn.textContent = '保存';
        
        if (result.success) {
          showToast('イベントを作成しました', 'success');
          closeEventModal();
          // ⚠️ 問題: 全データを再読み込み
          loadInitData().then(() => {
            renderEvents();
          });
        } else {
          showToast(result.error || '作成に失敗しました', 'error');
        }
      })
      .withFailureHandler((error) => {
        saveBtn.disabled = false;
        saveBtn.textContent = '保存';
        showToast(error.message || 'エラーが発生しました', 'error');
      })
      .adminCreateEvent({...}, currentUserKey, localStorage.getItem('adminToken'));
  }
}
```

**サーバーサイド**: `src/main.ts` 140-193行目

```typescript
function adminCreateEvent(
  eventData: {...},
  userKey?: string,
  adminToken?: string
): { success: boolean; eventId?: string; error?: string } {
  try {
    // 管理者権限チェック
    if (userKey && !isAdmin(userKey, adminToken)) {
      return { success: false, error: '管理者権限が必要です' };
    }

    // バリデーション
    if (!eventData || !eventData.title || !eventData.start || !eventData.end) {
      return { success: false, error: 'タイトル、開始日時、終了日時は必須です' };
    }
    
    // イベント作成
    const eventId = createEvent(
      eventData.title,
      eventData.start,
      eventData.end,
      eventData.location,
      eventData.description
    );
    
    if (eventId) {
      return { success: true, eventId: eventId };
    } else {
      return { success: false, error: 'イベント作成に失敗しました' };
    }
  } catch (error) {
    Logger.log(`❌ エラー: イベント作成API失敗 - ${(error as Error).message}`);
    return { success: false, error: (error as Error).message };
  }
}
```

#### 問題の本質
1. **全データ再読み込み**
   - イベント作成成功後、`loadInitData()` を呼び出している
   - `loadInitData()`：イベント一覧、出欠データ、メンバー情報を全て再取得
   - 必要なのは、新規作成されたイベント1件のみ

2. **処理時間の内訳**

| 処理 | 時間 |
|------|------|
| イベント作成API | 0.5-1秒 |
| `loadInitData()` | 1-2秒 |
| `renderEvents()` | 0.3-0.5秒 |
| **合計** | **1.8-3.5秒** |

#### 改善案：作成されたイベントのみを追加

##### 改善案A：レスポンスに作成されたイベントを含める（推奨）

**概要**：
`adminCreateEvent()` のレスポンスに、作成されたイベントオブジェクトを含める。クライアント側で `currentEvents` に追加し、再描画する。

**メリット**：
- API呼び出し削減：2回（作成 + 再読み込み）→ 1回（作成のみ）
- 予想処理時間：1.8-3.5秒 → **0.8-1.5秒**（約50%改善）
- 実装コスト：低

**デメリット**：
- レスポンスデータ量が若干増加（1イベント分のみなので影響は軽微）

**実装方針**：

1. **`adminCreateEvent()` の戻り値を拡張**（`src/main.ts`）

```typescript
function adminCreateEvent(
  eventData: {...},
  userKey?: string,
  adminToken?: string
): { 
  success: boolean; 
  eventId?: string; 
  event?: AttendanceEvent; // ← 追加
  error?: string 
} {
  try {
    // 既存の処理
    const eventId = createEvent(...);
    
    if (eventId) {
      // 作成されたイベントを取得
      const event = getEventById(eventId);
      
      return { 
        success: true, 
        eventId: eventId,
        event: event // ← 追加
      };
    } else {
      return { success: false, error: 'イベント作成に失敗しました' };
    }
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}
```

2. **クライアント側でイベントを追加**（`src/client/index.html`）

```javascript
function saveEvent(e) {
  e.preventDefault();
  
  // 既存の処理
  
  google.script.run
    .withSuccessHandler((result) => {
      saveBtn.disabled = false;
      saveBtn.textContent = '保存';
      
      if (result.success && result.event) {
        // 作成されたイベントをcurrentEventsに追加
        currentEvents.push(result.event);
        
        // 出欠データキャッシュに空の配列を追加
        window.allResponsesCache[result.event.id] = [];
        
        // 再描画（API呼び出しなし）
        renderEvents();
        
        showToast('イベントを作成しました', 'success');
        closeEventModal();
      } else {
        showToast(result.error || '作成に失敗しました', 'error');
      }
    })
    .adminCreateEvent({...}, currentUserKey, localStorage.getItem('adminToken'));
}
```

**判定**：✅ **論点なし** - 確実に効果があり、実装すべき

##### 改善案B：差分取得API

**概要**：
新規作成されたイベントのみを取得する専用APIを作成する。

**メリット**：
- データ量削減

**デメリット**：
- 実装コスト：中（新規API作成）
- 改善案Aで十分

**判定**：⚠️ **論点あり** - 改善案Aで十分

**推奨**：改善案A（レスポンスにイベントを含める）を実装する

---

### 【管理者機能】問題6: イベント削除モーダル表示が遅い

#### 📌 優先度: 低（管理者機能）
#### 📈 改善インパクト: ほぼなし（既に高速）

#### 現状の処理フロー

**クライアントサイド**: `src/client/index.html` 5365-5370行目

```javascript
function openDeleteConfirm(eventId, eventTitle) {
  deletingEventId = eventId;
  document.getElementById('delete-confirm-message').textContent = 
    `「${eventTitle}」を削除しますか？この操作は取り消せません。`;
  document.getElementById('delete-confirm').style.display = 'block';
}
```

#### 分析結果
- **処理内容**：DOM要素のテキスト変更と表示のみ
- **API呼び出し**：なし
- **予想処理時間**：0.01秒以下

**判定**：✅ **問題なし** - 既に十分高速であり、改善不要

**推測される原因**：
- ブラウザのレンダリング遅延
- 他の処理との競合
- ネットワーク遅延の誤認識

**推奨アクション**：
実際の測定を行い、遅延が発生しているか確認する。測定結果が0.5秒以上の場合のみ、調査を継続する。

---

### 【管理者機能】問題7: イベント削除実行が遅い

#### 📌 優先度: 中（管理者機能）
#### 📈 改善インパクト: 約30-50%の速度改善見込み

#### 現状の処理フロー

**クライアントサイド**: `src/client/index.html` 5383-5414行目

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
        showToast('イベントを削除しました', 'success');
        closeDeleteConfirm();
        // ⚠️ 問題: 全データを再読み込み
        loadInitData().then(() => {
          renderEvents();
        });
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

**サーバーサイド**: `src/main.ts` 253-293行目

```typescript
function adminDeleteEvent(
  eventId: string,
  userKey?: string,
  adminToken?: string
): { success: boolean; error?: string } {
  try {
    // 管理者権限チェック
    if (userKey && !isAdmin(userKey, adminToken)) {
      return { success: false, error: '管理者権限が必要です' };
    }

    if (!eventId) {
      return { success: false, error: 'イベントIDは必須です' };
    }
    
    // イベント削除
    const result = deleteEvent(eventId);
    
    if (result) {
      return { success: true };
    } else {
      return { success: false, error: 'イベント削除に失敗しました' };
    }
  } catch (error) {
    Logger.log(`❌ エラー: イベント削除API失敗 - ${(error as Error).message}`);
    return { success: false, error: (error as Error).message };
  }
}
```

#### 問題の本質
**問題5（イベント新規登録）と同じ問題**：
1. 削除成功後、`loadInitData()` を呼び出して全データを再読み込み
2. 必要な処理は、削除されたイベントを `currentEvents` から除外するのみ

#### 改善案：削除されたイベントをローカルから除外

**概要**：
削除成功後、`currentEvents` から該当イベントを除外し、再描画する。

**メリット**：
- API呼び出し削減：2回（削除 + 再読み込み）→ 1回（削除のみ）
- 予想処理時間：1.8-3.5秒 → **0.8-1.5秒**（約50%改善）
- 実装コスト：極めて低

**デメリット**：
- なし

**実装方針**：

1. **クライアント側で削除されたイベントを除外**（`src/client/index.html`）

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
        if (window.allResponsesCache[deletingEventId]) {
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

**判定**：✅ **論点なし** - 確実に効果があり、実装すべき

---

## 🔍 その他の潜在的な性能問題

### 問題8: `checkAdminStatus()` の処理タイミング

#### 現状分析
`loadInitData()` 完了後、`checkAdminStatus()` が実行され、その完了を待ってから `renderEvents()` が実行される。

**コード該当箇所**: `src/client/index.html` 2118-2126行目

```javascript
function loadInitData() {
  return new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler((data) => {
        // データをキャッシュに保存
        currentEvents = data.events;
        memberList = data.members.map(...);
        window.allResponsesCache = data.responsesMap;
        
        hideLoading();
        
        // 管理者ステータスを確認してからUIを更新
        checkAdminStatus().then(() => { // ← ここで待機
          renderEvents(); // ← 管理者ステータス確認完了後に実行
        });
      })
      .getInitData();
  });
}
```

**`checkAdminStatus()` の実装**: 2155-2188行目

```javascript
function checkAdminStatus() {
  return new Promise((resolve) => {
    const token = localStorage.getItem('adminToken');
    
    if (!token) {
      isAdminUser = false;
      updateAdminUI();
      resolve();
      return;
    }
    
    // API呼び出しで管理者確認
    google.script.run
      .withSuccessHandler((result) => {
        isAdminUser = result;
        updateAdminUI();
        resolve();
      })
      .withFailureHandler((error) => {
        isAdminUser = false;
        updateAdminUI();
        resolve();
      })
      .checkAdminStatus(currentUserKey, token);
  });
}
```

#### 問題の本質
1. **直列実行**：`renderEvents()` が `checkAdminStatus()` の完了を待っている
2. **追加のAPI呼び出し**：`checkAdminStatus()` で追加のAPI呼び出しが発生
3. **初回表示の遅延**：ユーザーは、管理者ステータス確認完了までコンテンツを見ることができない

#### 改善案：並列実行または統合

##### 改善案A：並列実行（推奨）

**概要**：
`checkAdminStatus()` と `renderEvents()` を並列実行する。管理者UIは後から更新する。

**メリット**：
- 初回表示が高速化：管理者ステータス確認を待たずにコンテンツ表示
- 予想処理時間：0.3-0.5秒の短縮
- 実装コスト：低

**デメリット**：
- 管理者ボタンが少し遅れて表示される（ユーザー体験への影響は軽微）

**実装方針**：

```javascript
function loadInitData() {
  return new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler((data) => {
        // データをキャッシュに保存
        currentEvents = data.events;
        memberList = data.members.map(...);
        window.allResponsesCache = data.responsesMap;
        
        hideLoading();
        
        // 並列実行（renderEventsを先に実行）
        renderEvents(); // ← 即座に表示
        
        // 管理者ステータスを並行して確認（UIは後で更新）
        checkAdminStatus().then(() => {
          // 管理者UIを更新
          updateAdminUI();
        });
        
        resolve(data);
      })
      .getInitData();
  });
}
```

**判定**：✅ **論点なし** - 確実に効果があり、実装すべき

##### 改善案B：`getInitData()` に管理者ステータスを含める

**概要**：
`getInitData()` APIのレスポンスに管理者ステータスを含め、追加のAPI呼び出しを削減する。

**メリット**：
- API呼び出し削減：2回 → 1回
- 初回表示が高速化

**デメリット**：
- サーバーサイドの変更が必要
- 実装コスト：中

**判定**：✅ **論点なし** - 効果があり、実装を推奨（改善案Aの次に実装）

---

### 問題9: DOM描画の最適化

#### 現状分析
`renderGridTable()` は、全イベント × 全メンバーのセルを一度に生成している。

**コード該当箇所**: `src/client/index.html` 2615-3185行目（約570行）

- イベント数：12件
- メンバー数：9人
- セル数：12 × 9 = 108セル

データ量が増加した場合（例：50イベント × 30メンバー = 1500セル）、DOM操作が遅くなる可能性がある。

#### 改善の方向性
⚠️ **論点あり**：現時点ではデータ量が少なく、問題は顕在化していない
- データ量が増加した場合に検討すべき最適化：
  1. 仮想スクロール（Virtual Scrolling）：表示領域のみをレンダリング
  2. 遅延レンダリング（Lazy Rendering）：最初の20イベントのみ描画し、スクロール時に追加
  3. `DocumentFragment` の使用：DOM挿入回数を削減

**推奨アクション**：
- 現時点では実装不要
- イベント数が50件を超える、またはメンバー数が30人を超える場合に検討

---

## 📋 改善優先順位と期待効果まとめ

| 優先度 | 問題 | 改善内容 | 工数 | 効果 | 論点 |
|--------|------|---------|------|------|------|
| **最高** | 問題2: 出欠保存 | カレンダー同期の非同期化・バッチ化 | 中 (3時間) | ★★★★☆ | なし |
| **最高** | 問題1: 初回表示 | `checkAdminStatus()` 並列化 | 小 (1時間) | ★★★☆☆ | なし |
| **高** | 問題4: ユーザー削除 | バッチ削除の実装 | 中 (2時間) | ★★★★☆ | なし |
| **高** | 問題3: 期間設定モーダル | キャッシュ活用 | 小 (1時間) | ★★★★★ | なし |
| **高** | 問題5: イベント新規登録 | レスポンスにイベント含める | 小 (1時間) | ★★★★☆ | なし |
| **高** | 問題7: イベント削除実行 | ローカルから除外 | 小 (30分) | ★★★★☆ | なし |
| **低** | 問題6: イベント削除モーダル | 測定のみ（改善不要） | - | - | - |
| **低** | 問題9: DOM描画 | データ量増加時に検討 | - | - | あり |

---

## 🎯 実装推奨順序

### フェーズ1（最優先・論点なし）
**所要時間**: 約4時間

1. **問題3: 期間設定モーダル** - キャッシュ活用（1時間）
2. **問題7: イベント削除実行** - ローカルから除外（30分）
3. **問題5: イベント新規登録** - レスポンスにイベント含める（1時間）
4. **問題1: 初回表示** - `checkAdminStatus()` 並列化（1時間）

**期待効果**：
- 期間設定モーダル表示：1-2秒 → **0.1秒以下**
- イベント削除：1.8-3.5秒 → **0.8-1.5秒**
- イベント新規登録：1.8-3.5秒 → **0.8-1.5秒**
- 初回表示：**0.3-0.5秒短縮**

### フェーズ2（重要・論点なし）
**所要時間**: 約5時間

5. **問題4: ユーザー削除** - バッチ削除の実装（2時間）
6. **問題2: 出欠保存** - カレンダー同期の最適化（3時間）

**期待効果**：
- ユーザー削除：5-10秒 → **1-2秒**
- 出欠保存：要測定 → **30-50%改善**

### フェーズ3（追加最適化・論点なし）
**所要時間**: 約2時間

7. **問題8: 管理者ステータス統合** - `getInitData()` に含める（2時間）

**期待効果**：
- 初回表示：**さらに0.3-0.5秒短縮**

---

## 📊 期待される改善結果

### ビフォー・アフター

| 操作 | 改善前 | 改善後（フェーズ1） | 改善後（フェーズ2） |
|------|--------|-------------------|-------------------|
| 初回ページ読み込み | 2秒以下（前回改善済み） | **1.5秒以下** | 1.5秒以下 |
| 出欠保存 | 要測定 | 要測定 | **30-50%改善** |
| 期間設定モーダル | 1-2秒 | **0.1秒以下** | 0.1秒以下 |
| ユーザー削除 | 5-10秒 | 5-10秒 | **1-2秒** |
| イベント新規登録 | 1.8-3.5秒 | **0.8-1.5秒** | 0.8-1.5秒 |
| イベント削除実行 | 1.8-3.5秒 | **0.8-1.5秒** | 0.8-1.5秒 |

---

## 🚨 注意事項

### 実装前の確認事項
1. **バックアップの作成**：現在のコードとSpreadsheetをバックアップ
2. **テスト環境での動作確認**：可能であれば、テスト用のSpreadsheetで先に確認
3. **パフォーマンス測定**：改善前後の実測値を記録

### データ整合性
1. **キャッシュの同期**：ローカルキャッシュとサーバーデータの整合性を保つ
2. **エラーハンドリング**：API呼び出し失敗時の挙動を確認
3. **並列処理の考慮**：複数の操作が同時に実行された場合の挙動

---

## 📈 測定方法

### クライアントサイドの測定
```javascript
// Chrome DevTools Console で実行

// 1. 初回読み込み速度
performance.mark('loadStart');
location.reload();
// ページ読み込み完了後
performance.mark('loadEnd');
performance.measure('loadTime', 'loadStart', 'loadEnd');

// 2. モーダル表示速度
console.time('modalOpen');
openDisplayPeriodModal();
console.timeEnd('modalOpen');

// 3. API呼び出し数確認
// Network タブで XHR フィルタを有効化
// exec? で始まるリクエスト数をカウント
```

### サーバーサイドの測定
```typescript
// GAS Scriptエディタで実行
function testPerformance() {
  const startTime = new Date().getTime();
  
  // 処理
  const result = getInitData();
  
  const endTime = new Date().getTime();
  Logger.log(`⏱️ 実行時間: ${endTime - startTime}ms`);
}
```

---

## 🔚 まとめ

### 主要ポイント
1. **前回改善の成果**：初回読み込みは既に大幅に改善済み
2. **新たな問題**：管理者機能と出欠保存に性能問題が存在
3. **論点なし改善**：9時間の実装で大幅な性能改善が可能
4. **論点あり改善**：データ量増加時に検討すべき項目あり

### Next Steps
1. **フェーズ1実装**：論点なし改善を優先的に実装（4時間）
2. **効果測定**：パフォーマンス改善を定量的に確認
3. **フェーズ2実装**：ユーザー削除・出欠保存の最適化（5時間）
4. **継続的な監視**：データ量増加に応じた追加最適化の検討

---

**調査完了日**: 2025年11月13日  
**レポート作成**: AI Performance Analyst  
**ドキュメントバージョン**: 2.0

