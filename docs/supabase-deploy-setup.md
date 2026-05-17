# Supabase デプロイセットアップ

## デプロイの運用

| トリガー | 対象環境 | 備考 |
|---|---|---|
| `main` マージ | prd | 本番へ自動デプロイ |
| `main` マージ | dev | 開発フェーズ中のみ（TODO 解消後に削除） |
| Actions 手動実行（dispatch） | dev | ブランチを指定して任意タイミングでデプロイ |

`shotasten` 以外のアクターによるプッシュはすべてスキップされます（`github.actor == 'shotasten'`）。

---

## GitHub Environments の作成

リポジトリの **Settings > Environments** で `dev` と `prd` の 2 つを作成してください。

---

## 必要な GitHub Secrets

各 Environment に同じ名前で登録します。

| Secret 名 | 取得場所 |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | [supabase.com > Account > Access Tokens](https://supabase.com/dashboard/account/tokens) で生成 |
| `SUPABASE_PROJECT_REF` | Supabase ダッシュボード > プロジェクト > Settings > General > Reference ID |
| `SUPABASE_DB_PASSWORD` | Supabase ダッシュボード > プロジェクト > Settings > Database > Database password |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | GCP コンソール > IAM > サービスアカウント > キー で生成した JSON 全体を貼り付け |
| `GOOGLE_CALENDAR_ID` | Google Calendar の設定 > カレンダーの統合 > カレンダー ID |

`dev` / `prd` それぞれで別プロジェクトを指すように `SUPABASE_PROJECT_REF` などを使い分けてください。

---

## dev への手動デプロイ手順

1. GitHub リポジトリの **Actions > Deploy to Supabase** を開く
2. **Run workflow** をクリック
3. デプロイしたいブランチ名を入力して実行

---

## 開発フェーズ終了後の TODO

`deploy-dev` ジョブの `if` 条件から `push` トリガーを削除し、dispatch のみで動くようにする。

```yaml
# 変更前（現状）
if: github.actor == 'shotasten'

# 変更後
if: github.actor == 'shotasten' && github.event_name == 'workflow_dispatch'
```
