# スプレッドシート変更トリガーによる同期の分析

## 📋 概要

定期同期（cron）の代わりに、スプレッドシートの変更をトリガーにしてカレンダー同期を行う方法の検討。

---

## 🔄 現在の実装（cron方式）

### 動作
- **時間主導型トリガー**で定期的に実行
- 変更がなくても実行される
- 1時間おき: 1日24回実行

### メリット
- ✅ シンプルで確実
- ✅ カレンダー側の変更も検知可能（双方向同期）

### デメリット
- ⚠️ 変更がなくても実行される（無駄な同期）
- ⚠️ 呼び出し回数が固定（1日24回）

---

## 💡 提案: スプレッドシート変更トリガー方式

### 実装方法

#### 1. `onEdit` トリガーを使用

```typescript
/**
 * スプレッドシートの編集時に自動実行される関数
 * @param e 編集イベント
 */
function onEdit(e: GoogleAppsScript.Events.SheetsOnEdit): void {
  const sheet = e.source.getActiveSheet();
  const sheetName = sheet.getName();
  
  // Responsesシートの変更のみを検知
  if (sheetName !== 'Responses') {
    return;
  }
  
  // 編集された行を取得
  const editedRow = e.range.getRow();
  
  // ヘッダー行は除外
  if (editedRow <= 1) {
    return;
  }
  
  // 変更があったことを記録（後で同期用）
  // 注意: onEdit内で直接同期すると実行時間制限に引っかかる可能性がある
  // → 1クッション挟む（後述）
}
```

#### 2. 1クッション挟む方式（推奨）

```typescript
// 変更を記録するシート（ChangeLog）
// または Script Properties に変更時刻を記録

function onEdit(e: GoogleAppsScript.Events.SheetsOnEdit): void {
  const sheet = e.source.getActiveSheet();
  if (sheet.getName() !== 'Responses') {
    return;
  }
  
  // 変更時刻を記録（Script Properties）
  PropertiesService.getScriptProperties().setProperty(
    'LAST_RESPONSE_CHANGE',
    new Date().toISOString()
  );
  
  // 変更フラグを立てる
  PropertiesService.getScriptProperties().setProperty(
    'NEEDS_CALENDAR_SYNC',
    'true'
  );
}

// 時間主導型トリガーで変更をチェック（5分おき）
function checkAndSyncOnChange(): void {
  const needsSync = PropertiesService.getScriptProperties()
    .getProperty('NEEDS_CALENDAR_SYNC');
  
  if (needsSync === 'true') {
    // 同期を実行
    syncAll(true);
    
    // フラグをクリア
    PropertiesService.getScriptProperties()
      .deleteProperty('NEEDS_CALENDAR_SYNC');
  }
}
```

---

## 📊 効果分析

### 呼び出し回数の比較

#### パターン1: cron方式（現在）

| 項目 | 値 |
|------|-----|
| **実行回数（1日）** | 24回（1時間おき） |
| **変更がない日** | 24回実行（無駄） |
| **変更がある日** | 24回実行（無駄な実行あり） |

#### パターン2: 変更トリガー方式（提案）

| 項目 | 値 |
|------|-----|
| **onEdit実行回数** | 変更回数分（例: 10回/日） |
| **checkAndSyncOnChange実行回数** | 288回（5分おき） |
| **実際の同期実行回数** | 変更があった回数（例: 10回/日） |

**注意**: `checkAndSyncOnChange` は軽量なチェックのみなので、実行時間は短い

---

## ⚖️ メリット・デメリット

### メリット

1. **無駄な同期が減る**
   - 変更がない場合は同期しない
   - 呼び出し回数が減る可能性がある

2. **リアルタイムに近い同期**
   - 変更があったときだけ同期
   - 最大5分遅延（checkAndSyncOnChangeの頻度による）

3. **API呼び出しの削減**
   - 変更がない日は同期しない
   - カレンダーAPIの呼び出しが減る

### デメリット

1. **カレンダー側の変更を検知できない**
   - スプレッドシートの変更のみ検知
   - カレンダー → アプリの同期は別途必要

2. **実装が複雑**
   - `onEdit` + `checkAndSyncOnChange` の2段階
   - エラーハンドリングが複雑

3. **実行回数は変わらない可能性**
   - `checkAndSyncOnChange` は5分おきに実行
   - 1日288回実行（ただし軽量）

4. **onEditの制限**
   - 実行時間: 最大30秒
   - 重い処理はできない
   - → 1クッション挟む必要がある

---

## 🎯 結論

### 呼び出し回数について

**結論**: **呼び出し回数自体は変わらない（むしろ増える可能性）**

**理由**:
1. `onEdit` は変更回数分実行（例: 10回/日）
2. `checkAndSyncOnChange` は5分おきに実行（1日288回）
3. **合計**: 約298回/日（cron方式の24回より多い）

