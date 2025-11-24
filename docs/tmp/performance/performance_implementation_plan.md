# パフォーマンス改善 実装計画書（正式版）

**承認日**: 2025年11月11日  
**対象アプリ**: UnionBoard - TMU 練習予定・出欠管理アプリ  
**実装期限**: 2週間以内（2025年11月25日まで）

---

## ✅ 承認済み改善項目

以下の全ての改善項目について、実装が正式に承認されました。

| 項目 | 優先度 | 実装工数 | 期待効果 | ステータス |
|------|--------|---------|---------|-----------|
| **【問題1】初回読み込みのN+1問題** | 最高 | 3時間 | 85%改善 | ✅ **承認済み** |
| **【問題2】出欠登録モーダルのN+1問題** | 高 | 1時間 | 90%改善 | ✅ **承認済み** |
| **【問題3】出欠保存のバッチ化** | 中 | 2時間 | 50%改善 | ✅ **承認済み** |
| **【問題4】イベント詳細モーダルの最適化** | 中 | 30分 | 70%改善 | ✅ **承認済み** |
| **【問題5】管理者ステータス確認の統合** | 低 | 30分 | 微改善 | ✅ **承認済み** |

**総実装工数**: 約7時間  
**総合改善効果**: 初回読み込み 13-14秒 → **2秒以下**（約85-90%改善）

---

## 📅 実装スケジュール

### Week 1（11/11 - 11/17）

#### Day 1-2: サーバーサイド実装
- [ ] `getAllResponses()` 関数追加（`src/server/responses.ts`）
- [ ] `getAllEventsWithResponses()` 関数追加（`src/main.ts`）
- [ ] `userSubmitResponsesBatch()` 関数追加（`src/main.ts`）
- [ ] `getInitData()` 拡張（responsesMap追加）

#### Day 3-4: クライアントサイド実装
- [ ] グローバルキャッシュ変数追加（`window.allResponsesCache`）
- [ ] `renderGrid()` 書き換え（バッチAPI使用）
- [ ] `loadInitData()` 修正（キャッシュ保存）
- [ ] `renderEventStatusList()` 書き換え（キャッシュ活用）
- [ ] `showEventDetailModal()` 書き換え（キャッシュ活用）
- [ ] `bulkUpdateResponsesForSelectedMember()` 書き換え（バッチAPI使用）

#### Day 5: ビルド・デプロイ・動作確認
- [ ] `npm run build` 実行
- [ ] `clasp push` でデプロイ
- [ ] 動作確認（全機能テスト）

### Week 2（11/18 - 11/24）

#### Day 1-2: パフォーマンス測定
- [ ] 初回読み込み速度測定
- [ ] 各モーダル表示速度測定
- [ ] 出欠保存速度測定
- [ ] Network タブでAPI呼び出し数確認

#### Day 3-4: 微調整・バグ修正
- [ ] パフォーマンス測定結果に基づく調整
- [ ] バグ修正（あれば）
- [ ] エラーハンドリングの強化

#### Day 5: 最終確認・本番適用
- [ ] 全機能の最終動作確認
- [ ] パフォーマンス目標達成確認
- [ ] 本番環境へ適用

---

## 🎯 実装目標（KPI）

### 速度改善目標

| 項目 | 改善前 | 目標値 | 測定方法 |
|------|--------|--------|---------|
| 初回ページ読み込み | 13-14秒 | **2秒以下** | Chrome DevTools Performance |
| 出欠登録モーダル表示 | 6秒 | **0.5秒以下** | console.time/timeEnd |
| 出欠保存（5件） | 3-5秒 | **1秒以下** | console.time/timeEnd |
| イベント詳細モーダル | 1.5秒 | **0.5秒以下** | console.time/timeEnd |

### API呼び出し削減目標

| 項目 | 改善前 | 目標値 | 測定方法 |
|------|--------|--------|---------|
| 初回読み込み時のAPI呼び出し数 | 14回 | **1回** | Network タブ |
| モーダル表示時のAPI呼び出し数 | 12回 | **0回** | Network タブ |
| 出欠保存時のAPI呼び出し数 | N回 | **1回** | Network タブ |

---

## 📦 Phase別実装詳細

### Phase 1: バッチ取得API実装（優先度：最高）

**対象**: 【問題1】初回読み込みのN+1問題

#### 実装ファイル

