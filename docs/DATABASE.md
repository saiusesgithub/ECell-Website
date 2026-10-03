# E-Cell VJIT — Supabase Database Reference

Generated from a live schema dump (`information_schema`, `pg_policies`, `pg_enum`) cross-referenced
against every `.from(...)` call in the codebase. Last verified: 2026-07-05.

**Regenerating this doc:** re-run the four queries in [Appendix: schema-dump queries](#appendix-schema-dump-queries)
in the Supabase SQL Editor and diff the output against the tables below.

## Overview

- **Database:** Postgres via Supabase.
- **Two client entry points:**
  | Client | File | Key used | Where it runs | Subject to RLS? |
  |---|---|---|---|---|
  | `supabase` | [`src/lib/supabase.js`](../src/lib/supabase.js) | `PUBLIC_SUPABASE_ANON_KEY` | Browser (client-side `<script>` in `.astro` pages) | Yes |
  | `supabaseAdmin` | [`src/lib/supabaseAdmin.js`](../src/lib/supabaseAdmin.js) | `SUPABASE_SERVICE_ROLE_KEY` | Server-only (`.ts` API routes, `.astro` frontmatter in `/console`, `/scan`) | No — bypasses RLS entirely |
- Because the anon key is `PUBLIC_`-prefixed, Astro bundles it into client-side JS. It is **visible to
  anyone** who views page source or the network tab. Anything readable/writable by `anon` under RLS is,
  in practice, readable/writable by anyone on the internet — RLS policies are the *only* access control
  on data reachable via `supabase` (the anon client).
- `supabaseAdmin` is only ever imported from files under `src/pages/api/`, `src/pages/console/`, and
  `src/pages/scan/` — all of which sit behind the cookie-based admin session in
  [`src/lib/adminAuth.js`](../src/lib/adminAuth.js) (HMAC-signed session token, no DB-backed users table —
  admin auth is a single shared password, not per-user accounts).
- RLS is **enabled on all 6 tables** (`rowsecurity = true`). Four of them have **zero policies**, which
  in Postgres means *default-deny*: no row is readable or writable via the anon key at all, only via
  `supabaseAdmin`. This is a deliberate, correct pattern used for the four "interaction" tables below.

## Table index

| Table | Purpose | Rows written by |
|---|---|---|
| [`events`](#events) | Event catalogue (workshops, hackathons, talks) | Console (admin) |
| [`registrations`](#registrations) | Per-event sign-ups / tickets | Public (validated API route) |
| [`sticky_notes`](#sticky_notes) | Interactions → Sticky Wall | Public (via API route) |
| [`event_wishlist`](#event_wishlist) | Interactions → Event Wishlist | Public (via API route) |
| [`cofounder_posts`](#cofounder_posts) | Interactions → Find a Cofounder | Public (via API route) |
| [`question_box`](#question_box) | Interactions → Question Drop Box | Public (via API route) |

---

## `events`

The event catalogue. Public read, admin-only write.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `title` | `text` | NO | | |
| `slug` | `text` | NO | | **UNIQUE** — used for `/events/[slug]` routing |
| `short_description` | `text` | NO | | |
| `long_description` | `text` | YES | | |
| `date` | `date` | NO | | |
| `time` | `time` | NO | | |
| `venue` | `text` | NO | | |
| `mode` | `event_mode` (enum) | NO | | `online` \| `offline` \| `hybrid` |
| `location_map_link` | `text` | YES | | |
| `poster_url` | `text` | NO | | |
| `gallery_images` | `jsonb` | YES | | array of image URLs |
| `recap_link` | `text` | YES | | |
| `registration_open` | `bool` | NO | `true` | toggled from console |
| `registration_deadline` | `timestamp` | YES | | no timezone |
| `max_participants` | `int4` | YES | | |
| `event_type` | `event_type_enum` (enum) | NO | | `hackathon` \| `workshop` \| `talk` \| `expo` |
| `status` | `event_status` (enum) | NO | | `upcoming` \| `past` |
| `requirements` | `text` | YES | | |
| `prerequisites` | `text` | YES | | |
| `speakers` | `jsonb` | YES | | |
| `judges` | `jsonb` | YES | | |
| `chief_guest` | `jsonb` | YES | | |
| `winners` | `jsonb` | YES | | |
| `prize_pool` | `text` | YES | | |
| `is_paid` | `bool` | YES | `false` | |
| `price` | `numeric` | YES | | |
| `payment_link` | `text` | YES | | |
| `certificate_template_url` | `text` | YES | | |
| `is_featured` | `bool` | YES | `false` | |
| `created_at` | `timestamp` | YES | `now()` | no timezone |
| `updated_at` | `timestamp` | YES | `now()` | no timezone — **not** auto-updated by a trigger; set manually wherever the row is updated |
| `is_team_event` | `bool` | NO | `false` | |
| `min_team_size` | `int4` | YES | | |
| `max_team_size` | `int4` | YES | | |
| `whatsapp_group_link` | `text` | YES | | |

**Constraints:** PK `id`; UNIQUE `slug`.
**Indexes:** `events_pkey` (id), `events_slug_key` (slug).

**RLS:** enabled, 1 policy —

| Policy | Command | Roles | Condition |
|---|---|---|---|
| `Public can view events` | `SELECT` | `anon, authenticated` | `true` (unrestricted read) |

No public write policy — inserts/updates only via `supabaseAdmin` (console).

**Read/written by:**
- Public read (`supabase`, anon): [`events/index.astro`](../src/pages/events/index.astro),
  [`events/[slug]/index.astro`](../src/pages/events/[slug]/index.astro),
  [`events/[slug]/registration.astro`](../src/pages/events/[slug]/registration.astro),
  [`events/[slug]/confirmation.astro`](../src/pages/events/[slug]/confirmation.astro)
- Admin (`supabaseAdmin`): [`console/index.astro`](../src/pages/console/index.astro) (dashboard list),
  [`console/events/new.astro`](../src/pages/console/events/new.astro) (insert),
  [`console/events/[id]/edit.astro`](../src/pages/console/events/[id]/edit.astro) (update),
  [`console/actions/toggle-registration.ts`](../src/pages/console/actions/toggle-registration.ts)
  (toggles `registration_open`), [`console/actions/export-registrations.ts`](../src/pages/console/actions/export-registrations.ts)
  (reads `title` for CSV filename), [`console/events/[id]/registrations.astro`](../src/pages/console/events/[id]/registrations.astro)
  (reads `id, title`).

---

## `registrations`

One row per person registered for an event (or per team member, for team events). Contains PII.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `event_id` | `uuid` | NO | | **FK → `events.id`** |
| `name` | `text` | NO | | |
| `roll_number` | `text` | YES | | |
| `year_of_study` | `text` | YES | | |
| `section` | `text` | YES | | |
| `branch` | `text` | YES | | |
| `email` | `text` | NO | | |
| `phone` | `text` | YES | | |
| `college` | `text` | YES | | |
| `ticket_id` | `uuid` | NO | | **UNIQUE** — the public identifier used in confirmation/ticket links (not the row `id`) |
| `is_checked_in` | `bool` | YES | `false` | set by `/scan` |
| `checked_in_at` | `timestamp` | YES | | |
| `payment_status` | `payment_status_enum` (enum) | YES | `pending` | `pending` \| `paid` \| `free` \| `failed` |
| `payment_id` | `text` | YES | | |
| `payment_verified` | `bool` | YES | `false` | toggled manually from console |
| `amount_paid` | `numeric` | YES | | |
| `extra_data` | `jsonb` | YES | | free-form per-event custom fields |
| `created_at` | `timestamp` | YES | `now()` | |
| `updated_at` | `timestamp` | YES | `now()` | not trigger-maintained |
| `ticket_pdf_url` | `text` | YES | | |
| `team_name` | `text` | YES | | only for `is_team_event` events |
| `is_team_leader` | `bool` | YES | `false` | |
| `email_sent` | `bool` | NO | `false` | ticket-email delivery flag |
| `email_sent_at` | `timestamp` | YES | | |

**Constraints:** PK `id`; FK `event_id → events.id`; UNIQUE `ticket_id`; UNIQUE `(event_id, email)` (one
registration per email per event).
**Indexes:** `registrations_pkey` (id), `registrations_ticket_id_key` (ticket_id),
`registrations_event_id_email_key` (event_id, email), `idx_registrations_event_id` (event_id),
`idx_registrations_event_team` (event_id, team_name).

Public registration batches are inserted through `register_event_batch(uuid, jsonb)`. The migration
drops the previous anonymous insert policy so requests cannot bypass the API. The function locks the
event row while it checks registration state and capacity, then inserts the full batch in the same
transaction. Its execute grant is limited to `service_role`. Event pages and the console use
`get_event_registration_counts()` to retrieve aggregate counts without transferring registration rows.
The functions are created by [`20261003000000_atomic_event_registration.sql`](../supabase/migrations/20261003000000_atomic_event_registration.sql).

**RLS:** enabled, 0 public policies after applying
[`20261004000000_private_registration_reads.sql`](../supabase/migrations/20261004000000_private_registration_reads.sql).

**Read/written by:**
- Public ticket holders use [`api/registration-tickets.ts`](../src/pages/api/registration-tickets.ts),
  which verifies a short-lived signed receipt before reading only that registration batch. Public
  registration submissions go through [`api/register-event.ts`](../src/pages/api/register-event.ts)
  and the service-role RPC. Ticket emails also require that receipt via
  [`api/send-ticket-email.ts`](../src/pages/api/send-ticket-email.ts).
- Admin (`supabaseAdmin`): [`console/index.astro`](../src/pages/console/index.astro) (dashboard counts),
  [`console/events/[id]/registrations.astro`](../src/pages/console/events/[id]/registrations.astro)
  (registrant list), [`console/actions/toggle-payment.ts`](../src/pages/console/actions/toggle-payment.ts),
  [`console/actions/toggle-checkin.ts`](../src/pages/console/actions/toggle-checkin.ts),
  [`console/actions/delete-registration.ts`](../src/pages/console/actions/delete-registration.ts),
  [`console/actions/export-registrations.ts`](../src/pages/console/actions/export-registrations.ts) (CSV
  export), [`scan/actions/checkin.ts`](../src/pages/scan/actions/checkin.ts) (QR check-in),
  [`api/send-ticket-email.ts`](../src/pages/api/send-ticket-email.ts) (reads registration + event, sets
  `email_sent`/`email_sent_at`).

---

## `sticky_notes`

Interactions → Sticky Wall. Anyone can post; all server-side.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `name` | `text` | YES | | optional author name |
| `message` | `text` | NO | | max 140 chars, enforced in API |
| `color` | `text` | NO | `'amber'` | one of the 6 swatch colours, validated in API |
| `created_at` | `timestamptz` | NO | `now()` | |

**Constraints:** PK `id`. **Indexes:** `sticky_notes_pkey`, `sticky_notes_created_idx` (created_at desc).

**RLS:** enabled, **0 policies** → default-deny for `anon`/`authenticated`. All access goes through
`supabaseAdmin` in the API route below, which bypasses RLS.

**Read/written by:** [`api/sticky-notes.ts`](../src/pages/api/sticky-notes.ts) — `GET` returns newest 80
rows; `POST` validates and inserts. Rendered by [`StickyWall.astro`](../src/components/StickyWall.astro)
on `/interactions/sticky-wall`.

---

## `event_wishlist`

Interactions → Event Wishlist. Suggest + upvote events.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `title` | `text` | NO | | max 80 chars, enforced in API |
| `reason` | `text` | YES | | max 140 chars |
| `name` | `text` | YES | | optional author name, max 32 |
| `votes` | `int4` | NO | `0` | incremented via `increment_event_vote()` |
| `created_at` | `timestamptz` | NO | `now()` | |

**Constraints:** PK `id`. **Indexes:** `event_wishlist_pkey`,
`event_wishlist_rank_idx` (votes desc, created_at desc).

**Postgres function:** `increment_event_vote(row_id uuid) returns integer` — atomically does
`update event_wishlist set votes = votes + 1 where id = row_id returning votes`. Called via
`supabaseAdmin.rpc(...)`, so it also runs with the service role.

**RLS:** enabled, **0 policies** → default-deny; all access via `supabaseAdmin`.

**Read/written by:** [`api/event-wishlist.ts`](../src/pages/api/event-wishlist.ts) — `GET` returns top 60
sorted by votes then recency; `POST` either inserts a new idea or (if body has `vote`) calls the RPC.
Rendered by [`EventWishlist.astro`](../src/components/EventWishlist.astro) on `/interactions/event-wishlist`.
Client dedupes votes per-browser via `localStorage`, not server-enforced (a user could vote once per
browser profile, not truly once per person).

---

## `cofounder_posts`

Interactions → Find a Cofounder.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `project` | `text` | NO | | max 140 chars |
| `role` | `text` | NO | | max 60 chars |
| `name` | `text` | YES | | optional, max 32 |
| `contact` | `text` | YES | | max 80 chars; free text, parsed client-side into `mailto:`/Instagram/URL link |
| `created_at` | `timestamptz` | NO | `now()` | |

**Constraints:** PK `id`. **Indexes:** `cofounder_posts_pkey`, `cofounder_posts_created_idx` (created_at desc).

**RLS:** enabled, **0 policies** → default-deny; all access via `supabaseAdmin`.

**Read/written by:** [`api/cofounder-board.ts`](../src/pages/api/cofounder-board.ts) — `GET` returns
newest 60; `POST` validates and inserts. Rendered by
[`CofounderBoard.astro`](../src/components/CofounderBoard.astro) on `/interactions/cofounders`.

---

## `question_box`

Interactions → Question Drop Box.

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `question` | `text` | NO | | max 240 chars |
| `target` | `text` | NO | `'E-Cell'` | one of `Founders` \| `Mentors` \| `E-Cell`, validated in API (not a DB enum) |
| `name` | `text` | YES | | optional, max 32 |
| `created_at` | `timestamptz` | NO | `now()` | |

**Constraints:** PK `id`. **Indexes:** `question_box_pkey`, `question_box_created_idx` (created_at desc).

**RLS:** enabled, **0 policies** → default-deny; all access via `supabaseAdmin`.

**Read/written by:** [`api/question-box.ts`](../src/pages/api/question-box.ts) — `GET` returns newest 40;
`POST` validates and inserts. Rendered by
[`QuestionDropBox.astro`](../src/components/QuestionDropBox.astro) on `/interactions/question-box`.

---

## Enum reference

| Enum type | Values (in order) |
|---|---|
| `event_mode` | `online`, `offline`, `hybrid` |
| `event_type_enum` | `hackathon`, `workshop`, `talk`, `expo` |
| `event_status` | `upcoming`, `past` |
| `payment_status_enum` | `pending`, `paid`, `free`, `failed` |

Note: `events.mode` and `events.event_type` are entered as **free text** in the console form
([`EventForm.astro`](../src/components/console/EventForm.astro)) with a hint to match an existing enum
value — the form does not use a `<select>` for these two, unlike `status` which does. A typo there will
fail at the database level (invalid enum input), not before.

## Postgres functions

| Function | Signature | Used by |
|---|---|---|
| `increment_event_vote` | `(row_id uuid) → integer` | `event_wishlist` upvotes, via `supabaseAdmin.rpc()` |

## Security notes

1. **Registration privacy depends on applying both registration migrations.** The first removes public
   inserts and serializes capacity checks; the second removes the unrestricted public SELECT policy.
   Ticket details are then returned only through a server endpoint after validation of a short-lived
   signed receipt. Verify both migrations are applied to each Supabase environment before deployment.
2. **The four interaction tables (`sticky_notes`, `event_wishlist`, `cofounder_posts`, `question_box`)
   correctly use the default-deny pattern:** RLS is on, no policies exist, so the anon key gets nothing.
   All reads/writes are proxied through their `/api/*.ts` routes using `supabaseAdmin`, where input
   validation (length limits, allowed values, honeypot fields) actually happens. This is the template to
   follow for any new public-facing table.
3. **Admin auth is not Supabase Auth.** `/console` and `/scan` are gated by a single shared password
   (`ADMIN_PASSWORD_HASH_B64`) verified with bcrypt, producing an HMAC-signed cookie session
   (`adminAuth.js`). There is no per-admin user table — anyone with the shared password has full
   `supabaseAdmin` access via the console UI. This is a reasonable tradeoff for a small student-run
   console, but means the shared password is the single point of failure for all admin-side data.
4. **`events.updated_at` / `registrations.updated_at` are not trigger-maintained** — they default to
   `now()` on insert but nothing bumps them on update. Treat them as "row created around this time," not
   "last modified."

## Appendix: schema-dump queries

Used to produce this document. Re-run periodically to catch drift.

```sql
-- Columns
select c.table_name, c.column_name, c.data_type, c.udt_name, c.is_nullable,
       c.column_default, c.character_maximum_length
from information_schema.columns c
where c.table_schema = 'public'
order by c.table_name, c.ordinal_position;

-- Constraints (PK/FK/UNIQUE)
select tc.table_name, tc.constraint_type, kcu.column_name,
       ccu.table_name as references_table, ccu.column_name as references_column
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
left join information_schema.constraint_column_usage ccu
  on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
where tc.table_schema = 'public'
order by tc.table_name;

-- Indexes
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
order by tablename;

-- Enum values
select t.typname, e.enumlabel, e.enumsortorder
from pg_type t
join pg_enum e on t.oid = e.enumtypid
where t.typname in ('event_mode', 'event_type_enum', 'event_status', 'payment_status_enum')
order by t.typname, e.enumsortorder;

-- RLS enabled per table
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

-- RLS policies
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```
