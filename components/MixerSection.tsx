'use client'

import { useCallback, useEffect, useState } from 'react'
import Mixer2 from './Mixer2'

// Homepage embed of the Mixer2 module. Starts gated behind the big "P" push
// button — the same unlock interaction as the standalone /mixer2 page — but the
// gate is an absolutely-positioned overlay contained within this section,
// rather than the full-viewport fixed overlay that MixGate2 uses.
export default function MixerSection() {
  const [revealed, setRevealed] = useState(false)
  const [pressed, setPressed] = useState(false)

  const reveal = useCallback(() => {
    setPressed(true)
    // Let the key-press animation play before the gate clears.
    window.setTimeout(() => setRevealed(true), 160)
  }, [])

  // Listen for the P key page-wide (matches /mixer2). Ignore form typing.
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
    // mix-page + data-theme="dark" activates Mixer2's built-in dark theme.
    <div className="mxg-embed mix-page" data-theme="dark">
      <style>{`
        .mxg-embed { position: relative; }

        /* ─── Locked gate — contained overlay over the (dark) mixer section ─── */
        .mxg-gate {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #0a0a0a;
          z-index: 20;
          gap: 1.6rem;
          opacity: 1;
          transition:
            opacity 0.55s cubic-bezier(0.4, 0, 0.2, 1),
            transform 0.55s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .mxg-gate.mxg-gate-out {
          opacity: 0;
          transform: scale(0.86);
          pointer-events: none;
        }

        /* ─── The big "P" key — stays white, with a light drop edge on the dark gate ─── */
        .mxg-key {
          background: #fff;
          color: #0a0a0a;
          border: 2px solid #0a0a0a;
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
          cursor: none;
          position: relative;
          box-shadow:
            0 14px 0 0 rgba(245,243,238,0.5),
            0 18px 38px rgba(0,0,0,0.55);
          transition: transform 0.18s ease, box-shadow 0.18s ease;
          animation: mxgBreathe 3.4s ease-in-out infinite;
          will-change: transform, box-shadow;
        }
        .mxg-key:hover {
          transform: translateY(-3px);
          box-shadow:
            0 17px 0 0 rgba(245,243,238,0.5),
            0 22px 44px rgba(0,0,0,0.6);
        }
        .mxg-key:active,
        .mxg-key.mxg-pressed {
          transform: translateY(11px);
          box-shadow:
            0 3px 0 0 rgba(245,243,238,0.5),
            0 6px 16px rgba(0,0,0,0.4);
          transition: transform 0.06s ease, box-shadow 0.06s ease;
          animation: none;
        }
        @keyframes mxgBreathe {
          0%, 100% {
            box-shadow:
              0 14px 0 0 rgba(245,243,238,0.5),
              0 18px 38px rgba(0,0,0,0.55);
          }
          50% {
            box-shadow:
              0 14px 0 0 rgba(245,243,238,0.5),
              0 18px 38px rgba(0,0,0,0.55),
              0 0 90px rgba(0,255,99,0.45);
          }
        }
        .mxg-key:focus-visible { outline: 2px solid #00FF63; outline-offset: 8px; }

        /* ─── Hint lines ─── */
        .mxg-hint {
          font-family: 'DM Mono', monospace;
          font-size: 0.78rem;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: #f5f3ee;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 0.7rem;
        }
        .mxg-hint kbd {
          font-family: 'DM Mono', monospace;
          background: #1a1a1a;
          color: #f5f3ee;
          border: 1px solid #f5f3ee;
          padding: 3px 10px;
          font-size: 0.72rem;
          border-radius: 4px;
          font-weight: 500;
          letter-spacing: 0;
          box-shadow: 0 2px 0 0 rgba(245,243,238,0.7);
        }
        .mxg-sub {
          font-family: 'DM Mono', monospace;
          font-size: 0.6rem;
          letter-spacing: 0.32em;
          text-transform: uppercase;
          color: #f5f3ee;
          opacity: 0.55;
          margin: 0;
        }

        /* ─── Mixer fades up as the gate clears ─── */
        .mxg-stage {
          opacity: 0;
          transform: translateY(20px);
          transition:
            opacity 0.7s 0.25s cubic-bezier(0.16,1,0.3,1),
            transform 0.7s 0.25s cubic-bezier(0.16,1,0.3,1);
        }
        .mxg-stage.mxg-stage-in {
          opacity: 1;
          transform: translateY(0);
        }

        @media (prefers-reduced-motion: reduce) {
          .mxg-key { animation: none; }
          .mxg-gate, .mxg-stage { transition: opacity 0.25s; }
        }
      `}</style>

      {/* Locked gate */}
      <div className={`mxg-gate${revealed ? ' mxg-gate-out' : ''}`} aria-hidden={revealed}>
        <button
          type="button"
          className={`mxg-key${pressed ? ' mxg-pressed' : ''}`}
          onClick={reveal}
          aria-label="Press P or tap to unlock the mixer"
          disabled={revealed}
        >
          P
        </button>
        <p className="mxg-hint">Press <kbd>P</kbd> · or tap</p>
        <p className="mxg-sub">Unlock the mixer</p>
      </div>

      {/* The mixer underneath — fades up on reveal */}
      <div className={`mxg-stage${revealed ? ' mxg-stage-in' : ''}`} aria-hidden={!revealed}>
        <Mixer2 autoplay={revealed} autoplayDelay={500} />
      </div>
    </div>
  )
}
