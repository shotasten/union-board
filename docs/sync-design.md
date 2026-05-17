# カレンダー同期 設計・実装状況

## アーキテクチャ概要

```
[ユーザー] → index.html (google.script.run 互換レイヤー)
                 ↓ (src/main.ts のProxyで変換)
           api.ts (Supabase SDK)
                 ↓
           Supabase DB (events / responses / members)
                 ↓ (Edge Function: fire-and-forget)
           Google Calendar API
```

`index.html` は GAS 時代のコードを流用。`src/main.ts` が `google.script.run.*` を `api.*` に透過的に変換するProxyを実装している。

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

すべて **fire-and-forget**（ユーザーはDB保存完了時点でレスポンスを受け取る）。

---

## syncAttendance の処理

```
1. DB から対象イベントの events.description（adminメモ）を取得
2. DB から responses + members を取得して出欠サマリーを生成
   【出欠状況】
   ○ 参加: N人
   △ 遅早: N人
   × 欠席: N人
   - 未定: N人
   合計: N人

   【コメント】
   ○ 田中: コメント内容
   最終更新: yyyy-MM-dd HH:mm
3. adminメモ + 出欠サマリー を結合
4. Google Calendar API PATCH で description フィールドのみ更新
```

- 複数 eventId をまとめて受け取り、ユニーク eventId ごとに処理
- `calendar_event_id` がない場合はスキップ（イベント作成時の syncOne で設定されるため通常発生しない）

---

## Edge Function アクション一覧

| action | 実装状況 | 内容 |
|---|---|---|
| `syncOne` | ✅ 実装済み | 1件同期（全フィールドPUT/POST/DELETE） |
| `syncAll` | ✅ 実装済み | 全件同期（全フィールドPUT） |
| `syncAttendance` | ❌ 未実装 | description のみ PATCH（出欠回答用） |

---

## TODO リスト

### 優先度: 高

1. **Edge Function に `syncAttendance` アクション追加**
   - 対象 eventId（複数可）を受け取る
   - DB から events.description（adminメモ）+ responses + members を取得
   - 出欠サマリーを生成して description を組み立て
   - Google Calendar API PATCH で description のみ更新

2. **出欠回答後に `syncAttendance` を fire-and-forget で呼ぶ**
   - `userSubmitResponsesBatch` で DB 保存成功後
   - バッチ内のユニーク eventId を収集して Edge Function を非同期呼び出し
   - ユーザーは DB 保存完了時点でレスポンスを受け取る

3. **イベント作成/更新/削除後に `syncOne` を fire-and-forget で呼ぶ**
   - `adminCreateEvent` 成功後 → `syncEvent(result.event.id)` を非同期呼び出し
   - `adminUpdateEvent` 成功後 → `syncEvent(eventId)` を非同期呼び出し
   - `adminDeleteEvent` 成功後 → `syncEvent(eventId)` を非同期呼び出し（削除処理は既存実装で対応）

---

## API 制限・性能メモ

- Google Calendar API: 100万リクエスト/日（個人利用は余裕）
- 出欠回答時: バッチ内ユニーク eventId 数だけ PATCH（通常数件）
- イベント CRUD 時: 1件につき1コール
- GAS の cron（数十分遅延）と比べ、すべてリアルタイム反映
