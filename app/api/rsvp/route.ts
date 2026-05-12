import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const resend = new Resend(process.env.RESEND_API_KEY)
  try {
    const body = await req.json()
    const { firstName, lastName, email, phone, photoWaiver } = body

    if (!firstName || !lastName || !email) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      )
    }

    if (!photoWaiver) {
      return NextResponse.json(
        { error: 'Photo & film release must be accepted to RSVP.' },
        { status: 400 }
      )
    }

    const toEmail = process.env.RSVP_TO_EMAIL || 'rsvp@droga5.com'
    const fromEmail = process.env.RSVP_FROM_EMAIL || 'onboarding@resend.dev'

    // Organizer notification
    await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: `D5XX RSVP — ${firstName} ${lastName}`,
      html: `
        <div style="font-family: 'DM Mono', monospace; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #f5f3ee; padding: 40px;">
          <p style="font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: #00FF63; margin-bottom: 32px;">D5XX · New RSVP</p>
          <h1 style="font-size: 48px; font-weight: 900; margin: 0 0 32px; letter-spacing: -0.02em; color: #f5f3ee;">${escapeHtml(firstName)} ${escapeHtml(lastName)}</h1>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr style="border-top: 1px solid rgba(245,243,238,0.14);">
              <td style="padding: 12px 0; color: #888; width: 40%; text-transform: uppercase; letter-spacing: 0.18em; font-size: 11px;">Email</td>
              <td style="padding: 12px 0;">${escapeHtml(email)}</td>
            </tr>
            <tr style="border-top: 1px solid rgba(245,243,238,0.14);">
              <td style="padding: 12px 0; color: #888; text-transform: uppercase; letter-spacing: 0.18em; font-size: 11px;">Phone</td>
              <td style="padding: 12px 0;">${escapeHtml(phone || '—')}</td>
            </tr>
            <tr style="border-top: 1px solid rgba(245,243,238,0.14);">
              <td style="padding: 12px 0; color: #888; text-transform: uppercase; letter-spacing: 0.18em; font-size: 11px;">Photo Release</td>
              <td style="padding: 12px 0; color: #00FF63;">${photoWaiver ? '✓ Accepted' : '✗ Declined'}</td>
            </tr>
            <tr style="border-top: 1px solid rgba(245,243,238,0.14); border-bottom: 1px solid rgba(245,243,238,0.14);">
              <td style="padding: 12px 0; color: #888; text-transform: uppercase; letter-spacing: 0.18em; font-size: 11px;">Submitted</td>
              <td style="padding: 12px 0;">${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET</td>
            </tr>
          </table>
          <p style="margin-top: 40px; font-size: 10px; color: #444; letter-spacing: 0.22em; text-transform: uppercase;">Droga5 · D5XX · 2006–2026</p>
        </div>
      `,
    })

    // Guest confirmation
    await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: `You're on the list — D5XX · June 9 · The Box`,
      html: `
        <div style="font-family: 'DM Mono', monospace; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #f5f3ee; padding: 40px;">
          <div style="background: #00FF63; color: #0a0a0a; padding: 8px 12px; display: inline-block; font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; margin-bottom: 32px;">D5XX · 20 Years of Droga5</div>
          <h1 style="font-size: 56px; font-weight: 900; margin: 0 0 16px; letter-spacing: -0.02em; line-height: 0.9;">See you<br/>there.</h1>
          <p style="color: #f5f3ee; font-size: 13px; line-height: 1.8; margin: 0 0 40px;">
            You're confirmed, ${escapeHtml(firstName)}. Celebrate with a music night to remember.
          </p>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr style="border-top: 1px solid rgba(245,243,238,0.14);">
              <td style="padding: 14px 0; color: #888; width: 32%; text-transform: uppercase; letter-spacing: 0.2em; font-size: 11px;">Date</td>
              <td style="padding: 14px 0; font-size: 18px; font-weight: 700;">June 9 · 7PM — Late</td>
            </tr>
            <tr style="border-top: 1px solid rgba(245,243,238,0.14);">
              <td style="padding: 14px 0; color: #888; text-transform: uppercase; letter-spacing: 0.2em; font-size: 11px;">Location</td>
              <td style="padding: 14px 0; font-size: 18px; font-weight: 700;">The Box<br/><span style="font-size: 13px; font-weight: 400; color: #888;">189 Chrystie St, New York, NY</span></td>
            </tr>
            <tr style="border-top: 1px solid rgba(245,243,238,0.14); border-bottom: 1px solid rgba(245,243,238,0.14);">
              <td style="padding: 14px 0; color: #888; text-transform: uppercase; letter-spacing: 0.2em; font-size: 11px;">Dress</td>
              <td style="padding: 14px 0;">Smart / Sharp — Shiny, tactile, statement.</td>
            </tr>
          </table>
          <p style="margin-top: 32px; font-size: 12px; line-height: 1.7; color: #888;">
            We'll follow up closer to the night with arrival details. Save the date.
          </p>
          <p style="margin-top: 40px; font-size: 10px; color: #444; letter-spacing: 0.22em; text-transform: uppercase;">Droga5 · D5XX · 2006–2026</p>
        </div>
      `,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('RSVP error:', err)
    return NextResponse.json(
      { error: 'Failed to process RSVP. Please try again.' },
      { status: 500 }
    )
  }
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