**ただし**:
- `checkAndSyncOnChange` は軽量なチェックのみ
- 実際の同期実行回数は変更があった回数のみ
- **カレンダーAPIの呼び出しは減る**（変更がない日は同期しない）

### 効果

| 項目 | cron方式 | 変更トリガー方式 |
|------|---------|----------------|
| **トリガー実行回数** | 24回/日 | 約298回/日（増加） |
| **同期実行回数** | 24回/日 | 変更回数分（例: 10回/日） |
| **カレンダーAPI呼び出し** | 24回/日 | 変更回数分（例: 10回/日） |
| **カレンダー → アプリ同期** | ✅ 可能 | ❌ 別途必要 |

---

## 💡 推奨: ハイブリッド方式

### 実装案

1. **変更トリガー方式**（アプリ → カレンダー同期）
   - スプレッドシートの変更を検知
   - 変更があったときだけ同期

2. **cron方式**（カレンダー → アプリ同期）
   - 定期的にカレンダー側の変更を検知
   - 1時間おき（低頻度）

### メリット

- ✅ アプリ → カレンダー: 変更があったときだけ同期（効率的）
- ✅ カレンダー → アプリ: 定期的に同期（確実）
- ✅ カレンダーAPI呼び出しを削減
- ✅ 双方向同期を実現

### デメリット

- ⚠️ 実装が複雑（2つの方式を併用）
- ⚠️ トリガー管理が複雑

---

## 🚀 実装する場合の手順

### 1. `onEdit` 関数を実装

```typescript
function onEdit(e: GoogleAppsScript.Events.SheetsOnEdit): void {
  const sheet = e.source.getActiveSheet();
  if (sheet.getName() !== 'Responses') {
    return;
  }
  
  // 変更時刻を記録
  PropertiesService.getScriptProperties().setProperty(
    'LAST_RESPONSE_CHANGE',
    new Date().toISOString()
  );
  
  // 同期フラグを立てる
  PropertiesService.getScriptProperties().setProperty(
    'NEEDS_CALENDAR_SYNC',
    'true'
  );
}
```

### 2. `checkAndSyncOnChange` 関数を実装

```typescript
function checkAndSyncOnChange(): void {
  const needsSync = PropertiesService.getScriptProperties()
    .getProperty('NEEDS_CALENDAR_SYNC');
  
  if (needsSync === 'true') {
    try {
      // アプリ → カレンダー同期のみ（説明欄同期）
      const events = getEvents('all');
      const displayPeriod = getDisplayPeriod();
      
      // 表示期間内のイベントのみ同期
      events.forEach(event => {
        if (isInDisplayPeriod(event, displayPeriod)) {
          syncCalendarDescriptionForEvent(event.id);
        }
      });
      
      // フラグをクリア
      PropertiesService.getScriptProperties()
        .deleteProperty('NEEDS_CALENDAR_SYNC');
    } catch (error) {
      Logger.log(`❌ 同期エラー: ${(error as Error).message}`);
    }
  }
}
```

### 3. トリガーを設定

1. **onEditトリガー**（自動設定、手動設定不要）
2. **checkAndSyncOnChangeトリガー**（5分おき）
3. **scheduledSyncトリガー**（1時間おき、カレンダー → アプリ同期用）

---

## ✅ 最終推奨

### 現状維持（cron方式）を推奨 ⭐⭐⭐

**理由**:
1. **シンプル**: 実装が簡単で確実
2. **双方向同期**: カレンダー側の変更も検知可能
3. **呼び出し回数**: 1日24回で十分少ない
4. **実装コスト**: 変更トリガー方式は複雑

### 変更トリガー方式を検討する場合

**条件**:
- カレンダーAPIの呼び出しをさらに削減したい
- 変更頻度が低い（1日数回程度）
- カレンダー → アプリ同期は別途対応可能

**推奨**: **ハイブリッド方式**
- 変更トリガー: アプリ → カレンダー同期
- cron方式: カレンダー → アプリ同期（1時間おき）

---

## 📝 まとめ

### 質問への回答

**Q: スプレッドシートの変更をトリガーにすると、呼び出し回数は変わる？**

**A: 変わらない（むしろ増える可能性）**

- `onEdit` + `checkAndSyncOnChange` の合計で約298回/日
- cron方式の24回より多い

**ただし**:
- 実際の同期実行回数は変更回数分のみ
- **カレンダーAPIの呼び出しは減る**（変更がない日は同期しない）

**Q: 意味がある？**

**A: 条件付きで意味がある**

- **カレンダーAPI呼び出しを削減したい場合**: 意味がある
- **実装のシンプルさを重視する場合**: 意味がない（現状維持推奨）

**推奨**: 現状のcron方式を維持し、必要に応じてハイブリッド方式を検討

