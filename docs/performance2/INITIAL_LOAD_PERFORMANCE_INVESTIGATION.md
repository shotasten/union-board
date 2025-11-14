# トップページ初期読み込み性能調査レポート

## 調査日
2025-01-XX

## 調査目的
トップページの読み込みが遅い原因を特定し、改善可能な点を洗い出す。

## 調査結果サマリー

### 主要な問題点
1. **ConfigシートのN+1問題**: `getConfig()`が合計6回呼ばれ、毎回Configシート全体を読み込んでいる
   - `getInitData()`内: 4回（ADMIN_TOKEN, CALENDAR_ID, DISPLAY_START_DATE, DISPLAY_END_DATE）
   - `getEvents()`内: 2回（DISPLAY_START_DATE, DISPLAY_END_DATE）
2. **大量のDOM操作**: `renderGridTable()`でイベント数 × メンバー数のセルを作成している
3. **GAS Cold Start**: 初回アクセス時のCold Startによる遅延

### 改善可能な点
- Configシートの読み込みを1回に統合
- DOM操作の最適化（DocumentFragmentの使用）
- クライアント側での段階的レンダリング

### GASの限界
- Spreadsheet APIの呼び出しは避けられない（データ取得に必須）
- Cold StartはGASの仕様上避けられない（6分以上の非アクティブ状態後）

---

## 詳細調査結果

### 1. 初期読み込みフロー

```
ページ読み込み
  ↓
DOMContentLoaded
  ↓
loadInitData()
  ↓
google.script.run.getInitData()
  ↓
[サーバー側処理]
  - getEvents('all')
    - getConfig('DISPLAY_START_DATE') × 1回
    - getConfig('DISPLAY_END_DATE') × 1回
  - getConfig('ADMIN_TOKEN') × 1回
  - getConfig('CALENDAR_ID') × 1回
  - getConfig('DISPLAY_START_DATE') × 1回（重複）
  - getConfig('DISPLAY_END_DATE') × 1回（重複）
  - getMembers()
  - getAllResponses()
  
  ※合計: getConfig()が6回呼ばれている（DISPLAY_START_DATE, DISPLAY_END_DATEは重複）
  ↓
[クライアント側処理]
  - renderEvents()
  - renderGrid()
  - renderGridTable()
  ↓
画面表示完了
```

### 2. サーバー側の処理詳細

#### 2.1. `getInitData()`関数（`src/main.ts:75-131`）

**処理内容:**
```typescript
function getInitData() {
  const events = getEvents('all');           // Eventsシートから全データ取得
  const config = {
    ADMIN_TOKEN: getConfig('ADMIN_TOKEN'),   // Configシート読み込み #1
    CALENDAR_ID: getConfig('CALENDAR_ID'),   // Configシート読み込み #2
    DISPLAY_START_DATE: getConfig('DISPLAY_START_DATE'), // Configシート読み込み #3
    DISPLAY_END_DATE: getConfig('DISPLAY_END_DATE')      // Configシート読み込み #4
  };
  const members = getMembers();             // Membersシートから全データ取得
  const allResponses = getAllResponses();   // Responsesシートから全データ取得
  // responsesMapに変換
  return { events, config, members, responsesMap };
}
```

**問題点:**
- `getConfig()`が4回呼ばれ、毎回Configシート全体を読み込んでいる
- `getEvents()`内でも`getConfig()`が2回呼ばれている
- **合計6回のConfigシート読み込みが発生**（DISPLAY_START_DATE, DISPLAY_END_DATEは重複）

#### 2.2. `getEvents()`関数（`src/server/events.ts:175-276`）

**処理内容:**
```typescript
function getEvents(filter) {
  const sheet = getEventsSheet();
  const data = sheet.getDataRange().getValues(); // Eventsシート全体を取得
  
  // 表示期間の設定を取得
  const displayStartDateStr = getConfig('DISPLAY_START_DATE', ''); // Configシート読み込み #5
  const displayEndDateStr = getConfig('DISPLAY_END_DATE', '');     // Configシート読み込み #6
  
  // ループでフィルタリング
  for (let i = 1; i < data.length; i++) {
    // 各イベントを処理
  }
}
```

**問題点:**
- `getDataRange().getValues()`でEventsシート全体を取得（必要最小限のデータのみ取得できない）
- `getConfig()`が2回呼ばれている（`getInitData()`内でも呼ばれているため重複）
- DISPLAY_START_DATE, DISPLAY_END_DATEは`getInitData()`と`getEvents()`の両方で取得されている

#### 2.3. `getConfig()`関数（`src/server/utils.ts:386-414`）