1. **`src/server/responses.ts`**
   - `getAllResponses()` 関数を追加
   - 場所: `getResponses()` 関数の後
   - コード: `performance_improvement_samples.md` の「Phase 1 - 1」参照

2. **`src/main.ts`**
   - `getAllEventsWithResponses()` 関数を追加
   - 場所: `getEventWithResponses()` 関数の後
   - コード: `performance_improvement_samples.md` の「Phase 1 - 2」参照

3. **`src/client/index.html`**
   - `window.allResponsesCache = {};` を追加（グローバル変数宣言部分）
   - `renderGrid()` 関数を書き換え
   - コード: `performance_improvement_samples.md` の「Phase 1 - 3, 4」参照

#### テスト項目
- [ ] 初回読み込みで `getAllEventsWithResponses()` が呼ばれることを確認
- [ ] `window.allResponsesCache` にデータが保存されることを確認
- [ ] 表形式で出欠データが正しく表示されることを確認
- [ ] API呼び出し数が 14回 → 2回 に削減されることを確認

---

### Phase 2: 出欠登録モーダルのキャッシュ活用（優先度：高）

**対象**: 【問題2】出欠登録モーダル表示時のN+1問題

#### 実装ファイル

1. **`src/client/index.html`**
   - `renderEventStatusList()` 関数を書き換え
   - コード: `performance_improvement_samples.md` の「Phase 2」参照

#### テスト項目
- [ ] メンバー名クリック時にモーダルが即座に表示されることを確認
- [ ] モーダル内で各イベントの出欠状況が正しく表示されることを確認
- [ ] API呼び出しが発生しないことを確認（Network タブ）
- [ ] キャッシュがない場合、自動的に取得されることを確認

---

### Phase 3: loadInitDataの統合（優先度：高）

**対象**: 【問題1】【問題5】の統合最適化

#### 実装ファイル

1. **`src/main.ts`**
   - `getInitData()` 関数を拡張（responsesMap追加）
   - コード: `performance_improvement_samples.md` の「Phase 3 - 1」参照

2. **`src/client/index.html`**
   - `loadInitData()` 関数を修正（キャッシュ保存追加）
   - `renderGrid()` 関数を最終形に変更
   - コード: `performance_improvement_samples.md` の「Phase 3 - 2, 3」参照

#### テスト項目
- [ ] 初回読み込みで全出欠データが取得されることを確認
- [ ] `window.allResponsesCache` にデータが保存されることを確認
- [ ] `renderGrid()` でAPI呼び出しが発生しないことを確認
- [ ] API呼び出し数が 2回 → 1回 に削減されることを確認

---

### Phase 4: イベント詳細モーダルの最適化（優先度：中）

**対象**: 【問題4】イベント詳細モーダル表示のパフォーマンス

#### 実装ファイル

1. **`src/client/index.html`**
   - `showEventDetailModal()` 関数を書き換え
   - コード: `performance_improvement_samples.md` の「Phase 4」参照

#### テスト項目
- [ ] イベント名クリック時にモーダルが即座に表示されることを確認
- [ ] イベント情報、出欠集計、コメントが正しく表示されることを確認
- [ ] API呼び出しが発生しないことを確認（Network タブ）

---

### Phase 5: 出欠保存のバッチ化（優先度：中）

**対象**: 【問題3】出欠保存時のパフォーマンス

#### 実装ファイル

1. **`src/main.ts`**
   - `userSubmitResponsesBatch()` 関数を追加
   - 場所: `userSubmitResponse()` 関数の後
   - コード: `performance_improvement_samples.md` の「Phase 3（問題3）」参照

2. **`src/client/index.html`**
   - `bulkUpdateResponsesForSelectedMember()` 関数を書き換え
   - コード: `performance_improvement_samples.md` の「Phase 3（問題3）- 2」参照

#### テスト項目
- [ ] 複数の出欠を変更して保存できることを確認
- [ ] 保存後にトーストメッセージが表示されることを確認
- [ ] キャッシュが更新されることを確認
- [ ] 表形式の表示が即座に更新されることを確認
- [ ] API呼び出し数が N回 → 1回 に削減されることを確認

---

## 🧪 テスト計画

### 1. ユニットテスト（サーバーサイド）

