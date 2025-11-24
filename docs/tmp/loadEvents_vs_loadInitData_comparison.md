# loadEvents() vs loadInitData() の比較

## 概要

どちらも**同じサーバーAPI (`getInitData()`) を呼び出しています**が、**受け取ったデータの処理方法が異なります**。

## 詳細比較

### 1. サーバー側 API: `getInitData()`

**場所:** `src/main.ts` (72-134行目)

**返すデータ:**
```typescript
{
  events: AttendanceEvent[];           // イベント一覧
  config: Config;                      // 設定情報
  members: Member[];                   // メンバー一覧
  responsesMap: {                      // 全出欠データ（イベントIDごと）
    [eventId: string]: Response[]
  }
}
```

---

### 2. クライアント側: `loadEvents()`

**場所:** `src/client/index.html` (2373-2395行目)

**処理内容:**
```javascript
function loadEvents() {
  google.script.run
    .withSuccessHandler(onEventsLoaded)  // ← コールバック
    .getInitData();
}

function onEventsLoaded(data) {
  if (data && data.events) {
    currentEvents = data.events;  // ← イベントだけ更新
    renderEvents();
  }
}
```

**更新される変数:**
- ✅ `currentEvents` （イベント一覧）

**更新されない変数:**
- ❌ `window.allResponsesCache` （出欠データキャッシュ）
- ❌ `memberList` （メンバー一覧）

**問題点:**
- サーバーは全データを返しているのに、**出欠データとメンバー情報を捨てている**
- 予定詳細モーダルで使う `window.allResponsesCache` が古いまま

---

### 3. クライアント側: `loadInitData()`

**場所:** `src/client/index.html` (1855-1954行目)

**処理内容:**
```javascript
function loadInitData() {
  return new Promise((resolve, reject) => {
    google.script.run
      .withSuccessHandler((data) => {
        // イベント一覧を更新
        if (data.events) {
          currentEvents = data.events;
        }
        
        // メンバー一覧を更新
        if (data.members) {
          memberList = data.members.map(...);
        }
        
        // 出欠データキャッシュを更新 ← 重要！
        if (data.responsesMap) {
          window.allResponsesCache = data.responsesMap;
          console.log('✅ 出欠データキャッシュ保存:', {
            イベント数: Object.keys(data.responsesMap).length,
            合計出欠数: Object.values(data.responsesMap).reduce(...)
          });
        }
        
        renderEvents();
        resolve(data);
      })
      .getInitData();
  });
}
```

**更新される変数:**
- ✅ `currentEvents` （イベント一覧）
- ✅ `window.allResponsesCache` （出欠データキャッシュ）← **重要！**
- ✅ `memberList` （メンバー一覧）

**利点:**
- サーバーから取得した全データを正しく反映
- 予定詳細モーダルで最新の出欠データを表示できる
- Promise を返すので、完了後の処理を連鎖できる

---

## 予定更新後のキャッシュ反映について

### ✅ **更新内容は反映されています**

**理由:**

1. **イベント更新後の処理** (5366-5368行目):
   ```javascript
   loadInitData().then(() => {
     renderEvents();
   });
   ```

2. **`loadInitData()` が `window.allResponsesCache` を更新** (1910-1918行目):
   ```javascript
   if (data.responsesMap) {
     window.allResponsesCache = data.responsesMap;
   }
   ```

3. **予定詳細モーダルがキャッシュを使用** (3602-3604行目):
   ```javascript
   const event = currentEvents.find(e => e.id === eventId);
   const responses = (window.allResponsesCache && window.allResponsesCache[eventId]) || [];
   ```

### 実際の動作フロー

```
1. 予定を更新（タイトル、日時、場所など）
   ↓
2. loadInitData() を呼び出し
   ↓
3. サーバーから最新データを取得
   - events（更新されたイベント情報）
   - responsesMap（全出欠データ）
   ↓
4. currentEvents を更新
5. window.allResponsesCache を更新  ← ここ！
   ↓
6. 一覧画面を再描画（renderEvents）
   ↓
7. 予定詳細を開く
   ↓
8. window.allResponsesCache から出欠データを取得
   ↓
9. 最新の出欠データを表示
```

---

## 現在の問題点

### ⚠️ `loadEvents()` を使っている箇所

以下の箇所ではまだ `loadEvents()` を使用しているため、**キャッシュが更新されません**：

1. **管理者ログイン後** (2111行目)
   ```javascript
   loadEvents();  // ← キャッシュが更新されない
   ```

2. **管理者ログアウト後** (2145行目)
   ```javascript
   loadEvents();  // ← キャッシュが更新されない
   ```

3. **イベント同期後** (5486, 5534, 5580行目)
   ```javascript
   loadEvents();  // ← キャッシュが更新されない
   ```

### 影響

- 管理者ログイン/ログアウト: 影響小（出欠データは変わらない）
- **イベント同期後: 影響中**（同期でイベント情報が変更される可能性がある）
  - 同期後に予定詳細を開くと、古い出欠データが表示される可能性

---

## 推奨対応

### すべての `loadEvents()` を `loadInitData()` に置き換える

**メリット:**
1. 一貫性が向上
2. 常に最新の出欠データが表示される
3. コードの保守性が向上

**デメリット:**
- なし（サーバー側は同じAPIを呼んでいるため、パフォーマンスは同じ）

---

## まとめ

| 項目 | loadEvents() | loadInitData() |
|------|--------------|----------------|
| サーバーAPI | `getInitData()` | `getInitData()` |
| イベント更新 | ✅ | ✅ |
| 出欠キャッシュ更新 | ❌ | ✅ |
| メンバー一覧更新 | ❌ | ✅ |
| Promise返す | ❌ | ✅ |
| 推奨使用 | ❌ | ✅ |

**結論:**
- **`loadInitData()` を使うべき**
- 予定更新後は `loadInitData()` を使っているので、**キャッシュは正しく更新されています** ✅
- 残存する `loadEvents()` も置き換えると、より堅牢になります

