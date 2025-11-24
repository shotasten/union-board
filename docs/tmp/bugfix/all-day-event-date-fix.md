# 終日イベントの日付表示ずれ問題

**発見日**: 2025-11-14  
**問題**: 11/12の終日イベントを編集すると、11/12 - 11/13と表示される

## 根本原因

### Googleカレンダーの仕様
- 終日イベントの終了日は「翌日の00:00:00」
- 例: 11/12の終日イベント
  - 開始: 2025/11/12 00:00:00
  - 終了: 2025/11/13 00:00:00

### 現在の実装
- **クライアント側** (`saveEvent`関数):
  ```javascript
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999); // ← 23:59:59を設定
  ```

- **サーバー側** (`isAllDayEvent`関数):
  - 23:59:59でも翌日00:00:00でも終日イベントと判定
  
### 問題点
- クライアント側が23:59:59で保存すると、一見正しく動作
- しかし、Googleカレンダーと同期すると、終了日が翌日00:00:00に変換される
- この状態でクライアント側が表示すると:
  - `formatDate(new Date('2025-11-13T00:00:00'))` → `2025-11-13`
  - 結果: 11/12 - 11/13と表示される

## 修正方針

Googleカレンダーの仕様に統一する：
1. クライアント側で終日イベントを保存する際、終了日を翌日00:00:00にする
2. クライアント側で終日イベントを表示する際、終了日から1日引いて表示する（編集用フィールドに設定）

## 修正内容

### 修正1: saveEvent()関数
終日イベントの終了日を翌日00:00:00に変更

```javascript
if (allDay) {
  const startDate = document.getElementById('event-start-date').value;
  const endDate = document.getElementById('event-end-date').value;
  
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  
  // 終了日は翌日の00:00:00に設定（Googleカレンダー仕様）
  const end = new Date(endDate);
  end.setDate(end.getDate() + 1); // 翌日
  end.setHours(0, 0, 0, 0);
  
  startISO = start.toISOString();
  endISO = end.toISOString();
}
```

### 修正2: openEditEventModal()関数
終了日から1日引いて表示

```javascript
if (isAllDay) {
  document.getElementById('event-start-date').value = formatDate(startDate);
  
  // 終了日から1日引いて表示（Googleカレンダー仕様の変換）
  const displayEndDate = new Date(endDate);
  displayEndDate.setDate(displayEndDate.getDate() - 1);
  document.getElementById('event-end-date').value = formatDate(displayEndDate);
  
  document.getElementById('event-start').value = '';
  document.getElementById('event-end').value = '';
}
```

### 修正3: openCreateEventModal()関数
デフォルト値の設定を確認（既に正しい場合は不要）

## テストケース

### TC1: 1日の終日イベント作成
- 操作: 11/12の終日イベントを作成
- 保存されるデータ:
  - start: 2025-11-12T00:00:00Z
  - end: 2025-11-13T00:00:00Z
- 編集時の表示:
  - 開始日: 2025/11/12
  - 終了日: 2025/11/12

### TC2: 複数日の終日イベント作成
- 操作: 11/12-11/14の終日イベントを作成
- 保存されるデータ:
  - start: 2025-11-12T00:00:00Z
  - end: 2025-11-15T00:00:00Z（14日の翌日）
- 編集時の表示:
  - 開始日: 2025/11/12
  - 終了日: 2025/11/14

### TC3: 終日イベント編集
- 前提: 11/12の終日イベント（DBには11/13 00:00:00で保存）
- 操作: 編集モーダルを開く
- 期待値:
  - 開始日: 2025/11/12
  - 終了日: 2025/11/12（11/13と表示されない）

