-- cron_runner_schedule.sql
-- Date     : 2026-07-03
-- Objet    : Schedule pg_cron pour invoquer notification-dispatch-runner chaque minute.
--
-- Prérequis (Dashboard → Database → Extensions) :
--   1. Activer pg_cron   (si pas déjà coché)
--   2. Activer pg_net    (si pas déjà coché)
--
-- Appliquer dans SQL Editor APRÈS activation des extensions.
-- STOP : ce fichier contient un placeholder <DISPATCH_RUNNER_SECRET> à remplacer
--        par le vrai secret AVANT d'appliquer.
--
-- Vérification post-apply :
--   select jobid, jobname, schedule, command, active from cron.job;

-- Supprime le job existant si on réapplique (idempotent).
select cron.unschedule('notify-dispatch-every-minute')
where exists (
  select 1 from cron.job where jobname = 'notify-dispatch-every-minute'
);

-- Crée le job : POST vers le runner chaque minute.
select cron.schedule(
  'notify-dispatch-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://ejjrdvxxdidivfoqmwvf.supabase.co/functions/v1/notification-dispatch-runner',
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'Authorization',     'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqanJkdnh4ZGlkaXZmb3Ftd3ZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDYxMjAsImV4cCI6MjA4OTA4MjEyMH0.KEcxqPLNR3BzD7hN0wO6ta4B3rN3F8oV1yeYGfK6j9g',
      'x-dispatch-secret', '<DISPATCH_RUNNER_SECRET>'
    ),
    body    := '{"limit":50}'::jsonb
  );
  $$
);

-- Vérification immédiate.
select jobid, jobname, schedule, active from cron.job where jobname = 'notify-dispatch-every-minute';
