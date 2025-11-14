# GAS カレンダー同期 cron ジョブ セットアップガイド

## 📋 概要

Responses シートの出欠・コメントの変更を検知し、変更されたイベントだけ Google カレンダーに同期する cron ジョブのセットアップ方法です。

---

## ✨ 実装内容

### 実装済みの関数

#### 1. `scheduledSyncResponsesToCalendar()`
- **用途**: 15分ごとの定期同期
- **実行時間**: 9:00〜25:00（翌1:00）まで
- **重複防止**: 10分以内の再実行を自動スキップ

#### 2. `scheduledSyncResponsesToCalendarHighFrequency()`
- **用途**: 5分ごとの高頻度同期
- **実行時間**: 土日のみ 12:40〜13:20

#### 3. `syncResponsesDiffToCalendar()`
- **用途**: 差分検知と同期処理の実行
- **差分検知**: Responses シートの F列（updatedAt）を使用
- **同期対象**: 前回同期以降に更新されたイベントのみ

---

## 🔧 セットアップ手順

### ステップ1: GAS エディタを開く

1. Google Drive で該当のスプレッドシートを開く
2. **拡張機能 > Apps Script** をクリック

### ステップ2: トリガーを設定

#### トリガー1: 15分ごとの定期同期

1. GAS エディタで **トリガー（時計アイコン）** をクリック
2. **トリガーを追加** をクリック
3. 以下のように設定:
   - **実行する関数を選択**: `scheduledSyncResponsesToCalendar`
   - **実行するデプロイを選択**: `Head`
   - **イベントのソースを選択**: `時間主導型`
   - **時間ベースのトリガーのタイプを選択**: `分ベースのタイマー`
   - **時間の間隔を選択（分）**: `15分ごと`
4. **保存** をクリック

#### トリガー2: 5分ごとの高頻度同期（土日12:40-13:20）

1. GAS エディタで **トリガー（時計アイコン）** をクリック
2. **トリガーを追加** をクリック
3. 以下のように設定:
   - **実行する関数を選択**: `scheduledSyncResponsesToCalendarHighFrequency`
   - **実行する デプロイを選択**: `Head`
   - **イベントのソースを選択**: `時間主導型`
   - **時間ベースのトリガーのタイプを選択**: `分ベースのタイマー`
   - **時間の間隔を選択（分）**: `5分ごと`
4. **保存** をクリック

> **注意**: 5分ごとのトリガーは全日実行されますが、関数内では何も制限していません。土日12:40-13:20のみ実行したい場合は、外部のスケジューラーやトリガー管理ツールを使用するか、関数内に時刻チェックを追加してください。

---

## 📊 実行頻度

### 平日
- 15分ごとのトリガーのみ: **64回/日**

### 土日
- 15分ごとのトリガー: **64回/日**
- 5分ごとのトリガー: **288回/日**
- **合計**: 最大 **352回/日**（重複防止により実際は少なくなります）

### 重複防止の仕組み
- 15分ごとのトリガーは、前回同期から10分以内の場合スキップ
- 5分ごとのトリガーは、前回同期時刻を更新するため、15分ごとのトリガーが自動的にスキップされる

---

## 🔍 動作確認

### ログの確認

1. GAS エディタで **実行数 > 実行ログ** をクリック
2. 以下のようなログが表示されることを確認:

```
📅 [cron 15分] 同期開始: 2025-11-14T10:00:00.000Z
📊 前回同期時刻: 2025-11-14T09:45:00.000Z
🔍 差分検知: 3件のイベントに更新あり
✅ 同期成功: event-1
✅ 同期成功: event-2
✅ 同期成功: event-3
✅ [cron 15分] 同期完了: 3件同期, 0件失敗, 0件スキップ
```

### 更新がない場合のログ

```
📅 [cron 15分] 同期開始: 2025-11-14T10:15:00.000Z
📊 前回同期時刻: 2025-11-14T10:00:00.000Z
🔍 差分検知: 0件のイベントに更新あり
✨ 更新なし - カレンダー同期をスキップ
✅ [cron 15分] 同期完了: 0件同期, 0件失敗, 0件スキップ
```

