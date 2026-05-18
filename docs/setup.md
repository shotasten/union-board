# UnionBoard セットアップ手順

## 前提

- Supabase プロジェクト作成済み
- Cloudflare Pages プロジェクト作成済み
- Google アカウント

---

## 1. Supabase DB セットアップ

Supabase Dashboard の SQL Editor で以下のマイグレーションを実行する。

1. `supabase/migrations/001_initial_schema.sql`

次に初期データを投入する。

```sql
-- スペース作成（UUID は任意の値でよい）
INSERT INTO spaces (id, name) VALUES ('<UUID>', 'UnionBoard');
```

---

## 2. 管理者の登録

管理者にしたい Google アカウントで一度アプリにサインインさせ、Supabase Dashboard の Authentication > Users からその UID を確認する。

確認した UID を `space_admins` テーブルに登録する。

```sql
INSERT INTO space_admins (space_id, user_id, role)
VALUES ('<スペースのUUID>', '<管理者のauth.uid>', 'owner');
```

> **注意:** `owner` の登録は現状この SQL 手動実行のみ。2人目以降の管理者はアプリの「管理者管理」画面から招待できる。
>
> **将来 SaaS 化する際の設計方針:** スペース作成画面でログインして作成すると、そのユーザーが自動的に `owner` になるフローを実装する（`create_space_with_owner` RPC でスペース作成と owner 登録をひとつのトランザクションにまとめる想定）。

---

## 3. Cloudflare Pages 環境変数

Cloudflare Dashboard → Workers & Pages → プロジェクト → Settings → Variables and Secrets

| 変数名 | 種別 | 値 |
|---|---|---|
| `VITE_SUPABASE_URL` | Variable | Supabase プロジェクト URL |
| `VITE_SUPABASE_ANON_KEY` | Variable | Supabase anon key |
| `VITE_SPACE_ID` | Variable | スペースの UUID |
| `VITE_FUNCTIONS_URL` | Variable | `https://<project>.supabase.co/functions/v1` |
| `VITE_CAL_IFRAME_SRC` | Variable | `/cal` に埋め込む Google カレンダーの iframe src URL |

`VITE_CAL_IFRAME_SRC` は dev・prd それぞれの環境変数に設定する。Google カレンダーの「カレンダーを埋め込む」から取得できる URL（`https://calendar.google.com/calendar/embed?...`）をそのまま貼り付ける。

---

## 4. Google Calendar 同期セットアップ

### 4-1. GCP でサービスアカウントを作成

1. https://console.cloud.google.com/ にアクセス
2. 左メニュー →「API とサービス」→「ライブラリ」→「Google Calendar API」を有効化
3. 左メニュー →「IAM と管理」→「サービスアカウント」
4. 「+ サービスアカウントを作成」→ 名前を入力（例: `union-board-sync`）→「作成して続行」
5. ロールはスキップ →「完了」
6. 作成したサービスアカウントをクリック →「キー」タブ →「鍵を追加」→「新しい鍵を作成」→「JSON」→「作成」
7. JSON ファイルがダウンロードされる

### 4-2. Google カレンダーに SA を招待

1. ダウンロードした JSON の `"client_email"` の値をコピー
2. https://calendar.google.com/ → 対象カレンダーの「設定と共有」
3. 「特定のユーザーやグループと共有する」→「ユーザーを追加」
4. コピーしたメールアドレスを入力、権限「予定の変更」で追加

### 4-3. Supabase Edge Function にシークレットを設定

Supabase Dashboard → Edge Functions → Manage secrets

| Name | 種別 | Value |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Secret | JSON ファイルの中身をそのまま貼り付け |
| `GOOGLE_CALENDAR_ID` | Variable | カレンダー ID（`xxxx@group.calendar.google.com`） |

### 4-4. Edge Function をデプロイ

GitHub Actions の `Deploy to Supabase` ワークフロー（main へのマージ）で自動デプロイされる。手動でデプロイする場合は以下のコマンドを使う。

```bash
# Supabase CLI をインストール（未インストールの場合）
npm install -g supabase

# ログイン
supabase login

# デプロイ（全 Edge Function）
supabase functions deploy --project-ref <project-ref>
```

`project-ref` は Supabase Dashboard の URL または Settings から確認できる（20 文字の英数字）。

---

## 5. Supabase Auth の設定（Google OAuth）

管理者ログインに Google OAuth を使うため、Supabase Dashboard で設定が必要。

1. Dashboard → Authentication → Providers → Google を有効化
2. GCP コンソールで OAuth 2.0 クライアント ID を作成し、`client_id` と `client_secret` を設定
3. Redirect URL は `https://<project>.supabase.co/auth/v1/callback` を GCP の承認済みリダイレクト URI に追加する

---

## 6. Cloudflare Pages 自動デプロイ

- Production branch: `main`
- Build command: `npm run build`
- Build output: `dist`

`main` に push すれば自動でデプロイされる。GitHub 連携が切れたら Settings → Build → Manage から再接続する。
