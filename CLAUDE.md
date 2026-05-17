# CLAUDE.md

## プロジェクト概要

吹奏楽団などのサークル向け出欠管理 Web アプリ。メンバーはアカウント登録なしで出欠を入力でき、回答のたびに Google Calendar の説明欄が自動更新される。管理者は Google OAuth でログインしてイベントや設定を管理する。

詳細は [docs/spec.md](docs/spec.md) を参照。

---

## ディレクトリ構成

```
union-board/
├── src/
│   ├── main.tsx                    エントリーポイント
│   ├── App.tsx                     ルートコンポーネント（useAppState を呼び出す）
│   ├── hooks/
│   │   ├── useAppState.ts          アプリ全体の状態管理・アクション定義
│   │   └── useAdmin.ts             管理者認証状態（Google OAuth セッション）
│   ├── lib/
│   │   ├── supabase.ts             Supabase クライアント初期化・環境変数
│   │   ├── api.ts                  DB/Edge Function の呼び出し層
│   │   └── utils.ts                汎用ユーティリティ
│   ├── types/
│   │   └── models.ts               フロントエンド型定義・DB 行型
│   └── components/
│       ├── AttendanceGrid.tsx      出欠グリッド（メイン画面）
│       ├── Header.tsx
│       ├── Toast.tsx / FullscreenLoader.tsx / LoadingSpinner.tsx
│       └── modals/                 各種モーダル（イベント作成・メンバー登録など）
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql  テーブル定義・RLS・RPC 関数（すべて1ファイルに統合）
│   ├── functions/
│   │   ├── calendar-sync/          Google Calendar 同期 Edge Function（現役）
│   │   └── api/                    旧管理者 API Edge Function（後述）
│   ├── seed.sql                    初期データ投入用
│   └── config.toml                 Supabase ローカル設定
├── docs/
│   ├── spec.md                     仕様書
│   ├── setup.md                    初期セットアップ手順
│   └── supabase-deploy-setup.md    Supabase デプロイ・CI/CD 設定
├── .github/workflows/
│   └── deploy-supabase.yml         main マージ時に Supabase へ自動デプロイ
└── .env.example                    環境変数のサンプル
```

---

## 最初に見るべきファイル

| 目的 | ファイル |
|---|---|
| アプリの動作を把握する | `src/hooks/useAppState.ts` |
| DB スキーマ・RLS・RPC を確認する | `supabase/migrations/001_initial_schema.sql` |
| Supabase 呼び出し方法を確認する | `src/lib/api.ts` |
| 型定義を確認する | `src/types/models.ts` |
| カレンダー同期の実装を確認する | `supabase/functions/calendar-sync/index.ts` |
| 管理者認証の実装を確認する | `src/hooks/useAdmin.ts` |

---

## 注意事項

### supabase/functions/api/ について
`supabase/functions/api/index.ts` は旧来の ADMIN_TOKEN 方式による管理者 API で、現在のフロントエンドからは使われていない。管理者操作は `src/lib/api.ts` から Supabase RPC（`admin_create_event` など）を直接呼び出す形に移行済み。このファイルを参照して認証方式を判断しないこと。

### Supabase クライアントが2つある理由
`src/lib/supabase.ts` には `supabase`（認証あり）と `supabasePublic`（認証なし・読み取り専用）の2つのクライアントがある。`supabasePublic` は auth 初期化のハングを回避するために分離している。データ取得には `supabasePublic`、認証が必要な操作（RPC・出欠 upsert）には `supabase` を使う。

---

## 開発ルール

### ドキュメント更新
機能の追加・変更・削除を行った場合は、関連するドキュメント（README.md、docs/ 配下）を同じ作業の中で更新すること。

### ブランチ・PR 運用
特段の指示がない限り、作業開始時は最新の main からブランチを切り、作業完了後に PR を作成すること。
