# Googleカレンダー共有機能の調査検討

## 📋 要件

ユーザーが同期先のGoogleカレンダーを自分のGoogleカレンダーに連携できるようにしたい。

---

## 🔍 現在の実装状況

### 使用しているカレンダー

- **カレンダー名**: `Tokyo Music Union イベントカレンダー`
- **作成方法**: `CalendarApp.createCalendar()` で専用カレンダーを作成
- **カレンダーID**: Configシートに保存（`CALENDAR_ID`）
- **所有者**: GASスクリプトの実行ユーザー（通常は管理者）

---

## 💡 実装可能な方法

### 方法1: カレンダー共有リンク（推奨）★★★

**概要**: カレンダーを共有し、「カレンダーに追加」ボタン/リンクを提供

**実装例**:
```html
<a href="https://calendar.google.com/calendar/render?cid=xxx@group.calendar.google.com">
  📅 自分のカレンダーに追加
</a>
```

**メリット**:
- ✅ 実装が非常に簡単（1-2時間）
- ✅ ユーザーはワンクリックで追加可能
- ✅ 自動的に同期される（閲覧のみ）
- ✅ OAuth認証不要
- ✅ メールアドレス不要

**デメリット**:
- ⚠️ カレンダーを公開する必要がある
- ⚠️ リンクを知っていれば誰でも閲覧可能
- ⚠️ ユーザーはイベントを編集できない（閲覧のみ）

**公開レベルの選択肢**:
- 完全公開: 検索で見つかる
- リンク共有: URLを知っている人のみ

---

### 方法2: 特定ユーザーとの自動共有 ★★

**概要**: メンバー登録時に自動的にカレンダーを共有

**実装例**:
```typescript
function shareBandCalendar(userEmail: string): boolean {
  const calendar = CalendarApp.getCalendarById(calendarId);
  calendar.addViewer(userEmail); // 閲覧権限を付与
  return true;
}
```

**メリット**:
- ✅ メンバーのみが閲覧可能（セキュア）
- ✅ 自動的に「他のカレンダー」に表示される
- ✅ 追加の操作不要

**デメリット**:
- ⚠️ ユーザーのメールアドレスが必要
- ⚠️ メンバー登録・削除時の共有設定管理が必要
- ⚠️ 実装やや複雑（3-4時間）

---

### 方法3: iCal購読リンク ★

**概要**: webcal:// プロトコルでカレンダーを購読

**実装例**:
```html
<a href="webcal://calendar.google.com/calendar/ical/xxx@group.calendar.google.com/public/basic.ics">
  📅 カレンダーを購読
</a>
```

**メリット**:
- ✅ Googleカレンダー以外でも利用可能（Outlook、Apple Calendarなど）

**デメリット**:
- ⚠️ 同期が遅い（数時間～1日）
- ⚠️ カレンダーを公開する必要がある

---

### 方法4: イベント個別追加リンク ★

**概要**: 各イベントに「Googleカレンダーに追加」リンクを生成

**実装例**:
```
https://calendar.google.com/calendar/render?action=TEMPLATE&text=イベント名&dates=20250115T130000Z/20250115T170000Z
```

**メリット**:
- ✅ ユーザーが個別にイベントを選択できる
- ✅ ユーザーの個人カレンダーにコピーされる

**デメリット**:
- ⚠️ カレンダー全体の自動同期ではない
- ⚠️ イベントごとに手動で追加が必要
- ⚠️ 元のイベントが更新されても反映されない

---

## 🎯 推奨実装: 方法1（カレンダー共有リンク）

### 理由

1. **実装が最も簡単** - 1-2時間で完成
2. **ユーザビリティが高い** - ワンクリックで追加
3. **メールアドレス不要** - プライバシー保護
4. **自動同期** - イベント更新が即座に反映

### 実装ステップ

#### Step 1: カレンダーを公開設定にする（手動）

1. Googleカレンダー（https://calendar.google.com/）を開く
2. 左側の「他のカレンダー」から対象カレンダーを選択
3. 「設定と共有」をクリック
4. 「アクセス権限」で以下を設定:
   - ✅「一般公開して誰でも利用できるようにする」（完全公開）
   - または✅「リンクを知っている全員が閲覧できる」（セミパブリック）

#### Step 2: カレンダーID取得APIを追加（GAS）

```typescript
// src/main.ts
function getCalendarIdForSharing(): { success: boolean; calendarId?: string; error?: string } {
  try {
    const calendarId = getConfig('CALENDAR_ID', '');
    if (!calendarId) {
      return {
        success: false,
        error: 'カレンダーIDが設定されていません'
      };
    }
    return {
      success: true,
      calendarId: calendarId
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message
    };
  }
}
```

#### Step 3: UIに「カレンダーに追加」ボタンを配置

