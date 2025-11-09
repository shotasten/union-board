/**
 * 型定義
 * Phase 1.2: 全データモデルの型定義
 */

/**
 * イベント情報
 * Eventsシートのデータモデル
 */
declare interface AttendanceEvent {
  /** イベントID（UUID） */
  id: string;
  /** タイトル */
  title: string;
  /** 開始日時（ISO 8601形式） */
  start: string;
  /** 終了日時（ISO 8601形式） */
  end: string;
  /** 場所 */
  location: string;
  /** 説明 */
  description?: string;
  /** カレンダーイベントID */
  calendarEventId?: string;
  /** 説明欄ハッシュ */
  notesHash?: string;
  /** ステータス（active, archived, deleted） */
  status: 'active' | 'archived' | 'deleted';
  /** 作成日時（ISO 8601形式） */
  createdAt: string;
  /** 更新日時（ISO 8601形式） */
  updatedAt: string;
  /** 最終同期日時（ISO 8601形式） */
  lastSynced?: string;
}

/**
 * 出欠回答情報
 * Responsesシートのデータモデル
 */
declare interface Response {
  /** イベントID */
  eventId: string;
  /** ユーザー識別子（hash-xxx または anon-xxx） */
  userKey: string;
  /** 表示名 */
  userName: string;
  /** 出欠ステータス（○: 出席, △: 未定, ×: 欠席, -: 未選択） */
  status: '○' | '△' | '×' | '-';
  /** コメント */
  comment?: string;
  /** 初回登録日時（ISO 8601形式） */
  createdAt: string;
  /** 更新日時（ISO 8601形式） */
  updatedAt: string;
}

/**
 * 出欠集計結果
 * 特定イベントの集計データ
 */
declare interface EventTally {
  /** イベントID */
  eventId: string;
  /** 出席（○）の人数 */
  attendCount: number;
  /** 未定（△）の人数 */
  maybeCount: number;
  /** 欠席（×）の人数 */
  absentCount: number;
  /** 回答総数 */
  totalCount: number;
  /** 集計日時（ISO 8601形式） */
  tallyAt: string;
}

/**
 * 設定情報
 * Configシートのkey-value形式データ
 * 注意: Google認証関連の設定は削除済み（Google認証機能が削除されたため）
 */
declare interface Config {
  /** 認証モード（現在はanonymousのみサポート） */
  AUTH_MODE: 'google' | 'anonymous';
  /** 管理者トークン（匿名モード用） */
  ADMIN_TOKEN?: string;
  /** 連携カレンダーID */
  CALENDAR_ID?: string;
  /** カレンダー共有機能ON/OFF */
  CALENDAR_SHARING_ENABLED?: 'true' | 'false';
  /** 同期間隔（時間） */
  SYNC_INTERVAL_HOURS?: string;
  /** Cache保持時間（時間） */
  CACHE_EXPIRE_HOURS: string;
  /** タイムゾーン */
  TIMEZONE: string;
  /** reCAPTCHA Site Key（匿名モード時） */
  RECAPTCHA_SITE_KEY?: string;
}

/**
 * 監査ログ
 * AuditLogシートのデータモデル（オプション）
 */
declare interface AuditLog {
  /** 実行日時（ISO 8601形式） */
  timestamp: string;
  /** 実行ユーザー識別子 */
  userKey: string;
  /** アクション種別（create_event, update_event, delete_event, submit_response等） */
  action: string;
  /** 対象イベントID */
  eventId?: string;
  /** 詳細情報（JSON文字列） */
  details?: string;
}

/**
 * イベント作成・更新用の入力データ
 */
declare interface AttendanceEventInput {
  title: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
}

/**
 * 出欠登録用の入力データ
 */
declare interface ResponseInput {
  eventId: string;
  userKey: string;
  userName: string;
  status: '○' | '△' | '×' | '-';
  comment?: string;
}
