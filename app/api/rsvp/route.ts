import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { firstName, lastName, email, team, plusOne, photoWaiver } = body

    // Basic validation
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

    const toEmail = process.env.RSVP_TO_EMAIL || 'rsvp@droga5.com'
    const fromEmail = process.env.RSVP_FROM_EMAIL || 'onboarding@resend.dev'

    // Send notification to organizer
    await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: `D5XX RSVP — ${firstName} ${lastName}`,
      html: `
        <div style="font-family: monospace; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #f5f3ee; padding: 40px;">
          <p style="font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #888; margin-bottom: 32px;">D5XX · New RSVP Received</p>
          <h1 style="font-size: 48px; font-weight: 400; margin: 0 0 32px; letter-spacing: -0.02em;">${firstName} ${lastName}</h1>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr style="border-top: 1px solid rgba(255,255,255,0.1);">
              <td style="padding: 12px 0; color: #888; width: 40%;">Email</td>
              <td style="padding: 12px 0;">${email}</td>
            </tr>
            <tr style="border-top: 1px solid rgba(255,255,255,0.1);">
              <td style="padding: 12px 0; color: #888;">Office / Team</td>
              <td style="padding: 12px 0;">${team || '—'}</td>
            </tr>
            <tr style="border-top: 1px solid rgba(255,255,255,0.1);">
              <td style="padding: 12px 0; color: #888;">Plus One</td>
              <td style="padding: 12px 0;">${plusOne || '—'}</td>
            </tr>
            <tr style="border-top: 1px solid rgba(255,255,255,0.1);">
              <td style="padding: 12px 0; color: #888;">Photo Waiver</td>
              <td style="padding: 12px 0;">${photoWaiver ? '✓ Accepted' : '✗ Declined'}</td>
            </tr>
            <tr style="border-top: 1px solid rgba(255,255,255,0.1); border-bottom: 1px solid rgba(255,255,255,0.1);">
              <td style="padding: 12px 0; color: #888;">Submitted</td>
              <td style="padding: 12px 0;">${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET</td>
            </tr>
          </table>
          <p style="margin-top: 40px; font-size: 10px; color: #444; letter-spacing: 0.2em; text-transform: uppercase;">Droga5 · D5XX · 2006–2026</p>
        </div>
      `,
    })

    // Send confirmation to attendee
    await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: `You're on the list — D5XX`,
      html: `
        <div style="font-family: monospace; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #f5f3ee; padding: 40px;">
          <p style="font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #888; margin-bottom: 32px;">D5XX · Droga5 Turns Twenty</p>
          <h1 style="font-size: 48px; font-weight: 400; margin: 0 0 16px; letter-spacing: -0.02em;">See you<br>there.</h1>
          <p style="color: #888; font-size: 13px; line-height: 1.8; margin: 0 0 40px;">
            You're confirmed for D5XX, ${firstName}. We'll be in touch with more details closer to the night.
          </p>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr style="border-top: 1px solid rgba(255,255,255,0.1);">
              <td style="padding: 12px 0; color: #888; width: 40%;">Date</td>
              <td style="padding: 12px 0;">Friday, October 3rd, 2026</td>
            </tr>
            <tr style="border-top: 1px solid rgba(255,255,255,0.1);">
              <td style="padding: 12px 0; color: #888;">Location</td>
              <td style="padding: 12px 0;">Droga5 HQ · 120 Wall Street, 17th Floor · New York</td>
            </tr>
            <tr style="border-top: 1px solid rgba(255,255,255,0.1); border-bottom: 1px solid rgba(255,255,255,0.1);">
              <td style="padding: 12px 0; color: #888;">Time</td>
              <td style="padding: 12px 0;">7:00 PM — Late</td>
            </tr>
          </table>
          <p style="margin-top: 40px; font-size: 10px; color: #444; letter-spacing: 0.2em; text-transform: uppercase;">Droga5 · D5XX · 2006–2026</p>
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