```typescript
// GAS Scriptエディタで実行
function testPerformanceImprovements() {
  Logger.log('=== パフォーマンス改善テスト開始 ===');
  
  // Test 1: getAllResponses
  Logger.log('\n--- Test 1: getAllResponses ---');
  const allResponses = getAllResponses();
  Logger.log(`✅ 全出欠データ取得: ${allResponses.length}件`);
  
  // Test 2: getAllEventsWithResponses
  Logger.log('\n--- Test 2: getAllEventsWithResponses ---');
  const result = getAllEventsWithResponses();
  Logger.log(`✅ イベント数: ${result.events.length}件`);
  Logger.log(`✅ 出欠データあるイベント: ${Object.keys(result.responsesMap).length}件`);
  
  // Test 3: userSubmitResponsesBatch
  Logger.log('\n--- Test 3: userSubmitResponsesBatch ---');
  const testResponses = [
    {
      eventId: result.events[0].id,
      userKey: 'test-user-1',
      status: '○',
      comment: 'テストコメント1'
    },
    {
      eventId: result.events[1].id,
      userKey: 'test-user-1',
      status: '△',
      comment: 'テストコメント2'
    }
  ];
  const batchResult = userSubmitResponsesBatch(testResponses);
  Logger.log(`✅ 成功: ${batchResult.success}件, 失敗: ${batchResult.failed}件`);
  
  Logger.log('\n=== テスト終了 ===');
}
```

### 2. パフォーマンステスト（クライアントサイド）

```javascript
// Chrome DevTools Console で実行

// Test 1: 初回読み込み速度
console.time('初回読み込み');
location.reload();
// ページ読み込み完了後
console.timeEnd('初回読み込み');

// Test 2: 表形式描画速度
console.time('表形式描画');
renderGrid();
console.timeEnd('表形式描画');

// Test 3: モーダル表示速度
console.time('モーダル表示');
// メンバー名をクリック
console.timeEnd('モーダル表示');

// Test 4: API呼び出し数確認
// Network タブで XHR フィルタを有効化
// ページリロード後、exec? で始まるリクエスト数をカウント
```

### 3. 統合テスト

| # | テストケース | 期待結果 | 確認方法 |
|---|------------|---------|---------|
| 1 | 初回ページ読み込み | 2秒以下で完了 | Performance タブ |
| 2 | 表形式でのデータ表示 | 全イベント・全メンバーの出欠が正しく表示 | 目視確認 |
| 3 | メンバー名クリック | 0.5秒以下でモーダル表示 | console.time |
| 4 | モーダル内のデータ表示 | 各イベントの出欠状況が正しく表示 | 目視確認 |
| 5 | 出欠の変更と保存 | 1秒以下で保存完了 | console.time |
| 6 | 保存後のデータ反映 | 表形式に即座に反映 | 目視確認 |
| 7 | イベント詳細モーダル | 0.5秒以下で表示 | console.time |
| 8 | API呼び出し数 | 初回読み込みで1回のみ | Network タブ |

---

## 📋 実装チェックリスト

### サーバーサイド実装

#### `src/server/responses.ts`
- [ ] `getAllResponses()` 関数を追加
- [ ] 関数が正しくエクスポートされていることを確認
- [ ] ログ出力が適切に設定されていることを確認

#### `src/main.ts`
- [ ] `getAllEventsWithResponses()` 関数を追加
- [ ] `userSubmitResponsesBatch()` 関数を追加
- [ ] `getInitData()` に `responsesMap` を追加
- [ ] TypeScript型定義が正しいことを確認

### クライアントサイド実装

#### `src/client/index.html`
- [ ] `window.allResponsesCache = {};` を追加（グローバル変数）
- [ ] `renderGrid()` を書き換え（バッチAPI使用）
- [ ] `loadInitData()` を修正（キャッシュ保存）
- [ ] `renderEventStatusList()` を書き換え（キャッシュ活用）
- [ ] `showEventDetailModal()` を書き換え（キャッシュ活用）
- [ ] `bulkUpdateResponsesForSelectedMember()` を書き換え（バッチAPI使用）
- [ ] エラーハンドリングが適切に設定されていることを確認

### ビルド・デプロイ

- [ ] `npm run build` が成功することを確認
- [ ] TypeScriptのコンパイルエラーがないことを確認
- [ ] `clasp push` でデプロイ成功
- [ ] GAS Scriptエディタで最新コードが反映されていることを確認

### 動作確認

