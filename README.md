# UnionBoard

TMU 練習予定・出欠管理アプリ（Google Apps Script製）

## 📋 プロジェクト概要

Google Apps Script (GAS) とHTML Serviceを使用した、TMU（Tokyo Music Union）の練習予定・出欠管理アプリです。

### 主要機能

- ✅ イベント管理（作成・編集・削除）
- ✅ 出欠登録（○/△/× + コメント）
- ✅ 出欠集計表示（リアルタイム）
- ✅ パート別メンバー管理
- ✅ Googleカレンダー連携（双方向同期）
  - 出欠状況を自動反映
  - コメントをカレンダーに同期
  - 表示期間による効率的な同期
- ✅ 定期同期機能（cron対応）
- ✅ 匿名認証モード（管理者トークン認証）
- ✅ 表示期間管理（年度単位の管理に対応）
- ✅ セキュリティ対策（XSS対策、レート制限、入力サニタイゼーション）

## 🛠️ 技術スタック

- **言語**: TypeScript
- **フロントエンド**: Vanilla JavaScript + CSS
- **バックエンド**: Google Apps Script
- **ストレージ**: Google Spreadsheet（4シート構成）
- **カレンダー**: Google Calendar API
- **デプロイ**: clasp
- **タイムゾーン**: Asia/Tokyo

## 📁 プロジェクト構造

```
/workspace
├── src/
│   ├── server/               # バックエンドロジック (TypeScript)
│   │   ├── main.ts           # エントリーポイント、API関数
│   │   ├── events.ts         # イベント管理（CRUD）
│   │   ├── responses.ts      # 出欠管理
│   │   ├── members.ts        # メンバー管理（パート別）
│   │   ├── calendar.ts       # カレンダー連携（双方向同期）
│   │   ├── calendar-helper.ts# カレンダーヘルパー関数
│   │   ├── auth.ts           # 認証処理（管理者判定）
│   │   └── utils.ts          # ユーティリティ（Spreadsheet管理）
│   ├── client/               # フロントエンド
│   │   └── index.html        # メインHTML（CSS、JS含む）
│   └── types/
│       └── models.ts         # 型定義（共通インターフェース）
├── dist/                     # コンパイル済みファイル
├── public/                   # ホスティング用ファイル
├── docs/                     # ドキュメント
│   ├── SPECIFICATION.md       # 機能仕様、技術仕様
│   ├── OPERATION_MANUAL.md    # 日常運用手順
│   ├── SETUP_GUIDE.md         # 初回セットアップガイド
│   ├── CRON_SYNC_SETUP_GUIDE.md # 定期同期設定ガイド
│   ├── CALENDAR_PUBLIC_SETUP.md # カレンダー公開設定ガイド
│   └── tmp/                  # 開発・調査資料（一時保存）
├── .clasp.json               # clasp設定（.gitignoreで除外、初回セットアップ時に作成）
├── .env                      # 環境変数（GAS_APP_URL等、.gitignoreで除外）
├── tsconfig.json             # TypeScript設定
├── appsscript.json           # GAS設定（OAuth スコープ）
├── package.json              # npm設定
├── scripts/                  # ビルドスクリプト
│   └── build-html.js         # HTMLビルドスクリプト
└── README.md                 # 本ファイル
```

## 🔧 セットアップ手順

**他のアカウントで1から導入する場合は、[完全なセットアップ手順](docs/SETUP_GUIDE.md)を参照してください。**

### クイックスタート

```bash
# リポジトリをクローン
git clone https://github.com/shotasten/union-board.git
cd union-board

# 依存関係をインストール
npm install

# 環境変数を設定（index.htmlビルド用）
# .envファイルをルートディレクトリに作成し、GAS_APP_URLを設定
echo 'GAS_APP_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec' > .env
# または手動で.envファイルを作成して以下を記述:
# GAS_APP_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec

# index.htmlをビルド（環境変数からURLを注入）
# 出力先: public/index.html
npm run build:html

# Google Apps Script APIを有効化
# https://script.google.com/home/usersettings

# clasp認証
clasp login

# 新規プロジェクト作成
clasp create --type standalone --title "UnionBoard" --rootDir ./dist

# ビルドとプッシュ（--force で強制プッシュ）
npm run push
```

**詳細な手順**: [セットアップ手順（完全版）](docs/SETUP_GUIDE.md) を参照してください。

## 🧪 テスト

### ユニットテストの実行

```bash
# 全テストを実行
npm test

# ウォッチモードで実行（ファイル変更時に自動実行）
npm run test:watch

# カバレッジレポートを生成
npm run test:coverage
```

### テスト構成

- **テストフレームワーク**: Jest
- **テスト形式**: AAA形式（Arrange, Act, Assert）
- **モック**: Google Apps Script API（SpreadsheetApp, CalendarApp等）をモック化
- **テスト対象**: `src/server/__tests__/` 配下のテストファイル

### テストファイル

- `utils.test.ts`: ユーティリティ関数（getConfig, setConfig等）のテスト
- `responses.test.ts`: 出欠管理関数（submitResponse等）のテスト

