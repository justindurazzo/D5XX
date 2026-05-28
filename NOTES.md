# D5XX — Build Notes

Working notes for the RSVP platform. The deploy steps are in `README.md`.

## Comms calendar → phased location reveal

The location ladder on the homepage unlocks in stages, driven by New York time.
Each phase activates at **noon Eastern (16:00 UTC during EDT)** on its listed date,
so a morning launch on the same day still shows the previous phase.

| Phase | When                | Unlocks                                                             |
|-------|---------------------|---------------------------------------------------------------------|
| 1     | Launch (05/28 AM)   | Earth / North America / United States                               |
| 2     | 05/28 · 12:00 ET    | Manhattan                                                           |
| 3     | 06/02 · 12:00 ET    | Lower East Side **+ the Bits & Bobs mixer appears for the first time** |
| 4     | 06/08 · 12:00 ET    | THE BOX — links to the Google Maps location                         |

- Steps above the current phase render **"TBD"**.
- Preview any phase on a deploy with `?phase=1`, `?phase=2`, `?phase=3`, `?phase=4`.
- THE BOX is the final reveal — clicking it opens the venue (189 Chrystie St) in a new Google Maps tab.
- Reveal moments live in `PHASE_REVEALS` at the top of `app/page.tsx`. Change the timestamps there to retime any phase.
- All additional comms roll out via **email + Partiful**.

## Google Sheet RSVP database

Every RSVP is appended as a row to a Google Sheet (the team-readable database),
in addition to the confirmation emails. Code: `app/api/rsvp/google-sheet.ts`.

**Columns (A–F):** Timestamp (ET) · First Name · Last Name · Email · Photo & Video Release · Terms Version

The "Terms Version" column records which release wording the guest accepted (see
`app/rsvp-config.ts`), so consent stays traceable if the terms text changes.

### Setup (~5 minutes)

1. **Create the sheet** — go to <https://sheets.new>, name it `D5XX — RSVPs`.
   Add a header row: `Timestamp | First Name | Last Name | Email | Photo & Video Release | Terms Version`.
   Copy the sheet ID from the URL (`docs.google.com/spreadsheets/d/<ID>/edit`) → set `RSVP_SHEET_ID`.
2. **Create a service account** — in Google Cloud Console, create a project, enable the
   **Google Sheets API**, then create a service account and download its JSON key.
3. **Share the sheet** — share the spreadsheet with the service account's `client_email`
   as an **Editor**.
4. **Set the env var** — collapse the JSON key onto a single line and set it as
   `GOOGLE_SERVICE_ACCOUNT_KEY` (locally in `.env.local`, and in the Vercel dashboard
   for the deployed app).

If either env var is missing, the RSVP still succeeds and emails still send — the
sheet write is skipped with a console warning. The DB write also never blocks the
RSVP if it fails: email is the backup record.

## PII handling

The Google Sheet holds personal data (names + emails) and consent records. Treat it
as the system of record for PII:

- **Access** — share the sheet only with named Droga5 accounts who need it. Never set
  link-sharing to "anyone". The service account gets Editor access and nothing else.
- **Consent** — the Photo & Video Release column records each guest's explicit consent;
  keep it alongside the contact data so consent is always traceable to a person.
- **No PII in logs** — the API route does not log names or emails; only generic
  warnings/errors go to the console.
- **Retention** — delete the sheet (and any exports) once the event wrap-up is done and
  the data is no longer needed.
- **Terms** — the photo/video release wording links to `/terms`. That copy is
  **pending Dan S. confirmation** before launch.

## Domain & email setup (d5xx.com)

Until `d5xx.com` is purchased and configured, two things are limited:

1. The site runs on a temporary Vercel URL instead of `d5xx.com`.
2. **Guest confirmation emails do not send.** Resend only delivers to the Resend
   account's own address until a sending domain is verified — so real guests get no
   email. This is a hard launch blocker.

Once `d5xx.com` is purchased and the registrar's DNS is editable, do all three:

### 1. Point the domain at the site (Vercel)

- Vercel → project `d5-xx` → Settings → Domains → **Add** → `d5xx.com`.
- Vercel shows the DNS records to add at the registrar. Typically:
  - apex `d5xx.com` → **A** record → `76.76.21.21`
  - `www` → **CNAME** → `cname.vercel-dns.com`
- Use whatever Vercel displays — those values are authoritative.

### 2. Verify the domain in Resend — this is what unblocks guest emails

- Resend → **Domains** → **Add Domain** → `d5xx.com`.
- Resend shows a set of DNS records — add **all** of them at the registrar, verbatim:
  - an **MX** record (bounce handling, on a `send` subdomain)
  - an **SPF** `TXT` record
  - a **DKIM** `TXT` record — a long unique key, copy it exactly
  - (recommended) a **DMARC** `TXT` record
- Wait for Resend to show the domain as **Verified** (minutes to a few hours).

### 3. Set the from-address

- In Vercel env vars, set `RSVP_FROM_EMAIL` to an address on the verified domain,
  e.g. `rsvp@d5xx.com`. Redeploy.
- After this, every guest receives a confirmation email.

DNS changes propagate slowly — allow at least a half-day of buffer before 05/26.

## Open items (owned elsewhere)

- `d5xx.com` purchase — Manini + Mike Alvez. See **Domain & email setup** above for
  the steps to run once it's bought.
- RSVP confirmation email — final design + copy still owed (current template is a
  functional placeholder).
- Dress Inspo — moodboard pending; the section currently shows a "coming soon"
  placeholder.
- Terms / photo-release wording — Dan S. to confirm.
