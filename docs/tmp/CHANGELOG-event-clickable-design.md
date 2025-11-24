# イベント名クリック可能デザイン実装記録

## 実装日
2025-11-13

## 概要
イベント予定の詳細を表示するための導線を改善しました。案6（複合型: 青色+矢印+影）のデザインを採用し、PCとスマホの両方で最適な表示を実現しています。

## 実装したデザイン: 案6（複合型）

### デザインの特徴
- **青色のテキスト**: イベント名、場所、日時が全て青色（#1976d2）で表示され、クリック可能であることを視覚的に示します
- **右矢印アイコン**: 常時表示される右矢印（›）が「詳細を見られる」ことを明確に示します
- **影エフェクト**: 軽い影（box-shadow）でカードのような浮き上がった見た目を実現
- **ホバー/タップ反応**: PC（ホバー時）とスマホ（タップ時）で適切なフィードバックを提供

### 実装の詳細

#### CSSスタイル
```css
/* 案6: イベント名のクリック可能デザイン（青色+矢印+影） */
.event-name-clickable {
  color: #1976d2;
  padding: 8px 28px 8px 8px;
  margin: -8px;
  border-radius: 8px;
  position: relative;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  display: block;
  transition: all 0.2s ease;
  cursor: pointer;
}

.event-name-clickable::after {
  content: "›";
  position: absolute;
  right: 8px;
  opacity: 0.7;
  font-size: 1.4rem;
  font-weight: bold;
  color: #1976d2;
  top: 50%;
  transform: translateY(-50%);
  transition: opacity 0.2s ease;
  line-height: 1;
}
```

#### PCでのホバー効果
```css
@media (hover: hover) and (pointer: fine) {
  .event-name-clickable:hover {
    background: rgba(25, 118, 210, 0.08);
    box-shadow: 0 2px 6px rgba(0,0,0,0.1);
  }

  .event-name-clickable:hover::after {
    opacity: 1;
  }
}
```

#### スマホでのタップ効果
```css
.event-name-clickable:active {
  background: rgba(25, 118, 210, 0.1);
  box-shadow: 0 2px 6px rgba(0,0,0,0.1);
  transform: scale(0.98);
}

.event-name-clickable:active::after {
  opacity: 1;
}
```

#### レスポンシブ対応
- **768px以下（タブレット・スマホ）**: パディングと矢印サイズを調整
- **480px以下（小画面スマホ）**: さらに小さいパディングと矢印サイズ

### ユーザー体験の改善点

#### 改善前
- イベント名が黒色で表示され、クリック可能であることが視覚的に分からない
- タップしても反応がなく、操作できるか不明確

#### 改善後
- **明確な視覚的手がかり**: 青色のテキスト + 矢印アイコンで「クリックできる」ことが一目瞭然
- **豊富なフィードバック**: ホバー時やタップ時に背景色、影、矢印の透明度が変化
- **統一感のあるデザイン**: イベント名、場所、日時が一体となったクリック可能な領域として表示

### 技術的な工夫

1. **メディアクエリによる最適化**
   - `@media (hover: hover) and (pointer: fine)` でPCのみホバー効果を適用
   - `:active` 疑似クラスでスマホのタップ反応を実現

2. **レイアウトの調整**
   - `position: relative` と `::after` 疑似要素で矢印アイコンを配置
   - `padding-right` を確保して矢印とテキストが重ならないように配慮

3. **アクセシビリティ**
   - `cursor: pointer` でマウスカーソルを変更
   - 十分なパディングでタップしやすいサイズを確保

## ファイル変更箇所

### `/src/client/index.html`

1. **CSSスタイルの追加**（540-588行目）
   - `.event-name-clickable` クラスのスタイル定義
   - ホバー効果とタップ効果の実装
   - レスポンシブ対応のメディアクエリ

2. **JavaScriptの変更**（2760-2856行目）
   - `eventInfo` 要素に `event-name-clickable` クラスを追加
   - イベント名、場所、日時の色を青色（#1976d2）に変更
   - クリックイベントを `eventInfo` に直接バインド

## 参考資料

- デザインサンプル: `/docs/design-samples/event-hover-mobile.html`
- 6つのデザイン案を比較検討し、案6を最終的に採用

## 今後の改善案

1. **アニメーション**: 矢印が横にスライドするアニメーションを追加
2. **カラーバリエーション**: テーマカラーに応じて青色を変更可能にする
3. **A/Bテスト**: 他のデザイン案との比較テストを実施

