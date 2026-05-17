# Supabase デプロイセットアップ

`main` ブランチにマージされると、GitHub Actions が自動でマイグレーションと Edge Functions のデプロイを実行します。

## 必要な GitHub Secrets

リポジトリの **Settings > Secrets and variables > Actions** で以下を登録してください。

| Secret 名 | 取得場所 |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | [supabase.com > Account > Access Tokens](https://supabase.com/dashboard/account/tokens) で生成 |
| `SUPABASE_PROJECT_REF` | Supabase ダッシュボード > プロジェクト > Settings > General > Reference ID |
| `SUPABASE_DB_PASSWORD` | Supabase ダッシュボード > プロジェクト > Settings > Database > Database password |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | GCP コンソール > IAM > サービスアカウント > キー で生成した JSON 全体を貼り付け |
| `GOOGLE_CALENDAR_ID` | Google Calendar の設定 > カレンダーの統合 > カレンダー ID |

## デプロイの流れ

1. `main` へのプッシュをトリガーに起動
2. `shotasten` 以外のアクターによるプッシュはスキップ（条件: `github.actor == 'shotasten'`）
3. Supabase CLI でプロジェクトにリンク
4. `supabase db push` でマイグレーションを本番 DB に適用
5. Edge Function のシークレット（Google Calendar 認証情報）を更新
6. `supabase functions deploy` で全 Edge Functions をデプロイ

## 注意事項

- マイグレーションは **冪等** に書いてください（`CREATE TABLE IF NOT EXISTS` など）。一度適用済みのファイルは再実行されませんが、誤って重複実行されても安全な形が望ましいです。
- `GOOGLE_SERVICE_ACCOUNT_JSON` はカレンダーへの書き込み権限を持つサービスアカウントのキーです。不要になったら GCP コンソールで無効化してください。
- Edge Function のシークレットは `supabase secrets set` で上書きされるため、GitHub Secrets を変更すれば次のデプロイで反映されます。