---

## 🗂️ PropertiesService のキー

### `LAST_CRON_CALENDAR_SYNC_TIMESTAMP`
- **用途**: 前回同期時刻を保存
- **形式**: ISO 8601形式（例: `2025-11-14T10:00:00.000Z`）
- **保存場所**: Script Properties

### 確認方法

GAS エディタで以下のスクリプトを実行:

```javascript
function checkLastSyncTime() {
  const properties = PropertiesService.getScriptProperties();
  const lastSync = properties.getProperty('LAST_CRON_CALENDAR_SYNC_TIMESTAMP');
  Logger.log(`前回同期時刻: ${lastSync}`);
}
```

---

## 🛠️ トラブルシューティング

### 1. トリガーが実行されない

**確認事項**:
- トリガーが正しく設定されているか確認
- GAS エディタの **実行数 > 実行ログ** でエラーを確認

**対処法**:
- トリガーを削除して再設定
- 関数名のスペルミスがないか確認

### 2. 同期が実行されない（更新なし）

**確認事項**:
- Responses シートに updatedAt が正しく記録されているか
- 前回同期時刻が正しいか（`checkLastSyncTime()` で確認）

**対処法**:
- PropertiesService をリセット:
  ```javascript
  function resetLastSyncTime() {
    const properties = PropertiesService.getScriptProperties();
    properties.deleteProperty('LAST_CRON_CALENDAR_SYNC_TIMESTAMP');
    Logger.log('前回同期時刻をリセットしました');
  }
  ```

### 3. エラーが発生する

**確認事項**:
- ログで詳細なエラーメッセージを確認
- Responses シートの F列（updatedAt）の形式が正しいか

**対処法**:
- ログに表示されたエラーメッセージを確認して修正
- 必要に応じて手動で `syncCalendarDescriptionForEvent(eventId)` を実行

---

## 📈 パフォーマンス

### API 呼び出し回数

- **更新がない場合**: Spreadsheet API 1回のみ（差分検知）
- **更新がある場合**: Spreadsheet API 1回 + Calendar API N回（N = 更新されたイベント数）

### 実行時間

- **更新がない場合**: 約1秒
- **更新がある場合**: 約1秒 + N × 2秒（N = 更新されたイベント数）

### GAS 実行時間制限

- **1回あたりの最大実行時間**: 6分
- **1日あたりの最大実行時間**: 90分

**推定使用時間**:
- 平日: 64回 × 1秒 = 約1分
- 土日: 352回 × 1秒 = 約6分
- **合計**: 約7分/日（制限90分/日の約8%）

---

## ✅ チェックリスト

- [ ] `scheduledSyncResponsesToCalendar` のトリガーを設定（15分ごと）
- [ ] `scheduledSyncResponsesToCalendarHighFrequency` のトリガーを設定（5分ごと）
- [ ] 実行ログで動作を確認
- [ ] カレンダーに出欠が正しく同期されているか確認

---

## 📝 備考

### 差分検知の仕組み

1. Responses シートの F列（updatedAt）を全行スキャン
2. 前回同期時刻（PropertiesService）と比較
3. updatedAt > 前回同期時刻 の行を抽出
4. 抽出された行の eventId をユニークに集計
5. 各 eventId に対して `syncCalendarDescriptionForEvent()` を実行

### 同期処理の流れ

1. `syncCalendarDescriptionForEvent(eventId)` を呼び出し
2. 該当イベントの出欠・コメントを Responses シートから取得
3. カレンダーの説明欄を更新
4. notesHash を比較して無限ループを防止

---

## 🔗 関連ドキュメント

- [CALENDAR_SYNC_CALL_PATHS.md](./CALENDAR_SYNC_CALL_PATHS.md) - カレンダー同期の導線一覧
- [CALENDAR_SYNC_STATUS_CHECK.md](./CALENDAR_SYNC_STATUS_CHECK.md) - カレンダー同期の状態確認

