-- Phone at registration (Jacob, July 8 2026). Run once in Supabase.
--
-- Every account (person + venue) registers with a phone number. One number per
-- account: the unique index means the same phone can't create a second account,
-- which deters multi-account abuse and fake venues — Jacob's core ask. The SMS
-- one-time-code verification layer turns on once an SMS provider (Twilio) is
-- configured; it reuses the existing login OTP infrastructure.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;

-- One account per phone number (nulls allowed for any legacy rows).
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_uidx
  ON profiles (phone) WHERE phone IS NOT NULL;
