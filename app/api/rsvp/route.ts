import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { appendRsvpToSheet } from './google-sheet'
import { organizerEmailHtml, guestConfirmationHtml } from './emails'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const resend = new Resend(process.env.RESEND_API_KEY)
  try {
    const body = await req.json()
    const { firstName, lastName, email, photoWaiver } = body

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
        { error: 'Photo & video release must be accepted to RSVP.' },
        { status: 400 }
      )
    }

    // Log the RSVP to the Google Sheet database. This never throws — a failed
    // DB write must not block the confirmation email.
    await appendRsvpToSheet({ firstName, lastName, email, photoWaiver })

    const toEmail = process.env.RSVP_TO_EMAIL || 'rsvp@droga5.com'
    const fromEmail = process.env.RSVP_FROM_EMAIL || 'onboarding@resend.dev'

    // Organizer notification
    await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: `D5XX RSVP — ${firstName} ${lastName}`,
      html: organizerEmailHtml({ firstName, lastName, email, photoWaiver }),
    })

    // Guest confirmation
    await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: `You're on the list — D5XX · June 9`,
      html: guestConfirmationHtml({ firstName }),
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
