-- Profile fields for Goodreads sync
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS goodreads_user_id TEXT,
  ADD COLUMN IF NOT EXISTS goodreads_url TEXT,
  ADD COLUMN IF NOT EXISTS goodreads_last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS goodreads_sync_enabled BOOLEAN NOT NULL DEFAULT true;

-- Books: track Goodreads source ID for de-duplication
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS goodreads_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS books_user_goodreads_uniq
  ON public.books (user_id, goodreads_id)
  WHERE goodreads_id IS NOT NULL;

-- Extensions for scheduled sync
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;