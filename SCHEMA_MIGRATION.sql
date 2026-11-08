-- KAIROS — Phase 2 Schema Migration
-- Paste into Supabase SQL editor and run.
-- ADDITIVE ONLY: no existing tables, columns, or rows are dropped.
-- Safe to re-run: new tables use IF NOT EXISTS; column adds are idempotent via IF NOT EXISTS.

-- ── 1. Contextual lean re-samples ────────────────────────────────────────────
-- One row per endorse/dismiss; ties lean(t) to the specific card that moved it.
-- node_id nullable: also used for commit-level captures with no specific card.

create table if not exists lean_samples (
  id          uuid        primary key default gen_random_uuid(),
  session_id  uuid        not null references sessions(id) on delete cascade,
  node_id     uuid        references nodes(id) on delete set null,
  lean_value  float       not null check (lean_value between -1 and 1),
  created_at  timestamptz default now()
);
create index if not exists lean_samples_session_idx on lean_samples(session_id, created_at);


-- ── 2. Prompt events (the mediator — must not be missing) ────────────────────
-- One row per fired prompt (at most one per session; zero for silent).
-- response_code is coded offline (engaged | deflected | ignored) — store raw text now.
-- UNIQUE on session_id: at most one prompt fires per session.

create table if not exists prompt_events (
  id            uuid        primary key default gen_random_uuid(),
  session_id    uuid        not null references sessions(id) on delete cascade,
  condition     text        not null check (condition in
                              ('anticipatory','reactive','random','silent')),
  trigger_type  text        not null check (trigger_type in
                              ('anticipatory','reactive','random')),
  fired_at      timestamptz default now(),
  prompt_text   text        not null,
  response_text text,
  response_code text        check (response_code in ('engaged','deflected','ignored')),
  created_at    timestamptz default now()
);
create unique index if not exists prompt_events_session_uniq on prompt_events(session_id);


-- ── 3. Final rationale (the IC-scored DV) ────────────────────────────────────
-- Exactly one row per completed session.
-- Store the raw free-text; IC is scored offline, blind to condition.

create table if not exists final_rationale (
  id           uuid        primary key default gen_random_uuid(),
  session_id   uuid        not null references sessions(id) on delete cascade,
  text         text        not null,
  committed_at timestamptz default now()
);
create unique index if not exists final_rationale_session_uniq on final_rationale(session_id);


-- ── 4. Session outcome (computed signals — recorded, never enforced) ──────────
-- equilibrium_reached: did the participant reach reflective equilibrium?
-- hardened_prematurely: did lean harden while dismissing undermining cards?
-- bailed: did they abandon before submitting final rationale?
-- Exactly one row per completed (or bailed) session.

create table if not exists session_outcome (
  id                   uuid        primary key default gen_random_uuid(),
  session_id           uuid        not null references sessions(id) on delete cascade,
  equilibrium_reached  boolean,
  hardened_prematurely boolean,
  bailed               boolean     default false,
  initial_lean         float       check (initial_lean between -1 and 1),
  final_lean           float       check (final_lean between -1 and 1),
  created_at           timestamptz default now()
);
create unique index if not exists session_outcome_session_uniq on session_outcome(session_id);


-- ── 5. Mailing list (ISOLATED — zero foreign keys, by design) ────────────────
-- NEVER add a session_id, participant_id, or any FK to this table.
-- Merging with session data breaks the consent anonymity promise and changes
-- the IRB category. This constraint is non-negotiable.

create table if not exists mailing_list (
  id         uuid        primary key default gen_random_uuid(),
  email      text        not null,
  created_at timestamptz default now()
);
create index if not exists mailing_list_created_idx on mailing_list(created_at);


-- ── 6. Additive columns on events ────────────────────────────────────────────
-- hidden_valence / hidden_edge_type: populated for endorse/dismiss events only.
-- NULL on all other event types (dwell, open, lean_shift, etc.).
-- These stay backend-only — never sent to the client.

