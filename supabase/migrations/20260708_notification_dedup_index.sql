-- Phase 8 Fix: Unique index for mention notification deduplication
-- Prevents duplicate @mention notifications on the same message
-- (server edge function upserts with ignore-on-conflict)

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_mention_dedup
  ON notifications(user_id, message_id)
  WHERE type = 'mention' AND message_id IS NOT NULL;

-- Existing message-notifications (before fix) can be marked read with:
-- UPDATE notifications SET is_read=true WHERE type='message';
-- (optional one-time cleanup — they'll age out naturally on chat opens)
