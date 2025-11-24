# アプリからカレンダー同期が呼ばれる導線一覧

## 📋 概要

アプリ（クライアント側）からカレンダー同期が実行される全ての導線を整理。

---

## 🔄 カレンダー同期の種類

### 1. アプリ → カレンダー同期
- イベント情報の同期（作成・更新・削除）
- 出欠状況・コメントの同期（説明欄更新）

### 2. カレンダー → アプリ同期
- カレンダー側の変更をアプリに反映

---

## 📊 導線一覧

### 1. 手動同期（管理者操作）

#### 1-1. 個別イベント同期

**導線**:
```
クライアント: syncEvent(eventId)
  ↓
サーバー: syncEvent(eventId, userKey, adminToken)
  ↓
upsertCalendarEvent(event)
  ↓
カレンダー同期（イベント情報 + 説明欄）
```

**呼び出し元**:
- イベントカードの「同期」ボタン（管理者のみ表示）
- `src/client/index.html:5451` - `syncEvent()`関数

**同期内容**:
- イベント情報（タイトル、日時、場所、説明）
- 出欠状況・コメント（説明欄）

**実装箇所**:
- `src/main.ts:757` - `syncEvent()`関数
- `src/server/calendar.ts:252` - `upsertCalendarEvent()`関数

---

#### 1-2. 全イベント一括同期

**導線**:
```
クライアント: syncAllEvents() → confirmSyncAllEvents()
  ↓
サーバー: syncAllEvents(userKey, adminToken, limitToDisplayPeriod)
  ↓
syncAll(limitToDisplayPeriod)
  ↓
pullFromCalendar() + 説明欄同期
  ↓
カレンダー → アプリ + アプリ → カレンダー（双方向）
```

**呼び出し元**:
- ヘッダーの「🔄」（同期）ボタン（管理者のみ表示）
- `src/client/index.html:1669` - 同期ボタン
- `src/client/index.html:5540` - `syncAllEvents()`関数
- `src/client/index.html:5556` - `confirmSyncAllEvents()`関数

**同期内容**:
- カレンダー → アプリ: カレンダー側の変更を取り込み
- アプリ → カレンダー: 出欠状況・コメントを反映

**実装箇所**:
- `src/main.ts:823` - `syncAllEvents()`関数
- `src/server/calendar.ts:1276` - `syncAll()`関数

---

### 2. 自動同期（リアルタイム）

#### 2-1. イベント作成時

**導線**:
```
クライアント: adminCreateEvent(eventData, userKey, adminToken)
  ↓
サーバー: adminCreateEvent() → createEvent()
  ↓
createEvent() 内で自動実行
  ↓
upsertCalendarEvent(event) （skipCalendarSync=falseの場合）
  ↓
カレンダー同期（イベント情報）
```

**呼び出し元**:
- イベント新規登録モーダルの「保存」ボタン
- `src/client/index.html:5373` - `adminCreateEvent()`呼び出し

**同期内容**:
- イベント情報（タイトル、日時、場所、説明）
- 注意: 出欠状況はまだないため、説明欄は空

**実装箇所**:
- `src/main.ts:140` - `adminCreateEvent()`関数
- `src/server/events.ts:37` - `createEvent()`関数（127-156行目でカレンダー同期）

**条件**:
- `skipCalendarSync=false`の場合のみ実行（デフォルト）

---

#### 2-2. イベント編集時

**導線**:
```
クライアント: adminUpdateEvent(eventId, updates, userKey, adminToken)
  ↓
サーバー: adminUpdateEvent() → updateEvent()
  ↓
updateEvent() 内で自動実行
  ↓
upsertCalendarEvent(event) （skipCalendarSync=falseの場合）
  ↓
カレンダー同期（イベント情報 + 説明欄）
```

**呼び出し元**:
- イベント編集モーダルの「保存」ボタン
- `src/client/index.html:5342` - `adminUpdateEvent()`呼び出し

