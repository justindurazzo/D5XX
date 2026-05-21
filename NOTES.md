# D5XX — Build Notes

Working notes for the RSVP platform. The deploy steps are in `README.md`.

## Comms calendar → phased location reveal

The location ladder on the homepage unlocks in stages, driven by the New York date:

| Phase | Date  | Unlocks                                            |
|-------|-------|----------------------------------------------------|
| 1     | 05/26 | RSVP site live · Earth / North America / US / NYC  |
| 2     | 05/29 | Manhattan                                          |
| 3     | 06/02 | Lower East Side                                    |
| 4     | 06/08 | Venue revealed                                     |

- Steps above the current phase render **redacted** (`████`).
- Preview any stage on the feedback site with a query param: `?phase=1`, `?phase=2`, `?phase=3`, `?phase=4`.
- **The venue is intentionally not named yet.** Per current direction, all mention of the venue is removed. When the venue is confirmed for the 06/08 reveal, set `VENUE_NAME` at the top of `app/page.tsx`.
- 06/02 "Synthesizer Live" and 06/05 email comms are internal milestones — no site change.
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

## Open items (owned elsewhere)

- `d5xx.com` purchase — Manini + Mike Alvez.
- RSVP confirmation email — final design + copy still owed (current template is a
  functional placeholder).
- Dress Inspo — moodboard pending; the section currently shows a "coming soon"
  placeholder.
- Terms / photo-release wording — Dan S. to confirm.
