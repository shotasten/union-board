/**
 * モーダルの閉じる条件を判定するヘルパー関数
 *
 * @param isClickInsideContent モーダルコンテンツ内をクリックしたかどうか
 * @returns バックドロップクリックとしてモーダルを閉じるべき場合は true
 */
function shouldCloseOnBackdropClick(isClickInsideContent: boolean): boolean {
  return !isClickInsideContent;
}

