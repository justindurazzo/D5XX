import Link from 'next/link'

export const metadata = {
  title: 'Terms & Photo Release — D5XX',
  description: 'Photo & video release and event terms for D5XX, June 9.',
}

export default function TermsPage() {
  return (
    <main style={{ background: '#0a0a0a', color: '#f5f3ee', minHeight: '100vh', padding: '4rem 1.5rem' }}>
      <style>{`
        .wrap { max-width: 720px; margin: 0 auto; font-family: 'DM Mono', monospace; }
        .topstrip { background: #00FF63; color: #0a0a0a; display: flex; justify-content: space-between;
                    padding: 0.7rem 1.5rem; font-size: 0.7rem; letter-spacing: 0.22em; text-transform: uppercase;
                    position: fixed; top: 0; left: 0; right: 0; z-index: 10; }
        .topstrip a { color: #0a0a0a; text-decoration: none; }
        h1 { font-family: 'Archivo Black', sans-serif; font-size: clamp(48px, 7vw, 96px);
             line-height: 0.9; letter-spacing: -0.02em; transform: scaleX(1.1); transform-origin: left center;
             margin-bottom: 2.5rem; }
        h2 { font-family: 'Archivo Black', sans-serif; font-size: 1.4rem; letter-spacing: -0.01em;
             margin: 2.5rem 0 1rem; color: #00FF63; }
        p { font-size: 0.85rem; line-height: 1.85; color: rgba(245,243,238,0.85); margin-bottom: 1rem; }
        .eyebrow { font-size: 0.65rem; letter-spacing: 0.24em; text-transform: uppercase;
                   color: #00FF63; margin-bottom: 2rem; }
        .back { margin-top: 4rem; display: inline-block; font-size: 0.7rem; letter-spacing: 0.24em;
                text-transform: uppercase; color: #00FF63; text-decoration: none; border-bottom: 1px solid #00FF63;
                padding-bottom: 4px; }
      `}</style>

      <div className="topstrip">
        <Link href="/">DROGA5</Link>
        <Link href="/#rsvp">RSVP</Link>
      </div>

      <div className="wrap" style={{ paddingTop: '4rem' }}>
        <p className="eyebrow">D5XX · Terms &amp; Photo Release</p>
        <h1>FINE<br/>PRINT.</h1>

        <h2>Photo &amp; Video Release</h2>
        <p>
          By RSVPing to D5XX (the "Event") on June 9 in New York, NY, you acknowledge
          and agree that the Event will be photographed and filmed by Droga5 and/or
          its appointed agents.
        </p>
        <p>
          You grant Droga5, its parent companies, affiliates, and successors a perpetual,
          worldwide, royalty-free, irrevocable license to use, reproduce, distribute,
          and publicly display photographs, video footage, and audio recordings in which
          you appear, in any medium now known or later developed, for internal communications,
          archival purposes, social media, marketing, and editorial use. This release
          extends to your name, likeness, and voice.
        </p>
        <p>
          You waive any right to inspect or approve the finished product or the use to
          which it may be applied. You release Droga5 from any and all claims arising
          out of the use of such recordings, including any claim for compensation,
          defamation, or invasion of privacy.
        </p>

        <h2>Event Conduct</h2>
        <p>
          D5XX is an invitation-only event. RSVPs are non-transferable. Droga5 reserves
          the right to refuse entry or remove any guest whose conduct is, in the sole
          discretion of Droga5 or venue staff, disruptive, unsafe, or inconsistent with
          the standards of the venue.
        </p>

        <h2>Venue Rules</h2>
        <p>
          The event venue maintains its own house rules and dress code. All attendees
          agree to comply with venue policy, including any restrictions on mobile phone
          use, recording, and personal photography during performances.
        </p>

        <h2>Health &amp; Safety</h2>
        <p>
          By attending, you assume all risks associated with attendance, including
          exposure to communicable illness. You agree to follow any applicable health
          and safety requirements communicated by Droga5 or the venue.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about these terms or the photo release can be directed to the
          D5XX organizers at the email address on your RSVP confirmation.
        </p>

        <Link href="/" className="back">← Back to D5XX</Link>
      </div>
    </main>
  )
}
