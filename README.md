# UnionBoard

吹奏楽団などのサークル向けの出欠管理アプリ。

メンバーはアカウント登録なしで名前を選ぶだけで各イベントに出欠を入れられる。回答するたびに Google Calendar の説明欄が自動で更新される。

---

## スタック

| | |
|---|---|
| フロントエンド | Vanilla TypeScript + Vite |
| ホスティング | Cloudflare Pages |
| DB / Auth | Supabase |
| カレンダー連携 | Supabase Edge Function + Google Calendar API |

---

## ドキュメント

- [セットアップ手順](docs/setup.md)
- [仕様書](docs/spec.md)
- [カレンダー同期設計](docs/sync-design.md)

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
```

## Edge Function のデプロイ

```bash
supabase functions deploy calendar-sync --project-ref <project-ref>
```
