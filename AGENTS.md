# AI Agent Guidelines

このファイルは、AIエージェント（Cursor、GitHub Copilot、その他のAIアシスタント）がコードを生成・修正する際に従うべきルールを定義します。

## 🚨 必須ルール

### 1. テストファーストの原則

**実装とテストは必ずセットで行うこと。**

#### 適用範囲
- 新機能の追加
- バグ修正
- ロジックの変更
- リファクタリング

#### 例外
- ドキュメントのみの変更
- スタイル・フォーマットのみの変更
- 設定ファイルのみの変更

#### テスト実装ルール

1. **AAA（Arrange-Act-Assert）パターンで記述**
   ```typescript
   it('説明文は日本語で具体的に', () => {
     // Arrange（準備）
     const input = 'test data';
     
     // Act（実行）
     const result = targetFunction(input);
     
     // Assert（検証）
     expect(result).toBe('expected');
   });
   ```

2. **テストケースの網羅性**
   - 正常系（ハッピーパス）
   - 異常系（エラーケース）
   - 境界値テスト
   - エッジケース

3. **テストファイルの配置**
   - 実装: `src/server/module.ts`
   - テスト: `src/server/__tests__/module.test.ts`

### 2. コード変更のワークフロー

```
1. 要件確認
   ↓
2. テストケース設計（何をテストするか明確化）
   ↓
3. 実装
   ↓
4. テスト実装
   ↓
5. テスト実行・確認
   ↓
6. GASへのデプロイ
   ↓
7. コミット
```

#### デプロイ手順

**実装とテストが完了したら、必ずGoogle Apps Script (GAS)にデプロイすること。**

1. **全テストの実行**
   ```bash
   npm test
   ```
   - 全テストがパスすることを確認
   - 既存機能が壊れていないことを確認

2. **GASへプッシュ**
   ```bash
   npm run push
   ```
   - TypeScriptをコンパイル
   - GASにコードをプッシュ（開発環境に反映）

3. **デプロイの詳細**
   - デプロイ方法の詳細は[README.mdのデプロイ手順](README.md#-デプロイ手順)を参照
   - Webアプリとしてのデプロイが必要な場合は、README.mdに記載の手順に従う

**注意事項:**
- テストがパスしない場合は、デプロイしないこと
- デプロイ後は、Web UIで動作確認を行うこと
- データベースの更新が必要な場合は、適切なマイグレーションスクリプトを実行すること

#### ✅ 正しい例

```typescript
// 1. 実装を追加
function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

// 2. 同じコミットでテストを追加
describe('calculateTotal', () => {
  it('商品の合計金額を正しく計算すること', () => {
    // Arrange
    const items = [
      { name: 'A', price: 100 },
      { name: 'B', price: 200 }
    ];
    
    // Act
    const result = calculateTotal(items);
    
    // Assert
    expect(result).toBe(300);
  });
  
  it('空配列の場合は0を返すこと', () => {
    expect(calculateTotal([])).toBe(0);
  });
});
```

#### ❌ 悪い例

```typescript
// 実装だけ追加してテストを書かない
function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}
// テストなし ← NG
```

### 3. コミットメッセージ

実装とテストを同時にコミットする場合：

```bash
git commit -m "feat: 合計金額計算機能を追加

- calculateTotal関数を実装
- 正常系・異常系・境界値のテストを追加
- 全テストがパス"
```

テストを後から追加する場合（既存コードへのテスト追加）：

```bash
git commit -m "test: calculateTotal関数のテストケースを追加

- 正常系テスト
- 空配列のテスト
- 負の値のテスト"
```

## 📋 プロジェクト固有のルール

### Google Apps Script (GAS) プロジェクト

#### モック
GAS特有のグローバルオブジェクトをモックする：
- `Logger`
- `CalendarApp`
- `SpreadsheetApp`
- `Utilities`

モックは `jest.setup.js` で定義済み。

#### テストファイルの構造
```typescript
describe('module.ts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // モックの初期化
  });
  
  describe('関数名', () => {
    it('テストケース1', () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

### TypeScript型定義
- `src/types/models.ts` に共通型を定義
- 型定義の変更時は影響範囲を確認

## 🔍 レビューチェックリスト

コードレビュー時に確認する項目：

- [ ] 実装とテストがセットになっているか
- [ ] テストがAAAパターンで記述されているか
- [ ] 正常系・異常系の両方をカバーしているか
- [ ] テストがすべてパスしているか
- [ ] テストの説明が日本語で具体的か
- [ ] モックが適切に使用されているか
- [ ] GASにデプロイ済みか（`npm run push`を実行したか）
- [ ] デプロイ後の動作確認を行ったか

## 📚 参考

### テスト実行コマンド
```bash
# 全テスト実行
npm test

# 特定ファイルのみ
npm test -- src/server/__tests__/calendar.test.ts

# watchモード
npm test -- --watch
```

### Jest関連ドキュメント
- 設定: `jest.config.js`
- セットアップ: `jest.setup.js`
- 実行: `package.json` の `test` スクリプト

---

## 🤖 AI Agentへの指示

このファイルを読んだAIエージェントは：

1. **コード変更時は必ずテストの有無を確認すること**
2. **テストがない場合は実装を提案する前に指摘すること**
3. **実装とテストを同時に提案すること**
4. **テストがない変更を検出したら警告すること**
5. **テストがパスしたら、必ずGASにデプロイすること**
6. **デプロイ後は、動作確認を促すこと**

### 実装完了時の対応例

```
❌ 悪い対応:
「この関数を実装しました！」

✅ 良い対応:
「この関数を実装しました。続けてテストケースを追加します。
- 正常系: ...
- 異常系: ...
テストが完了したら、GASにデプロイします。」

✅ さらに良い対応:
「この関数を実装し、テストも完了しました。
- テスト結果: 全8テストがパス
- GASへのデプロイ: 完了（11ファイルをプッシュ）
Web UIで動作確認を行ってください。」
```

### ユーザーがテストを省略しようとした場合

```
ユーザー: 「この機能だけ実装して」

AI: 「承知しました。実装を進めますが、AGENTS.mdのルールに従い、
テストもセットで実装し、GASにデプロイまで行います。
どのようなテストケースが必要か確認させてください：
1. 正常系: ...
2. 異常系: ...」
```

### ユーザーがデプロイを忘れている場合

```
ユーザー: 「実装とテストができたので終わり」

AI: 「テストが完了しましたが、AGENTS.mdのルールに従い、
GASへのデプロイも必要です。
`npm run push` を実行してデプロイします。」
```

