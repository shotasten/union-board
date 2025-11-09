# UnionBoard

TMU 練習予定・出欠管理アプリ（Google Apps Script製）

## 📋 プロジェクト概要

Google Apps Script (GAS) とHTML Serviceを使用した、TMU（Tokyo Music Union）の練習予定・出欠管理アプリです。

### 主要機能

- ✅ イベント管理（作成・編集・削除）
- ✅ 出欠登録（○/△/× + コメント）
- ✅ 出欠集計表示（リアルタイム）
- ✅ Googleカレンダー連携（双方向同期）
- ✅ 匿名認証モード（管理者トークン認証）
- ✅ セキュリティ対策（XSS対策、レート制限、入力サニタイゼーション）

## 🚀 Phase 0: 環境セットアップ ✅ 完了

### 完了項目

- ✅ Node.js インストール完了（v24.11.0）
- ✅ clasp インストール完了（v3.1.1）
- ✅ Google認証完了
- ✅ GASプロジェクト作成完了
- ✅ TypeScript設定完了
- ✅ プロジェクト構造作成完了
- ✅ 初回デプロイ・動作確認完了

### 成果物

- **GASプロジェクトURL**: `https://script.google.com/d/[SCRIPT_ID]/edit` (実際のIDは`.clasp.json`を参照)
- **WebアプリURL**: デプロイ後に取得したURLを使用

## 🛠️ 技術スタック

- **言語**: TypeScript
- **フロントエンド**: Vanilla JavaScript + CSS
- **バックエンド**: Google Apps Script
- **ストレージ**: Google Spreadsheet
- **デプロイ**: clasp
- **タイムゾーン**: Asia/Tokyo

## 📁 プロジェクト構造

```
/workspace
├── src/
│   ├── server/          # バックエンドロジック (TypeScript)
│   │   ├── main.ts      # エントリーポイント
│   │   ├── events.ts    # イベント管理
│   │   ├── responses.ts # 出欠管理
│   │   ├── calendar.ts  # カレンダー連携
│   │   ├── auth.ts      # 認証処理
│   │   └── utils.ts     # ユーティリティ
│   ├── client/          # フロントエンド
│   │   └── index.html   # メインHTML
│   └── types/
│       └── models.ts    # 型定義
├── dist/                # コンパイル済みファイル
├── docs/                # ドキュメント
├── .clasp.json          # clasp設定
├── tsconfig.json        # TypeScript設定
├── appsscript.json      # GAS設定
├── package.json         # npm設定
└── README.md
```

## 🔧 セットアップ手順

**他のアカウントで1から導入する場合は、[完全なセットアップ手順](docs/セットアップ手順.md)を参照してください。**

### クイックスタート

```bash
# リポジトリをクローン
git clone https://github.com/shotasten/gas-attendance-manager.git
cd gas-attendance-manager

# 依存関係をインストール
npm install

# Google Apps Script APIを有効化
# https://script.google.com/home/usersettings

# clasp認証
clasp login

# 新規プロジェクト作成
clasp create --type standalone --title "UnionBoard" --rootDir ./dist

# ビルドとプッシュ
npm run build && clasp push
```

**詳細な手順**: [セットアップ手順（完全版）](docs/セットアップ手順.md) を参照してください。

## 🚢 デプロイ手順

```bash
# TypeScriptをコンパイル
npm run build

# GASにプッシュ
clasp push

# Webアプリとしてデプロイ（GASエディタで実施）
# 1. https://script.google.com でプロジェクトを開く
# 2. 「デプロイ」→「新しいデプロイ」
# 3. 種類: ウェブアプリ
# 4. アクセス権限: 全員
# 5. デプロイ
```

### 便利なコマンド

```bash
# ビルド
npm run build

# ビルド + プッシュ
npm run push

# ビルド + プッシュ + デプロイ
npm run deploy
```

## 📝 開発方針

詳細は `docs/作業計画書.md` を参照してください。

### 重要原則

1. **テスト駆動開発の徹底**
   - 実装後は必ずテストコードを作成
   - すべてのテストが通るまで次に進まない

2. **問題解決への真摯な姿勢**
   - 動作確認失敗時は原因を徹底調査
   - 仕様を簡略化せず、解決を目指す

3. **品質保証の基準**
   - 動作確認済み
   - エラーハンドリング実装
   - ログ出力完備

## 📅 開発スケジュール

- ✅ **Phase 0**: 環境セットアップ（完了）
- ✅ **Phase 1**: MVP実装（イベント管理、出欠登録、集計表示）（完了）
- ✅ **Phase 2**: カレンダー連携（完了）
- ✅ **Phase 3**: 認証・セキュリティ（完了）
- 🔄 **Phase 4**: テスト・デプロイ（進行中）

## 📚 ドキュメント

- [仕様書](docs/仕様書.md)
- [作業計画書](docs/作業計画書.md)
- [セットアップ手順](docs/セットアップ手順.md)
- [運用マニュアル](docs/運用マニュアル.md)

## 📄 ライセンス

ISC

## 👤 開発者

開発中...

---

**Phase 0 完了日**: 2025-11-08
