# イベントモーダルのバグ修正プラン

**作成日**: 2025-11-14  
**関連調査レポート**: `event-modal-bugs-investigation.md`

## 修正方針

### 基本方針
1. サーバーから取得した`event.isAllDay`フラグを信頼する
2. 日付文字列のパース時にタイムゾーンを明示的に扱う
3. `toggleAllDay()`の呼び出しタイミングとロジックを見直す
4. イベントリスナーの初期化タイミングを適切にする

## 修正内容

### 修正1: 終日フラグの判定を修正

**対象**: `openEditEventModal()` 関数

**変更前**:
```javascript
const isAllDay = startDate.getHours() === 0 && 
                 startDate.getMinutes() === 0 && 
                 endDate.getHours() === 23 && 
                 endDate.getMinutes() === 59;
```

**変更後**:
```javascript
// サーバーから取得したisAllDayフラグを使用
const isAllDay = event.isAllDay !== undefined ? event.isAllDay : false;
```

**理由**: サーバー側でisAllDayフラグを管理しているため、それを信頼する

### 修正2: toggleAllDay()のロジック改善

**対象**: `toggleAllDay()` 関数

**変更内容**:
1. 早期リターンの条件を見直し
2. 日付フィールド→日時フィールド変換時のタイムゾーン処理を修正

**変更後**:
```javascript
function toggleAllDay() {
  const allDay = document.getElementById('event-all-day').checked;
  const startDateTime = document.getElementById('event-start');
  const endDateTime = document.getElementById('event-end');
  const startDate = document.getElementById('event-start-date');
  const endDate = document.getElementById('event-end-date');
  
  if (allDay) {
    // 終日モード
    startDateTime.style.display = 'none';
    endDateTime.style.display = 'none';
    startDate.style.display = 'block';
    endDate.style.display = 'block';
    startDate.required = true;
    endDate.required = true;
    startDateTime.required = false;
    endDateTime.required = false;
    
    // 日付フィールドに値がない場合のみ、日時フィールドから変換
    if (!startDate.value && startDateTime.value) {
      const currentStart = new Date(startDateTime.value);
      startDate.value = formatDate(currentStart);
    }
    if (!endDate.value && endDateTime.value) {
      const currentEnd = new Date(endDateTime.value);
      endDate.value = formatDate(currentEnd);
    }
  } else {
    // 通常モード
    startDateTime.style.display = 'block';
    endDateTime.style.display = 'block';
    startDate.style.display = 'none';
    endDate.style.display = 'none';
    startDateTime.required = true;
    endDateTime.required = true;
    startDate.required = false;
    endDate.required = false;
    
    // 日時フィールドに値がない場合のみ、日付フィールドから変換
    // タイムゾーンを考慮した変換
    if (!startDateTime.value && startDate.value) {
      const dateParts = startDate.value.split('-');
      const start = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
      start.setHours(13, 0, 0, 0);
      startDateTime.value = formatDateTimeLocal(start);
    }
    if (!endDateTime.value && endDate.value) {
      const dateParts = endDate.value.split('-');
      const end = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
      end.setHours(17, 0, 0, 0);
      endDateTime.value = formatDateTimeLocal(end);
    }
  }
}
```

**理由**: 
- タイムゾーン問題を回避するため、日付文字列を手動でパース
- 既存の値を上書きしないロジックを改善

### 修正3: openEditEventModal()の処理順序を変更

**対象**: `openEditEventModal()` 関数

**変更内容**:
1. `isAllDay`の判定を修正
2. `toggleAllDay()`を呼ぶ前に、適切なフィールドに値を設定
3. `setupStartDateChangeHandler()`の呼び出しタイミングを調整

**変更後の処理順序**:
```
1. event.isAllDayフラグを取得
2. チェックボックスを設定
3. isAllDayがtrueの場合:
   - 日付フィールドに値を設定
   - 日時フィールドはクリア（または空のまま）
4. isAllDayがfalseの場合:
   - 日時フィールドに値を設定
   - 日付フィールドはクリア（または空のまま）
5. toggleAllDay()を呼んで表示を切り替え（値は上書きされない）
6. setupStartDateChangeHandler()を呼んでイベントリスナーを設定
```

### 修正4: setupStartDateChangeHandler()の初期化ロジック改善

**対象**: `setupStartDateChangeHandler()` 関数

**変更内容**:
1. イベントリスナー設定時に、現在の値を`data-old-value`に保存
2. 終日モードの場合、日付フィールドの初期値を確実に設定

## テストケース

### テストケース1: 終日イベントの編集
- **前提**: 終日イベント（例: 2025/11/18）が登録されている
- **操作**: イベント編集モーダルを開く
- **期待値**:
  - 終日チェックボックスがON
  - 開始日: 2025/11/18
  - 終了日: 2025/11/19（または2025/11/18）
  - 日時フィールドは非表示

### テストケース2: 通常イベントの編集
- **前提**: 通常イベント（例: 2025/11/18 09:00-12:00）が登録されている
- **操作**: イベント編集モーダルを開く
- **期待値**:
  - 終日チェックボックスがOFF
  - 開始日時: 2025/11/18 09:00
  - 終了日時: 2025/11/18 12:00
  - 日付フィールドは非表示

### テストケース3: 新規作成で終日→開始日変更
- **前提**: 新規作成モーダルを開く
- **操作**:
  1. 終日チェックボックスをON
  2. 開始日を2025/11/21に変更
- **期待値**:
  - 終了日が自動的に2025/11/21に変更される

### テストケース4: 新規作成で終日ON→OFF
- **前提**: 新規作成モーダルで終日をON、開始日を2025/11/21に設定
- **操作**: 終日チェックボックスをOFF
- **期待値**:
  - 開始日時: 2025/11/21 13:00
  - 終了日時: 2025/11/21 17:00
  - 日付が21日のまま（15日にならない）

### テストケース5: 編集で終日ON→OFF
- **前提**: 終日イベント（2025/11/18）の編集モーダルを開く
- **操作**: 終日チェックボックスをOFF
- **期待値**:
  - 開始日時: 2025/11/18 13:00
  - 終了日時: 2025/11/19 17:00（元の終了日を維持）

## 実装手順

1. `openEditEventModal()`のisAllDay判定を修正
2. `toggleAllDay()`のロジックを修正
3. `openEditEventModal()`の処理順序を調整
4. 動作確認（テストケース1-2）
5. `setupStartDateChangeHandler()`の初期化ロジックを改善
6. 動作確認（テストケース3-5）
7. コミット

## リスク

- **低**: ロジックは比較的単純で、影響範囲は限定的
- **注意点**: タイムゾーン処理に注意が必要

## 完了条件

- 全テストケースが成功すること
- 既存の通常イベント作成・編集機能が正常に動作すること

