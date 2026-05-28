'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Mixer2 from './Mixer2'
import FlickerBackground from './FlickerBackground'

// Homepage embed of the Mixer2 module. Starts gated behind the big "P" push
// button — the same unlock interaction as the standalone /mixer2 page — but the
// gate is an absolutely-positioned overlay contained within this section,
// rather than the full-viewport fixed overlay that MixGate2 uses.
//
// Audio behaviour:
//   1. The engine boots quietly + heavily lowpassed the moment the RSVP
//      ("See You There?") section first enters the viewport.
//   2. As the user scrolls toward the mixer, the lowpass opens up and the
//      volume rises — like walking toward a room with music playing.
//   3. When the P-gate is pressed, the lowpass fully opens and volume
//      ramps to 1.0 — the full mix.
export default function MixerSection() {
  const [revealed, setRevealed] = useState(false)
  const [pressed, setPressed] = useState(false)
  // Sticky — flips true the first time the user scrolls past the RSVP top edge.
  // Once true, never flips back, so the audio engine doesn't yo-yo on scroll-up.
  const [audioStarted, setAudioStarted] = useState(false)
  // Continuous 0..1 — 0 when RSVP top just enters the viewport, 1 when the
  // mixer top enters the viewport. Drives the scroll-driven crescendo.
  const [scrollProgress, setScrollProgress] = useState(0)
  const embedRef = useRef<HTMLDivElement>(null)

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

  // Scroll-driven crescendo: measure the user's scroll position between the
  // RSVP section and the mixer section, normalize to 0..1, and let the audio
  // params (volume + lowpass) interpolate from "muffled background" to "muted
  // teaser ready for P-unlock". rAF-throttled so the listener never blows up
  // the main thread.
  useEffect(() => {
    let rafId: number | null = null
    const compute = () => {
      rafId = null
      const rsvp = document.getElementById('rsvp')
      const mixer = embedRef.current
      if (!rsvp || !mixer) return
      const vh = window.innerHeight
      // scrollY value at which each section's TOP would meet the viewport bottom.
      const startScroll = rsvp.offsetTop - vh
      const endScroll = mixer.offsetTop - vh
      const range = endScroll - startScroll
      const p = range > 0 ? (window.scrollY - startScroll) / range : 0
      const clamped = Math.min(1, Math.max(0, p))
      setScrollProgress(clamped)
      if (clamped > 0) setAudioStarted(prev => prev || true)
    }
    const onScroll = () => {
      if (rafId == null) rafId = requestAnimationFrame(compute)
    }
    compute()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      if (rafId != null) cancelAnimationFrame(rafId)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  // Audio engine boots once the user crosses the RSVP top, or instantly on
  // P-press if they never scrolled there (e.g. anchor-jumped). The volume
  // ramps with scroll and the lowpass opens with scroll; both go to "full"
  // on P-press.
  const autoplay = audioStarted || revealed
  const volumeScale = revealed
    ? 1
    : (scrollProgress > 0 ? Math.max(0.04, scrollProgress * 0.16) : 0)
  // Lowpass: 280Hz at RSVP top (muffled, low-end only) → 2500Hz at mixer top
  // (mostly open) → 22kHz when revealed (effectively off).
  const lowpassFreq = revealed
    ? 22000
    : 280 + scrollProgress * 2220

  return (
    // mix-page + data-theme="dark" activates Mixer2's built-in dark theme.
    <div ref={embedRef} className="mxg-embed mix-page" data-theme="dark">
      <style>{`
        .mxg-embed { position: relative; background: #0a0a0a; }

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
          animation: mxgBreathe 2s ease-in-out infinite;
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
              0 18px 38px rgba(0,0,0,0.55),
              0 0 0px 0px rgba(0,255,99,0);
          }
          50% {
            box-shadow:
              /* The 14px "key cap" rim lights up green at the peak of the
                 breath — the bottom edge feels physically alive. */
              0 14px 0 0 rgba(0,255,99,0.85),
              0 18px 38px rgba(0,0,0,0.55),
              0 0 40px 4px rgba(0,255,99,0.27);
          }
        }
        .mxg-key:focus-visible { outline: 2px solid #00FF63; outline-offset: 8px; }

        /* The "P" character bobs gently and gives a quick wiggle every cycle so
           the key reads as alive and asks to be pressed. Wrapped in a span so
           its animation doesn't fight the button's own hover/press transforms;
           the wiggle stops the moment the user hovers or presses. */
        .mxg-key-letter {
          display: inline-block;
          animation: mxgAlive 5s ease-in-out infinite;
          transform-origin: center 60%;
          will-change: transform;
        }
        .mxg-key:hover .mxg-key-letter,
        .mxg-key:active .mxg-key-letter,
        .mxg-key.mxg-pressed .mxg-key-letter { animation: none; }
        @keyframes mxgAlive {
          0%, 40%, 80%, 100% { transform: translateY(0) rotate(0deg); }
          18% { transform: translateY(-4px) rotate(0deg); }
          84% { transform: translateY(-1px) rotate(-6deg); }
          88% { transform: translateY(-1px) rotate(6deg); }
          92% { transform: translateY(-1px) rotate(-3deg); }
          96% { transform: translateY(0) rotate(2deg); }
        }

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
          position: relative;
          z-index: 1;
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
          .mxg-key, .mxg-key-letter { animation: none; }
          .mxg-gate, .mxg-stage { transition: opacity 0.25s; }
        }
      `}</style>

      {/* Animated white flicker / analog-tape static behind the mixer */}
      <FlickerBackground />

      {/* Locked gate */}
      <div className={`mxg-gate${revealed ? ' mxg-gate-out' : ''}`} aria-hidden={revealed}>
        <button
          type="button"
          className={`mxg-key${pressed ? ' mxg-pressed' : ''}`}
          onClick={reveal}
          aria-label="Press P or tap to unlock the mixer"
          disabled={revealed}
        >
          <span className="mxg-key-letter">P</span>
        </button>
        <p className="mxg-hint">Press <kbd>P</kbd> · or tap</p>
        <p className="mxg-sub">Unlock the mixer</p>
      </div>

      {/* The mixer underneath — fades up on reveal */}
      <div className={`mxg-stage${revealed ? ' mxg-stage-in' : ''}`} aria-hidden={!revealed}>
        <Mixer2
          autoplay={autoplay}
          autoplayDelay={500}
          volumeScale={volumeScale}
          lowpassFreq={lowpassFreq}
        />
      </div>
    </div>
  )
}