**同期内容**:
- イベント情報（タイトル、日時、場所、説明）
- 出欠状況・コメント（説明欄）

**実装箇所**:
- `src/main.ts:207` - `adminUpdateEvent()`関数
- `src/server/events.ts:347` - `updateEvent()`関数（494-506行目でカレンダー同期）

**条件**:
- `skipCalendarSync=false`の場合のみ実行（デフォルト）

---

#### 2-3. イベント削除時

**導線**:
```
クライアント: adminDeleteEvent(eventId, userKey, adminToken)
  ↓
サーバー: adminDeleteEvent() → deleteEvent()
  ↓
deleteEvent() 内で自動実行
  ↓
calendarEvent.deleteEvent() （カレンダーから削除）
```

**呼び出し元**:
- イベント削除確認モーダルの「削除」ボタン
- `src/client/index.html:5445` - `adminDeleteEvent()`呼び出し

**同期内容**:
- カレンダーからイベントを削除

**実装箇所**:
- `src/main.ts:257` - `adminDeleteEvent()`関数
- `src/server/events.ts:529` - `deleteEvent()`関数（カレンダー削除処理あり）

---

#### 2-4. 出欠登録時（単一）

**導線**:
```
クライアント: userSubmitResponse(eventId, userKey, status, comment)
  ↓
サーバー: userSubmitResponse() → submitResponse()
  ↓
submitResponse() 内で自動実行
  ↓
syncCalendarDescriptionForEvent(eventId)
  ↓
カレンダー説明欄同期（出欠状況 + コメント）
```

**呼び出し元**:
- グリッド編集での出欠登録（現在は使用されていない可能性）
- `src/main.ts:307` - `userSubmitResponse()`関数

**同期内容**:
- 出欠状況・コメント（説明欄のみ）

**実装箇所**:
- `src/server/responses.ts:31` - `submitResponse()`関数（78行目、102行目でカレンダー同期）

**注意**:
- 現在は主に`userSubmitResponsesBatch()`が使用されている

---

#### 2-5. 出欠登録時（一括）⭐ **現在の主要な導線**

**導線**:
```
クライアント: bulkUpdateResponsesForSelectedMember()
  ↓
サーバー: userSubmitResponsesBatch(responses, skipCalendarSync)
  ↓
userSubmitResponsesBatch() 内で自動実行
  ↓
syncCalendarDescriptionForEvent(eventId) （skipCalendarSync=falseの場合）
  ↓
カレンダー説明欄同期（出欠状況 + コメント）
```

**呼び出し元**:
- メンバー登録モーダルの「保存」ボタン
- `src/client/index.html:4392` - `bulkUpdateResponsesForSelectedMember()`関数
- `src/client/index.html:4587` - `userSubmitResponsesBatch()`呼び出し

**同期内容**:
- 出欠状況・コメント（説明欄のみ）

**実装箇所**:
- `src/main.ts:354` - `userSubmitResponsesBatch()`関数（469-484行目でカレンダー同期）

**条件**:
- `skipCalendarSync=false`の場合のみ実行
- **現在は`skipCalendarSync=true`で呼び出されている**（定期同期に任せる）

---

### 3. 定期同期（cron）

#### 3-1. 通常同期

**導線**:
```
トリガー: scheduledSync() （1時間おき）
  ↓
syncAll(limitToDisplayPeriod=true)
  ↓
pullFromCalendar() + 説明欄同期
  ↓
カレンダー → アプリ + アプリ → カレンダー（双方向）
```

**呼び出し元**:
- Google Apps Script の時間主導型トリガー
- `src/main.ts:851` - `scheduledSync()`関数

**同期内容**:
- カレンダー → アプリ: カレンダー側の変更を取り込み
- アプリ → カレンダー: 出欠状況・コメントを反映

**実装箇所**:
- `src/server/calendar.ts:1276` - `syncAll()`関数

