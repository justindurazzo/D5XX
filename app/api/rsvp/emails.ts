// HTML email templates for D5XX RSVP.
//
// Built to match the site's look: near-black background, neon-green accent,
// monospace body, heavy display headline. Email-client-safe — table layout,
// inline styles, web-safe font fallbacks, no <style> blocks or external fonts.

import { TERMS_VERSION } from '../../rsvp-config'

const MONO = "'DM Mono','Courier New',Courier,monospace"
const DISPLAY = "'Arial Black',Arial,Helvetica,sans-serif"

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

type GuestData = { firstName: string }
type OrganizerData = {
  firstName: string
  lastName: string
  email: string
  photoWaiver: boolean
}

/** Confirmation email sent to the guest after a successful RSVP. */
export function guestConfirmationHtml({ firstName }: GuestData): string {
  const name = escapeHtml(firstName)
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0a0a0a;margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:0;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

        <!-- green strip -->
        <tr>
          <td bgcolor="#00FF63" style="background-color:#00FF63;padding:14px 30px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:${MONO};font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#0a0a0a;">D5XX</td>
                <td align="right" style="font-family:${MONO};font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#0a0a0a;">20 Years of Droga5</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- body -->
        <tr>
          <td bgcolor="#0a0a0a" style="background-color:#0a0a0a;padding:46px 30px 40px;">

            <p style="margin:0 0 24px;font-family:${MONO};font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#00FF63;">&mdash;&nbsp; RSVP Confirmed</p>

            <h1 style="margin:0 0 24px;font-family:${DISPLAY};font-weight:800;font-size:56px;line-height:0.9;letter-spacing:-1.5px;color:#f5f3ee;">SEE YOU<br/>THERE.</h1>

            <p style="margin:0 0 36px;font-family:${MONO};font-size:13px;line-height:1.85;color:#f5f3ee;">
              You're on the list, ${name}. An invitation-only evening celebrating twenty years of Droga5 &mdash; celebrate with a music night to remember.
            </p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:16px 0;border-top:1px solid rgba(245,243,238,0.15);">
                  <p style="margin:0 0 6px;font-family:${MONO};font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:#888888;">Date</p>
                  <p style="margin:0;font-family:${DISPLAY};font-weight:800;font-size:21px;color:#f5f3ee;">June 9 &nbsp;&middot;&nbsp; 7PM &mdash; Late</p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 0;border-top:1px solid rgba(245,243,238,0.15);border-bottom:1px solid rgba(245,243,238,0.15);">
                  <p style="margin:0 0 6px;font-family:${MONO};font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:#888888;">Location</p>
                  <p style="margin:0;font-family:${DISPLAY};font-weight:800;font-size:21px;color:#f5f3ee;">To Be Revealed</p>
                  <p style="margin:6px 0 0;font-family:${MONO};font-size:11px;color:#888888;">New York City &mdash; hints to follow</p>
                </td>
              </tr>
            </table>

            <p style="margin:32px 0 0;font-family:${MONO};font-size:12px;line-height:1.8;color:#888888;">
              We'll roll out location hints, dress, and arrival details by email and Partiful. Keep an eye on your inbox.
            </p>

            <p style="margin:22px 0 0;font-family:${MONO};font-size:10px;line-height:1.7;color:#555555;">
              You accepted the D5XX photo &amp; video release when you RSVP'd.
            </p>

            <p style="margin:34px 0 0;padding-top:24px;border-top:1px solid rgba(245,243,238,0.15);font-family:${MONO};font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:#555555;">
              Droga5 &nbsp;&middot;&nbsp; D5XX &nbsp;&middot;&nbsp; 2006&mdash;2026 &nbsp;&middot;&nbsp; New York
            </p>

          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>`.trim()
}

/** Notification email sent to the organizer for each RSVP. */
export function organizerEmailHtml({ firstName, lastName, email, photoWaiver }: OrganizerData): string {
  const submitted = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
  const row = (label: string, value: string, last = false) => `
    <tr>
      <td style="padding:12px 0;border-top:1px solid rgba(245,243,238,0.14);${last ? 'border-bottom:1px solid rgba(245,243,238,0.14);' : ''}width:42%;font-family:${MONO};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#888888;vertical-align:top;">${label}</td>
      <td style="padding:12px 0;border-top:1px solid rgba(245,243,238,0.14);${last ? 'border-bottom:1px solid rgba(245,243,238,0.14);' : ''}font-family:${MONO};font-size:13px;color:#f5f3ee;">${value}</td>
    </tr>`
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0a0a0a;margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:0;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
        <tr>
          <td bgcolor="#0a0a0a" style="background-color:#0a0a0a;padding:40px 30px;">
            <p style="margin:0 0 28px;font-family:${MONO};font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#00FF63;">D5XX &middot; New RSVP</p>
            <h1 style="margin:0 0 30px;font-family:${DISPLAY};font-weight:800;font-size:40px;line-height:0.95;letter-spacing:-1px;color:#f5f3ee;">${escapeHtml(firstName)} ${escapeHtml(lastName)}</h1>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${row('Email', escapeHtml(email))}
              ${row('Photo &amp; Video Release', photoWaiver
                ? '<span style="color:#00FF63;">&#10003; Accepted</span>'
                : '<span style="color:#ff6b6b;">&#10007; Declined</span>')}
              ${row('Terms Version', escapeHtml(TERMS_VERSION))}
              ${row('Submitted', submitted + ' ET', true)}
            </table>
            <p style="margin:36px 0 0;font-family:${MONO};font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:#555555;">Droga5 &middot; D5XX &middot; 2006&ndash;2026</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`.trim()
}
