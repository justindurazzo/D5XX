'use client'

import { useEffect, useRef, useState } from 'react'

type FormState = 'idle' | 'submitting' | 'success' | 'error'

export default function Home() {
  const cursorRef = useRef<HTMLDivElement>(null)
  const submitRef = useRef<HTMLButtonElement>(null)
  const [waiverChecked, setWaiverChecked] = useState(false)
  const [formState, setFormState] = useState<FormState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  })

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

  // Cursor-parallax on hero. Maps mouse position over #hero to CSS vars --mx/--my on each
  // .hero-stack span. Each row gets a different depth (3/6/9px max) so the type reads as
  // layered, not a flat poster. Lerps via rAF for organic settle.
  useEffect(() => {
    const hero = document.getElementById('hero')
    if (!hero) return
    const spans = hero.querySelectorAll<HTMLElement>('.hero-stack span')
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
      spans.forEach((span, i) => {
        const depth = (i + 1) * 6  // row 1: 6px max, row 2: 12px, row 3: 18px
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


  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!waiverChecked) {
      setFormState('error')
      setErrorMsg('Please accept the photo & film release to continue.')
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
          --rule-light: rgba(10,10,10,0.14);
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
          justify-content: flex-start;
        }
        .hero-stack {
          font-family: 'Archivo Black', 'Bowlby One', sans-serif;
          font-size: clamp(96px, 22vw, 320px);
          line-height: 0.82;
          letter-spacing: -0.025em;
          display: flex;
          flex-direction: column;
          color: var(--white);
        }
        .hero-stack span {
          display: block;
          transform: scaleX(1.15) translateX(-40px);
          transform-origin: left center;
          opacity: 0;
          filter: blur(18px);
          animation: heroIn 1.05s cubic-bezier(0.18, 0.9, 0.2, 1) forwards;
        }
        .hero-stack span:nth-child(1) { animation-delay: 0.1s; }
        .hero-stack span:nth-child(2) { animation-delay: 0.28s; }
        .hero-stack span:nth-child(3) { animation-delay: 0.46s; }
        @keyframes heroIn {
          to {
            opacity: 1;
            filter: blur(0);
            /* End state uses --mx/--my so cursor parallax composes with the reveal */
            transform: scaleX(1.15) translate(var(--mx, 0px), var(--my, 0px));
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
          animation: marquee 32s linear infinite;
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

        /* ───────── EVENT ───────── */
        .event {
          background: var(--gray-light);
          color: var(--black);
          padding: 5rem 2.5rem 6rem;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 3rem;
          position: relative;
          overflow: hidden;
        }
        .event-bg-marks {
          position: absolute;
          inset: 0;
          pointer-events: none;
          font-family: 'Archivo Black', sans-serif;
          font-size: clamp(200px, 30vw, 420px);
          color: transparent;
          -webkit-text-stroke: 1px rgba(10,10,10,0.06);
          white-space: nowrap;
          letter-spacing: -0.02em;
          top: 8%;
          left: -4%;
          line-height: 1;
          transform: scaleX(1.1);
          transform-origin: left center;
          animation: drift 40s linear infinite;
        }
        @keyframes drift {
          from { transform: scaleX(1.1) translateX(0); }
          to   { transform: scaleX(1.1) translateX(-12%); }
        }
        .event-left, .event-right { position: relative; z-index: 1; }
        .event-headline {
          font-family: 'Archivo Black', sans-serif;
          font-size: clamp(40px, 5vw, 72px);
          line-height: 0.95;
          letter-spacing: -0.015em;
          transform: scaleX(1.1);
          transform-origin: left center;
          margin-bottom: 1.5rem;
        }
        .event-body {
          font-family: 'DM Mono', monospace;
          font-size: 0.78rem;
          line-height: 1.7;
          color: var(--black);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          max-width: 40ch;
        }
        .event-right { display: flex; flex-direction: column; gap: 2rem; }
        .event-detail .label {
          font-family: 'DM Mono', monospace;
          font-size: 0.65rem;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--black);
          opacity: 0.55;
          margin-bottom: 0.5rem;
        }
        .event-detail .value {
          font-family: 'Archivo Black', sans-serif;
          font-size: clamp(36px, 4.5vw, 64px);
          letter-spacing: -0.01em;
          line-height: 1;
          transform: scaleX(1.1);
          transform-origin: left center;
          color: var(--black);
        }

        /* ───────── LOCATION LADDER ───────── */
        .location {
          background: var(--black);
          color: var(--white);
          padding: 6rem 2.5rem 8rem;
          border-top: 1px solid var(--rule-dark);
        }
        .location-label {
          color: var(--green);
          margin-bottom: 2.5rem;
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .location-label::before {
          content: ''; width: 32px; height: 1px; background: var(--green);
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
          color: var(--gray-dim);
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
          background: var(--green);
          transition: width 0.5s cubic-bezier(0.16,1,0.3,1);
        }
        .loc-step.lit { color: var(--white); }
        .loc-step.lit::before { width: 1.5rem; }
        .loc-step:nth-child(1) { font-size: clamp(28px, 3.2vw, 48px); }
        .loc-step:nth-child(2) { font-size: clamp(32px, 3.8vw, 56px); }
        .loc-step:nth-child(3) { font-size: clamp(36px, 4.4vw, 64px); }
        .loc-step:nth-child(4) { font-size: clamp(40px, 5vw, 72px); }
        .loc-step:nth-child(5) { font-size: clamp(48px, 5.8vw, 84px); }
        .loc-step:nth-child(6) { font-size: clamp(54px, 6.6vw, 96px); }
        .loc-step:nth-child(7) { font-size: clamp(64px, 7.6vw, 112px); color: var(--white); }
        .loc-step.final {
          font-size: clamp(56px, 7vw, 110px);
          color: var(--green);
          margin-top: 0.8rem;
          line-height: 1;
        }
        .loc-step.final.lit { letter-spacing: 0em; }
        /* Phase 1.5 hook: tie .lit to date-based active step instead of scroll position. */

        /* ───────── RSVP ───────── */
        .rsvp {
          background: var(--black);
          color: var(--white);
          padding: 5rem 2.5rem 7rem;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 3rem;
          border-top: 1px solid var(--rule-dark);
        }
        .rsvp-left { display: flex; align-items: flex-start; }
        .rsvp-headline {
          font-family: 'Archivo Black', sans-serif;
          font-size: clamp(80px, 14vw, 220px);
          line-height: 0.85;
          letter-spacing: -0.02em;
          color: var(--white);
          transform: scaleX(1.15);
          transform-origin: left center;
        }
        .rsvp-right {
          display: flex;
          flex-direction: column;
          gap: 0;
        }
        .field-wrap {
          border: 1px solid var(--green-soft);
          padding: 0.9rem 1.1rem 1rem;
          background: transparent;
          margin-bottom: -1px;
          transition: border-color 0.3s, background 0.3s;
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
        .field-wrap:focus-within {
          border-color: var(--green);
          background: rgba(0,255,99,0.04);
        }
        .field-wrap:focus-within::after { width: 100%; }
        .field-label {
          font-family: 'DM Mono', monospace;
          font-size: 0.55rem;
          letter-spacing: 0.24em;
          text-transform: uppercase;
          color: var(--green-deep);
          display: block;
          margin-bottom: 0.35rem;
        }
        .field-wrap input {
          width: 100%;
          background: transparent;
          border: none;
          outline: none;
          font-family: 'DM Mono', monospace;
          font-size: 0.95rem;
          color: var(--white);
          padding: 0;
          cursor: none;
          caret-color: var(--green);
        }
        .field-wrap input::placeholder { color: rgba(245,243,238,0.25); }
        .field-wrap input:disabled { opacity: 0.5; }

        .waiver-row {
          border: 1px solid var(--green-soft);
          padding: 1rem 1.1rem;
          display: flex;
          gap: 1rem;
          align-items: flex-start;
          cursor: pointer;
          margin-top: 0.4rem;
          transition: border-color 0.3s, background 0.3s;
        }
        .waiver-row:hover { border-color: var(--green); background: rgba(0,255,99,0.03); }
        .waiver-checkbox {
          width: 14px; height: 14px;
          border: 1px solid var(--green);
          background: transparent;
          flex-shrink: 0;
          margin-top: 4px;
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
          margin-top: 0.4rem;
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
          padding: 1rem 1.1rem;
          font-family: 'DM Mono', monospace;
          font-size: 0.68rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-top: 0.4rem;
          animation: fadeUp 0.4s cubic-bezier(0.16,1,0.3,1);
        }
        .form-msg.success { border: 1px solid var(--green); color: var(--green); }
        .form-msg.error { border: 1px solid #ff6b6b; color: #ff6b6b; }

        /* ───────── DRESS INSPO ───────── */
        .dress {
          background: var(--gray-light);
          color: var(--black);
          padding: 5rem 2.5rem 6rem;
        }
        .dress-head {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 2rem;
          margin-bottom: 2.5rem;
          flex-wrap: wrap;
        }
        .dress-headline {
          font-family: 'Archivo Black', sans-serif;
          font-size: clamp(40px, 5vw, 72px);
          line-height: 0.95;
          letter-spacing: -0.015em;
          transform: scaleX(1.1);
          transform-origin: left center;
        }
        .dress-sub {
          font-family: 'DM Mono', monospace;
          font-size: 0.7rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--black);
          opacity: 0.6;
          max-width: 32ch;
        }
        .dress-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.8rem;
        }
        .dress-tile {
          aspect-ratio: 3 / 4;
          position: relative;
          overflow: hidden;
          background: #d6d3cd;
          cursor: none;
        }
        .dress-tile img {
          width: 100%; height: 100%;
          object-fit: cover;
          display: block;
          filter: grayscale(0.35) contrast(1.02);
          transform: scale(1.02);
          transition: filter 0.6s cubic-bezier(0.16,1,0.3,1),
                      transform 0.7s cubic-bezier(0.16,1,0.3,1);
        }
        .dress-tile::after {
          /* corner mark */
          content: '';
          position: absolute;
          top: 10px; right: 10px;
          width: 8px; height: 8px;
          background: var(--green);
          opacity: 0;
          transform: scale(0.4);
          transition: opacity 0.35s, transform 0.35s cubic-bezier(0.16,1,0.3,1);
        }
        .dress-tile::before {
          /* counter chip */
          content: attr(data-n);
          position: absolute;
          bottom: 10px; left: 10px;
          font-family: 'DM Mono', monospace;
          font-size: 0.55rem;
          letter-spacing: 0.24em;
          color: var(--white);
          background: rgba(10,10,10,0.55);
          padding: 4px 8px;
          backdrop-filter: blur(4px);
          z-index: 2;
          opacity: 0.85;
        }
        .dress-tile:hover img {
          filter: grayscale(0) contrast(1.05);
          transform: scale(1.06);
        }
        .dress-tile:hover::after { opacity: 1; transform: scale(1); }

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
          .event { grid-template-columns: 1fr; padding: 3.5rem 1.25rem 4.5rem; }
          .rsvp { grid-template-columns: 1fr; padding: 3.5rem 1.25rem 5rem; }
          .rsvp-headline { font-size: clamp(64px, 18vw, 130px); }
          .dress-grid { grid-template-columns: repeat(2, 1fr); }
          .dress { padding: 3.5rem 1.25rem 4.5rem; }
          .location { padding: 4rem 1.25rem 5rem; }
          .topbar { padding: 0.6rem 1.25rem; font-size: 0.6rem; }
          footer { flex-direction: column; gap: 1rem; align-items: flex-start; padding: 2rem 1.25rem; }
        }
        @media (max-width: 480px) {
          body { cursor: auto; }
          .cursor { display: none; }
          input, button, a, .waiver-row, .dress-tile { cursor: auto !important; }
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
          <h1 className="hero-stack" aria-label="D5MNXX">
            <span>D5</span>
            <span>MN</span>
            <span>XX</span>
          </h1>
        </div>
        <div className="hero-right">
          <p className="hero-eyebrow">20 YEARS<br />OF DROGA5</p>
          <p className="hero-tagline">Celebrate with a music night to remember</p>
          <p className="hero-footer">20 YEARS<br />OF DROGA5</p>
        </div>
      </section>

      {/* RSVP */}
      <section id="rsvp" className="rsvp">
        <div className="rsvp-left">
          <h2 className="rsvp-headline reveal">SEE YOU<br />THERE?</h2>
        </div>
        <div className="rsvp-right">
          <form onSubmit={handleSubmit} noValidate>
            <div className="field-wrap reveal">
              <label className="field-label" htmlFor="firstName">First Name</label>
              <input
                type="text" id="firstName" name="firstName"
                placeholder="David" required
                value={form.firstName} onChange={handleChange} disabled={disabled}
              />
            </div>
            <div className="field-wrap reveal reveal-d1">
              <label className="field-label" htmlFor="lastName">Last Name</label>
              <input
                type="text" id="lastName" name="lastName"
                placeholder="Droga" required
                value={form.lastName} onChange={handleChange} disabled={disabled}
              />
            </div>
            <div className="field-wrap reveal reveal-d2">
              <label className="field-label" htmlFor="email">Email</label>
              <input
                type="email" id="email" name="email"
                placeholder="you@email.com" required
                value={form.email} onChange={handleChange} disabled={disabled}
              />
            </div>
            <div className="field-wrap reveal reveal-d3">
              <label className="field-label" htmlFor="phone">Phone (Optional)</label>
              <input
                type="tel" id="phone" name="phone"
                placeholder="555-555-5555"
                value={form.phone} onChange={handleChange} disabled={disabled}
              />
            </div>

            <div
              className="waiver-row reveal reveal-d4"
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
                <strong>FILM &amp; PHOTO RELEASE:</strong> By checking this box,
                I consent to being photographed and/or filmed at D5XX on June 9
                and grant Droga5 the right to use such images and recordings for
                internal communications, archival, and social purposes.{' '}
                <a href="/terms" target="_blank" rel="noreferrer">Read full terms</a>.
              </p>
            </div>

            {formState !== 'success' && (
              <button
                ref={submitRef}
                type="submit"
                className="rsvp-submit reveal reveal-d5"
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

      {/* EVENT */}
      <section id="event" className="event">
        <div className="event-bg-marks">D5XX D5XX</div>
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
            <p className="label">Location</p>
            <p className="value">THE BOX</p>
          </div>
          <div className="event-detail reveal reveal-d4">
            <p className="label">Time</p>
            <p className="value">7PM — LATE</p>
          </div>
        </div>
      </section>

      {/* DRESS INSPO */}
      <section id="dress" className="dress">
        <div className="dress-head">
          <h2 className="dress-headline reveal">DRESS INSPO</h2>
          <p className="dress-sub reveal reveal-d1">
            Smart / Sharp. Shiny, tactile, statement. Wear what makes the room.
          </p>
        </div>
        <div className="dress-grid">
          {[1, 2, 3, 4].map((n, i) => (
            <div
              key={n}
              className={`dress-tile reveal reveal-d${i + 2}`}
              data-n={String(n).padStart(2, '0')}
            >
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
