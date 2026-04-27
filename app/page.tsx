'use client'

import { useEffect, useRef, useState } from 'react'

type FormState = 'idle' | 'submitting' | 'success' | 'error'

export default function Home() {
  const cursorRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const [waiverChecked, setWaiverChecked] = useState(false)
  const [formState, setFormState] = useState<FormState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    team: '',
    plusOne: '',
  })

  // Cursor
  useEffect(() => {
    const cursor = cursorRef.current
    if (!cursor) return
    const move = (e: MouseEvent) => {
      cursor.style.left = e.clientX + 'px'
      cursor.style.top = e.clientY + 'px'
    }
    document.addEventListener('mousemove', move)
    const hoverEls = document.querySelectorAll('a, button, .waiver-wrap, input, select')
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
    }
  }, [])

  // Nav scroll
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 60)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Scroll reveal
  useEffect(() => {
    const reveals = document.querySelectorAll('.reveal')
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible') }),
      { threshold: 0.12 }
    )
    reveals.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  // Counters
  useEffect(() => {
    const counters = document.querySelectorAll<HTMLElement>('.counter-num')
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return
        const el = entry.target as HTMLElement
        const target = parseInt(el.dataset.target || '0')
        const start = performance.now()
        const duration = 1400
        const tick = (now: number) => {
          const p = Math.min((now - start) / duration, 1)
          const ease = 1 - Math.pow(1 - p, 3)
          el.textContent = Math.round(ease * target).toString()
          if (p < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
        observer.unobserve(el)
      })
    }, { threshold: 0.5 })
    counters.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  // Parallax
  useEffect(() => {
    const bg = document.querySelector<HTMLElement>('.hero-bg-text')
    if (!bg) return
    const onScroll = () => {
      bg.style.transform = `translate(-50%, calc(-50% + ${window.scrollY * 0.3}px))`
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --black: #0a0a0a;
          --white: #f5f3ee;
          --gray: #888;
          --rule: rgba(255,255,255,0.12);
        }
        html { scroll-behavior: smooth; }
        body {
          background: var(--black);
          color: var(--white);
          font-family: 'DM Mono', monospace;
          overflow-x: hidden;
          cursor: none;
        }
        .cursor {
          position: fixed;
          width: 10px; height: 10px;
          background: var(--white);
          border-radius: 50%;
          pointer-events: none;
          z-index: 9999;
          transform: translate(-50%, -50%);
          transition: width 0.2s, height 0.2s;
          mix-blend-mode: difference;
        }
        .cursor.expanded { width: 40px; height: 40px; }
        nav {
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.5rem 2.5rem;
          border-bottom: 1px solid transparent;
          transition: border-color 0.4s, background 0.4s;
        }
        nav.scrolled {
          border-color: var(--rule);
          background: rgba(10,10,10,0.9);
          backdrop-filter: blur(12px);
        }
        .nav-logo {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 1.5rem;
          letter-spacing: 0.08em;
          color: var(--white);
          text-decoration: none;
        }
        .nav-links { display: flex; gap: 2.5rem; list-style: none; }
        .nav-links a {
          font-size: 0.65rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--gray);
          text-decoration: none;
          transition: color 0.2s;
          cursor: none;
        }
        .nav-links a:hover { color: var(--white); }
        section { min-height: 100vh; }
        #hero {
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding: 0 2.5rem 4rem;
          position: relative;
          overflow: hidden;
        }
        .hero-bg {
          position: absolute;
          inset: 0;
          overflow: hidden;
        }
        .hero-bg-text {
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          font-family: 'Bebas Neue', sans-serif;
          font-size: clamp(260px, 40vw, 520px);
          color: transparent;
          -webkit-text-stroke: 1px rgba(255,255,255,0.04);
          white-space: nowrap;
          user-select: none;
          letter-spacing: -0.02em;
        }
        .hero-eyebrow {
          font-size: 0.6rem;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: var(--gray);
          margin-bottom: 1.5rem;
          opacity: 0;
          transform: translateY(20px);
          animation: fadeUp 0.8s 0.2s forwards;
        }
        .hero-title {
          font-family: 'Bebas Neue', sans-serif;
          font-size: clamp(96px, 18vw, 240px);
          line-height: 0.88;
          letter-spacing: -0.01em;
          opacity: 0;
          animation: fadeUp 0.9s 0.4s forwards;
        }
        .hero-title em {
          font-style: italic;
          color: transparent;
          -webkit-text-stroke: 2px var(--white);
        }
        .hero-sub {
          font-size: 0.65rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--gray);
          margin-top: 2rem;
          opacity: 0;
          animation: fadeUp 0.8s 0.7s forwards;
        }
        .hero-rule { position: absolute; bottom: 0; left: 0; right: 0; height: 1px; background: var(--rule); }
        .scroll-hint {
          position: absolute;
          right: 2.5rem; bottom: 3.5rem;
          display: flex; flex-direction: column;
          align-items: center; gap: 0.5rem;
          opacity: 0;
          animation: fadeUp 0.8s 1.2s forwards;
        }
        .scroll-hint span {
          font-size: 0.55rem; letter-spacing: 0.22em;
          text-transform: uppercase; color: var(--gray);
          writing-mode: vertical-rl;
        }
        .scroll-line {
          width: 1px; height: 48px;
          background: linear-gradient(to bottom, var(--gray), transparent);
          animation: scrollPulse 2s 1.5s infinite;
        }
        .marquee-wrap {
          overflow: hidden;
          border-top: 1px solid var(--rule);
          border-bottom: 1px solid var(--rule);
          padding: 1.2rem 0;
          background: rgba(255,255,255,0.02);
        }
        .marquee-track {
          display: flex; gap: 3rem;
          animation: marquee 24s linear infinite;
          white-space: nowrap;
        }
        .marquee-track span {
          font-size: 0.6rem; letter-spacing: 0.3em;
          text-transform: uppercase; color: var(--gray);
          flex-shrink: 0;
        }
        .marquee-track span.accent { color: var(--white); }
        .counter-strip {
          border-top: 1px solid var(--rule);
          display: grid; grid-template-columns: repeat(4, 1fr);
        }
        .counter-item {
          padding: 3rem 2.5rem;
          border-right: 1px solid var(--rule);
        }
        .counter-item:last-child { border-right: none; }
        .counter-num {
          font-family: 'Bebas Neue', sans-serif;
          font-size: clamp(48px, 6vw, 80px);
          line-height: 1; color: var(--white);
          display: block;
        }
        .counter-desc {
          font-size: 0.6rem; letter-spacing: 0.2em;
          text-transform: uppercase; color: var(--gray); margin-top: 0.5rem;
        }
        #about {
          display: grid; grid-template-columns: 1fr 1fr;
          border-top: 1px solid var(--rule);
          min-height: auto; padding: 6rem 2.5rem; gap: 4rem;
        }
        .section-label {
          font-size: 0.6rem; letter-spacing: 0.28em;
          text-transform: uppercase; color: var(--gray);
          margin-bottom: 3rem;
          display: flex; align-items: center; gap: 1rem;
        }
        .section-label::before {
          content: ''; display: block;
          width: 24px; height: 1px; background: var(--gray);
        }
        .about-headline {
          font-family: 'Bebas Neue', sans-serif;
          font-size: clamp(56px, 7vw, 96px);
          line-height: 0.92; letter-spacing: -0.01em;
        }
        .about-headline em { font-style: italic; color: var(--gray); }
        .about-right { display: flex; flex-direction: column; justify-content: flex-end; gap: 3rem; }
        .detail-label {
          font-size: 0.55rem; letter-spacing: 0.3em;
          text-transform: uppercase; color: var(--gray); margin-bottom: 0.5rem;
        }
        .detail-value { font-size: 1rem; line-height: 1.5; color: var(--white); }
        .about-body {
          font-size: 0.8rem; line-height: 1.8; color: var(--gray);
          max-width: 36ch; border-top: 1px solid var(--rule); padding-top: 2rem;
        }
        .about-year-block { display: flex; align-items: baseline; gap: 1rem; margin-bottom: 3rem; }
        .year-num {
          font-family: 'Bebas Neue', sans-serif;
          font-size: clamp(100px, 16vw, 200px);
          line-height: 1; color: transparent;
          -webkit-text-stroke: 1px rgba(255,255,255,0.2);
        }
        .year-label {
          font-size: 0.6rem; letter-spacing: 0.24em;
          text-transform: uppercase; color: var(--gray); transform: translateY(-1rem);
        }
        #rsvp {
          min-height: 100vh;
          display: flex; flex-direction: column; justify-content: center;
          border-top: 1px solid var(--rule); padding: 8rem 2.5rem;
        }
        .rsvp-inner { max-width: 900px; }
        .rsvp-headline {
          font-family: 'Bebas Neue', sans-serif;
          font-size: clamp(72px, 12vw, 160px);
          line-height: 0.88; letter-spacing: -0.01em; margin-bottom: 4rem;
        }
        .rsvp-headline em { font-style: italic; color: transparent; -webkit-text-stroke: 2px var(--white); }
        .rsvp-form {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 0; border: 1px solid var(--rule);
        }
        .field-wrap {
          border-bottom: 1px solid var(--rule);
          padding: 1.25rem 1.5rem; position: relative;
        }
        .field-wrap:nth-child(odd) { border-right: 1px solid var(--rule); }
        .field-wrap.full { grid-column: 1 / -1; border-right: none; }
        .field-label {
          font-size: 0.55rem; letter-spacing: 0.28em;
          text-transform: uppercase; color: var(--gray);
          margin-bottom: 0.5rem; display: block;
        }
        .field-wrap input {
          width: 100%; background: transparent; border: none; outline: none;
          font-family: 'DM Mono', monospace; font-size: 0.9rem;
          color: var(--white); padding: 0; cursor: none;
        }
        .field-wrap input::placeholder { color: rgba(255,255,255,0.2); }
        .field-line {
          position: absolute; bottom: 0; left: 0; right: 0; height: 2px;
          background: var(--white); transform: scaleX(0);
          transform-origin: left; transition: transform 0.3s;
        }
        .field-wrap input:focus ~ .field-line,
        .field-wrap input:not(:placeholder-shown) ~ .field-line { transform: scaleX(1); }
        .waiver-wrap {
          grid-column: 1 / -1;
          border-top: 1px solid var(--rule);
          padding: 1.5rem;
          display: flex; align-items: flex-start; gap: 1rem; cursor: pointer;
        }
        .waiver-checkbox {
          width: 18px; height: 18px;
          border: 1px solid rgba(255,255,255,0.3);
          flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          margin-top: 1px; transition: border-color 0.2s, background 0.2s;
          cursor: pointer;
        }
        .waiver-checkbox.checked { border-color: var(--white); background: var(--white); }
        .waiver-checkbox.checked::after {
          content: ''; width: 10px; height: 6px;
          border-left: 2px solid var(--black); border-bottom: 2px solid var(--black);
          transform: rotate(-45deg) translateY(-1px); display: block;
        }
        .waiver-text { font-size: 0.7rem; line-height: 1.7; color: var(--gray); }
        .waiver-text strong { color: var(--white); font-weight: 400; }
        .rsvp-submit {
          grid-column: 1 / -1;
          background: transparent; color: var(--white);
          font-family: 'DM Mono', monospace; font-size: 0.65rem;
          letter-spacing: 0.3em; text-transform: uppercase;
          padding: 1.5rem; cursor: none;
          border: none; border-top: 1px solid var(--rule);
          width: 100%; text-align: left;
          display: flex; align-items: center; justify-content: space-between;
          transition: background 0.25s;
        }
        .rsvp-submit:hover:not(:disabled) { background: rgba(255,255,255,0.04); }
        .rsvp-submit:disabled { opacity: 0.5; }
        .rsvp-submit .arrow { font-size: 1.2rem; transition: transform 0.3s; }
        .rsvp-submit:hover:not(:disabled) .arrow { transform: translateX(6px); }
        .success-msg {
          grid-column: 1 / -1;
          padding: 2rem 1.5rem; font-size: 0.75rem;
          letter-spacing: 0.1em; color: var(--white);
          border-top: 1px solid var(--rule);
          animation: fadeUp 0.5s forwards;
        }
        .error-msg {
          grid-column: 1 / -1;
          padding: 1rem 1.5rem; font-size: 0.7rem;
          letter-spacing: 0.08em; color: #ff6b6b;
          border-top: 1px solid rgba(255,107,107,0.3);
          background: rgba(255,107,107,0.05);
        }
        footer {
          border-top: 1px solid var(--rule); padding: 3rem 2.5rem;
          display: flex; align-items: center; justify-content: space-between;
        }
        .footer-logo {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 2.5rem; letter-spacing: 0.06em;
          color: rgba(255,255,255,0.12);
        }
        .footer-copy {
          font-size: 0.6rem; letter-spacing: 0.18em;
          text-transform: uppercase; color: var(--gray);
        }
        .reveal { opacity: 0; transform: translateY(40px); transition: opacity 0.8s cubic-bezier(0.16,1,0.3,1), transform 0.8s cubic-bezier(0.16,1,0.3,1); }
        .reveal.visible { opacity: 1; transform: translateY(0); }
        .reveal-delay-1 { transition-delay: 0.1s; }
        .reveal-delay-2 { transition-delay: 0.2s; }
        .reveal-delay-3 { transition-delay: 0.35s; }
        .reveal-delay-4 { transition-delay: 0.5s; }
        @keyframes fadeUp { to { opacity: 1; transform: translateY(0); } }
        @keyframes scrollPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @media (max-width: 768px) {
          #about { grid-template-columns: 1fr; padding: 4rem 1.5rem; }
          .rsvp-form { grid-template-columns: 1fr; }
          .field-wrap:nth-child(odd) { border-right: none; }
          .counter-strip { grid-template-columns: repeat(2, 1fr); }
          .counter-item:nth-child(2) { border-right: none; }
          nav { padding: 1.2rem 1.5rem; }
          .nav-links { gap: 1.5rem; }
          #hero { padding: 0 1.5rem 3rem; }
          #rsvp { padding: 5rem 1.5rem; }
        }
      `}</style>

      <div className="cursor" ref={cursorRef} />

      <nav ref={navRef}>
        <a href="#hero" className="nav-logo">Droga5</a>
        <ul className="nav-links">
          <li><a href="#about">About</a></li>
          <li><a href="#rsvp">RSVP</a></li>
        </ul>
      </nav>

      {/* HERO */}
      <section id="hero">
        <div className="hero-bg">
          <div className="hero-bg-text">D5XX</div>
        </div>
        <div className="scroll-hint">
          <span>Scroll</span>
          <div className="scroll-line" />
        </div>
        <p className="hero-eyebrow">2006 — 2026 &nbsp;&nbsp;·&nbsp;&nbsp; New York</p>
        <h1 className="hero-title">D5<em>XX</em></h1>
        <p className="hero-sub">Droga5 Turns Twenty &nbsp;·&nbsp; A Night for the People Who Made It</p>
        <div className="hero-rule" />
      </section>

      {/* MARQUEE */}
      <div className="marquee-wrap">
        <div className="marquee-track">
          {[...Array(2)].map((_, i) => (
            <span key={i} style={{ display: 'contents' }}>
              <span className="accent">D5XX</span>
              <span>Twenty Years</span>
              <span className="accent">·</span>
              <span>Creatively Led</span>
              <span className="accent">·</span>
              <span>Strategically Driven</span>
              <span className="accent">·</span>
              <span>Droga5</span>
              <span className="accent">·</span>
              <span>2006–2026</span>
              <span className="accent">·</span>
            </span>
          ))}
        </div>
      </div>

      {/* COUNTER STRIP */}
      <div className="counter-strip">
        {[
          { target: 20, label: 'Years' },
          { target: 25, label: 'Agency of the Year Awards' },
          { target: 2, label: 'Decades of Impact' },
          { target: 1, label: 'Night to Remember' },
        ].map((item, i) => (
          <div className={`counter-item reveal${i > 0 ? ` reveal-delay-${i}` : ''}`} key={i}>
            <span className="counter-num" data-target={item.target}>0</span>
            <p className="counter-desc">{item.label}</p>
          </div>
        ))}
      </div>

      {/* ABOUT */}
      <section id="about">
        <div>
          <p className="section-label reveal">The Event</p>
          <div className="about-year-block reveal reveal-delay-1">
            <span className="year-num">20</span>
            <span className="year-label">Years</span>
          </div>
          <h2 className="about-headline reveal reveal-delay-2">
            Twenty<br /><em>years</em><br />of making<br />it matter.
          </h2>
        </div>
        <div className="about-right">
          {[
            { label: 'Date', value: 'Friday, October 3rd, 2026' },
            { label: 'Location', value: 'Droga5 HQ\n120 Wall Street, 17th Floor\nNew York, NY 10005' },
            { label: 'Time', value: '7:00 PM — Late' },
            { label: 'Dress', value: 'Smart / Sharp' },
          ].map((d, i) => (
            <div className={`reveal${i > 0 ? ` reveal-delay-${Math.min(i, 3)}` : ''}`} key={d.label}>
              <p className="detail-label">{d.label}</p>
              <p className="detail-value" style={{ whiteSpace: 'pre-line' }}>{d.value}</p>
            </div>
          ))}
          <p className="about-body reveal">
            An invitation-only evening celebrating two decades of work, people, and the ideas that defined a generation of creativity. Past and present Drogans, clients, and collaborators — together for one night.
          </p>
        </div>
      </section>

      {/* RSVP */}
      <section id="rsvp">
        <div className="rsvp-inner">
          <p className="section-label reveal">RSVP</p>
          <h2 className="rsvp-headline reveal reveal-delay-1">
            See you<br />there<em>.</em>
          </h2>

          <form className="rsvp-form reveal reveal-delay-2" onSubmit={handleSubmit}>

            <div className="field-wrap">
              <label className="field-label" htmlFor="firstName">First Name</label>
              <input type="text" id="firstName" name="firstName" placeholder="David"
                required value={form.firstName} onChange={handleChange}
                disabled={formState === 'submitting' || formState === 'success'} />
              <div className="field-line" />
            </div>

            <div className="field-wrap">
              <label className="field-label" htmlFor="lastName">Last Name</label>
              <input type="text" id="lastName" name="lastName" placeholder="Droga"
                required value={form.lastName} onChange={handleChange}
                disabled={formState === 'submitting' || formState === 'success'} />
              <div className="field-line" />
            </div>

            <div className="field-wrap">
              <label className="field-label" htmlFor="email">Email</label>
              <input type="email" id="email" name="email" placeholder="you@droga5.com"
                required value={form.email} onChange={handleChange}
                disabled={formState === 'submitting' || formState === 'success'} />
              <div className="field-line" />
            </div>

            <div className="field-wrap">
              <label className="field-label" htmlFor="team">Office / Team</label>
              <input type="text" id="team" name="team" placeholder="New York, London, Dublin…"
                value={form.team} onChange={handleChange}
                disabled={formState === 'submitting' || formState === 'success'} />
              <div className="field-line" />
            </div>

            <div className="field-wrap full">
              <label className="field-label" htmlFor="plusOne">Bringing a +1?</label>
              <input type="text" id="plusOne" name="plusOne" placeholder="Guest name (optional)"
                value={form.plusOne} onChange={handleChange}
                disabled={formState === 'submitting' || formState === 'success'} />
              <div className="field-line" />
            </div>

            {/* WAIVER */}
            <div className="waiver-wrap" onClick={() => {
              if (formState !== 'submitting' && formState !== 'success') setWaiverChecked(v => !v)
            }}>
              <div className={`waiver-checkbox${waiverChecked ? ' checked' : ''}`} />
              <p className="waiver-text">
                <strong>Photo &amp; Film Release</strong> — By checking this box, I consent to being photographed and/or filmed during the D5XX event on October 3rd, 2026. I grant Droga5 the right to use such images and recordings for internal communications, archival, and social purposes without additional compensation.
              </p>
            </div>

            {formState !== 'success' && (
              <button
                type="submit"
                className="rsvp-submit"
                disabled={formState === 'submitting'}
              >
                <span>{formState === 'submitting' ? 'Sending…' : 'Confirm Attendance'}</span>
                <span className="arrow">{formState === 'submitting' ? '…' : '→'}</span>
              </button>
            )}

            {formState === 'error' && (
              <div className="error-msg">⚠ &nbsp;{errorMsg}</div>
            )}

            {formState === 'success' && (
              <div className="success-msg">
                ✓ &nbsp; You&apos;re on the list, {form.firstName}. Check your inbox — we&apos;ll be in touch closer to the night.
              </div>
            )}

          </form>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="footer-logo">Droga5</div>
        <p className="footer-copy">D5XX &nbsp;·&nbsp; 2006—2026 &nbsp;·&nbsp; New York</p>
      </footer>
    </>
  )
}
