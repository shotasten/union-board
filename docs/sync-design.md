# カレンダー同期 設計・実装状況

## アーキテクチャ概要

```
ブラウザ (React SPA)
  │
  └─ src/lib/api.ts (Supabase SDK)
       │
       ├─ Supabase DB (events / responses / members)
       │
       └─ Supabase Edge Function: calendar-sync (fire-and-forget)
            │
            └─ Google Calendar API
```

---

## 基本方針

- **アプリが唯一の編集インターフェース**。カレンダーは見る専用（通知・共有用途）
- アプリでの操作は即座にカレンダーへ反映（fire-and-forget）
- カレンダーを直接編集しない運用のため、競合・LWW・pullFromCalendar は不要

---

## 同期フロー

| トリガー | Edge Function アクション | 内容 |
|---|---|---|
| イベント作成 | `syncOne`（POST） | 全フィールドをカレンダーに作成 |
| イベント更新 | `syncOne`（PUT） | 全フィールドをカレンダーに上書き |
| イベント削除 | `syncOne`（DELETE） | カレンダーから削除 |
| 出欠回答 | `syncAttendance`（PATCH） | description のみ更新 |
| メンバー情報更新 | `syncAttendance`（PATCH） | 対象イベントの description を更新 |
| メンバー削除 | `syncAttendance`（PATCH） | 対象イベントの description を更新 |

すべて **fire-and-forget**（ユーザーは DB 保存完了時点でレスポンスを受け取る）。

---

## syncAttendance の処理

```
1. DB から対象イベントの events.description（admin メモ）を取得
2. DB から responses + members を取得して出欠サマリーを生成
   【出欠状況】
   ○ 参加: N人
   △ 遅早: N人
   × 欠席: N人
   - 未定: N人
   合計: N人

   【パート別内訳】
   ○ (参加) の内訳
   Fl (1人): 山田

   【コメント】
   ○ 田中: コメント内容
   最終更新: yyyy-MM-dd HH:mm
3. admin メモ + 出欠サマリーを結合
4. Google Calendar API PATCH で description フィールドのみ更新
```

- 複数 eventId をまとめて受け取り、ユニーク eventId ごとに処理
- `calendar_event_id` がない場合はスキップ（イベント作成時の syncOne で設定されるため通常発生しない）

---

## Edge Function アクション一覧

| action | 内容 |
|---|---|
| `syncOne` | 1件同期（イベント CRUD に対応。full PUT / POST / DELETE） |
| `syncAll` | 表示期間内の全件同期（full PUT） |
| `syncAttendance` | description のみ PATCH（出欠回答・メンバー変更用） |

---

## Edge Function 認証

- `syncAttendance` は認証不要（description PATCH のみで破壊的操作がないため）。
- `syncOne` / `syncAll` は呼び出し時に Authorization ヘッダーで Supabase Auth JWT を送り、DB 側の `is_space_admin` 関数で管理者かどうかを検証する。

---

## API 制限・性能メモ

- Google Calendar API: 100万リクエスト/日（個人利用は余裕）
- 出欠回答時: バッチ内ユニーク eventId 数だけ PATCH（通常数件）
- イベント CRUD 時: 1件につき1コール
