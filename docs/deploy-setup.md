# デプロイセットアップ

## ワークフロー構成

| ファイル | トリガー | 内容 |
|---|---|---|
| `deploy-dev.yml` | 手動実行 | Supabase (dev) にマイグレーション・Edge Functions をデプロイ |
| `deploy-prd.yml` | `main` マージ | Supabase (prd) にマイグレーション・Edge Functions をデプロイ → Cloudflare Pages (prd) にフロントエンドをデプロイ |
| `deploy-keepalive-dev.yml` | `main` の keep-alive 変更、手動実行 | Cloudflare keep-alive Worker を `dev` へデプロイ |
| `deploy-keepalive-prd.yml` | `main` の keep-alive 変更、手動実行 | Cloudflare keep-alive Worker を `prd` へデプロイ |

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
| `SUPABASE_KEEPALIVE_TOKEN` | keep-alive RPC の任意トークン。DB の `config` に `KEEPALIVE_TOKEN` を設定した場合だけ照合される |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | GCP サービスアカウントの JSON キー全体 |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Dashboard > My Profile > API Tokens で生成（dev / prd） |

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
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare アカウント ID（各 Environment に対象アカウントの値を登録） | dev / prd で異なる値を設定 |
| `KEEPALIVE_WORKER_URL` | 手動 keep-alive 実行対象 Worker の URL | dev / prd で異なる値を設定 |

---

## Supabase keep-alive

`cloudflare/keepalive` の Cloudflare Worker を Cron Trigger で実行し、`dev` / `prd` の Supabase Data API に1日2回アクセスする。`record_keepalive` RPC で `keepalive_pings` に軽量な write を発生させるため、GitHub Actions の scheduled workflow の自動無効化に依存しない。

目的は Free Plan project の inactivity pause を避けるための外部 activity。Supabase 公式が inactivity 判定条件の詳細を公開しているわけではないため、これは保証付きの回避策ではない。確実に pause させたくない環境は Pro Plan を使う。

Worker は各 GitHub Environment の Variables と Secret を、専用の keep-alive deploy workflow 実行時に Cloudflare Worker Secret へ同期する。

`deploy-keepalive-dev.yml` と `deploy-keepalive-prd.yml` は、`main` に keep-alive 関連ファイルが push された場合に、それぞれの環境へ自動デプロイする。どちらも手動実行できる。両方の Environment に `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を登録すること。

`run-keepalive.yml` は自動実行せず、手動実行時に `dev` / `prd` を選択して Worker の `/keepalive` endpoint を呼び出す。各 Environment に `KEEPALIVE_WORKER_URL` を登録すること。

| Variable 名 | 用途 |
|---|---|
| `VITE_SUPABASE_URL` | Data API のアクセス先 |
| `VITE_SUPABASE_ANON_KEY` | Data API の anon / publishable key |
| `VITE_SPACE_ID` | keep-alive 対象 space |

| Secret 名 | 用途 |
|---|---|
| `SUPABASE_KEEPALIVE_TOKEN` | `config` の `KEEPALIVE_TOKEN` に値がある場合だけ RPC で照合する |

`KEEPALIVE_TOKEN` を有効化する場合は、各 Supabase project の SQL Editor で以下を実行し、同じ値を GitHub Environment Secret `SUPABASE_KEEPALIVE_TOKEN` に設定する。keep-alive の deploy workflow が、この値を Worker Secret に同期する。

```sql
insert into config (space_id, key, value)
values ('<space_id>', 'KEEPALIVE_TOKEN', '<random-token>')
on conflict (space_id, key) do update set value = excluded.value;
```

`KEEPALIVE_TOKEN` が未設定の場合も RPC は成功する。これは merge 直後に未設定 secret で workflow が止まるのを避けるため。`config` の `ADMIN_TOKEN` / `KEEPALIVE_TOKEN` は anon / authenticated の select 対象から除外される。

アプリ画面を単に `curl` してもブラウザ JavaScript が実行されず Supabase への初期データ取得は発生しないため、Data API の RPC を直接叩く。

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
