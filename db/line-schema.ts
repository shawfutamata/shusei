// 既存の会員IDは変えず、LINEだけを後から取り外せるよう別の表で持つ。
export const lineStatements = [
  `CREATE TABLE IF NOT EXISTS line_accounts (
    member_id TEXT PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
    provider_id TEXT NOT NULL, line_user_id TEXT NOT NULL, display_name TEXT NOT NULL DEFAULT '',
    linked_at TEXT NOT NULL,
    -- 旧実装との互換列。友だち状態は保存せず、常に0のままにする。
    friend INTEGER NOT NULL DEFAULT 0, friend_updated_at INTEGER NOT NULL DEFAULT 0,
    notify_message INTEGER NOT NULL DEFAULT 0, notify_offer INTEGER NOT NULL DEFAULT 0,
    consent_at TEXT NOT NULL DEFAULT '', consent_version TEXT NOT NULL,
    UNIQUE(provider_id, line_user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS line_authorizations (
    member_id TEXT PRIMARY KEY REFERENCES line_accounts(member_id) ON DELETE CASCADE,
    provider_id TEXT NOT NULL, channel_id TEXT NOT NULL, subject TEXT NOT NULL,
    ciphertext TEXT NOT NULL, iv TEXT NOT NULL, key_version TEXT NOT NULL,
    expires_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active', revision TEXT NOT NULL,
    checked_at INTEGER NOT NULL DEFAULT 0, deauthorize_lease_until INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS line_data_origins (
    member_id TEXT PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
    email_from_line INTEGER NOT NULL DEFAULT 0, name_from_line INTEGER NOT NULL DEFAULT 0,
    data_consent_version TEXT NOT NULL, data_consent_at TEXT NOT NULL,
    email_notice_consent INTEGER NOT NULL DEFAULT 0, email_notice_consent_at TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS line_privacy_codes (
    member_id TEXT PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE, purpose TEXT NOT NULL,
    code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, requested_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0
  )`,
  // 本人が入力した登録情報はメール確認とLINE認証が揃うまで会員情報へ移さない。
  `CREATE TABLE IF NOT EXISTS line_signup_drafts (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, invite TEXT NOT NULL DEFAULT '',
    mail_consent INTEGER NOT NULL DEFAULT 0, consent_version TEXT NOT NULL, consent_at TEXT NOT NULL,
    browser_hash TEXT NOT NULL, code_hash TEXT NOT NULL, code_expires_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL, requested_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
    verified_at INTEGER NOT NULL DEFAULT 0, consumed_at INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS line_privacy_grants (
    token_hash TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS line_oauth_flows (
    state_hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, nonce TEXT NOT NULL, verifier TEXT NOT NULL,
    mode TEXT NOT NULL, member_id TEXT NOT NULL DEFAULT '', session_hash TEXT NOT NULL DEFAULT '',
    return_to TEXT NOT NULL, draft_id TEXT NOT NULL DEFAULT '', expires_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS line_sessions (
    token_hash TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS line_webhook_events (
    event_id TEXT PRIMARY KEY, received_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS line_notification_outbox (
    event_key TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    provider_id TEXT NOT NULL, line_user_id TEXT NOT NULL, consent_version TEXT NOT NULL,
    kind TEXT NOT NULL, message_text TEXT NOT NULL, retry_key TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0, available_at INTEGER NOT NULL, lease_until INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL, accepted_at INTEGER NOT NULL DEFAULT 0, last_error TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS line_outbox_pending ON line_notification_outbox(status, available_at)`,
];