- [ ] 初回読み込みが2秒以下で完了
- [ ] 表形式でデータが正しく表示
- [ ] 出欠登録モーダルが0.5秒以下で表示
- [ ] イベント詳細モーダルが0.5秒以下で表示
- [ ] 出欠の保存が1秒以下で完了
- [ ] API呼び出し数が1回に削減
- [ ] エラーが発生しないことを確認
- [ ] 全ブラウザで動作確認（Chrome, Safari, Edge）
- [ ] スマートフォンで動作確認

---

## 🚨 注意事項

### デプロイ前の確認

1. **バックアップの作成**
   - 現在のGASコードをバックアップ
   - Spreadsheetのコピーを作成

2. **TypeScript型定義の確認**
   - `Response` 型に `responsesMap` が追加されていることを確認
   - 型エラーが発生していないことを確認

3. **テスト環境での動作確認**
   - 可能であれば、テスト用のSpreadsheetで先に動作確認

### デプロイ後の確認

1. **パフォーマンス測定**
   - 初回読み込み速度を測定
   - 目標値（2秒以下）を達成しているか確認

2. **機能確認**
   - 全機能が正常に動作することを確認
   - エラーログがないことを確認（GAS実行ログ）

3. **ユーザーフィードバック**
   - 実際のユーザーに速度改善を体感してもらう
   - 不具合がないか確認

---

## 🔧 トラブルシューティング

### よくあるエラーと対処法

#### エラー1: "getAllResponses is not defined"

**原因**: 関数が正しくビルド・デプロイされていない

**解決策**:
```bash
npm run build
clasp push
```

#### エラー2: "allResponsesCache is not defined"

**原因**: グローバル変数が宣言されていない

**解決策**: `src/client/index.html` の先頭に以下を追加
```javascript
window.allResponsesCache = {};
```

#### エラー3: モーダルにデータが表示されない

**原因**: キャッシュが空、またはデータ変換ロジックにバグ

**解決策**:
1. `console.log(window.allResponsesCache)` でキャッシュを確認
2. `console.log(memberList)` でメンバーリストを確認
3. userKey のマッピングが正しいか確認

#### エラー4: 速度が改善されない

**原因**: 古いキャッシュが残っている、またはAPI呼び出しが削減されていない

**解決策**:
1. ブラウザのキャッシュをクリア（スーパーリロード: Ctrl+Shift+R）
2. Network タブでAPI呼び出し数を確認
3. `getAllEventsWithResponses` が呼ばれているか確認

---

## 📊 パフォーマンス測定結果記録用

### 改善前（ベースライン）

| 項目 | 測定値 | 測定日時 |
|------|--------|---------|
| 初回読み込み | 13-14秒 | 2025/11/11 |
| API呼び出し数 | 14回 | 2025/11/11 |
| モーダル表示 | 6秒 | 2025/11/11 |

### 改善後（目標）

| 項目 | 目標値 | 実測値 | 達成率 | 測定日時 |
|------|--------|--------|--------|---------|
| 初回読み込み | 2秒以下 | ___秒 | ___% | __/__/__ |
| API呼び出し数 | 1回 | ___回 | ___% | __/__/__ |
| モーダル表示 | 0.5秒以下 | ___秒 | ___% | __/__/__ |
| 出欠保存 | 1秒以下 | ___秒 | ___% | __/__/__ |

---

## ✅ 完了基準

以下の全ての項目を満たした時点で、本実装計画は完了とします。

### 必須項目
- [ ] 初回読み込み速度が2秒以下
- [ ] API呼び出し数が初回1回のみ
- [ ] 全機能が正常に動作
- [ ] エラーログが発生していない
- [ ] パフォーマンス測定結果を記録

### 推奨項目
- [ ] ユーザーからのポジティブなフィードバック
- [ ] モバイル環境での動作確認
- [ ] ドキュメントの更新

---

## 📞 サポート・質問

実装中に不明点や問題が発生した場合：

1. **ドキュメント参照**
   - `performance_improvement_samples.md`: 実装コード例
   - `performance_investigation_report.md`: 技術的背景

2. **ログ確認**
   - GAS実行ログ（Apps Script エディタ → 表示 → ログ）
   - ブラウザコンソール（F12 → Console）

3. **段階的実装**
   - Phase 1 から順番に実装
   - 各Phaseごとに動作確認

---

**実装責任者**: _______________  
**開始日**: _______________  
**完了予定日**: 2025/11/25  
**実完了日**: _______________

---

**ドキュメントバージョン**: 1.0  
**最終更新日**: 2025年11月11日  
**作成者**: プロジェクトチーム


