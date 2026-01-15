/**
 * モーダルの閉じる条件を判定するヘルパー関数
 * @param isClickInsideContent モーダルコンテンツ内をクリックしたかどうか
 * @returns バックドロップクリックとしてモーダルを閉じるべき場合は true
 */
function shouldCloseOnBackdropClick(isClickInsideContent: boolean): boolean {
  return !isClickInsideContent;
}

describe('modalCloseHelper.ts', () => {
  describe('shouldCloseOnBackdropClick', () => {
    it('モーダルコンテンツ外をクリックした場合にtrueを返すこと', () => {
      // Arrange
      const isClickInsideContent = false;

      // Act
      const result = shouldCloseOnBackdropClick(isClickInsideContent);

      // Assert
      expect(result).toBe(true);
    });

    it('モーダルコンテンツ内をクリックした場合にfalseを返すこと', () => {
      // Arrange
      const isClickInsideContent = true;

      // Act
      const result = shouldCloseOnBackdropClick(isClickInsideContent);

      // Assert
      expect(result).toBe(false);
    });

    it('境界値として、クリック位置がコンテンツ外と判定される場合は常にtrueを返すこと', () => {
      // Arrange
      const isClickInsideContent = false;

      // Act
      const result = shouldCloseOnBackdropClick(isClickInsideContent);

      // Assert
      expect(result).toBe(true);
    });
  });
});

