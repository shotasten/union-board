# イベントモーダルのバグ調査レポート

**調査日**: 2025-11-14  
**調査者**: AI Assistant  
**対象**: イベント編集・作成モーダルの日付・時刻入力に関するバグ

## 報告されたバグ

### 1. 終日イベント編集時の問題
- **症状**: 終日イベントを編集モーダルで開くと、終日チェックボックスがOFFになっている
- **症状**: 開始日時・終了日時の表示が、編集対象のイベントデータと一致していない

### 2. 新規イベント作成時（終日選択後）の問題
- **症状**: 終日選択後、開始日を変更しても終了日が連動しない
- **症状**: 終日チェックボックスをOFFにすると、日付が期待値と異なる（例: 21日→15日）

## 調査結果

### 問題1: 終日イベント編集時のチェックボックス状態

**該当コード**: `src/client/index.html` 4859-4886行目

```javascript
// 終日かどうかを判定（開始が00:00、終了が23:59の場合）
const isAllDay = startDate.getHours() === 0 && 
                 startDate.getMinutes() === 0 && 
                 endDate.getHours() === 23 && 
                 endDate.getMinutes() === 59;

document.getElementById('event-all-day').checked = isAllDay;
```

**問題点**:
1. サーバーから取得する`event.isAllDay`フラグを使用していない
2. 時刻での判定ロジックが不完全（秒・ミリ秒を考慮していない）
3. UTCとJSTのタイムゾーン変換の問題がある可能性

**検証**:
- `event`オブジェクトには`isAllDay`プロパティが存在する（Eventsシートに保存されている）
- サーバー側のデータ構造を確認すると、`isAllDay`フラグが明示的に管理されている

### 問題2: toggleAllDay()による値の上書き

**該当コード**: `src/client/index.html` 5005-5054行目

```javascript
function toggleAllDay() {
  const allDay = document.getElementById('event-all-day').checked;
  // ...
  if (allDay) {
    // ...
    // 既に日付が設定されている場合は上書きしない（編集時）
    if (startDate.value && endDate.value) {
      return;
    }
    // 現在の日時から日付を取得して設定（新規作成時のみ）
    const currentStart = startDateTime.value ? new Date(startDateTime.value) : new Date();
    const currentEnd = endDateTime.value ? new Date(endDateTime.value) : new Date();
    startDate.value = formatDate(currentStart);
    endDate.value = formatDate(currentEnd);
  }
}
```

**問題点**:
1. `openEditEventModal`で日付フィールドに値を設定した**後**に`toggleAllDay()`を呼んでいるため、既に値が設定されている
2. しかし、4878-4879行目で通常イベントの場合は日付フィールドを空にしているため、チェックボックス状態が正しく設定されても、`toggleAllDay()`内の早期リターン条件（5024-5026行目）が機能しない

### 問題3: 終日チェックボックスOFF時の日付変換

**該当コード**: `src/client/index.html` 5035-5054行目

```javascript
} else {
  // 通常モード：日時表示
  startDateTime.style.display = 'block';
  endDateTime.style.display = 'block';
  startDate.style.display = 'none';
  endDate.style.display = 'none';
  // ...
  
  // 日付フィールドに値がある場合は、それを使って日時フィールドを設定
  if (startDate.value) {
    const start = new Date(startDate.value);
    start.setHours(13, 0, 0, 0); // デフォルト: 13:00
    startDateTime.value = formatDateTimeLocal(start);
  }
  
  if (endDate.value) {
    const end = new Date(endDate.value);
    end.setHours(17, 0, 0, 0); // デフォルト: 17:00
    endDateTime.value = formatDateTimeLocal(end);
  }
}
```

**問題点**:
1. 日付フィールドから日時フィールドへの変換時、`new Date(startDate.value)`がローカル時刻として解釈される
2. しかし、日付文字列（YYYY-MM-DD形式）を`new Date()`に渡すと、UTCとして解釈される可能性がある
3. これにより、タイムゾーンのずれで日付が1日ずれる問題が発生

### 問題4: 終日モードでの開始日変更時の終了日連動

**該当コード**: `src/client/index.html` 4949-4977行目

```javascript
newStartDateInput.addEventListener('change', function() {
  if (!allDayCheckbox.checked) return; // 通常モードの場合は処理しない
  
  const oldStartValue = this.getAttribute('data-old-value');
  // ...
});
```

**問題点**:
1. `setupStartDateChangeHandler()`は`toggleAllDay()`の**後**に呼ばれる（4889行目）
2. しかし、`toggleAllDay()`内で早期リターンすると、日付フィールドの値が設定されていない状態でイベントリスナーが設定される
3. その結果、`data-old-value`属性が正しく初期化されず、初回変更時に終了日が連動しない

## 根本原因まとめ

1. **終日フラグの判定**: サーバーから取得した`event.isAllDay`を使用せず、時刻で判定している
2. **toggleAllDay()の呼び出しタイミング**: 値設定後に呼んでいるため、ロジックが複雑化し、バグが発生
3. **日付文字列のパース**: `new Date(YYYY-MM-DD)`がUTCとして解釈され、タイムゾーンのずれが発生
4. **イベントリスナーの初期化タイミング**: 値設定とイベントリスナー設定の順序が不適切

## 影響範囲

- イベント編集モーダル（終日イベントの場合）
- イベント作成モーダル（終日チェックボックスの操作時）
- 日付・時刻の入力全般

## 修正の優先度

**高**: ユーザーがイベントを正しく編集できない致命的なバグ

