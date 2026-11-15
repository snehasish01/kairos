# KAIROS

> **The pilot is closed. The public demo does not collect data.**
> Data collection for the KAIROS pilot ended in November 2026 and the dataset is frozen.
> Anyone can try the full participant flow in **demo mode**. Demo sessions are never written to
> the research database, and they do not take part in condition assignment. The research
> routes are closed by default (`STUDY_OPEN` unset) and refuse every request.

KAIROS is a research instrument, not a consumer product. It runs a between-subjects experiment
on **when** a self-referential reflective ("dissonance") prompt should be delivered while
someone reasons through one of their own convictions.

- 📄 **Paper:** [`docs/paper/KAIROS_paper.pdf`](docs/paper/KAIROS_paper.pdf) ([LaTeX source](docs/paper/KAIROS_paper.tex))
- 🧪 **Study summary:** [`docs/STUDY.md`](docs/STUDY.md)
- 🗂 **Preregistration, data and analysis script:** OSF, <https://osf.io/nmuk7/>
  (DOI [10.17605/OSF.IO/NMUK7](https://doi.org/10.17605/OSF.IO/NMUK7))
- 🏷 **Instrument as run in the pilot:** git tag `v1.0-pilot`

## The hypothesis

> Final reasoning quality, measured as the integrative complexity (IC) of the written rationale
> and scored offline and blind to condition, is **higher when the self-referential dissonance
> prompt fires in the anticipatory window** than when the same prompt fires reactively.

- **IV:** prompt timing. The pilot used `anticipatory` vs `reactive`. The code also supports
  `random` and `silent` for a full four-arm study.
- **Primary DV:** IC of the final written rationale, scored offline by blind raters. The app
  never scores IC.
- **Mediator:** engagement with the prompt, coded offline from the raw response text.
- **Manipulation checks only:** bias score, disconfirmation ratio, operation coverage.
- **Held constant:** the prompt is produced the same way in every arm. Only its timing differs.

The pilot (n = 30) did not support the hypothesis, and it was not a fair test of it. See
[`docs/STUDY.md`](docs/STUDY.md) and the paper for details. [`ARCHITECTURE.md`](ARCHITECTURE.md)
documents the signal definitions, the anticipatory window, and the schema.

## Participant flow

```
consent → onboarding (demographics, topic, prior lean + reasons)
  → explore (endorse / dismiss evidence cards, inline lean re-rating)
  → [anticipatory prompt may fire here]
  → "I've reached my position"   (always proceeds, never gated)
  → [reactive prompt fires here]
  → final written rationale   (the IC-scored outcome)
  → debrief
```

## Running locally

Requirements: Node.js 20+, and a Supabase project and Anthropic API key if you want the full
research path. The demo works with only `DEMO_TOKEN_SECRET` set (plus Supabase for topics).

```bash
npm install
cp .env.example .env.local     # then fill in values
npm run dev                    # http://localhost:3000
```

Create the database schema by running `SCHEMA.sql` and then `SCHEMA_MIGRATION.sql` in the
Supabase SQL editor. Every database access goes through server-side API routes that use the
service-role key, so enable Row Level Security on **every** table. No anon policies are
needed.

### Tests

```bash
npm run test:signals     # signal-processor unit tests
npm run test:trigger     # trigger-engine unit tests
npm run test:demo        # closed-study gate, demo isolation, research-path regression (mock DB, no network)
```

### Environment variables

Names only. Never commit values. [`.env.example`](.env.example) lists all of them.

| Variable | Where it is used | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | server | Anon key. The app does not query with it, and RLS should deny it everything |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Used by API routes. Never expose to the browser |
| `ANTHROPIC_API_KEY` | **server only** | Card and prompt generation |
| `ANTHROPIC_MODEL` | server | Optional model override |
| `NEXT_PUBLIC_PROLIFIC_COMPLETION_CODE` | browser | Prolific completion code (research path only) |
| `STUDY_OPEN` | server | `true` opens the research routes for data collection. **Unset (the default) means closed**, and every research route returns 403 |
| `DEMO_TOKEN_SECRET` | **server only** | HMAC secret for the demo cookie. The demo is disabled when unset |
| `DEMO_LLM_ENABLED` | server | `true` makes the demo call the Anthropic API (rate-limited). Anything else uses canned cards and the fixed fallback prompt |
| `DEMO_MAX_LLM_CALLS_PER_SESSION` | server | Hard cap per demo session (default 15) |
| `DEMO_MAX_LLM_CALLS_PER_IP_PER_HOUR` | server | Per-IP limit (default 30) |
| `DEMO_MAX_LLM_CALLS_PER_DAY` | server | Global daily ceiling per server instance (default 300) |

## Study gate

The research routes write to participants, sessions, nodes, events, lean samples, triggers,
prompt events, final rationale, session outcome and the mailing list. They are **closed unless
`STUDY_OPEN=true`**. While closed, both `proxy.ts` and each route return
`403 {"code": "study_closed"}` before touching the database or the Anthropic API. Someone
arriving from a Prolific link sees "This study is closed and is no longer accepting
participants." when they submit the onboarding form. Only the read-only topic list
and the demo stay available. With `STUDY_OPEN=true` the research path behaves exactly as at
tag `v1.0-pilot`. Set it only on a deployment that is actively collecting data.

## Demo mode

Opening the app without Prolific parameters offers **"Try the demo"**. The demo works whether
or not the study is open:

- The server issues a signed `kairos_demo` cookie. While that cookie is present, a server-side
  `proxy.ts` and a guard in each research route **refuse** every route that writes research
  data, including participants, sessions, events, lean samples, triggers, prompt events,
  final rationale, session outcome and the mailing list.
- Demo state lives only in the browser tab (`sessionStorage`). The demo condition is picked by
  the visitor or drawn at random in the browser. It never reads or advances the research
  condition counter.
- Card and prompt generation go through the normal `/api/cards` and `/api/trigger` routes. By
  default the demo serves canned cards and the fixed fallback prompt. With
  `DEMO_LLM_ENABLED=true` it calls the Anthropic API under per-session, per-IP and daily caps.
  These limits are in-memory per server instance, so also set a spend limit on the Anthropic
  key you deploy with.
- A persistent "Demo, no data is saved" banner is shown, and the email opt-in is hidden.

## Security

- `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `DEMO_TOKEN_SECRET` are read only in
  server code (`app/api/**`, `lib/**`, `proxy.ts`) and are never logged.
- The mailing list (`mailing_list(email, created_at)`) has no session ID and no foreign key.
  It is deliberately unlinkable to any response data.

## License

[MIT](LICENSE) © 2026 Snehasish Satpathy. If you use KAIROS in research, please cite it
(see [`CITATION.cff`](CITATION.cff) or [`docs/STUDY.md`](docs/STUDY.md#citation)).
