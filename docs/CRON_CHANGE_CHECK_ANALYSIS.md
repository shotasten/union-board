# cronジョブ内での変更チェック方式の検討

## 📋 提案内容

cronで呼ぶjobの中で、スプレッドシートの変更をチェックして、変更があった場合のみカレンダー同期を実行する方式。

---

## 🔄 実装イメージ

### 現在の実装（cron方式）

```typescript
function scheduledSync(): void {
  // 常に同期を実行
  const result = syncAll(true);
  Logger.log(`✅ 定期同期完了: 成功 ${result.success}件`);
}
```

### 提案: 変更チェック方式

```typescript
function scheduledSync(): void {
  // 1. スプレッドシートの変更をチェック
  const lastSyncTime = getLastSyncTime(); // Script Propertiesから取得
  const lastUpdateTime = getLastResponseUpdateTime(); // Responsesシートの最終更新時刻
  
  // 2. 変更がない場合はスキップ
  if (lastUpdateTime <= lastSyncTime) {
    Logger.log(`⏭️ 同期スキップ（変更なし）`);
    return;
  }
  
  // 3. 変更があった場合のみ同期を実行
  const result = syncAll(true);
  
  // 4. 最終同期時刻を更新
  setLastSyncTime(new Date().toISOString());
}
```

---

## 📊 効果分析

### 呼び出し回数の比較

| 項目 | cron方式（現在） | 変更チェック方式 |
|------|----------------|----------------|
| **トリガー実行回数** | 24回/日（1時間おき） | 24回/日（1時間おき） |
| **同期実行回数** | 24回/日 | 変更回数分（例: 5回/日） |
| **カレンダーAPI呼び出し** | 24回/日 | 変更回数分（例: 5回/日） |

**結論**: 呼び出し回数は変わらないが、**カレンダーAPI呼び出しは大幅に削減**

---

## ⚖️ メリット・デメリット

### メリット

1. **カレンダーAPI呼び出しの削減**
   - 変更がない日は同期しない
   - 例: 1日24回 → 5回（約79%削減）

2. **実行時間の短縮**
   - 変更がない場合は即座に終了
   - 実行時間制限のリスクを低減

3. **コスト削減**
   - Google Calendar APIのクォータ消費を削減
   - 実行時間の削減

### デメリット

1. **カレンダー → アプリ同期が減る**
   - スプレッドシートに変更がない場合、カレンダー側の変更を検知できない
   - 別途、カレンダー → アプリ同期を定期的に実行する必要がある

2. **実装の複雑化**
   - 最終更新時刻の管理が必要
   - Script Propertiesの管理が必要

3. **変更チェックのコスト**
   - Responsesシート全体をスキャンして最終更新時刻を取得
   - ただし、軽量な処理なので問題なし

---

## 🎯 実装の詳細検討

### 1. 最終更新時刻の取得方法

#### 方法A: ResponsesシートのupdatedAtカラムをスキャン

```typescript
function getLastResponseUpdateTime(): string | null {
  const sheet = getResponsesSheet();
  const data = sheet.getDataRange().getValues();
  
  let lastUpdateTime: string | null = null;
  for (let i = 1; i < data.length; i++) {
    const updatedAt = data[i][5]; // updatedAtカラム
    if (updatedAt && (!lastUpdateTime || updatedAt > lastUpdateTime)) {
      lastUpdateTime = updatedAt;
    }
  }
  return lastUpdateTime;
}
```

**コスト**: O(n) - nは出欠データ数（通常100-1000件程度）

**評価**: ✅ **問題なし** - 軽量な処理

#### 方法B: Script Propertiesに変更時刻を記録

```typescript
// 出欠保存時に記録
function userSubmitResponsesBatch(...) {
  // ... 保存処理 ...
  
  // 変更時刻を記録
  PropertiesService.getScriptProperties()
    .setProperty('LAST_RESPONSE_UPDATE_TIME', new Date().toISOString());
}
```

**コスト**: O(1) - 定数時間

**評価**: ✅ **より効率的** - ただし、既存コードの修正が必要

### 2. カレンダー → アプリ同期の扱い

#### 問題点