**処理内容:**
```typescript
function getConfig(key, defaultValue) {
  const spreadsheet = getOrCreateSpreadsheet();
  const sheet = spreadsheet.getSheetByName('Config');
  const data = sheet.getDataRange().getValues(); // Configシート全体を取得
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      return String(data[i][1]);
    }
  }
  return defaultValue;
}
```

**問題点:**
- 毎回Configシート全体を読み込んでいる
- 同じシートを複数回読み込んでいる（N+1問題）

#### 2.4. `getMembers()`関数（`src/server/members.ts:45-74`）

**処理内容:**
```typescript
function getMembers() {
  const sheet = getMembersSheet();
  const data = sheet.getDataRange().getValues(); // Membersシート全体を取得
  // ループで変換
  for (let i = 1; i < data.length; i++) {
    members.push({ ... });
  }
  return members;
}
```

**評価:**
- バッチ取得で問題なし
- ただし、メンバー数が多い場合は処理時間が増加

#### 2.5. `getAllResponses()`関数（`src/server/responses.ts:74-114`）

**処理内容:**
```typescript
function getAllResponses() {
  const sheet = getResponsesSheet();
  const data = sheet.getDataRange().getValues(); // Responsesシート全体を取得
  // ループで変換
  for (let i = 1; i < data.length; i++) {
    responses.push({ ... });
  }
  return responses;
}
```

**評価:**
- バッチ取得で問題なし
- ただし、出欠データが多い場合は処理時間が増加

### 3. クライアント側の処理詳細

#### 3.1. `renderGridTable()`関数（`src/client/index.html:2732-3152`）

**処理内容:**
```javascript
function renderGridTable(allResponses) {
  gridContainer.innerHTML = ''; // 既存のDOMをクリア
  
  // テーブルを作成
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');
  
  // ヘッダー行を作成（2行構成）
  // 1行目：イベント、凡例、パートヘッダー
  // 2行目：メンバー名
  
  // データ行を作成
  sortedEvents.forEach(event => {
    const row = document.createElement('tr');
    // イベント情報セルを作成
    // ステータス凡例セルを作成（3つ）
    // 各メンバーのステータスセルを作成
    sortedMembers.forEach(member => {
      const statusCell = document.createElement('td');
      // スタイル設定
      // イベントハンドラ設定
      row.appendChild(statusCell);
    });
    tbody.appendChild(row);
  });
  
  table.appendChild(tbody);
  gridContainer.appendChild(table);
}
```

**問題点:**
- 大量のDOM操作が発生（イベント数 × メンバー数のセルを作成）
- 例：イベント50件 × メンバー30人 = 1,500セル + ヘッダー
- `innerHTML = ''`で既存のDOMをクリアしてから再構築（リフローが発生）

### 4. 性能ボトルネック分析

#### 4.1. サーバー側のボトルネック

| 処理 | 呼び出し回数 | 問題点 | 影響度 |
|------|------------|--------|--------|
| `getConfig()` | 6回 | Configシートを6回読み込んでいる | **高** |
| `getEvents()` | 1回 | Eventsシート全体を取得 | 中 |
| `getMembers()` | 1回 | Membersシート全体を取得 | 中 |
| `getAllResponses()` | 1回 | Responsesシート全体を取得 | 中 |

**推定処理時間（目安）:**
- Configシート読み込み: 6回 × 100-300ms = 600-1800ms
- Eventsシート読み込み: 1回 × 200-500ms = 200-500ms
- Membersシート読み込み: 1回 × 100-300ms = 100-300ms
- Responsesシート読み込み: 1回 × 300-1000ms = 300-1000ms
- **合計: 1,200-3,600ms（1.2-3.6秒）**

#### 4.2. クライアント側のボトルネック

| 処理 | 問題点 | 影響度 |
|------|--------|--------|
| `renderGridTable()` | 大量のDOM操作 | **高** |
| イベント数 × メンバー数 | セル数が多すぎる場合、レンダリングが遅い | 中 |

**推定処理時間（目安）:**
- イベント50件 × メンバー30人 = 1,500セル
- 1セルあたり 0.5-1ms = 750-1,500ms（0.75-1.5秒）

#### 4.3. GAS Cold Start

**問題点:**
- 6分以上の非アクティブ状態後、初回アクセス時にCold Startが発生
- Cold Start時間: 2-10秒程度

**評価:**
- GASの仕様上避けられない
- 定期的なアクセスで回避可能だが、完全な解決は困難

---

## 改善案

### 改善案1: Configシートの読み込みを1回に統合（推奨）

**現状:**
- `getConfig()`が6回呼ばれ、毎回Configシート全体を読み込んでいる

**改善案:**
- `getInitData()`内でConfigシートを1回だけ読み込み、すべての設定値を取得
- `getEvents()`内の`getConfig()`呼び出しを削除し、`getInitData()`から渡された設定値を使用

