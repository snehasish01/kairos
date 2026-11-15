-- KAIROS: access hardening (applied to the pilot project 2026-11-15 as migration
-- "rls_hardening_public_release"). Run after SCHEMA.sql and SCHEMA_MIGRATION.sql.
--
-- Every database access in the app goes through server-side API routes using the
-- service-role key, which bypasses RLS. RLS is therefore enabled on every table with
-- NO policies: the anon and authenticated roles (whose keys ship to browsers) get nothing.
-- participants, sessions, nodes, events, triggers and outcomes already had RLS enabled.

alter table public.lean_samples    enable row level security;
alter table public.prompt_events   enable row level security;
alter table public.final_rationale enable row level security;
alter table public.session_outcome enable row level security;
alter table public.mailing_list    enable row level security;
alter table public.topics          enable row level security;

revoke truncate on all tables in schema public from anon, authenticated;
