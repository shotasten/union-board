# 調査報告: スマホでのピンチインによるクラッシュ問題

## 概要
スマホ（モバイル端末）でピンチイン（拡大操作）を行った際にWebアプリがクラッシュする現象について調査を行いました。
結論として、**フロントエンドのJSによる画面サイズ調整処理と、ブラウザのネイティブズーム機能が競合し、無限ループ（または高負荷な再描画）が発生している**ことが原因と考えられます。

## 原因の詳細

### 1. JSによる動的なスケーリング処理
`src/client/index.html` の末尾にある以下のスクリプトが、ウィンドウのリサイズイベント（`resize`）を検知して動作しています。

```javascript
window.addEventListener('resize', debouncedAdjustLayoutScale);

function adjustLayoutScale() {
  // ...
  const viewportWidth = window.innerWidth;
  if (viewportWidth < BASE_WIDTH) { // BASE_WIDTH = 1200
    const scale = viewportWidth / BASE_WIDTH;
    root.style.transform = `scale(${scale})`;
    // ...
    wrapper.style.height = `${root.offsetHeight * scale}px`;
  }
  // ...
}
```

この処理は、画面幅が1200px未満の場合に、コンテンツ全体（`#app-root`）をCSSの `transform: scale()` を使って縮小し、画面に収めようとします。

### 2. ピンチイン操作との競合
スマホでピンチイン（拡大）操作を行うと、ブラウザの「ビジュアルビューポート」が変化します。
多くのモバイルブラウザでは、ズーム操作によって `window.innerWidth`（CSSピクセル単位の幅）が変化します（拡大すると `window.innerWidth` は小さくなります）。

1. ユーザーが拡大操作をする
2. `window.innerWidth` が小さくなる
3. `resize` イベントが発生する
4. JSが検知し、`scale` 値を再計算して**さらにコンテンツを縮小**しようとする
5. コンテンツの高さ（`wrapper.style.height`）が変更される
6. 高さの変更によりスクロールバーの有無が切り替わるなどして、再度レイアウト変更・リサイズイベントが発生する可能性がある
7. **無限ループまたは激しいレイアウトスラッシング（再計算の繰り返し）が発生し、ブラウザがクラッシュする**

また、ユーザーが「拡大したい」のに、JSが「画面に収めるために縮小する」という逆の動きをするため、UX的にも問題があります。

### 3. Wrapperの影響
`public/index.html.template`（Wrapper）の設定は以下のようになっています。

```html
<meta name="viewport" content="width=device-width, initial-scale=1">
```

これにより、iframeの幅はデバイスの幅（例: 375px）になります。
GASアプリ側は `window.innerWidth` を375pxと認識するため、前述のJSスケーリングが常に動作する状態になっています。

## 対応方針（修正案）

この問題を解決するための推奨される対応方針は以下の通りです。

### 方針A: Wrapper側でビューポートを固定する（推奨）

Wrapper（`public/index.html.template`）のビューポート設定を変更し、ブラウザのネイティブなスケーリング機能に任せます。

**変更前:**
```html
<meta name="viewport" content="width=device-width, initial-scale=1">
```

**変更後:**
```html
<meta name="viewport" content="width=1200">
```
※ または `width=1200, initial-scale=1` など、挙動を確認しつつ調整。

**効果:**
- ブラウザはページを幅1200pxとしてレンダリングし、スマホ画面に合わせて自動的に縮小表示します。
- GASアプリ側は `window.innerWidth` が1200pxであると認識します。
- JSの `if (viewportWidth < BASE_WIDTH)` が `false` となり、スケーリング処理が実行されなくなります。
- ユーザーはブラウザの機能でスムーズに拡大・縮小ができます。
- クラッシュの原因となるリサイズイベントのループが解消されます。

### 方針B: GASアプリ側のJS修正

もしWrapperを変更できない、あるいはGAS直接アクセスの際も修正したい場合は、`src/client/index.html` を修正します。

1. **リサイズイベントの監視を削除する**
   モバイル端末でのリサイズ（ズーム含む）に反応しないようにします。初期表示時（`DOMContentLoaded`）のみ調整を行うように変更します。

2. **または、JSスケーリング自体を削除する**
   JSによる無理な縮小をやめ、CSSメディアクエリによるレスポンシブ対応を行うか、あるいは `min-width` 設定による横スクロールを許容します。

## まとめ

最も低コストかつ安全な対応は **「方針A: Wrapperのビューポート設定を `width=1200` に変更する」** です。これにより、既存のデスクトップ向けレイアウトを維持したまま、スマホでの安定した表示とズーム操作が可能になります。
