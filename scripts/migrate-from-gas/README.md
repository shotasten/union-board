# GAS → union-board 移行スクリプト

Google Apps Script 版 UnionBoard から Supabase 版へデータを移行するスクリプトです。

## 前提条件

- Node.js 18 以上（`crypto.randomUUID` が使えること）
- Supabase プロジェクトが作成済みで、スキーマ (`001_initial_schema.sql`) が適用済みであること
- Google Spreadsheet から CSV エクスポートした4ファイルが手元にあること

---

## 手順

### 1. Spreadsheet から CSV エクスポート

Google Spreadsheet を開き、各シートを CSV 形式でダウンロードします。

| シート名 | 保存ファイル名 |
|---|---|
| Events | `events.csv` |
| Members | `members.csv` |
| Responses | `responses.csv` |
| Config | `config.csv` |

ダウンロード方法: `ファイル` → `ダウンロード` → `カンマ区切り形式 (.csv)`

> シートを切り替えながら1シートずつ個別にエクスポートしてください。

---

### 2. CSV ファイルを配置

エクスポートした CSV を任意のディレクトリ（例: `./data`）に配置します。

```
data/
  events.csv
  members.csv
  responses.csv
  config.csv
```

---

### 3. space_id を確認

Supabase Dashboard の SQL エディタで以下を実行して space_id を取得します。

```sql
SELECT id, name FROM spaces;
```

---

### 4. スクリプト実行

```bash
# union-board リポジトリのルートで実行
node scripts/migrate-from-gas/migrate.mjs \
  --space-id <YOUR_SPACE_UUID> \
  --input-dir ./data \
  > migration.sql
```

- `--space-id`  : 上記で確認した space の UUID（必須）
- `--input-dir` : CSV を配置したディレクトリ（省略時: `./data`）
- ログは stderr に出力、SQL は stdout に出力される

---

### 5. SQL を Supabase に適用

生成された `migration.sql` を Supabase Dashboard の SQL エディタに貼り付けて実行します。

または psql を使う場合:

```bash
psql "<CONNECTION_STRING>" -f migration.sql
```

---

## 変換ルール

### ステータス変換

| GAS 値 | Supabase 値 |
|---|---|
| `○` | `attend` |
| `△` | `maybe` |
| `×` | `absent` |
| `-` | `unselected` |

### userKey 変換

- UUID 形式の userKey → そのまま保持
- `anon-表示名` 形式など UUID でない userKey → 新規 UUID を採番（警告を表示）

採番した新 UUID は `anon-` 形式の旧 userKey と紐付けられるため、移行後の過去データとの整合性は保たれます。

### Config 変換

| GAS キー | Supabase キー | 変換内容 |
|---|---|---|
| `SHOW_ONLY_FUTURE_EVENTS` | `SHOW_ALL_EVENTS` | 真偽値を**反転**（`true`→`false`） |
| `DISPLAY_START_DATE` | `DISPLAY_START_DATE` | そのまま |
| `DISPLAY_END_DATE` | `DISPLAY_END_DATE` | そのまま |
| `ADMIN_TOKEN` | — | 移行しない（Supabase Auth に置き換え済み） |
| `CALENDAR_ID` | — | Edge Function シークレットで管理するため移行しない |

---

## 注意事項

- スクリプトはすべて `ON CONFLICT ... DO NOTHING` で挿入するため、**既存データは上書きしません**。再実行しても安全です。
- `anon-` 形式の userKey を持つメンバーの新旧 UUID 対応はログ（stderr）に出力されます。必要であればリダイレクトして保存してください。
  ```bash
  node scripts/migrate-from-gas/migrate.mjs ... 2>migrate.log > migration.sql
  ```
- 移行完了後、GAS 側の定期 cron トリガーを**必ず停止**してください（カレンダーへの二重書き込みが発生します）。
- カレンダーの description は移行後すぐには更新されません。次回の出欠変更時に自動的に上書きされます。

---

## サンプルデータでのテスト

```bash
node scripts/migrate-from-gas/migrate.mjs \
  --space-id 00000000-0000-0000-0000-000000000001 \
  --input-dir scripts/migrate-from-gas/sample-data
```
