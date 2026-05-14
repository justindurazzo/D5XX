import Link from 'next/link'
import Mixer from '@/components/Mixer'

export const metadata = {
  title: 'Mix — D5XX',
  description: 'Internal test of the D5XX mixer module.',
  robots: { index: false, follow: false },
}

export default function MixPage() {
  return (
    <main className="mix-page">
      <style>{`
        html, body { background: #f5f3ee; }
        .mix-page { min-height: 100vh; background: #f5f3ee; }
        .mix-topbar {
          background: #00FF63;
          color: #0a0a0a;
          padding: 0.7rem 1.5rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-family: 'DM Mono', monospace;
          font-size: 0.7rem;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          position: sticky;
          top: 0;
          z-index: 100;
        }
        .mix-topbar a { color: #0a0a0a; text-decoration: none; }
        .mix-topbar a:hover { opacity: 0.7; }
      `}</style>

      <header className="mix-topbar">
        <Link href="/">← DROGA5</Link>
        <span>Mix · Test</span>
      </header>

      <Mixer />
    </main>
  )
}
