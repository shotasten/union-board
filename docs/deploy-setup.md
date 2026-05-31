# デプロイセットアップ

## ワークフロー構成

| ファイル | トリガー | 内容 |
|---|---|---|
| `deploy-dev.yml` | `main` マージ / 手動実行 | Supabase (dev) にマイグレーション・Edge Functions をデプロイ |
| `deploy-prd.yml` | `main` マージ | Supabase (prd) にマイグレーション・Edge Functions をデプロイ → Cloudflare Pages (prd) にフロントエンドをデプロイ |

`github.actor == 'shotasten'` 以外のアクターによるプッシュはすべてスキップされます。

---

## GitHub Environments

リポジトリの **Settings > Environments** に `dev` と `prd` の2環境を作成済み。

### Secrets（機密値）

各 Environment の **Settings > Environments > [env名] > Secrets** で登録。

| Secret 名 | 内容 |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | [supabase.com > Account > Access Tokens](https://supabase.com/dashboard/account/tokens) で生成した個人トークン |
| `SUPABASE_DB_PASSWORD` | Supabase Dashboard > Project Settings > Database > Database password |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | GCP サービスアカウントの JSON キー全体 |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Dashboard > My Profile > API Tokens で生成（prd のみ） |

### Variables（非機密の設定値）

各 Environment の **Settings > Environments > [env名] > Variables** で登録。

| Variable 名 | 内容 | prd の値 |
|---|---|---|
| `SUPABASE_PROJECT_REF` | Supabase プロジェクトの ref（20文字の英数字） | `vsdwwspusgljyrsvhghz` |
| `GOOGLE_CALENDAR_ID` | 同期先 Google カレンダー ID | `791d1152...@group.calendar.google.com` |
| `VITE_SUPABASE_URL` | Supabase プロジェクト URL | `https://vsdwwspusgljyrsvhghz.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase Publishable key（anon key） | Dashboard > Project Settings > API |
| `VITE_SPACE_ID` | spaces テーブルの UUID | `bb59c8f2-f1e8-427b-9258-73c344dd718c` |
| `VITE_FUNCTIONS_URL` | Edge Functions のベース URL | `https://vsdwwspusgljyrsvhghz.supabase.co/functions/v1` |
| `VITE_CAL_IFRAME_SRC` | カレンダー埋め込み iframe の src URL | Google カレンダー「カレンダーを埋め込む」から取得 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare アカウント ID（prd のみ） | `0c9ba43b348230d5890a6ec495188848` |

---

## prd 環境の構成

### Supabase

| 項目 | 値 |
|---|---|
| プロジェクト URL | `https://vsdwwspusgljyrsvhghz.supabase.co` |
| Project Ref | `vsdwwspusgljyrsvhghz` |
| Space ID | `bb59c8f2-f1e8-427b-9258-73c344dd718c` |
| Google OAuth Callback URL | `https://vsdwwspusgljyrsvhghz.supabase.co/auth/v1/callback` |

### Google OAuth（GCP）

| 項目 | 値 |
|---|---|
| GCP プロジェクト | `union-board-prd` |
| OAuth クライアント ID | `171953996524-tum47ov4fu5d9ei135mo90jk1cgitnqo.apps.googleusercontent.com` |
| 承認済みリダイレクト URI | `https://vsdwwspusgljyrsvhghz.supabase.co/auth/v1/callback` |

### Cloudflare Pages

| 項目 | 値 |
|---|---|
| アカウント ID | `0c9ba43b348230d5890a6ec495188848` |
| Pages プロジェクト名 | `union-board-prd` |
| デプロイ方法 | Wrangler CLI（Git 連携は dev アカウントが使用中のため使用不可） |

> **Wrangler を使う理由**: Cloudflare Pages の GitHub リポジトリ連携は1リポジトリにつき1アカウントしか紐付けられない。dev 環境のアカウントがすでにリポジトリと連携済みのため、prd は Wrangler CLI でデプロイする。

---

## dev への手動デプロイ手順

1. GitHub リポジトリの **Actions > Deploy (dev)** を開く
2. **Run workflow** をクリックして実行

## Data API 権限

`supabase/migrations/004_explicit_data_api_grants.sql` で、フロントエンドと Edge Function が Data API（PostgREST / `supabase-js`）経由で使うテーブル・RPC だけに明示的な `GRANT` を付与する。新しいテーブルや RPC を追加した場合は、同じ migration flow で必要最小限の `GRANT` も追加する。

## prd への初回マイグレーション手順

`supabase db push` は Supabase CLI が適用済みマイグレーションを追跡するが、SQL Editor で手動適用したマイグレーションは追跡外になる。その場合は以下を Supabase SQL Editor で実行して既適用済みとしてマークする。

```sql
-- 手動適用済みのマイグレーション番号を登録する（例: 001 を手動適用した場合）
INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('001');
```
