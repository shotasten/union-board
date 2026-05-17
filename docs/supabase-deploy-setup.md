# Supabase デプロイセットアップ

## 現在の運用（開発フェーズ）

| トリガー | 対象環境 | 備考 |
|---|---|---|
| `main` マージ | dev | 開発中は main マージで dev へ自動デプロイ |
| Actions 手動実行（dispatch） | dev | ブランチを指定して任意タイミングでデプロイ |

`shotasten` 以外のアクターによるプッシュはすべてスキップされます（`github.actor == 'shotasten'`）。

---

## 開発フェーズ終了後の TODO

以下の 2 点を対応して prd 運用に切り替える。

**1. `deploy-dev` ジョブを dispatch 専用に戻す**

```yaml
# 変更前（現状）
if: github.actor == 'shotasten'

# 変更後
if: github.actor == 'shotasten' && github.event_name == 'workflow_dispatch'
```

**2. `deploy-prd` ジョブを追加する**

```yaml
deploy-prd:
  name: Deploy to prd
  runs-on: ubuntu-latest
  if: github.actor == 'shotasten' && github.event_name == 'push'
  environment: prd
  steps:
    # deploy-dev と同じ steps
```

完了後の運用:

| トリガー | 対象環境 |
|---|---|
| `main` マージ | prd |
| Actions 手動実行（dispatch） | dev |

---

## GitHub Environments の作成

リポジトリの **Settings > Environments** で `dev` を作成済み。prd は開発フェーズ終了後に追加する。

---

## 必要な GitHub Secrets / Variables

各 Environment の **Settings > Environments > [env名]** で登録します。

### Secrets（機密値）

| Secret 名 | 取得場所 |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | [supabase.com > Account > Access Tokens](https://supabase.com/dashboard/account/tokens) で生成（個人トークン、env 共通でも可） |
| `SUPABASE_DB_PASSWORD` | Supabase ダッシュボード > プロジェクト > Settings > Database > Database password |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | GCP コンソール > IAM > サービスアカウント > キー で生成した JSON 全体を貼り付け |

### Variables（非機密の設定値）

| Variable 名 | 取得場所 |
|---|---|
| `SUPABASE_PROJECT_REF` | Supabase ダッシュボード > プロジェクト > Settings > General > Reference ID |
| `GOOGLE_CALENDAR_ID` | Google Calendar の設定 > カレンダーの統合 > カレンダー ID |

---

## dev への手動デプロイ手順

1. GitHub リポジトリの **Actions > Deploy to Supabase** を開く
2. **Run workflow** をクリック
3. デプロイしたいブランチ名を入力して実行
