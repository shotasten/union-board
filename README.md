# UnionBoard

吹奏楽団などのサークル向けの出欠管理アプリ。メンバーはアカウント登録なしで名前を選ぶだけで各イベントに出欠を入れられる。回答するたびに Google Calendar の説明欄が自動で更新される。管理者は Google アカウントでログインしてイベントの作成・編集・削除などを行う。

---

## スタック

| | |
|---|---|
| フロントエンド | React + TypeScript + Vite |
| ホスティング | Cloudflare Pages |
| DB / Auth | Supabase (PostgreSQL + Google OAuth) |
| カレンダー連携 | Supabase Edge Function + Google Calendar API |

---

## ドキュメント

- [セットアップ手順](docs/setup.md)
- [仕様書](docs/spec.md)
- [Supabase デプロイセットアップ](docs/supabase-deploy-setup.md)

---

## 開発

```bash
npm install
npm run dev
```

環境変数は `.env.local` に設定する（[セットアップ手順](docs/setup.md) 参照）。

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_SPACE_ID=<space-uuid>
VITE_FUNCTIONS_URL=https://xxxx.supabase.co/functions/v1
VITE_CAL_IFRAME_SRC=https://calendar.google.com/calendar/embed?src=...
```

## Edge Function のデプロイ

GitHub Actions の `Deploy to Supabase` ワークフロー（main へのマージ）で自動デプロイされる。手動でデプロイする場合は以下のコマンドを使う（[Supabase デプロイセットアップ](docs/supabase-deploy-setup.md) 参照）。

```bash
supabase functions deploy --project-ref <project-ref>
```
