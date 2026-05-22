'use client'

import { useEffect, useRef, useState } from 'react'
import MixerSection from '@/components/MixerSection'

type FormState = 'idle' | 'submitting' | 'success' | 'error'

// ────── Phased location reveal — driven by the comms calendar ──────
// Phase 1 · 05/26 — RSVP site live + Earth / North America / United States / NYC
// Phase 2 · 05/29 — Manhattan
// Phase 3 · 06/02 — Lower East Side
// Phase 4 · 06/08 — venue revealed
// Steps above the current phase show "TBD". Add ?phase=1..4 to the URL to
// preview any stage on the feedback site.
const LOCATION_STEPS: { name: string; phase: number; final?: boolean }[] = [
  { name: 'EARTH', phase: 1 },
  { name: 'NORTH AMERICA', phase: 1 },
  { name: 'UNITED STATES', phase: 1 },
  { name: 'NEW YORK CITY', phase: 1 },
  { name: 'MANHATTAN', phase: 2 },
  { name: 'LOWER EAST SIDE', phase: 3 },
  { name: 'THE VENUE', phase: 4, final: true },
]
// The venue name is revealed on 06/08. Left blank intentionally — fill this in
// on the reveal date (the final ladder step shows "TBD" until then).
const VENUE_NAME = ''

function computePhase(): number {
  const params = new URLSearchParams(window.location.search)
  const override = params.get('phase')
  if (override) {
    const n = parseInt(override, 10)
    if (n >= 1 && n <= 4) return n
  }
  // Current date in New York, as YYYY-MM-DD (lexically comparable).
  const ny = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  let p = 1
  if (ny >= '2026-05-29') p = 2
  if (ny >= '2026-06-02') p = 3
  if (ny >= '2026-06-08') p = 4
  return p
}