変更チェック方式では、スプレッドシートに変更がない場合、カレンダー側の変更を検知できません。

#### 解決策

**ハイブリッド方式**:

```typescript
function scheduledSync(): void {
  // 1. カレンダー → アプリ同期（常に実行、低頻度）
  // 例: 6時間おきに実行
  const shouldPullFromCalendar = shouldPullFromCalendar();
  if (shouldPullFromCalendar) {
    pullFromCalendar(...);
  }
  
  // 2. アプリ → カレンダー同期（変更があった場合のみ）
  const lastSyncTime = getLastSyncTime();
  const lastUpdateTime = getLastResponseUpdateTime();
  
  if (lastUpdateTime > lastSyncTime) {
    syncCalendarDescriptions(...); // 説明欄同期のみ
  }
}
```

**メリット**:
- カレンダー → アプリ同期は定期的に実行（6時間おきなど）
- アプリ → カレンダー同期は変更があった場合のみ

---

## 📈 効果の定量評価

### シナリオ1: 変更頻度が低い場合（1日5回）

| 項目 | cron方式 | 変更チェック方式 | 削減率 |
|------|---------|----------------|--------|
| **同期実行回数** | 24回/日 | 5回/日 | **79%削減** |
| **カレンダーAPI呼び出し** | 24回/日 | 5回/日 | **79%削減** |
| **実行時間** | 24回 × 30秒 = 12分/日 | 5回 × 30秒 = 2.5分/日 | **79%削減** |

### シナリオ2: 変更頻度が高い場合（1日20回）

| 項目 | cron方式 | 変更チェック方式 | 削減率 |
|------|---------|----------------|--------|
| **同期実行回数** | 24回/日 | 20回/日 | **17%削減** |
| **カレンダーAPI呼び出し** | 24回/日 | 20回/日 | **17%削減** |
| **実行時間** | 24回 × 30秒 = 12分/日 | 20回 × 30秒 = 10分/日 | **17%削減** |

### シナリオ3: 変更がない日

| 項目 | cron方式 | 変更チェック方式 | 削減率 |
|------|---------|----------------|--------|
| **同期実行回数** | 24回/日 | 0回/日 | **100%削減** |
| **カレンダーAPI呼び出し** | 24回/日 | 0回/日 | **100%削減** |
| **実行時間** | 24回 × 30秒 = 12分/日 | 0秒/日 | **100%削減** |

---

## ⚠️ 注意点

### 1. カレンダー → アプリ同期の扱い

**問題**: 変更チェック方式では、カレンダー側の変更を検知できない

**解決策**:
- カレンダー → アプリ同期は別途定期的に実行（例: 6時間おき）
- または、変更チェック方式をアプリ → カレンダー同期のみに適用

### 2. 最終更新時刻の精度

**問題**: Responsesシート全体をスキャンする必要がある

**解決策**:
- 出欠保存時にScript Propertiesに変更時刻を記録（方法B）
- より効率的で確実

### 3. 初回実行時の扱い

**問題**: 初回実行時は最終同期時刻がない

**解決策**:
- 初回実行時は強制的に同期を実行
- または、最終同期時刻がない場合は同期を実行

---

## ✅ 結論

### 推奨: **変更チェック方式を採用** ⭐⭐⭐

**理由**:
1. **大幅なAPI呼び出し削減**: 変更がない日は100%削減
2. **実行時間の短縮**: 変更がない場合は即座に終了
3. **実装がシンプル**: 既存コードの小修正で対応可能
4. **コスト削減**: Google Calendar APIのクォータ消費を削減

### 実装方針

1. **方法Bを採用**: 出欠保存時にScript Propertiesに変更時刻を記録
2. **ハイブリッド方式**: 
   - カレンダー → アプリ同期: 6時間おき（低頻度）
   - アプリ → カレンダー同期: 変更チェック方式（1時間おきにチェック）

### 期待効果

- **変更がない日**: カレンダーAPI呼び出しを100%削減
- **変更頻度が低い場合**: 約79%削減
- **変更頻度が高い場合**: 約17%削減

**総合評価**: ✅ **採用を推奨** - 実装コストに対して効果が大きい

