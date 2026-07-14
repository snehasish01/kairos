-- KAIROS schema — paste into Supabase SQL editor and run.
-- Run-once. Idempotent-ish: drops are commented out; uncomment to reset during dev.

-- drop table if exists triggers, events, nodes, sessions, participants cascade;

create extension if not exists "pgcrypto";

-- Participants -------------------------------------------------------------
create table participants (
  id            uuid primary key default gen_random_uuid(),
  condition     text not null check (condition in
                  ('anticipatory','reactive','random','silent')),
  age_range     text,
  education     text,
  passed_checks boolean default true,   -- attention checks / bot screening
  created_at    timestamptz default now()
);

-- Sessions -----------------------------------------------------------------
create table sessions (
  id              uuid primary key default gen_random_uuid(),
  participant_id  uuid references participants(id) on delete cascade,
  question        text not null,
  prior_lean      float check (prior_lean between -1 and 1),
  prior_reasons   text,
  current_lean    float,
  status          text default 'active'
                    check (status in ('active','triggered','complete','abandoned')),
  trigger_fired_at timestamptz,
  started_at      timestamptz default now(),
  completed_at    timestamptz
);

-- Conviction graph nodes ---------------------------------------------------
create table nodes (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid references sessions(id) on delete cascade,
  parent_id   uuid references nodes(id) on delete cascade,
  edge_type   text check (edge_type in
                ('observe_world','observe_self',
                 'predict_future','reflect_on_prediction')),  -- null only for root
  valence     text not null default 'neutral'
                check (valence in ('supports','undermines','neutral')),
  content     text not null,
  authored_by text not null default 'system'
                check (authored_by in ('system','user')),
  depth       int not null default 0,
  created_at  timestamptz default now()
);
create index nodes_session_idx on nodes(session_id);

-- Behavioral events (APPEND-ONLY — never update/delete in prod) -------------
create table events (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid references sessions(id) on delete cascade,
  node_id     uuid references nodes(id) on delete set null,
  event_type  text not null check (event_type in
                ('open','expand','dwell_start','dwell_end','endorse',
                 'dismiss','add_own','revisit','lean_shift','commit_intent')),
  payload     jsonb,           -- e.g. {weight: 0.7} for endorse, {lean: 0.3} for lean_shift
  elapsed_ms  int,             -- ms since session start
  created_at  timestamptz default now()
);
create index events_session_idx on events(session_id, created_at);

-- Trigger log --------------------------------------------------------------
create table triggers (
  id                   uuid primary key default gen_random_uuid(),
  session_id           uuid references sessions(id) on delete cascade,
  condition            text not null,
  signal_scores        jsonb,    -- snapshot of B(t), C(t), etc. at fire time
  prompt_generated     text,
  participant_response text,
  elapsed_ms           int,
  created_at           timestamptz default now()
);

-- Outcomes -----------------------------------------------------------------
create table outcomes (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid references sessions(id) on delete cascade,
  final_lean          float check (final_lean between -1 and 1),
  lean_delta          float,           -- final - prior
  breadth_engaged     float,           -- distinct stances touched / surfaced
  self_consistency    float,           -- vs. stated prior
  felt_genuine        int,             -- Likert 1–5: exploration vs scripted
  created_at          timestamptz default now()
);

-- Note on RLS: enable Row Level Security before public deployment. Client uses the
-- anon key for inserts via API routes only; all signal computation + trigger decisions
-- happen server-side with the service role key. Do not let the client write triggers/outcomes.