---

#### 3-2. 高頻度同期

**導線**:
```
トリガー: scheduledSyncHighFrequency() （5分おき、土日13時前後）
  ↓
syncAll(limitToDisplayPeriod=true)
  ↓
pullFromCalendar() + 説明欄同期
  ↓
カレンダー → アプリ + アプリ → カレンダー（双方向）
```

**呼び出し元**:
- Google Apps Script の時間主導型トリガー
- `src/main.ts:872` - `scheduledSyncHighFrequency()`関数

**同期内容**:
- カレンダー → アプリ: カレンダー側の変更を取り込み
- アプリ → カレンダー: 出欠状況・コメントを反映

**実装箇所**:
- `src/server/calendar.ts:1276` - `syncAll()`関数

---

## 📊 導線のまとめ表

| # | 導線 | 呼び出し元 | 同期内容 | 実行タイミング | 現在の状態 |
|---|------|-----------|---------|--------------|-----------|
| 1-1 | 個別イベント同期 | イベントカードの「同期」ボタン | イベント情報 + 説明欄 | 手動 | ✅ 有効 |
| 1-2 | 全イベント一括同期 | ヘッダーの「🔄」ボタン | 双方向同期 | 手動 | ✅ 有効 |
| 2-1 | イベント作成時 | イベント新規登録 | イベント情報 | 自動 | ✅ 有効 |
| 2-2 | イベント編集時 | イベント編集 | イベント情報 + 説明欄 | 自動 | ✅ 有効 |
| 2-3 | イベント削除時 | イベント削除 | カレンダーから削除 | 自動 | ✅ 有効 |
| 2-4 | 出欠登録時（単一） | グリッド編集 | 説明欄のみ | 自動 | ⚠️ 使用されていない可能性 |
| 2-5 | 出欠登録時（一括） | メンバー登録モーダル | 説明欄のみ | 自動 | ⏭️ **スキップ中**（定期同期に任せる） |
| 3-1 | 通常同期（cron） | 時間主導型トリガー | 双方向同期 | 1時間おき | ✅ 有効 |
| 3-2 | 高頻度同期（cron） | 時間主導型トリガー | 双方向同期 | 5分おき（土日13時前後） | ✅ 有効 |

---

## 🔍 重要なポイント

### 現在スキップされている導線

**2-5. 出欠登録時（一括）**:
- `userSubmitResponsesBatch()`で`skipCalendarSync=true`を指定
- カレンダー同期は定期同期（cron）に任せる
- **理由**: 出欠保存の高速化（30秒 → 2-3秒）

### 使用されていない可能性がある導線

**2-4. 出欠登録時（単一）**:
- `userSubmitResponse()`は現在使用されていない可能性
- 主に`userSubmitResponsesBatch()`が使用されている

---

## 📝 補足

### カレンダー同期の内部処理

#### `upsertCalendarEvent()`
- イベント情報（タイトル、日時、場所、説明）をカレンダーに同期
- 出欠状況・コメント（説明欄）も含む

#### `syncCalendarDescriptionForEvent()`
- 出欠状況・コメント（説明欄のみ）をカレンダーに同期
- `notesHash`で変更判定（変更がない場合はスキップ）

#### `syncAll()`
- カレンダー → アプリ同期（`pullFromCalendar()`）
- アプリ → カレンダー同期（説明欄同期）

---

## 🎯 まとめ

### アプリからカレンダー同期が呼ばれる導線

1. **手動同期**: 2つ（個別・一括）
2. **自動同期**: 5つ（イベント作成・編集・削除、出欠登録×2）
3. **定期同期**: 2つ（通常・高頻度）

**合計**: 9つの導線

### 現在の状態

- ✅ **有効**: 8つ
- ⏭️ **スキップ中**: 1つ（出欠登録時一括）
- ⚠️ **使用されていない可能性**: 1つ（出欠登録時単一）

