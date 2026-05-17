# UnionBoard 仕様書

## 概要

吹奏楽団などのサークル向けの出欠管理 Web アプリ。

ユーザー登録なし。メンバーはリストから自分の名前を選び、各イベントに参加 / 遅早 / 欠席 / 未定を回答する。回答のたびに Google Calendar の説明欄が自動更新される。管理者はイベントの作成・編集・削除と表示期間の設定ができる。

---

## 技術スタック

| レイヤー | 採用技術 |
|---|---|
| フロントエンド | React + TypeScript + Vite |
| ホスティング | Cloudflare Pages |
| データベース | Supabase (PostgreSQL) |
| 認証 | Supabase anon key（匿名）+ 管理者トークン（RPC 検証） |
| カレンダー連携 | Supabase Edge Function + Google Calendar API |

---

## アーキテクチャ

```
ブラウザ (React SPA / src/main.tsx)
  │
  ├─ src/App.tsx              ルートコンポーネント
  ├─ src/hooks/useAppState.ts 全状態管理（楽観的更新）
  ├─ src/components/          UI コンポーネント群
  │    ├─ AttendanceGrid.tsx  出欠グリッド
  │    ├─ Header.tsx
  │    └─ modals/             各種モーダル（15 種）
  └─ src/lib/api.ts           Supabase 呼び出し層
       │  anon key で直接 Supabase に読み書き
       ├─ supabase.from('events' | 'responses' | 'members')
       │
       │  管理者操作は RPC で管理者トークンを検証
       ├─ supabase.rpc('admin_create_event' | 'admin_update_event' | ...)
       │
       │  カレンダー同期は fire-and-forget
       └─ supabase.functions.invoke('calendar-sync')
            │
            └─ Google Calendar API
```

---

## データモデル

### spaces
テナント単位。現状は 1 スペース運用。

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid PK | |
| name | text | 表示名 |

### events

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid PK | |
| space_id | uuid FK | |
| title | text | イベント名 |
| start_at | timestamptz | 開始日時 |
| end_at | timestamptz | 終了日時 |
| is_all_day | boolean | 終日フラグ |
| location | text | 場所 |
| description | text | 管理者メモ |
| calendar_event_id | text | Google Calendar イベント ID |
| status | text | `active` / `archived` / `deleted` |

### responses

| カラム | 型 | 説明 |
|---|---|---|
| event_id | uuid FK | |
| user_key | text | members.user_key |
| status | text | `attend` / `maybe` / `absent` / `unselected` |
| comment | text | 自由コメント |

event_id + user_key で unique。

### members

| カラム | 型 | 説明 |
|---|---|---|
| user_key | text | フロントで生成した UUID |
| part | text | パート名（Fl / Cl / ... / その他） |
| name | text | 氏名 |
| display_name | text | part + name を結合した表示名 |

### config

| key | 説明 |
|---|---|
| ADMIN_TOKEN | 管理者操作の認証トークン |
| SHOW_ONLY_FUTURE_EVENTS | `true` のとき過去イベントを非表示 |
| DISPLAY_START_DATE | 表示開始日（SHOW_ONLY_FUTURE_EVENTS が false のとき有効） |
| DISPLAY_END_DATE | 表示終了日 |

---

## 認証モデル

一般ユーザーは Supabase anon key で直接 DB に読み書きする。responses の upsert と members の CRUD が可能。RLS で space_id が一致するデータのみ触れる。

管理者トークン（config の `ADMIN_TOKEN`）は localStorage に保存する。イベント CRUD や設定変更は RPC 経由で実行し、DB 側でトークンを検証する。

---

## 出欠ステータス

| DB 値 | 画面表示 | 意味 |
|---|---|---|
| attend | ○ | 参加 |
| maybe | △ | 遅早 |
| absent | × | 欠席 |
| unselected | - | 未定 |

---

## Google Calendar 連携

### 方針
カレンダーは閲覧専用（通知・共有用途）。アプリ側でしか編集しない運用を前提にしているので、競合解決は不要。

同期はすべて fire-and-forget。DB 保存が終わった時点でユーザーにレスポンスを返し、カレンダー反映は非同期で行う。

### 同期フロー

| トリガー | Edge Function アクション | 内容 |
|---|---|---|
| イベント作成 | syncOne | カレンダーにイベントを POST |
| イベント更新 | syncOne | カレンダーイベントを PUT |
| イベント削除 | syncOne | カレンダーイベントを DELETE |
| 出欠回答 | syncAttendance | description のみ PATCH |
| メンバー情報更新 | syncAttendance | 対象イベントの description を PATCH |

### カレンダー description の構成

```
[管理者メモ（events.description）]

【出欠状況】
○ 参加: N人
△ 遅早: N人
× 欠席: N人
- 未定: N人
合計: N人

【パート別内訳】
○ (参加) の内訳
Fl (2人): 山田、田中
Cl (1人): 佐藤

【コメント】
○ 山田: コメント内容

最終更新: yyyy-MM-dd HH:mm
```

### Edge Function 認証
- `syncAttendance` は認証不要（description PATCH のみで破壊的操作がないため）。
- それ以外（syncOne / syncAll）は管理者トークンを検証。

---

## 表示期間フィルター

`SHOW_ONLY_FUTURE_EVENTS = true` のとき、終了日時が現在より前のイベントを非表示にする。

`false` の場合は `DISPLAY_START_DATE` / `DISPLAY_END_DATE` で期間を絞れる。どちらも未設定なら全件表示。

---

## パート一覧と表示順

`Fl / Ob / Cl / Sax / Hr / Tp / Tb / Bass / Perc / その他`

カレンダーのパート別内訳はこの順で出力される。

---

## 環境変数

### Cloudflare Pages（ビルド時）

| 変数名 | 説明 |
|---|---|
| VITE_SUPABASE_URL | Supabase プロジェクト URL |
| VITE_SUPABASE_ANON_KEY | Supabase anon key |
| VITE_SPACE_ID | スペースの UUID |
| VITE_FUNCTIONS_URL | Edge Functions のベース URL |

### Supabase Edge Function（シークレット）

| 変数名 | 説明 |
|---|---|
| GOOGLE_SERVICE_ACCOUNT_JSON | GCP サービスアカウントの JSON キー |
| GOOGLE_CALENDAR_ID | 同期先の Google Calendar ID |