export default function Home() {
  const cursorRef = useRef<HTMLDivElement>(null)
  const submitRef = useRef<HTMLButtonElement>(null)
  const [waiverChecked, setWaiverChecked] = useState(false)
  const [formState, setFormState] = useState<FormState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  // Default to phase 1 (launch state) for SSR; the real phase is set on mount.
  const [phase, setPhase] = useState(1)
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
  })

  // ────── Resolve the live reveal phase (date- or query-driven) ──────
  useEffect(() => {
    setPhase(computePhase())
  }, [])

  // ────── Cursor follow + idle pulse ──────
  useEffect(() => {
    const cursor = cursorRef.current
    if (!cursor) return
    let idleTimer: ReturnType<typeof setTimeout>
    const move = (e: MouseEvent) => {
      cursor.style.left = e.clientX + 'px'
      cursor.style.top = e.clientY + 'px'
      cursor.classList.remove('idle')
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => cursor.classList.add('idle'), 600)
    }
    document.addEventListener('mousemove', move)
    const hoverEls = document.querySelectorAll('a, button, input, .waiver-row, .dress-tile')
    const expand = () => cursor.classList.add('expanded')
    const shrink = () => cursor.classList.remove('expanded')
    hoverEls.forEach(el => {
      el.addEventListener('mouseenter', expand)
      el.addEventListener('mouseleave', shrink)
    })
    return () => {
      document.removeEventListener('mousemove', move)
      hoverEls.forEach(el => {
        el.removeEventListener('mouseenter', expand)
        el.removeEventListener('mouseleave', shrink)
      })
      clearTimeout(idleTimer)
    }
  }, [])

  // ────── Scroll reveal ──────
  useEffect(() => {
    const reveals = document.querySelectorAll('.reveal')
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible') }),
      { threshold: 0.15 }
    )
    reveals.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  // ────── Location ladder scroll-spy (active = currently centered in viewport) ──────
  useEffect(() => {
    const steps = document.querySelectorAll<HTMLElement>('.loc-step')
    if (!steps.length) return
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) e.target.classList.add('lit')
      }),
      { rootMargin: '-40% 0px -40% 0px', threshold: 0 }
    )
    steps.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [phase])

  // ────── Magnetic submit button ──────
  useEffect(() => {
    const btn = submitRef.current
    if (!btn) return
    const STRENGTH = 0.25
    const onMove = (e: MouseEvent) => {
      const r = btn.getBoundingClientRect()
      const dx = e.clientX - (r.left + r.width / 2)
      const dy = e.clientY - (r.top + r.height / 2)
      btn.style.transform = `translate(${dx * STRENGTH}px, ${dy * STRENGTH}px)`
    }
    const reset = () => { btn.style.transform = '' }
    btn.addEventListener('mousemove', onMove)
    btn.addEventListener('mouseleave', reset)
    return () => {
      btn.removeEventListener('mousemove', onMove)
      btn.removeEventListener('mouseleave', reset)
    }
  }, [formState])

  // ────── Date "06.09" scramble on view ──────
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('[data-scramble]')
    const chars = '0123456789'
    const runScramble = (el: HTMLElement) => {
      const final = el.dataset.scramble || el.textContent || ''
      const len = final.length
      let frame = 0
      const totalFrames = 22
      const tick = () => {
        let out = ''
        for (let i = 0; i < len; i++) {
          const reveal = frame / totalFrames > i / len
          const ch = final[i]
          out += reveal || !/[0-9]/.test(ch) ? ch : chars[Math.floor(Math.random() * chars.length)]
        }
        el.textContent = out
        frame++
        if (frame <= totalFrames + 2) requestAnimationFrame(tick)
        else el.textContent = final
      }
      tick()
    }
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) {
          runScramble(e.target as HTMLElement)
          observer.unobserve(e.target)
        }
      }),
      { threshold: 0.6 }
    )
    els.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  // Cursor-parallax on hero. Maps mouse position over #hero to CSS vars --mx/--my on the
  // logo mark so it drifts subtly with the cursor. Lerps via rAF for an organic settle.
  useEffect(() => {
    const hero = document.getElementById('hero')
    if (!hero) return
    const spans = hero.querySelectorAll<HTMLElement>('.hero-mark img')
    if (!spans.length) return

    let targetX = 0, targetY = 0, currentX = 0, currentY = 0
    let rafId = 0

    const onMove = (e: MouseEvent) => {
      const rect = hero.getBoundingClientRect()
      targetX = (e.clientX - rect.left) / rect.width - 0.5  // -0.5..+0.5
      targetY = (e.clientY - rect.top) / rect.height - 0.5
    }
    const onLeave = () => { targetX = 0; targetY = 0 }

    const tick = () => {
      currentX += (targetX - currentX) * 0.08
      currentY += (targetY - currentY) * 0.08
      spans.forEach((span) => {
        const depth = 12
        span.style.setProperty('--mx', `${currentX * depth}px`)
        span.style.setProperty('--my', `${currentY * depth}px`)
      })
      rafId = requestAnimationFrame(tick)
    }

    hero.addEventListener('mousemove', onMove)
    hero.addEventListener('mouseleave', onLeave)
    rafId = requestAnimationFrame(tick)
    return () => {
      hero.removeEventListener('mousemove', onMove)
      hero.removeEventListener('mouseleave', onLeave)
      cancelAnimationFrame(rafId)
    }
  }, [])

  // Scroll-driven proximity scale on the location ladder. Each .loc-step element scales up
  // and brightens as it passes through viewport center, scales back down past it.
  useEffect(() => {
    const steps = document.querySelectorAll<HTMLElement>('.loc-step')
    if (!steps.length) return
    let rafId = 0

    const tick = () => {
      const vh = window.innerHeight
      const center = vh / 2
      steps.forEach(step => {
        const rect = step.getBoundingClientRect()
        if (rect.bottom < -100 || rect.top > vh + 100) {
          step.style.setProperty('--prox', '1')
          return
        }
        const stepCenter = rect.top + rect.height / 2
        const distance = Math.abs(stepCenter - center)
        const normalized = Math.min(1, distance / (vh * 0.45))
        const scale = 1 + (1 - normalized) * 0.12 // 1.0 (far) → 1.12 (center)
        step.style.setProperty('--prox', scale.toFixed(3))
      })
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [phase])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!waiverChecked) {
      setFormState('error')
      setErrorMsg('Please accept the photo & video release to continue.')
      return
    }
    setFormState('submitting')
    setErrorMsg('')

    try {
      const res = await fetch('/api/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, photoWaiver: waiverChecked }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Something went wrong')
      setFormState('success')
    } catch (err: unknown) {
      setFormState('error')
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }

  const disabled = formState === 'submitting' || formState === 'success'

  const marqueeItems = [
    'D5XX', '·', '20 YEARS OF DROGA5', '·', 'JUNE 9', '·', 'NYC', '·',
    '7PM — LATE', '·', 'INVITATION ONLY', '·', 'CELEBRATE WITH A MUSIC NIGHT TO REMEMBER', '·',
  ]

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --green: #00FF63;
          --green-deep: #00cc4f;
          --green-soft: rgba(0,255,99,0.5);
          --black: #0a0a0a;
          --white: #f5f3ee;
          --gray-light: #e8e6e1;
          --gray-mid: #888;
          --gray-dim: rgba(245,243,238,0.4);
          --rule-dark: rgba(245,243,238,0.14);
          --rule-light: rgba(10,10,10,0.18);
          --ink-dim: rgba(10,10,10,0.55);
        }

        html { scroll-behavior: smooth; }
        body {
          background: var(--black);
          color: var(--white);
          font-family: 'DM Mono', monospace;
          font-weight: 400;
          overflow-x: hidden;
          cursor: none;
        }
        ::selection { background: var(--green); color: var(--black); }

        /* ───────── CURSOR ───────── */
        .cursor {
          position: fixed;
          width: 8px; height: 8px;
          background: var(--green);
          border-radius: 50%;
          pointer-events: none;
          z-index: 9999;
          transform: translate(-50%, -50%);
          transition: width 0.25s, height 0.25s, background 0.25s;
          mix-blend-mode: difference;
        }
        .cursor.expanded { width: 36px; height: 36px; background: var(--white); }
        .cursor.idle { animation: cursorPulse 1.8s ease-in-out infinite; }
        @keyframes cursorPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(0,255,99,0.6); }
          50%      { box-shadow: 0 0 0 10px rgba(0,255,99,0); }
        }

        /* ───────── TYPE ───────── */
        .mono-label {
          font-family: 'DM Mono', monospace;
          font-size: 0.65rem;
          letter-spacing: 0.22em;
          text-transform: uppercase;
        }

        /* ───────── TOP NEON STRIP ───────── */
        .topbar {
          position: sticky;
          top: 0;
          z-index: 100;
          background: var(--green);
          color: var(--black);
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.7rem 1.5rem;
          font-family: 'DM Mono', monospace;
          font-size: 0.7rem;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          overflow: hidden;
        }
        .topbar::before {
          /* scanning gleam */
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.45) 50%, transparent 100%);
          transform: translateX(-100%);
          animation: gleam 6s linear infinite;
          pointer-events: none;
        }
        @keyframes gleam {
          0% { transform: translateX(-100%); }
          60% { transform: translateX(120%); }
          100% { transform: translateX(120%); }
        }
        .topbar a {
          color: var(--black);
          text-decoration: none;
          cursor: none;
          position: relative;
          z-index: 1;
          transition: opacity 0.2s;
        }
        .topbar a:hover { opacity: 0.65; }

        /* ───────── HERO ───────── */
        .hero {
          background: var(--black);
          color: var(--white);
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;
          padding: 2.5rem 2.5rem 3rem;
          min-height: calc(100vh - 2.6rem);
          position: relative;
        }
        .hero-left {
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .hero-mark { display: block; }
        .hero-mark img {
          display: block;
          width: clamp(240px, 40vw, 560px);
          height: auto;
          opacity: 0;
          filter: blur(18px);
          transform: translateX(-40px);
          animation: heroIn 1.1s 0.15s cubic-bezier(0.18, 0.9, 0.2, 1) forwards;
        }
        @keyframes heroIn {
          to {
            opacity: 1;
            filter: blur(0);
            /* End state uses --mx/--my so cursor parallax composes with the reveal */
            transform: translate(var(--mx, 0px), var(--my, 0px));
          }
        }

        .hero-right {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding-top: 0.5rem;
        }
        .hero-eyebrow, .hero-footer {
          font-family: 'Archivo Black', 'Bowlby One', sans-serif;
          font-size: clamp(28px, 4.2vw, 64px);
          line-height: 0.95;
          letter-spacing: -0.015em;
          transform: scaleX(1.1);
          transform-origin: left center;
          color: var(--white);
          opacity: 0;
          animation: fadeUp 0.8s 0.7s cubic-bezier(0.18, 0.9, 0.2, 1) forwards;
        }
        .hero-footer { align-self: flex-end; animation-delay: 0.95s; }
        .hero-tagline {
          font-family: 'DM Mono', monospace;
          font-size: 0.75rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--green);
          margin: 3rem 0;
          max-width: 32ch;
          opacity: 0;
          animation: fadeUp 0.7s 0.85s cubic-bezier(0.18, 0.9, 0.2, 1) forwards;
          position: relative;
        }
        .hero-tagline::before {
          content: '';
          position: absolute;
          top: 50%;
          left: -2.5rem;
          width: 1.5rem; height: 1px;
          background: var(--green);
          transform-origin: left;
          animation: lineDraw 0.6s 1.2s cubic-bezier(0.18, 0.9, 0.2, 1) forwards;
          transform: scaleX(0);
        }
        @keyframes lineDraw { to { transform: scaleX(1); } }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* ───────── MARQUEE ───────── */
        .marquee {
          background: var(--black);
          border-top: 1px solid var(--rule-dark);
          border-bottom: 1px solid var(--rule-dark);
          padding: 0.85rem 0;
          overflow: hidden;
          white-space: nowrap;
        }
        .marquee-track {
          display: inline-flex;
          gap: 2.5rem;
          padding-right: 2.5rem;
          animation: marquee 36s linear infinite;
          font-family: 'DM Mono', monospace;
          font-size: 0.7rem;
          letter-spacing: 0.24em;
          text-transform: uppercase;
          color: var(--white);
        }
        .marquee-track span.dim { color: var(--green); opacity: 0.85; }
        @keyframes marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }

        /* ───────── SHARED: section background watermark ───────── */
        .bg-marks {
          position: absolute;
          inset: 0;
          pointer-events: none;
          font-family: 'Archivo Black', sans-serif;
          font-size: clamp(200px, 30vw, 420px);
          color: transparent;
          white-space: nowrap;
          letter-spacing: -0.02em;
          top: 8%;
          left: -4%;
          line-height: 1;
          transform: scaleX(1.1);
          transform-origin: left center;
          animation: drift 40s linear infinite;
        }
        .rsvp .bg-marks, .dress .bg-marks { -webkit-text-stroke: 1px rgba(10,10,10,0.06); }
        .event .bg-marks { -webkit-text-stroke: 1px rgba(245,243,238,0.06); }
        @keyframes drift {
          from { transform: scaleX(1.1) translateX(0); }
          to   { transform: scaleX(1.1) translateX(-12%); }
        }

        /* ───────── RSVP — "SEE YOU THERE?" (light) ───────── */
        .rsvp {
          background: var(--gray-light);
          color: var(--black);
          padding: 5.5rem 2.5rem 6rem;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 3rem 4rem;
          position: relative;
          overflow: hidden;
        }
        .rsvp-left, .rsvp-right,
        .event-left, .event-right { position: relative; z-index: 1; }

        .rsvp-left { display: flex; align-items: center; }
        .rsvp-headline {
          font-family: 'Archivo Black', sans-serif;
          /* Sized so "SEE YOU" stays on one line — two-line lockup, per Figma. */
          font-size: clamp(54px, 9.5vw, 172px);
          line-height: 0.84;
          letter-spacing: -0.02em;
          color: var(--black);
        }

        .rsvp-right { display: flex; flex-direction: column; justify-content: center; }

        /* The form is a dark card with a green outline, sitting on the light section. */
        .rsvp-form {
          border: 1.5px solid var(--green);
          background: var(--black);
        }
        .field-wrap {
          padding: 1.15rem 1.3rem 1.25rem;
          border-bottom: 1px solid var(--green);
          background: transparent;
          transition: background 0.3s;
          position: relative;
        }
        .field-wrap::after {
          content: '';
          position: absolute;
          left: 0; bottom: -1px;
          width: 0; height: 2px;
          background: var(--green);
          transition: width 0.45s cubic-bezier(0.16,1,0.3,1);
        }
        .field-wrap:focus-within { background: rgba(0,255,99,0.06); }
        .field-wrap:focus-within::after { width: 100%; }
        .field-label {
          font-family: 'DM Mono', monospace;
          font-size: 0.55rem;
          letter-spacing: 0.24em;
          text-transform: uppercase;
          color: var(--gray-dim);
          display: block;
          margin-bottom: 0.45rem;
        }
        .field-wrap input {
          width: 100%;
          background: transparent;
          border: none;
          outline: none;
          font-family: 'DM Mono', monospace;
          font-size: 1.05rem;
          color: var(--white);
          padding: 0;
          cursor: none;
          caret-color: var(--green);
        }
        .field-wrap input::placeholder { color: rgba(245,243,238,0.28); }
        .field-wrap input:disabled { opacity: 0.5; }

        .waiver-row {
          padding: 1.25rem 1.3rem 1.35rem;
          display: flex;
          gap: 0.9rem;
          align-items: flex-start;
          cursor: pointer;
          transition: background 0.3s;
        }
        .waiver-row:hover { background: rgba(0,255,99,0.05); }
        .waiver-checkbox {
          width: 15px; height: 15px;
          border: 1px solid var(--green);
          background: transparent;
          flex-shrink: 0;
          margin-top: 3px;
          transition: background 0.18s, transform 0.18s;
          position: relative;
        }
        .waiver-checkbox.checked { background: var(--green); transform: scale(1.05); }
        .waiver-checkbox.checked::after {
          content: '';
          position: absolute;
          inset: 2px;
          background: var(--green);
          animation: pop 0.4s cubic-bezier(0.16,1,0.3,1);
        }
        @keyframes pop {
          0%   { transform: scale(0); }
          60%  { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
        .waiver-text {
          font-family: 'DM Mono', monospace;
          font-size: 0.62rem;
          line-height: 1.65;
          letter-spacing: 0.04em;
          color: var(--gray-dim);
          text-transform: uppercase;
        }
        .waiver-text strong { color: var(--green); font-weight: 500; }
        .waiver-text a {
          color: var(--white);
          text-decoration: underline;
          text-underline-offset: 3px;
        }

        .rsvp-submit {
          margin-top: 0.9rem;
          width: 100%;
          background: var(--green);
          color: var(--black);
          font-family: 'DM Mono', monospace;
          font-size: 0.7rem;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          padding: 1.1rem 1.2rem;
          border: 1px solid var(--green);
          cursor: none;
          display: flex;
          align-items: center;
          justify-content: space-between;
          transition: background 0.25s, color 0.25s, transform 0.18s ease-out;
          will-change: transform;
        }
        .rsvp-submit:hover:not(:disabled) { background: var(--black); color: var(--green); }
        .rsvp-submit:disabled { opacity: 0.55; cursor: not-allowed; }
        .rsvp-submit .arrow { font-size: 1.1rem; transition: transform 0.25s; }
        .rsvp-submit:hover:not(:disabled) .arrow { transform: translateX(6px); }

        .form-msg {
          padding: 1rem 1.15rem;
          font-family: 'DM Mono', monospace;
          font-size: 0.68rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-top: 0.9rem;
          animation: fadeUp 0.4s cubic-bezier(0.16,1,0.3,1);
        }
        .form-msg.success { border: 1px solid var(--green-deep); color: var(--green-deep); }
        .form-msg.error { border: 1px solid #d63b3b; color: #d63b3b; }

        /* ───────── THE EVENT (dark) ───────── */
        .event {
          background: var(--black);
          color: var(--white);
          padding: 5.5rem 2.5rem 6rem;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 3rem 4rem;
          position: relative;
          overflow: hidden;
        }
        .event-left { display: flex; flex-direction: column; justify-content: center; }
        .event-headline {
          font-family: 'Archivo Black', sans-serif;
          font-size: clamp(48px, 6.5vw, 104px);
          line-height: 0.92;
          letter-spacing: -0.015em;
          color: var(--white);
          transform: scaleX(1.08);
          transform-origin: left center;
          margin-bottom: 1.6rem;
        }
        .event-body {
          font-family: 'DM Mono', monospace;
          font-size: 0.78rem;
          line-height: 1.75;
          color: var(--gray-dim);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          max-width: 44ch;
        }
        .event-right {
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 2.4rem;
        }
        .event-detail .label {
          font-family: 'DM Mono', monospace;
          font-size: 0.62rem;
          letter-spacing: 0.24em;
          text-transform: uppercase;
          color: var(--gray-dim);
          margin-bottom: 0.5rem;
        }
        .event-detail .value {
          font-family: 'Archivo Black', sans-serif;
          font-size: clamp(40px, 5.4vw, 84px);
          letter-spacing: -0.01em;
          line-height: 1;
          color: var(--white);
          transform: scaleX(1.08);
          transform-origin: left center;
        }
        .event-detail .value.tbd { color: var(--gray-dim); }

        /* ───────── LOCATION LADDER ───────── */
        .location {
          background: var(--gray-light);
          color: var(--black);
          padding: 6rem 2.5rem 8rem;
          border-top: 1px solid var(--rule-light);
        }
        .location-label {
          color: var(--green-deep);
          margin-bottom: 0.9rem;
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .location-label::before {
          content: ''; width: 32px; height: 1px; background: var(--green-deep);
        }
        .location-note {
          font-family: 'DM Mono', monospace;
          font-size: 0.62rem;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--ink-dim);
          margin-bottom: 2.5rem;
        }
        .location-ladder {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }
        .loc-step {
          font-family: 'Archivo Black', sans-serif;
          letter-spacing: -0.015em;
          line-height: 0.95;
          color: rgba(10,10,10,0.32);
          transform: scaleX(1.1);
          transform-origin: left center;
          transition: color 0.5s cubic-bezier(0.16,1,0.3,1), opacity 0.5s, letter-spacing 0.5s;
          position: relative;
        }
        .loc-step::before {
          content: '';
          position: absolute;
          left: -2rem;
          top: 50%;
          width: 0;
          height: 1px;
          background: var(--green-deep);
          transition: width 0.5s cubic-bezier(0.16,1,0.3,1);
        }
        .loc-step.lit { color: var(--black); }
        .loc-step.lit::before { width: 1.5rem; }
        .loc-step:nth-child(1) { font-size: clamp(28px, 3.2vw, 48px); }
        .loc-step:nth-child(2) { font-size: clamp(32px, 3.8vw, 56px); }
        .loc-step:nth-child(3) { font-size: clamp(36px, 4.4vw, 64px); }
        .loc-step:nth-child(4) { font-size: clamp(40px, 5vw, 72px); }
        .loc-step:nth-child(5) { font-size: clamp(48px, 5.8vw, 84px); }
        .loc-step:nth-child(6) { font-size: clamp(54px, 6.6vw, 96px); }
        .loc-step.final {
          font-size: clamp(56px, 7vw, 110px);
          color: var(--green-deep);
          margin-top: 0.8rem;
          line-height: 1;
        }
        .loc-step.final.lit { letter-spacing: 0em; }
        /* Locked steps — show "TBD" until their reveal phase. */
        .loc-step.locked { color: rgba(10,10,10,0.26); }
        .loc-step.locked.lit { color: rgba(10,10,10,0.26); }
        .loc-step.final.locked { color: rgba(0,204,79,0.42); }

        /* ───────── DRESS INSPO ───────── */
        .dress {
          background: var(--gray-light);
          color: var(--black);
          padding: 5rem 2.5rem 6rem;
          position: relative;
          overflow: hidden;
        }
        .dress-headline {
          font-family: 'Archivo Black', sans-serif;
          font-size: clamp(40px, 5vw, 72px);
          line-height: 0.95;
          letter-spacing: -0.015em;
          transform: scaleX(1.1);
          transform-origin: left center;
          position: relative;
          z-index: 1;
          margin-bottom: 2.5rem;
        }
        .dress-grid {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.8rem;
        }
        .dress-tile {
          aspect-ratio: 1 / 1;
          position: relative;
          overflow: hidden;
          background: #d6d3cd;
          cursor: none;
        }
        .dress-tile img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transform: scale(1.02);
          transition: transform 0.7s cubic-bezier(0.16,1,0.3,1),
                      filter 0.6s cubic-bezier(0.16,1,0.3,1);
        }
        .dress-tile:hover img {
          transform: scale(1.07);
          filter: brightness(1.05);
        }

        /* ───────── FOOTER ───────── */
        footer {
          background: var(--black);
          border-top: 1px solid var(--rule-dark);
          padding: 2.5rem 2.5rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .footer-logo {
          font-family: 'Archivo Black', sans-serif;
          font-size: 2rem;
          letter-spacing: -0.01em;
          color: rgba(245,243,238,0.18);
          transform: scaleX(1.1);
          transform-origin: left center;
        }
        .footer-copy {
          font-family: 'DM Mono', monospace;
          font-size: 0.6rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--gray-mid);
        }

        /* ───────── REVEAL ───────── */
        .reveal {
          opacity: 0;
          transform: translateY(28px);
          transition:
            opacity 0.75s cubic-bezier(0.16,1,0.3,1),
            transform 0.75s cubic-bezier(0.16,1,0.3,1);
        }
        .reveal.visible { opacity: 1; transform: translateY(0); }
        /* Location ladder: after reveal, transform composes scaleX(1.1) with the JS-driven
           proximity scale (--prox). Higher specificity than plain .reveal.visible so this wins. */
        .loc-step.reveal.visible {
          transform: scaleX(1.1) scale(var(--prox, 1));
        }
        .reveal-d1 { transition-delay: 0.06s; }
        .reveal-d2 { transition-delay: 0.12s; }
        .reveal-d3 { transition-delay: 0.2s; }
        .reveal-d4 { transition-delay: 0.28s; }
        .reveal-d5 { transition-delay: 0.36s; }
        .reveal-d6 { transition-delay: 0.44s; }
        .reveal-d7 { transition-delay: 0.52s; }

        /* ───────── RESPONSIVE ───────── */
        @media (max-width: 900px) {
          .hero { grid-template-columns: 1fr; padding: 2rem 1.25rem 3rem; }
          .hero-right { padding-top: 1.5rem; }
          .rsvp, .event {
            grid-template-columns: 1fr;
            gap: 2.5rem;
            padding: 3.5rem 1.25rem 4.5rem;
          }
          .rsvp-headline { font-size: clamp(64px, 17vw, 130px); }
          .dress { padding: 3.5rem 1.25rem 4.5rem; }
          .dress-grid { grid-template-columns: repeat(2, 1fr); }
          .location { padding: 4rem 1.25rem 5rem; }
          .topbar { padding: 0.6rem 1.25rem; font-size: 0.6rem; }
          footer { flex-direction: column; gap: 1rem; align-items: flex-start; padding: 2rem 1.25rem; }
        }
        @media (max-width: 480px) {
          body { cursor: auto; }
          .cursor { display: none; }
          input, button, a, .waiver-row { cursor: auto !important; }
          .rsvp-submit { cursor: pointer !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
          .marquee-track { animation: none; }
        }
      `}</style>

      <div className="cursor" ref={cursorRef} />

      {/* TOP NEON STRIP */}
      <header className="topbar">
        <a href="#hero">DROGA5</a>
        <a href="#rsvp">RSVP</a>
      </header>

      {/* HERO */}
      <section id="hero" className="hero">
        <div className="hero-left">
          <h1 className="hero-mark">
            <img src="/d5xx-logo.png" alt="D5XX" />
          </h1>
        </div>
        <div className="hero-right">
          <p className="hero-eyebrow">20 YEARS<br />OF DROGA5</p>
          <p className="hero-tagline">Celebrate with a music night to remember</p>
          <p className="hero-footer">20 YEARS<br />OF DROGA5</p>
        </div>
      </section>

      {/* MARQUEE */}
      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {[...Array(2)].map((_, copy) => (
            marqueeItems.map((item, i) => (
              <span key={`${copy}-${i}`} className={item === '·' ? 'dim' : ''}>{item}</span>
            ))
          ))}
        </div>
      </div>

      {/* RSVP — SEE YOU THERE? (headline left · form right) */}
      <section id="rsvp" className="rsvp">
        <div className="bg-marks" aria-hidden="true">D5XX D5XX</div>

        <div className="rsvp-left">
          <h2 className="rsvp-headline reveal">SEE YOU<br />THERE?</h2>
        </div>

        <div className="rsvp-right">
          <form onSubmit={handleSubmit} noValidate>
            <div className="rsvp-form reveal">
              <div className="field-wrap">
                <label className="field-label" htmlFor="firstName">First Name</label>
                <input
                  type="text" id="firstName" name="firstName"
                  placeholder="David" required
                  value={form.firstName} onChange={handleChange} disabled={disabled}
                />
              </div>
              <div className="field-wrap">
                <label className="field-label" htmlFor="lastName">Last Name</label>
                <input
                  type="text" id="lastName" name="lastName"
                  placeholder="Droga" required
                  value={form.lastName} onChange={handleChange} disabled={disabled}
                />
              </div>
              <div className="field-wrap">
                <label className="field-label" htmlFor="email">Email Address</label>
                <input
                  type="email" id="email" name="email"
                  placeholder="you@email.com" required
                  value={form.email} onChange={handleChange} disabled={disabled}
                />
              </div>

              {/* Photo & video release. Terms copy pending Dan S. confirmation. */}
              <div
                className="waiver-row"
                onClick={() => { if (!disabled) setWaiverChecked(v => !v) }}
                role="checkbox"
                aria-checked={waiverChecked}
                tabIndex={0}
                onKeyDown={(e) => {
                  if ((e.key === ' ' || e.key === 'Enter') && !disabled) {
                    e.preventDefault()
                    setWaiverChecked(v => !v)
                  }
                }}
              >
                <div className={`waiver-checkbox${waiverChecked ? ' checked' : ''}`} />
                <p className="waiver-text">
                  <strong>PHOTO &amp; VIDEO RELEASE:</strong> By checking this box,
                  I consent to being photographed and/or filmed at D5XX on June 9
                  and grant Droga5 the right to use such images and recordings for
                  internal communications, archival, and social purposes.{' '}
                  <a href="/terms" target="_blank" rel="noreferrer">Read full terms</a>.
                </p>
              </div>
            </div>

            {formState !== 'success' && (
              <button
                ref={submitRef}
                type="submit"
                className="rsvp-submit reveal reveal-d1"
                disabled={disabled}
              >
                <span>{formState === 'submitting' ? 'Sending…' : 'Confirm Attendance'}</span>
                <span className="arrow">{formState === 'submitting' ? '…' : '→'}</span>
              </button>
            )}

            {formState === 'error' && (
              <div className="form-msg error">⚠ &nbsp;{errorMsg}</div>
            )}
            {formState === 'success' && (
              <div className="form-msg success">
                ✓ &nbsp;You&apos;re on the list, {form.firstName}. Check your inbox.
              </div>
            )}
          </form>
        </div>
      </section>

      {/* THE EVENT — copy left · date/location/time right */}
      <section id="event" className="event">
        <div className="bg-marks" aria-hidden="true">D5XX D5XX</div>

        <div className="event-left">
          <h2 className="event-headline reveal">THE EVENT</h2>
          <p className="event-body reveal reveal-d1">
            Twenty years of making it matter. An invitation-only evening
            celebrating the decades of work, people, and the ideas that defined
            a generation of creativity. Past and present Drogans, clients, and
            collaborators — together for one night.
          </p>
        </div>

        <div className="event-right">
          <div className="event-detail reveal reveal-d2">
            <p className="label">Date</p>
            <p className="value" data-scramble="06.09">06.09</p>
          </div>
          <div className="event-detail reveal reveal-d3">
            <p className="label">Time</p>
            <p className="value">7PM — LATE</p>
          </div>
        </div>
      </section>

      {/* PHASED LOCATION REVEAL */}
      <section id="location" className="location">
        <p className="mono-label location-label reveal">You are here</p>
        <p className="location-note reveal reveal-d1">
          Location unlocks in stages — final venue revealed soon.
        </p>
        <div className="location-ladder">
          {LOCATION_STEPS.map((step, i) => {
            const unlocked = phase >= step.phase
            const revealed = unlocked && (!step.final || Boolean(VENUE_NAME))
            const text = revealed
              ? (step.final ? VENUE_NAME : step.name)
              : 'TBD'
            return (
              <div
                key={step.name}
                className={
                  `loc-step reveal reveal-d${i}` +
                  (step.final ? ' final' : '') +
                  (revealed ? '' : ' locked')
                }
              >
                {text}
              </div>
            )
          })}
        </div>
      </section>

      {/* MIXER — interactive music module, gated behind the P push button */}
      <MixerSection />

      {/* DRESS INSPO */}
      <section id="dress" className="dress">
        <div className="bg-marks" aria-hidden="true">D5XX D5XX</div>
        <h2 className="dress-headline reveal">DRESS INSPO</h2>
        <div className="dress-grid">
          {[1, 2, 3, 4].map((n, i) => (
            <div key={n} className={`dress-tile reveal reveal-d${i + 1}`}>
              <img src={`/lookbook/${n}.jpg`} alt={`Dress inspo ${n}`} loading="lazy" />
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="footer-logo">DROGA5</div>
        <p className="footer-copy">D5XX &nbsp;·&nbsp; 2006—2026 &nbsp;·&nbsp; New York</p>
      </footer>
    </>
  )
}
