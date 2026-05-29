// ───── Google Sheet RSVP log ─────
// Appends each RSVP as a row to a Google Sheet so submissions land in a database
// the team can read. Uses a Google service account — no third-party SDK, just a
// signed JWT minted with Node's built-in crypto. See NOTES.md for setup + the
// PII handling guidance.
//
// Required env vars (both must be set, or the append is skipped silently):
//   RSVP_SHEET_ID               — the spreadsheet ID from its URL
//   GOOGLE_SERVICE_ACCOUNT_KEY  — the full service-account JSON key, single line

import crypto from 'crypto'

import { TERMS_VERSION } from '../../rsvp-config'

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

export type RsvpRow = {
  firstName: string
  lastName: string
  email: string
  photoWaiver: boolean
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

// Exchange a signed service-account JWT for a short-lived access token.
async function getAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = base64url(
    JSON.stringify({
      iss: clientEmail,
      scope: SHEETS_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  )
  const signingInput = `${header}.${claim}`
  const signature = base64url(
    crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKey)
  )
  const assertion = `${signingInput}.${signature}`

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`)
  }
  const data = (await res.json()) as { access_token?: string }
  if (!data.access_token) throw new Error('Token exchange returned no access_token')
  return data.access_token
}

/**
 * Append one RSVP to the configured Google Sheet.
 * Never throws — a failed DB write must not break the RSVP (email is the backup).
 */
export async function appendRsvpToSheet(row: RsvpRow): Promise<void> {
  const rawSheetId = process.env.RSVP_SHEET_ID
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY

  if (!rawSheetId || !rawKey) {
    console.warn('[rsvp] Google Sheet not configured — skipping database write')
    return
  }

  // Tolerate a full sheet URL — or an ID with a trailing "/edit?gid=..." suffix —
  // being pasted into RSVP_SHEET_ID. Extract the bare spreadsheet ID either way.
  const sheetId =
    rawSheetId.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] ??
    rawSheetId.trim().split(/[/?#]/)[0]

  try {
    const creds = JSON.parse(rawKey) as { client_email: string; private_key: string }
    // Env vars store newlines as the literal characters "\n" — restore them.
    const privateKey = String(creds.private_key).replace(/\\n/g, '\n')
    const token = await getAccessToken(creds.client_email, privateKey)

    // Columns A–F: Timestamp · First · Last · Email · Photo & Video Release · Terms Version
    const range = 'A:F'
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}` +
      `/values/${encodeURIComponent(range)}:append` +
      `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`

    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [
          [
            timestamp,
            row.firstName,
            row.lastName,
            row.email,
            row.photoWaiver ? 'Accepted' : 'Declined',
            TERMS_VERSION,
          ],
        ],
      }),
    })
    if (!res.ok) {
      throw new Error(`Sheets append failed: ${res.status} ${await res.text()}`)
    }
  } catch (err) {
    console.error('[rsvp] Google Sheet append error:', err)
  }
}
