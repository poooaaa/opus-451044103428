CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule if exists (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('refresh-popular-midnight');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'refresh-popular-midnight',
  '0 17 * * *', -- 17:00 UTC = 00:00 WIB (UTC+7)
  $$
  SELECT net.http_post(
    url := 'https://ruhpshusgevhnyfdzevb.supabase.co/functions/v1/refresh-popular',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);