-- Per-user mute flag for push delivery. When true, the send-push edge function
-- routes the recipient's native (FCM) push to a SILENT notification channel — the
-- message still shows on the lock screen / shade, but with no sound or vibration
-- (WhatsApp-style mute). Written by the client when Do Not Disturb is toggled.
alter table public.profiles add column if not exists notify_muted boolean default false;