**効果:**
- Configシートの読み込み回数: 6回 → 1回
- 推定削減時間: 500-1,500ms

**実装難易度:** 低
**リスク:** 低

### 改善案2: DOM操作の最適化

**現状:**
- `innerHTML = ''`で既存のDOMをクリアしてから再構築
- 大量のDOM操作が同期的に実行される

**改善案:**
- `DocumentFragment`を使用してDOM操作をバッチ化
- 段階的レンダリング（最初の10件を表示してから残りを表示）

**効果:**
- DOM操作の最適化により、レンダリング時間を30-50%削減可能
- 最初の表示が早くなる（体感速度向上）

**実装難易度:** 中
**リスク:** 中（既存の機能に影響する可能性）

### 改善案3: クライアント側での段階的レンダリング

**現状:**
- すべてのデータを取得してから一括でレンダリング

**改善案:**
- 最初にイベント一覧のみを表示
- 出欠データは非同期で取得・表示

**効果:**
- 最初の表示が早くなる（体感速度向上）
- ただし、実装が複雑になる

**実装難易度:** 高
**リスク:** 高（既存の機能に大きな影響）

### 改善案4: データ取得の最適化

**現状:**
- すべてのシートから全データを取得

**改善案:**
- 表示期間が設定されている場合、必要なデータのみ取得
- ただし、GASのSpreadsheet APIでは部分取得が難しい

**効果:**
- データ量が少ない場合、処理時間を削減可能
- ただし、実装が複雑になる

**実装難易度:** 高
**リスク:** 中

---

## GASの限界

### 避けられない遅延

1. **Spreadsheet API呼び出し**
   - データ取得にはSpreadsheet API呼び出しが必須
   - API呼び出しのオーバーヘッド: 100-500ms/回
   - 複数のシートから取得する場合、合計で1-3秒程度かかる

2. **Cold Start**
   - 6分以上の非アクティブ状態後、初回アクセス時にCold Startが発生
   - Cold Start時間: 2-10秒程度
   - 定期的なアクセスで回避可能だが、完全な解決は困難

3. **データ量による制限**
   - イベント数やメンバー数が多い場合、処理時間が増加
   - 100件以上のイベント、50人以上のメンバーの場合、処理時間が3-5秒以上になる可能性

### 改善可能な範囲

- ConfigシートのN+1問題: **改善可能**（改善案1）
- DOM操作の最適化: **改善可能**（改善案2）
- 段階的レンダリング: **改善可能**（改善案3）
- データ取得の最適化: **部分的に改善可能**（改善案4）

---

## 推奨改善策

### 優先度1: Configシートの読み込みを1回に統合（改善案1）

**理由:**
- 実装が簡単で、効果が大きい
- リスクが低い
- 推定削減時間: 500-1,500ms

**実装内容:**
1. `getInitData()`内でConfigシートを1回だけ読み込み
2. すべての設定値を一度に取得
3. `getEvents()`内の`getConfig()`呼び出しを削除
4. `getEvents()`に設定値を引数で渡す

### 優先度2: DOM操作の最適化（改善案2）

**理由:**
- 体感速度の向上が期待できる
- 実装難易度は中程度

**実装内容:**
1. `DocumentFragment`を使用してDOM操作をバッチ化
2. 段階的レンダリング（最初の10件を表示してから残りを表示）

### 優先度3: 段階的レンダリング（改善案3）

**理由:**
- 実装が複雑で、リスクが高い
- ただし、体感速度の向上が期待できる

---

## 結論

### 改善可能な点
1. **ConfigシートのN+1問題**: 改善案1で解決可能（推定削減時間: 500-1,500ms）
2. **DOM操作の最適化**: 改善案2で部分的に改善可能（推定削減時間: 300-750ms）

### GASの限界
1. **Spreadsheet API呼び出し**: 避けられない（データ取得に必須）
2. **Cold Start**: 避けられない（GASの仕様）
3. **大量データ**: イベント数やメンバー数が多い場合、処理時間が増加

### 総合評価
- **改善案1（Configシートの統合）**: 実装推奨（効果大、リスク低）
- **改善案2（DOM操作の最適化）**: 実装検討（効果中、リスク中）
- **改善案3（段階的レンダリング）**: 実装検討（効果大、リスク高）

**推定改善効果:**
- 改善案1のみ: 500-1,500ms削減
- 改善案1 + 改善案2: 800-2,250ms削減
- 改善案1 + 改善案2 + 改善案3: 1,000-3,000ms削減（ただし実装が複雑）

**注意:**
- Cold Startによる遅延は避けられない
- データ量が多い場合、処理時間が増加するのは仕方ない

