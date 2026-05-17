# UnionBoard セットアップ手順

## 前提

- Supabaseプロジェクト作成済み
- Cloudflare Pagesプロジェクト作成済み
- Googleアカウント

---

## 1. Supabase DB セットアップ

Supabase Dashboard の SQL Editor で以下のマイグレーションを順番に実行する。

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_rls_policies.sql`
3. `supabase/migrations/003_rpc_functions.sql`

次に初期データを投入する。

```sql
-- スペース作成
INSERT INTO spaces (id, name) VALUES ('<UUID>', 'UnionBoard');

-- 設定登録（ADMIN_TOKEN は任意の文字列）
INSERT INTO config (space_id, key, value) VALUES
  ('<UUID>', 'ADMIN_TOKEN', 'your-admin-token'),
  ('<UUID>', 'CALENDAR_ID', 'your-calendar-id@group.calendar.google.com');
```

---

## 2. Cloudflare Pages 環境変数

Cloudflare Dashboard → Workers & Pages → プロジェクト → Settings → Variables and Secrets

| 変数名 | 種別 | 値 |
|---|---|---|
| `VITE_SUPABASE_URL` | Variable | SupabaseプロジェクトURL |
| `VITE_SUPABASE_ANON_KEY` | Variable | Supabase anon key |
| `VITE_SPACE_ID` | Variable | スペースのUUID |
| `VITE_FUNCTIONS_URL` | Variable | `https://<project>.supabase.co/functions/v1` |

---

## 3. Google Calendar 同期セットアップ

### 3-1. GCPでサービスアカウントを作成

1. https://console.cloud.google.com/ にアクセス
2. 左メニュー →「APIとサービス」→「ライブラリ」→「Google Calendar API」を有効化
3. 左メニュー →「IAMと管理」→「サービスアカウント」
4. 「+ サービスアカウントを作成」→ 名前を入力（例: `union-board-sync`）→「作成して続行」
5. ロールはスキップ →「完了」
6. 作成したサービスアカウントをクリック →「キー」タブ →「鍵を追加」→「新しい鍵を作成」→「JSON」→「作成」
7. JSONファイルがダウンロードされる

### 3-2. GoogleカレンダーにSAを招待

1. ダウンロードしたJSONの `"client_email"` の値をコピー
2. https://calendar.google.com/ → 対象カレンダーの「設定と共有」
3. 「特定のユーザーやグループと共有する」→「ユーザーを追加」
4. コピーしたメールアドレスを入力、権限「予定の変更」で追加

### 3-3. Supabase Edge Function にシークレットを設定

Supabase Dashboard → Edge Functions → Manage secrets

| Name | 種別 | Value |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Secret | JSONファイルの中身をそのまま貼り付け |
| `GOOGLE_CALENDAR_ID` | Secret | カレンダーID（`xxxx@group.calendar.google.com`） |

### 3-4. Edge Function をデプロイ

```bash
# Supabase CLIをインストール（未インストールの場合）
npm install -g supabase

# ログイン
supabase login

# デプロイ
supabase functions deploy calendar-sync --project-ref <project-ref>
```

`project-ref` は Supabase Dashboard の URL または Settings から確認できる。

---

## 4. Cloudflare Pages 自動デプロイ

- Production branch: `main`
- Build command: `npm run build`
- Build output: `dist`

`main` に push すれば自動でデプロイされる。GitHub 連携が切れたら Settings → Build → Manage から再接続する。