```html
<!-- ヘッダーに追加 -->
<button class="secondary-btn" onclick="showAddToCalendarModal()">
  📅 カレンダーに追加
</button>

<!-- モーダル -->
<div id="add-to-calendar-modal" class="modal" style="display: none;">
  <div class="modal-content">
    <div class="modal-header">
      <h2>自分のGoogleカレンダーに追加</h2>
      <button class="close-btn" onclick="closeAddToCalendarModal()">&times;</button>
    </div>
    <div class="modal-body">
      <p>このボタンをクリックすると、楽団のイベントカレンダーがあなたのGoogleカレンダーに追加されます。</p>
      <p>イベントは自動的に同期され、常に最新の情報が表示されます。</p>
      <div style="margin-top: 20px;">
        <a id="calendar-add-link" href="#" target="_blank" 
           style="display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 6px;">
          📅 Googleカレンダーに追加
        </a>
      </div>
    </div>
  </div>
</div>

<script>
function showAddToCalendarModal() {
  google.script.run
    .withSuccessHandler((result) => {
      if (result.success && result.calendarId) {
        const addLink = document.getElementById('calendar-add-link');
        addLink.href = `https://calendar.google.com/calendar/render?cid=${result.calendarId}`;
        document.getElementById('add-to-calendar-modal').style.display = 'block';
      } else {
        showToast('カレンダーIDの取得に失敗しました', 'error');
      }
    })
    .getCalendarIdForSharing();
}

function closeAddToCalendarModal() {
  document.getElementById('add-to-calendar-modal').style.display = 'none';
}
</script>
```

---

## 🔐 セキュリティ・プライバシー考慮事項

### 公開レベルの選択

| 公開レベル | 閲覧可能な人 | 適用シーン |
|----------|------------|-----------|
| **完全公開** | 検索で見つかる・誰でも | オープンな団体 |
| **リンク共有** | URLを知っている人のみ | メンバー・関係者限定 |
| **特定ユーザー** | 指定したユーザーのみ | 完全プライベート |

### 推奨設定

**「リンクを知っている全員が閲覧できる」（セミパブリック）**

理由:
- メンバー間でリンクを共有しやすい
- 検索エンジンには表示されない
- 外部に漏れても閲覧のみ（編集不可）

---

## 📊 実装難易度と効果の比較

| 方法 | 実装時間 | ユーザビリティ | セキュリティ | 推奨度 |
|------|---------|--------------|------------|--------|
| 1. カレンダー共有リンク | 1-2時間 | ⭐⭐⭐ 高 | ⭐⭐ 中 | ⭐⭐⭐ 高 |
| 2. 特定ユーザー共有 | 3-4時間 | ⭐⭐⭐ 高 | ⭐⭐⭐ 高 | ⭐⭐ 中 |
| 3. iCal購読リンク | 1-2時間 | ⭐⭐ 中 | ⭐⭐ 中 | ⭐ 低 |
| 4. イベント個別追加 | 2-3時間 | ⭐ 低 | ⭐⭐ 中 | ⭐ 低 |

---

## ⚠️ 注意事項・制約

### Googleカレンダーの仕様

- **公開設定**: GASからは完全な公開設定ができないため、手動設定が必要
- **共有の反映**: 設定変更の反映には数分かかる場合がある
- **閲覧のみ**: ユーザーが追加したカレンダーはイベント編集不可

### GASの制限

- **ACL設定**: GASから設定できる共有レベルには制限がある
- **公開URL**: カレンダーの公開URLはGoogleカレンダーUIで確認

---

## 💬 検討結果まとめ

### ✅ 実装可能です！

**最も簡単で効果的な方法**:
- **方法1: カレンダー共有リンク**

### 推奨実装手順

1. **カレンダーを「リンク共有」に設定**（手動、5分）
2. **カレンダーID取得APIを実装**（GAS、30分）
3. **UIに「カレンダーに追加」ボタンを配置**（HTML/JS、1時間）

### 合計実装時間: 約1.5-2時間

### メリット
- ✅ ワンクリックでカレンダー追加
- ✅ 自動同期（イベント更新が即座に反映）
- ✅ メールアドレス不要
- ✅ OAuth認証不要
- ✅ 実装が簡単

### デメリット
- ⚠️ リンクを知っていれば誰でも閲覧可能
  - 対策: メンバー間でのみリンクを共有

---

## 📝 次のステップ

実装を希望される場合:
1. [ ] カレンダーの公開レベルを決定（完全公開 or リンク共有）
2. [ ] 実装の承認
3. [ ] カレンダーの公開設定（手動）
4. [ ] コード実装

より安全な運用を希望される場合:
- 方法2（特定ユーザー共有）を検討（実装時間: 3-4時間）