alter table events
  add column if not exists hidden_valence   text
    check (hidden_valence in ('supports','undermines','neutral')),
  add column if not exists hidden_edge_type text
    check (hidden_edge_type in
      ('observe_world','observe_self','predict_future','reflect_on_prediction'));


-- ── 7. Update events.event_type constraint to include endorse_weighted ────────
-- Must drop + recreate (PostgreSQL check constraints have no ADD VALUE syntax).
-- The DO block finds the constraint by column reference so the name need not be
-- hard-coded; existing rows are preserved.

do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from   pg_constraint
  where  conrelid = 'events'::regclass
    and  contype  = 'c'
    and  pg_get_constraintdef(oid) like '%event_type%';

  if v_conname is not null then
    execute 'alter table events drop constraint ' || quote_ident(v_conname);
  end if;
end;
$$;

alter table events
  add constraint events_event_type_check
  check (event_type in (
    'open', 'expand', 'dwell_start', 'dwell_end',
    'endorse', 'endorse_weighted', 'dismiss',
    'add_own', 'revisit', 'lean_shift', 'commit_intent'
  ));


-- ── 8. Topics table (pilot: fixed conviction set) ─────────────────────────────
-- random and silent dropped for pilot — restore for full study.
-- topic_id on sessions is nullable so existing rows are unaffected.

create table if not exists topics (
  id          uuid        primary key default gen_random_uuid(),
  title       text        not null,
  description text,
  created_at  timestamptz default now()
);

alter table sessions
  add column if not exists topic_id uuid references topics(id);

-- Seed pilot topics (idempotent: skip if title already exists)
insert into topics (title, description)
select * from (values
  ('Financial stability vs. passion when choosing a career',
   'Should people prioritize financial security or personal passion when choosing their career path?'),
  ('Social media does more harm than good',
   'Has social media had a net negative effect on society, relationships, and mental health?'),
  ('Remote work is better for productivity than office work',
   'Do people produce better work outside of traditional office environments?'),
  ('Going to college is worth it for most people',
   'Does higher education provide enough return on investment for the average person?'),
  ('City living is better than suburban living',
   'Are urban environments superior to suburban ones for quality of life?'),
  ('Parents should limit screen time for kids under 12',
   'Should parents actively restrict how much time young children spend on screens?'),
  ('Owning a home is better than renting long-term',
   'Is homeownership a superior financial and lifestyle choice compared to long-term renting?'),
  ('AI will eliminate more jobs than it creates over the next 20 years',
   'Will artificial intelligence result in a net job loss for workers over the next two decades?')
) as t(title, description)
where not exists (select 1 from topics where topics.title = t.title);


-- ── 9. Narrow participants.condition to pilot arms ────────────────────────────
-- random and silent dropped for pilot — restore for full study.
-- Must drop + recreate (PostgreSQL has no ALTER CHECK syntax).

do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from   pg_constraint
  where  conrelid = 'participants'::regclass
    and  contype  = 'c'
    and  pg_get_constraintdef(oid) like '%condition%';

  if v_conname is not null then
    execute 'alter table participants drop constraint ' || quote_ident(v_conname);
  end if;
end;
$$;

alter table participants
  add constraint participants_condition_check
  check (condition in ('anticipatory', 'reactive'));
-- random and silent dropped for pilot — restore for full study


-- ── 10. Word counts on participant free-text ──────────────────────────────────
-- Written by /api/rationale and /api/trigger/[id] (limits in lib/word-limits.ts).
-- Must be applied before deploying the word-limit change, or those writes fail.
alter table final_rationale add column if not exists word_count int;
alter table prompt_events   add column if not exists word_count int;

-- ── Verification queries (run after migration to confirm) ─────────────────────
-- select table_name from information_schema.tables
--   where table_schema = 'public'
--   order by table_name;
--
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_name = 'events'
--   order by ordinal_position;
--
-- select id, title from topics order by created_at;
