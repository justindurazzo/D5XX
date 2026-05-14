'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Mixer from './Mixer'

export default function MixGate() {
  const [revealed, setRevealed] = useState(false)
  const [pressed, setPressed] = useState(false)

  const reveal = useCallback(() => {
    setPressed(true)
    // Short delay so the visual key-press animation can play before the gate disappears.
    window.setTimeout(() => setRevealed(true), 160)
  }, [])

  // Listen for the P key (anywhere on the page). Ignore when typing into an input.
  useEffect(() => {
    if (revealed) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if (e.key.toLowerCase() === 'p') {
        e.preventDefault()
        if (!pressed) reveal()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealed, pressed, reveal])

  return (
    <main className="mix-page">
      <style>{`
        html, body { background: #f5f3ee; margin: 0; }
        .mix-page { min-height: 100vh; background: #f5f3ee; position: relative; }

        /* ─── Top bar ─── */
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
          z-index: 200;
        }
        .mix-topbar a { color: #0a0a0a; text-decoration: none; }
        .mix-topbar a:hover { opacity: 0.7; }

        /* ─── Locked gate ─── */
        .gate {
          position: fixed;
          inset: 38px 0 0 0; /* sits below the sticky topbar */
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #f5f3ee;
          z-index: 100;
          gap: 1.6rem;
          opacity: 1;
          transition:
            opacity 0.55s cubic-bezier(0.4, 0, 0.2, 1),
            transform 0.55s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .gate.gate-out {
          opacity: 0;
          transform: scale(0.86);
          pointer-events: none;
        }

        /* ─── The big "P" key ─── */
        .p-key {
          background: #0a0a0a;
          color: #f5f3ee;
          border: none;
          font-family: 'Archivo Black', sans-serif;
          font-size: clamp(120px, 18vw, 220px);
          line-height: 1;
          width: clamp(180px, 24vw, 280px);
          height: clamp(180px, 24vw, 280px);
          border-radius: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          cursor: pointer;
          position: relative;
          box-shadow:
            0 14px 0 0 rgba(10,10,10,0.85),
            0 18px 38px rgba(10,10,10,0.18);
          transition: transform 0.18s ease, box-shadow 0.18s ease;
          animation: pBreathe 3.4s ease-in-out infinite;
          will-change: transform, box-shadow;
        }
        .p-key:hover {
          transform: translateY(-3px);
          box-shadow:
            0 17px 0 0 rgba(10,10,10,0.85),
            0 22px 44px rgba(10,10,10,0.22);
        }
        .p-key:active,
        .p-key.pressed {
          transform: translateY(11px);
          box-shadow:
            0 3px 0 0 rgba(10,10,10,0.85),
            0 6px 16px rgba(10,10,10,0.15);
          transition: transform 0.06s ease, box-shadow 0.06s ease;
          animation: none;
        }
        @keyframes pBreathe {
          0%, 100% {
            box-shadow:
              0 14px 0 0 rgba(10,10,10,0.85),
              0 18px 38px rgba(10,10,10,0.18);
          }
          50% {
            box-shadow:
              0 14px 0 0 rgba(10,10,10,0.85),
              0 18px 38px rgba(10,10,10,0.18),
              0 0 60px rgba(0,255,99,0.18);
          }
        }
        .p-key:focus-visible {
          outline: 2px solid #00FF63;
          outline-offset: 8px;
        }

        /* ─── Hint lines ─── */
        .gate-hint {
          font-family: 'DM Mono', monospace;
          font-size: 0.78rem;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: #0a0a0a;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 0.7rem;
        }
        .gate-hint kbd {
          font-family: 'DM Mono', monospace;
          background: #fff;
          border: 1px solid #0a0a0a;
          padding: 3px 10px;
          font-size: 0.72rem;
          border-radius: 4px;
          font-weight: 500;
          letter-spacing: 0;
          box-shadow: 0 2px 0 0 rgba(10,10,10,0.85);
        }
        .gate-sub {
          font-family: 'DM Mono', monospace;
          font-size: 0.6rem;
          letter-spacing: 0.32em;
          text-transform: uppercase;
          color: #0a0a0a;
          opacity: 0.45;
          margin: 0;
        }

        /* ─── Mixer stage (fades up under the gate) ─── */
        .mixer-stage {
          opacity: 0;
          transform: translateY(20px);
          transition:
            opacity 0.7s 0.25s cubic-bezier(0.16,1,0.3,1),
            transform 0.7s 0.25s cubic-bezier(0.16,1,0.3,1);
          pointer-events: none;
        }
        .mixer-stage.mixer-in {
          opacity: 1;
          transform: translateY(0);
          pointer-events: auto;
        }

        /* ─── Cursor override ─── The Mixer uses cursor: none for its custom dot follower
            (which lives on the main page only). On /mix we want the OS cursor visible. */
        .mix-page .slider-track,
        .mix-page .slider-handle,
        .mix-page .knob,
        .mix-page .cf3-track,
        .mix-page .cf3-handle,
        .mix-page .xy-pad,
        .mix-page .led-cell,
        .mix-page .play-btn,
        .mix-page input {
          cursor: pointer;
        }
        .mix-page input { cursor: text; }

        @media (prefers-reduced-motion: reduce) {
          .p-key { animation: none; }
          .gate, .mixer-stage { transition: opacity 0.25s; }
        }
      `}</style>

      <header className="mix-topbar">
        <Link href="/">← DROGA5</Link>
        <span>{revealed ? 'Mix · Live' : 'Locked'}</span>
      </header>

      {/* Locked gate */}
      <div
        className={`gate${revealed ? ' gate-out' : ''}`}
        aria-hidden={revealed}
      >
        <button
          className={`p-key${pressed ? ' pressed' : ''}`}
          onClick={reveal}
          aria-label="Press P or tap to unlock the mixer"
          disabled={revealed}
        >
          P
        </button>
        <p className="gate-hint">
          Press <kbd>P</kbd> · or tap
        </p>
        <p className="gate-sub">Unlock the mixer</p>
      </div>

      {/* The mixer underneath, fades up on reveal */}
      <div
        className={`mixer-stage${revealed ? ' mixer-in' : ''}`}
        aria-hidden={!revealed}
      >
        <Mixer />
      </div>
    </main>
  )
}