## 🚢 デプロイ手順

```bash
# TypeScriptをコンパイル
npm run build

# GASにプッシュ（--force で強制プッシュ）
npm run push

# Webアプリとしてデプロイ（GASエディタで実施）
# 1. https://script.google.com でプロジェクトを開く
# 2. 「デプロイ」→ 既存のデプロイメントを選択 → 「編集」
# 3. 「バージョン」を「新規」に変更
# 4. 「デプロイ」をクリック
```

### 便利なコマンド

```bash
# ビルド
npm run build

# index.htmlをビルド（環境変数からURLを注入）
# 出力先: public/index.html
npm run build:html

# ビルド + プッシュ（--force で強制プッシュ、変更検出の問題を回避）
npm run push

# ビルド + プッシュ + デプロイ
npm run deploy

# テスト実行
npm test
```

**注意**: `npm run push` は `--force` フラグを使用して強制プッシュします。これにより、clasp の変更検出の問題を回避し、確実にコードが更新されます。

### ホスティング用HTMLのビルド

`public/`ディレクトリには、GASアプリをiframeで埋め込むためのHTMLファイルが含まれています。

#### ビルドプロセス

1. **テンプレートファイル**: `public/index.html.template`
   - プレースホルダー `{{GAS_APP_URL}}` を含むテンプレート
   - Gitにコミットされます

2. **環境変数**: `.env`（ルートディレクトリ）
   - `GAS_APP_URL` にGASアプリのURLを設定
   - `.gitignore`で除外されるため、機密情報を保護

3. **ビルドコマンド**: `npm run build:html`
   - `.env`からURLを読み込み
   - テンプレートのプレースホルダーを置換
   - `public/index.html`を生成

4. **生成されたファイル**: `public/index.html`
   - ビルド成果物（`.gitignore`で除外）
   - ホスティングサーバーにデプロイするファイル

#### 画像ファイルの管理

`public/image/`ディレクトリには、アイコンやファビコンなどの画像ファイルが含まれています。現在のサイズ（約1.7MB）は通常のGitで管理可能です。将来的に画像が増える場合は、Git LFSの導入を検討してください。

### 初回セットアップ後の作業

1. **Spreadsheet初期化**
   ```javascript
   // GASエディタで実行
   initializeSpreadsheet();
   ```

2. **管理者トークンの取得**
   ```javascript
   // GASエディタで実行
   testConfig();
   // ログから ADMIN_TOKEN をコピー
   ```

3. **カレンダーIDの設定**
   - 専用カレンダーを作成（推奨）
   - ConfigシートのCALENDAR_IDに設定

4. **表示期間の設定**
   - ConfigシートのDISPLAY_START_DATE、DISPLAY_END_DATEに設定
   - 例: `2025-04-01` ～ `2026-03-31`（年度単位）

5. **定期同期の設定（オプション）**
   - [定期同期設定ガイド](docs/CRON_SYNC_SETUP_GUIDE.md)を参照
   - 推奨: 15分おきの同期

## 📝 主要機能

詳細な機能仕様については[仕様書](docs/SPECIFICATION.md)を参照してください。

- **イベント管理**: 作成・編集・削除（管理者のみ）
- **出欠登録**: ○/△/× + コメント（全ユーザー）
- **出欠集計**: リアルタイム表示、パート別内訳
- **カレンダー連携**: Googleカレンダーとの双方向同期
- **表示期間管理**: 年度単位でのイベント表示制御

## 📚 ドキュメント

詳細なドキュメントは `docs/` ディレクトリにあります。

- **[仕様書](docs/SPECIFICATION.md)** - 機能仕様、技術仕様、データモデル、セキュリティの詳細
- **[運用マニュアル](docs/OPERATION_MANUAL.md)** - 日常的な運用方法
- **[セットアップ手順](docs/SETUP_GUIDE.md)** - 初回セットアップガイド（完全版）
- **[定期同期設定ガイド](docs/CRON_SYNC_SETUP_GUIDE.md)** - cron設定手順
- **[カレンダー公開設定ガイド](docs/CALENDAR_PUBLIC_SETUP.md)** - カレンダー公開設定手順

## 🔒 セキュリティと機密情報の管理

### 環境変数ファイル（.env）

- **場所**: ルートディレクトリ（`.env`）
- **内容**: GASアプリのURLなど、機密情報を含む設定
- **Git管理**: `.gitignore`で除外されているため、リポジトリにコミットされません
- **設定方法**: リポジトリをクローン後、`.env`ファイルを手動で作成してください

### ビルド成果物

- **`public/index.html`**: ビルド時に生成されるファイル
  - `.gitignore`で除外されているため、リポジトリにコミットされません
  - ホスティングサーバーにデプロイする際は、このファイルを使用します

### テンプレートファイル

- **`public/index.html.template`**: プレースホルダーを含むテンプレート
  - 機密情報を含まないため、Gitにコミットされます
  - URLを変更する場合は、`.env`を編集してから`npm run build:html`を実行してください

