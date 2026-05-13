'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type Sliders = {
  drive: number
  bass: number
  melody: number
  shuffle: number
  echo: number
}

const LOOKAHEAD_MS = 25
const SCHEDULE_AHEAD_S = 0.1
const STEPS_PER_BAR = 16
const BARS = 4
const TOTAL_STEPS = STEPS_PER_BAR * BARS

// Am → F → C → G (i-VI-III-VII in A natural minor — the "All My Friends" / "Dance Yrself Clean" vibe).
const PROGRESSION = [
  { name: 'Am', bassRoot: 110.00, chord: [220.00, 261.63, 329.63, 392.00], melodyNotes: [440.00, 523.25, 587.33, 659.25, 783.99] },
  { name: 'F',  bassRoot: 87.31,  chord: [174.61, 220.00, 261.63, 329.63], melodyNotes: [349.23, 392.00, 440.00, 523.25, 659.25] },
  { name: 'C',  bassRoot: 130.81, chord: [261.63, 329.63, 392.00, 493.88], melodyNotes: [523.25, 587.33, 659.25, 783.99, 987.77] },
  { name: 'G',  bassRoot: 98.00,  chord: [196.00, 246.94, 293.66, 391.99], melodyNotes: [392.00, 440.00, 493.88, 587.33, 783.99] },
] as const

const INITIAL_SLIDERS: Sliders = {
  drive: 0.65,
  bass: 0.55,
  melody: 0.5,
  shuffle: 0.45,
  echo: 0.3,
}
const INITIAL_BPM = 118
const BPM_MIN = 80
const BPM_MAX = 160

// ───────── Audio helpers (module-level) ─────────

function makeReverbImpulse(ctx: AudioContext, durationSec: number, decay: number) {
  const sr = ctx.sampleRate
  const len = Math.max(1, Math.floor(sr * durationSec))
  const buf = ctx.createBuffer(2, len, sr)
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch)
    const preDelay = Math.floor(sr * 0.015)
    for (let i = 0; i < len; i++) {
      const t = Math.max(0, i - preDelay)
      const env = Math.pow(1 - t / (len - preDelay), decay)
      data[i] = (Math.random() * 2 - 1) * env
    }
  }
  return buf
}

function makeTanhCurve(amount: number, samples = 2048) {
  const curve = new Float32Array(samples)
  for (let i = 0; i < samples; i++) {
    const x = (i / samples) * 2 - 1
    curve[i] = Math.tanh(x * amount)
  }
  return curve
}

// Pink noise buffer (1/f) — sounds more like vinyl than white. ~4s loop is enough.
function makePinkNoiseBuffer(ctx: AudioContext, seconds: number) {
  const sr = ctx.sampleRate
  const len = Math.floor(sr * seconds)
  const buf = ctx.createBuffer(2, len, sr)
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch)
    let b0 = 0, b1 = 0, b2 = 0
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1
      b0 = 0.99765 * b0 + white * 0.0990460
      b1 = 0.96300 * b1 + white * 0.2965164
      b2 = 0.57000 * b2 + white * 1.0526913
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.11
    }
  }
  return buf
}

const jitter = () => (Math.random() - 0.5) * 0.008
const velJ   = (v: number) => v * (0.9 + Math.random() * 0.2)

export default function Mixer() {
  const [playing, setPlaying] = useState(false)
  const [sliders, setSliders] = useState<Sliders>(INITIAL_SLIDERS)
  const [bpm, setBpm] = useState(INITIAL_BPM)
  const [beat, setBeat] = useState(-1)
  const [bar, setBar] = useState(0)

  const audioCtxRef     = useRef<AudioContext | null>(null)
  const masterRef       = useRef<GainNode | null>(null)
  const drumsBusRef     = useRef<GainNode | null>(null)
  const bassBusRef      = useRef<GainNode | null>(null)
  const melodyBusRef    = useRef<GainNode | null>(null)
  const sidechainRef    = useRef<GainNode | null>(null)

  const delayInRef      = useRef<GainNode | null>(null)
  const delayLRef       = useRef<DelayNode | null>(null)
  const delayRRef       = useRef<DelayNode | null>(null)
  const delayWetRef     = useRef<GainNode | null>(null)
  const delayFbRef      = useRef<GainNode | null>(null)

  const reverbInRef     = useRef<GainNode | null>(null)

  const bassDriveCurveRef = useRef<Float32Array | null>(null)

  const slidersRef      = useRef<Sliders>(sliders)
  const bpmRef          = useRef<number>(bpm)
  const schedulerRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const nextNoteTimeRef = useRef(0)
  const stepRef         = useRef(0)

  useEffect(() => { slidersRef.current = sliders }, [sliders])
  useEffect(() => {
    bpmRef.current = bpm
    const ctx = audioCtxRef.current
    if (!ctx) return
    const dotted8 = (60 / bpm) * 0.75
    delayLRef.current?.delayTime.setTargetAtTime(dotted8, ctx.currentTime, 0.05)
    delayRRef.current?.delayTime.setTargetAtTime(dotted8, ctx.currentTime, 0.05)
  }, [bpm])

  useEffect(() => {
    const ctx = audioCtxRef.current
    if (!ctx || !delayWetRef.current || !delayFbRef.current) return
    const t = ctx.currentTime
    delayWetRef.current.gain.setTargetAtTime(sliders.echo * 0.75, t, 0.08)
    delayFbRef.current.gain.setTargetAtTime(0.2 + sliders.echo * 0.55, t, 0.08)
  }, [sliders.echo])

  // ───────── Audio graph ─────────
  const initAudio = useCallback(() => {
    if (audioCtxRef.current) return
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    audioCtxRef.current = ctx

    // Master chain: master → glue-sat → comp → destination
    const masterSat = ctx.createWaveShaper()
    masterSat.curve = makeTanhCurve(1.3)
    masterSat.oversample = '4x'

    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -10
    comp.knee.value = 18
    comp.ratio.value = 6
    comp.attack.value = 0.003
    comp.release.value = 0.14

    const master = ctx.createGain()
    master.gain.value = 0.7
    master.connect(masterSat); masterSat.connect(comp); comp.connect(ctx.destination)
    masterRef.current = master

    // ── Stereo ping-pong delay ──
    const delayIn = ctx.createGain(); delayIn.gain.value = 1.0
    const delayL  = ctx.createDelay(2.0); delayL.delayTime.value = (60 / INITIAL_BPM) * 0.75
    const delayR  = ctx.createDelay(2.0); delayR.delayTime.value = (60 / INITIAL_BPM) * 0.75
    const damp    = ctx.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 2800
    const panL    = ctx.createStereoPanner(); panL.pan.value = -0.85
    const panR    = ctx.createStereoPanner(); panR.pan.value = 0.85
    const fb      = ctx.createGain(); fb.gain.value = 0.2 + INITIAL_SLIDERS.echo * 0.55
    const wet     = ctx.createGain(); wet.gain.value = INITIAL_SLIDERS.echo * 0.75

    delayIn.connect(delayL)
    delayL.connect(panL); panL.connect(wet)
    delayL.connect(delayR)
    delayR.connect(panR); panR.connect(wet)
    delayR.connect(damp); damp.connect(fb); fb.connect(delayL)
    wet.connect(master)

    delayInRef.current = delayIn
    delayLRef.current = delayL
    delayRRef.current = delayR
    delayWetRef.current = wet
    delayFbRef.current = fb

    // ── Convolution reverb ──
    const conv = ctx.createConvolver()
    conv.buffer = makeReverbImpulse(ctx, 2.6, 2.3)
    const reverbIn = ctx.createGain(); reverbIn.gain.value = 1.0
    const reverbWet = ctx.createGain(); reverbWet.gain.value = 0.55
    reverbIn.connect(conv); conv.connect(reverbWet); reverbWet.connect(master)
    reverbInRef.current = reverbIn

    // ── DRUM BUS: bus → smashed comp → saturator → master ──
    // This is the "punch you in the chest" chain.
    const drumComp = ctx.createDynamicsCompressor()
    drumComp.threshold.value = -16
    drumComp.knee.value = 6
    drumComp.ratio.value = 6
    drumComp.attack.value = 0.001
    drumComp.release.value = 0.08

    const drumSat = ctx.createWaveShaper()
    drumSat.curve = makeTanhCurve(2.5)
    drumSat.oversample = '2x'

    const drums = ctx.createGain(); drums.gain.value = 1.0
    drums.connect(drumComp); drumComp.connect(drumSat); drumSat.connect(master)
    drumsBusRef.current = drums

    // ── Bass bus → drive → master ──
    const bassSat = ctx.createWaveShaper()
    bassSat.curve = makeTanhCurve(2.2)
    bassSat.oversample = '2x'
    const bassBus = ctx.createGain(); bassBus.gain.value = 0.62
    bassBus.connect(bassSat); bassSat.connect(master)
    bassBusRef.current = bassBus

    // Per-voice bass drive curve (cached, reused per note)
    bassDriveCurveRef.current = makeTanhCurve(2.8)

    // ── Melody bus → sidechain → light sat → master ──
    const melSat = ctx.createWaveShaper()
    melSat.curve = makeTanhCurve(1.6)
    melSat.oversample = '2x'
    const sidechain = ctx.createGain(); sidechain.gain.value = 1.0
    sidechain.connect(melSat); melSat.connect(master)
    sidechainRef.current = sidechain

    const mel = ctx.createGain(); mel.gain.value = 0.5
    mel.connect(sidechain)
    melodyBusRef.current = mel

    // ── Vinyl hiss bed — one-shot start, plays as long as context is running ──
    const vinylSrc = ctx.createBufferSource()
    vinylSrc.buffer = makePinkNoiseBuffer(ctx, 4)
    vinylSrc.loop = true
    const vinylBp = ctx.createBiquadFilter(); vinylBp.type = 'bandpass'; vinylBp.frequency.value = 3500; vinylBp.Q.value = 0.4
    const vinylG = ctx.createGain(); vinylG.gain.value = 0.045
    vinylSrc.connect(vinylBp); vinylBp.connect(vinylG); vinylG.connect(master)
    vinylSrc.start()
  }, [])

  // ───────── Voices ─────────

  // KICK — three layers (sub thump + pitched body + click) and a deep sidechain duck.
  const kick = useCallback((t: number, vel: number) => {
    const ctx = audioCtxRef.current!
    const drums = drumsBusRef.current!

    // Sub thump — long, low sine
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 50
    const subG = ctx.createGain()
    subG.gain.setValueAtTime(0.0001, t)
    subG.gain.exponentialRampToValueAtTime(vel * 0.9, t + 0.005)
    subG.gain.exponentialRampToValueAtTime(0.0001, t + 0.55)
    sub.connect(subG); subG.connect(drums)

    // Pitched body — sine pitch envelope (the "boom")
    const o = ctx.createOscillator(); o.type = 'sine'
    o.frequency.setValueAtTime(180, t)
    o.frequency.exponentialRampToValueAtTime(48, t + 0.13)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vel), t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45)
    o.connect(g); g.connect(drums)

    // Click transient — bigger and louder than before
    const len = Math.floor(ctx.sampleRate * 0.015)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len)
    const src = ctx.createBufferSource(); src.buffer = buf
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400
    const cg = ctx.createGain(); cg.gain.value = vel * 0.7
    src.connect(hp); hp.connect(cg); cg.connect(drums)
    src.start(t)

    sub.start(t); sub.stop(t + 0.6)
    o.start(t); o.stop(t + 0.48)

    // Sidechain duck — deeper for LCD pump
    const sc = sidechainRef.current
    if (sc) {
      sc.gain.cancelScheduledValues(t)
      sc.gain.setValueAtTime(sc.gain.value, t)
      sc.gain.linearRampToValueAtTime(0.22, t + 0.012)
      sc.gain.exponentialRampToValueAtTime(1.0, t + 0.28)
    }
  }, [])

  // CLAP — four quick noise bursts simulating multiple hands.
  // Bandpass ≈1.8kHz, big reverb send.
  const clap = useCallback((t: number, vel: number) => {
    const ctx = audioCtxRef.current!
    const drums = drumsBusRef.current!
    const offsets = [0, 0.011, 0.022, 0.034]
    offsets.forEach((off, i) => {
      const last = i === offsets.length - 1
      const len = Math.floor(ctx.sampleRate * (last ? 0.16 : 0.045))
      const buf = ctx.createBuffer(1, len, ctx.sampleRate)
      const ch = buf.getChannelData(0)
      for (let j = 0; j < len; j++) ch[j] = (Math.random() * 2 - 1) * (1 - j / len)
      const src = ctx.createBufferSource(); src.buffer = buf
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 1.4
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900
      const amp = vel * (last ? 0.55 : 0.32)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t + off)
      g.gain.exponentialRampToValueAtTime(amp, t + off + 0.0015)
      g.gain.exponentialRampToValueAtTime(0.0001, t + off + (last ? 0.18 : 0.045))
      const sp = ctx.createStereoPanner(); sp.pan.value = i * 0.06 - 0.09 // tiny stereo spread across hits
      src.connect(bp); bp.connect(hp); hp.connect(g); g.connect(sp); sp.connect(drums)
      const rSend = ctx.createGain(); rSend.gain.value = last ? 0.55 : 0.25
      g.connect(rSend); rSend.connect(reverbInRef.current!)
      src.start(t + off)
    })
  }, [])

  // SNARE — triangle body + filtered noise rattle, paired with clap on 2 & 4.
  const snare = useCallback((t: number, vel: number) => {
    const ctx = audioCtxRef.current!
    const drums = drumsBusRef.current!

    // Body
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 195
    o.frequency.setValueAtTime(220, t)
    o.frequency.exponentialRampToValueAtTime(160, t + 0.05)
    const og = ctx.createGain()
    og.gain.setValueAtTime(0.0001, t)
    og.gain.exponentialRampToValueAtTime(vel * 0.4, t + 0.002)
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
    o.connect(og); og.connect(drums)

    // Rattle (filtered noise)
    const len = Math.floor(ctx.sampleRate * 0.16)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const ch = buf.getChannelData(0)
    for (let j = 0; j < len; j++) ch[j] = (Math.random() * 2 - 1) * (1 - (j / len) * 0.75)
    const src = ctx.createBufferSource(); src.buffer = buf
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1600
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(0.0001, t)
    ng.gain.exponentialRampToValueAtTime(vel * 0.5, t + 0.002)
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
    src.connect(hp); hp.connect(ng); ng.connect(drums)
    const rSend = ctx.createGain(); rSend.gain.value = 0.35
    ng.connect(rSend); rSend.connect(reverbInRef.current!)

    o.start(t); o.stop(t + 0.15)
    src.start(t)
  }, [])

  // SHAKER — short bandpassed noise. Random pan for texture.
  const shaker = useCallback((t: number, vel: number) => {
    const ctx = audioCtxRef.current!
    const len = Math.floor(ctx.sampleRate * 0.08)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const ch = buf.getChannelData(0)
    for (let j = 0; j < len; j++) ch[j] = Math.random() * 2 - 1
    const src = ctx.createBufferSource(); src.buffer = buf
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 5200; bp.Q.value = 1
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(vel * 0.16, t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07)
    const sp = ctx.createStereoPanner(); sp.pan.value = (Math.random() - 0.5) * 0.5
    src.connect(bp); bp.connect(g); g.connect(sp); sp.connect(drumsBusRef.current!)
    const rSend = ctx.createGain(); rSend.gain.value = 0.1
    g.connect(rSend); rSend.connect(reverbInRef.current!)
    src.start(t)
  }, [])

  // NOISE RISER — fired every 4 bars to build into the next loop.
  const noiseSweep = useCallback((t: number, durSec: number) => {
    const ctx = audioCtxRef.current!
    const len = Math.max(1, Math.floor(ctx.sampleRate * durSec))
    const buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch)
      for (let j = 0; j < len; j++) data[j] = Math.random() * 2 - 1
    }
    const src = ctx.createBufferSource(); src.buffer = buf
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3
    lp.frequency.setValueAtTime(200, t)
    lp.frequency.exponentialRampToValueAtTime(9000, t + durSec)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.12, t + durSec * 0.95)
    g.gain.exponentialRampToValueAtTime(0.0001, t + durSec + 0.05)
    src.connect(lp); lp.connect(g); g.connect(masterRef.current!)
    const rSend = ctx.createGain(); rSend.gain.value = 0.4
    g.connect(rSend); rSend.connect(reverbInRef.current!)
    src.start(t)
    src.stop(t + durSec + 0.1)
  }, [])

  const clave = useCallback((t: number, vel: number) => {
    const ctx = audioCtxRef.current!
    const carrier = ctx.createOscillator(); carrier.type = 'sine'; carrier.frequency.value = 2200
    const mod = ctx.createOscillator(); mod.type = 'sine'; mod.frequency.value = 2200 * 1.4
    const mg = ctx.createGain()
    mg.gain.setValueAtTime(1700, t)
    mg.gain.exponentialRampToValueAtTime(8, t + 0.04)
    mod.connect(mg); mg.connect(carrier.frequency)
    const amp = ctx.createGain()
    amp.gain.setValueAtTime(0.0001, t)
    amp.gain.exponentialRampToValueAtTime(Math.max(0.001, vel * 0.32), t + 0.002)
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
    const sp = ctx.createStereoPanner(); sp.pan.value = -0.35
    carrier.connect(amp); amp.connect(sp); sp.connect(drumsBusRef.current!)
    const dSend = ctx.createGain(); dSend.gain.value = 0.18; amp.connect(dSend); dSend.connect(delayInRef.current!)
    const rSend = ctx.createGain(); rSend.gain.value = 0.15; amp.connect(rSend); rSend.connect(reverbInRef.current!)
    carrier.start(t); mod.start(t); carrier.stop(t + 0.1); mod.stop(t + 0.1)
  }, [])

  const hat = useCallback((t: number, vel: number, openish: boolean, step: number) => {
    const ctx = audioCtxRef.current!
    const dur = openish ? 0.17 : 0.04
    const ratios = [1, 2.4, 3.74, 4.91, 5.91, 7.41]
    const baseFreq = 320 + Math.random() * 30
    const mix = ctx.createGain(); mix.gain.value = 0.14
    const oscs = ratios.map(r => {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = baseFreq * r
      o.connect(mix); return o
    })
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = openish ? 5800 : 9000; bp.Q.value = 1.2
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000
    const amp = ctx.createGain()
    amp.gain.setValueAtTime(0.0001, t)
    amp.gain.exponentialRampToValueAtTime(Math.max(0.001, vel * 0.36), t + 0.001)
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    const panV = ((step % 4) - 1.5) / 1.5 * 0.45
    const sp = ctx.createStereoPanner(); sp.pan.value = panV
    mix.connect(bp); bp.connect(hp); hp.connect(amp); amp.connect(sp); sp.connect(drumsBusRef.current!)
    const dSend = ctx.createGain(); dSend.gain.value = openish ? 0.32 : 0.22; amp.connect(dSend); dSend.connect(delayInRef.current!)
    const rSend = ctx.createGain(); rSend.gain.value = openish ? 0.28 : 0.14; amp.connect(rSend); rSend.connect(reverbInRef.current!)
    oscs.forEach(o => { o.start(t); o.stop(t + dur + 0.02) })
  }, [])

  // BASS — sub + detuned saws + square octave + drive + heavy filter envelope.
  const bass = useCallback((t: number, hz: number, vel: number, cutoff: number) => {
    const ctx = audioCtxRef.current!
    const bus = bassBusRef.current!

    // Sub
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = hz / 2
    const subAmp = ctx.createGain()
    subAmp.gain.setValueAtTime(0.0001, t)
    subAmp.gain.exponentialRampToValueAtTime(vel * 0.6, t + 0.005)
    subAmp.gain.exponentialRampToValueAtTime(0.0001, t + 0.42)
    sub.connect(subAmp); subAmp.connect(bus)

    // Main: two saws + square one octave below for grit
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = hz
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = hz * (1.005 + Math.random() * 0.004)
    const sq = ctx.createOscillator(); sq.type = 'square'; sq.frequency.value = hz
    const sqg = ctx.createGain(); sqg.gain.value = 0.32 // square layer level
    sq.connect(sqg)

    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 10
    // Harder filter envelope: cutoff×3 → cutoff over 120ms
    lp.frequency.setValueAtTime(cutoff * 3, t)
    lp.frequency.exponentialRampToValueAtTime(cutoff, t + 0.12)

    // Per-voice drive (separate from bus saturator, hits harmonics earlier in the chain)
    const drive = ctx.createWaveShaper()
    drive.curve = bassDriveCurveRef.current!
    drive.oversample = '2x'

    const amp = ctx.createGain()
    amp.gain.setValueAtTime(0.0001, t)
    amp.gain.exponentialRampToValueAtTime(vel * 0.42, t + 0.012)
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.42)

    o1.connect(lp); o2.connect(lp); sqg.connect(lp)
    lp.connect(drive); drive.connect(amp); amp.connect(bus)

    sub.start(t); o1.start(t); o2.start(t); sq.start(t)
    sub.stop(t + 0.45); o1.stop(t + 0.46); o2.stop(t + 0.46); sq.stop(t + 0.46)
  }, [])

  const rhodes = useCallback((t: number, freqs: number[], vel: number) => {
    const ctx = audioCtxRef.current!
    const bus = melodyBusRef.current!
    freqs.forEach((hz, i) => {
      const c = ctx.createOscillator(); c.type = 'sine'; c.frequency.value = hz
      const m = ctx.createOscillator(); m.type = 'sine'; m.frequency.value = hz * 14
      const mg = ctx.createGain()
      mg.gain.setValueAtTime(hz * 4.5, t)
      mg.gain.exponentialRampToValueAtTime(hz * 0.4, t + 0.25)
      m.connect(mg); mg.connect(c.frequency)
      const amp = ctx.createGain()
      amp.gain.setValueAtTime(0.0001, t)
      amp.gain.exponentialRampToValueAtTime(Math.max(0.001, vel * 0.22), t + 0.003)
      amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.85)
      const pan = ((i / Math.max(1, freqs.length - 1)) - 0.5) * 0.7
      const sp = ctx.createStereoPanner(); sp.pan.value = pan
      c.connect(amp); amp.connect(sp); sp.connect(bus)
      const dSend = ctx.createGain(); dSend.gain.value = 0.22; amp.connect(dSend); dSend.connect(delayInRef.current!)
      const rSend = ctx.createGain(); rSend.gain.value = 0.42; amp.connect(rSend); rSend.connect(reverbInRef.current!)
      c.start(t); m.start(t); c.stop(t + 0.9); m.stop(t + 0.9)
    })
  }, [])

  const mallet = useCallback((t: number, hz: number, vel: number, pan: number) => {
    const ctx = audioCtxRef.current!
    const c = ctx.createOscillator(); c.type = 'sine'; c.frequency.value = hz
    const m = ctx.createOscillator(); m.type = 'sine'; m.frequency.value = hz * 3.5
    const mg = ctx.createGain()
    mg.gain.setValueAtTime(hz * 5, t)
    mg.gain.exponentialRampToValueAtTime(hz * 0.25, t + 0.06)
    m.connect(mg); mg.connect(c.frequency)
    const amp = ctx.createGain()
    amp.gain.setValueAtTime(0.0001, t)
    amp.gain.exponentialRampToValueAtTime(Math.max(0.001, vel * 0.3), t + 0.002)
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.45)
    const sp = ctx.createStereoPanner(); sp.pan.value = pan
    c.connect(amp); amp.connect(sp); sp.connect(melodyBusRef.current!)
    const dSend = ctx.createGain(); dSend.gain.value = 0.45; amp.connect(dSend); dSend.connect(delayInRef.current!)
    const rSend = ctx.createGain(); rSend.gain.value = 0.52; amp.connect(rSend); rSend.connect(reverbInRef.current!)
    c.start(t); m.start(t); c.stop(t + 0.5); m.stop(t + 0.5)
  }, [])

  const pad = useCallback((t: number, chord: readonly number[], dur: number, vel: number) => {
    const ctx = audioCtxRef.current!
    const bus = melodyBusRef.current!
    chord.forEach((hz, i) => {
      const f = hz / 2
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = f
      const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f * (1.005 + i * 0.0012)
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2
      lp.frequency.setValueAtTime(280, t)
      lp.frequency.linearRampToValueAtTime(1700, t + dur * 0.45)
      lp.frequency.linearRampToValueAtTime(550, t + dur)
      const amp = ctx.createGain()
      amp.gain.setValueAtTime(0.0001, t)
      amp.gain.linearRampToValueAtTime(vel * 0.06, t + dur * 0.25)
      amp.gain.linearRampToValueAtTime(0.0001, t + dur)
      const pan = ((i / Math.max(1, chord.length - 1)) - 0.5) * 1.5
      const sp = ctx.createStereoPanner(); sp.pan.value = pan
      o1.connect(lp); o2.connect(lp); lp.connect(amp); amp.connect(sp); sp.connect(bus)
      const rSend = ctx.createGain(); rSend.gain.value = 0.6; amp.connect(rSend); rSend.connect(reverbInRef.current!)
      o1.start(t); o2.start(t)
      o1.stop(t + dur + 0.08); o2.stop(t + dur + 0.08)
    })
  }, [])

  // ───────── Sequencer ─────────
  const scheduleStep = useCallback((step: number, time: number) => {
    const s = slidersRef.current
    const stepInBar = step % STEPS_PER_BAR
    const barIdx = Math.floor(step / STEPS_PER_BAR) % BARS
    const chord = PROGRESSION[barIdx]
    const sub = stepInBar % 4
    const beatInBar = Math.floor(stepInBar / 4)

    if (stepInBar === 0) {
      const barSec = (60 / bpmRef.current) * 4
      pad(time, chord.chord, barSec, 0.35 + s.melody * 0.65)
    }

    // KICK — on the grid, every quarter
    if (sub === 0) kick(time, 0.92)

    // CLAP + SNARE — on beats 2 and 4 (the backbeat)
    if (stepInBar === 4 || stepInBar === 12) {
      clap(time + jitter() * 0.4, velJ(0.85))
      snare(time, velJ(0.55))
    }

    // CLAVE — drive-driven, off-grid colour
    if (s.drive > 0.5  && stepInBar === 10) clave(time + jitter(), velJ(s.drive * 0.5))
    if (s.drive > 0.8  && stepInBar === 6)  clave(time + jitter(), velJ(s.drive * 0.4))

    // SHAKER — 8th notes underneath the hat
    if (sub === 0 || sub === 2) {
      const sShake = s.shuffle * 0.018 * (sub === 2 ? 1 : 0)
      shaker(time + sShake + jitter(), velJ(0.5 + s.shuffle * 0.3))
    }

    // HATS
    const playHat =
      sub === 0 ||
      sub === 2 ||
      (s.shuffle > 0.28 && sub === 3) ||
      (s.shuffle > 0.6 && sub === 1 && Math.random() < 0.65)
    if (playHat) {
      const swingMs = sub === 3 ? s.shuffle * 0.045 : sub === 1 ? s.shuffle * 0.022 : 0
      const accent = sub === 0 ? 1 : sub === 2 ? 0.6 : 0.4
      const vel = velJ(accent * (0.55 + s.shuffle * 0.5))
      const openish = s.shuffle > 0.75 && sub === 2 && beatInBar === 3 && Math.random() < 0.45
      hat(time + swingMs + jitter(), vel, openish, step)
    }

    // BASS
    if (sub === 0 || sub === 2) {
      const pat = [0, 0, 0, 0, 0, 7, 5, 0]
      const idx = Math.floor(step / 2) % pat.length
      let hz = chord.bassRoot * Math.pow(2, pat[idx] / 12)
      if (s.bass > 0.55 && stepInBar === 14) hz *= 2
      const vel = velJ(0.6 + s.bass * 0.4)
      const cutoff = 260 + s.bass * 2400
      bass(time + jitter() * 0.5, hz, vel, cutoff)
    }

    // RHODES (low-melody side)
    const pianoLevel = Math.max(0, 1 - s.melody * 1.4)
    if (pianoLevel > 0.1 && (stepInBar === 0 || stepInBar === 8)) {
      rhodes(time + jitter(), chord.chord, velJ(pianoLevel * 0.8))
    }

    // MALLET ARP (high-melody side)
    if (s.melody > 0.22 && (sub === 0 || sub === 2)) {
      const notes = chord.melodyNotes
      const seqIdx = Math.floor(step / 2) % (notes.length * 2)
      const noteIdx = seqIdx < notes.length ? seqIdx : (notes.length * 2 - 1 - seqIdx)
      const hz = notes[noteIdx]
      const swing = s.shuffle * 0.022 * (sub === 2 ? 1 : 0)
      const malletPan = ((Math.floor(step / 2) % 4) - 1.5) / 1.5 * 0.55
      mallet(time + swing + jitter(), hz, velJ(s.melody * 0.7), malletPan)
    }

    // NOISE RISER — fire on step 56 (start of beat 3 of bar 4), spans 2 beats into the next loop.
    if (step === 56) {
      const sweepDur = (60 / bpmRef.current) * 2
      noiseSweep(time, sweepDur)
    }

    if (sub === 0) {
      const ctx = audioCtxRef.current!
      const delayMs = Math.max(0, (time - ctx.currentTime) * 1000)
      window.setTimeout(() => {
        setBeat(beatInBar)
        if (beatInBar === 0) setBar(barIdx)
      }, delayMs)
    }
  }, [kick, clap, snare, shaker, clave, hat, bass, rhodes, mallet, pad, noiseSweep])

  const tick = useCallback(() => {
    const ctx = audioCtxRef.current
    if (!ctx) return
    while (nextNoteTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD_S) {
      scheduleStep(stepRef.current, nextNoteTimeRef.current)
      nextNoteTimeRef.current += (60 / bpmRef.current) / 4
      stepRef.current = (stepRef.current + 1) % TOTAL_STEPS
    }
  }, [scheduleStep])

  const start = useCallback(async () => {
    initAudio()
    const ctx = audioCtxRef.current!
    if (ctx.state === 'suspended') await ctx.resume()
    nextNoteTimeRef.current = ctx.currentTime + 0.06
    stepRef.current = 0
    if (schedulerRef.current) clearInterval(schedulerRef.current)
    schedulerRef.current = setInterval(tick, LOOKAHEAD_MS)
    setPlaying(true)
  }, [initAudio, tick])

  const stop = useCallback(() => {
    if (schedulerRef.current) { clearInterval(schedulerRef.current); schedulerRef.current = null }
    audioCtxRef.current?.suspend()
    setPlaying(false)
    setBeat(-1)
  }, [])

  useEffect(() => () => {
    if (schedulerRef.current) clearInterval(schedulerRef.current)
    audioCtxRef.current?.close().catch(() => {})
  }, [])

  const setSlider = (key: keyof Sliders) => (value: number) => {
    setSliders(prev => ({ ...prev, [key]: value }))
  }

  return (
    <section id="mixer" className="mixer">
      <style>{`
        .mixer { background: #f5f3ee; color: #0a0a0a; padding: 5rem 2.5rem 6rem; border-top: 1px solid rgba(10,10,10,0.08); }
        .mixer-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 2rem; margin-bottom: 3rem; flex-wrap: wrap; }
        .mixer-headline {
          font-family: 'Archivo Black', sans-serif; font-size: clamp(40px, 5vw, 72px);
          line-height: 0.95; letter-spacing: -0.015em; transform: scaleX(1.1); transform-origin: left center;
        }
        .mixer-sub { font-family: 'DM Mono', monospace; font-size: 0.7rem; letter-spacing: 0.18em; text-transform: uppercase; opacity: 0.55; max-width: 32ch; }
        .mixer-panel { border: 1px solid rgba(10,10,10,0.85); padding: 2.2rem 2rem 2rem; display: grid; grid-template-columns: 1fr auto; gap: 2.5rem; align-items: stretch; background: #f5f3ee; }
        .mixer-sliders { display: grid; grid-template-columns: repeat(5, 1fr); gap: 1.2rem; min-height: 280px; }
        .slider-col { display: flex; flex-direction: column; align-items: center; gap: 0.6rem; }
        .slider-val { font-family: 'DM Mono', monospace; font-size: 0.6rem; letter-spacing: 0.18em; opacity: 0.55; height: 12px; }
        .slider-track { position: relative; flex: 1; width: 14px; background: #fff; border: 1px solid #0a0a0a; touch-action: none; cursor: none; }
        .slider-fill { position: absolute; left: 0; right: 0; bottom: 0; background: #0a0a0a; transition: height 0.06s linear; }
        .slider-handle { position: absolute; left: -7px; right: -7px; height: 8px; background: #0a0a0a; transform: translateY(50%); pointer-events: none; transition: bottom 0.06s linear; }
        .slider-track:active .slider-handle { left: -10px; right: -10px; height: 12px; }
        .slider-label { font-family: 'DM Mono', monospace; font-size: 0.6rem; letter-spacing: 0.22em; text-transform: uppercase; }
        .mixer-right { display: flex; flex-direction: column; justify-content: space-between; align-items: stretch; min-width: 240px; gap: 1.4rem; }
        .knob-wrap { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
        .knob-label { font-family: 'DM Mono', monospace; font-size: 0.6rem; letter-spacing: 0.22em; text-transform: uppercase; opacity: 0.6; }
        .knob { width: 72px; height: 72px; border-radius: 50%; border: 1px solid #0a0a0a; background: #f5f3ee; position: relative; touch-action: none; cursor: none; }
        .knob::before { content: ''; position: absolute; inset: 6px; border-radius: 50%; background: #fff; border: 1px solid rgba(10,10,10,0.4); }
        .knob-indicator { position: absolute; inset: 0; pointer-events: none; transform: rotate(var(--angle)); transition: transform 0.06s linear; }
        .knob-indicator::after { content: ''; position: absolute; top: 8px; left: 50%; width: 2px; height: 14px; background: #0a0a0a; transform: translateX(-50%); }
        .knob-value { font-family: 'Archivo Black', sans-serif; font-size: 1.4rem; letter-spacing: -0.01em; line-height: 1; }
        .knob-suffix { font-family: 'DM Mono', monospace; font-size: 0.6rem; letter-spacing: 0.22em; text-transform: uppercase; opacity: 0.6; margin-top: -2px; }
        .mixer-meta-row { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding-top: 0.8rem; border-top: 1px solid rgba(10,10,10,0.18); }
        .mixer-meta-row .label { font-family: 'DM Mono', monospace; font-size: 0.55rem; letter-spacing: 0.22em; text-transform: uppercase; opacity: 0.6; }
        .mixer-meta-row .value { font-family: 'Archivo Black', sans-serif; font-size: 1.05rem; letter-spacing: -0.005em; }
        .beats { display: flex; gap: 6px; }
        .beat { width: 12px; height: 12px; border: 1px solid #0a0a0a; background: #fff; transition: background 0.07s linear, transform 0.07s linear; }
        .beat.lit { background: #0a0a0a; transform: scale(1.08); }
        .play-btn { background: #0a0a0a; color: #f5f3ee; border: 1px solid #0a0a0a; font-family: 'DM Mono', monospace; font-size: 0.78rem; letter-spacing: 0.3em; text-transform: uppercase; padding: 1.1rem 1.4rem; cursor: none; display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; transition: background 0.2s, color 0.2s; width: 100%; }
        .play-btn:hover { background: #f5f3ee; color: #0a0a0a; }
        .play-btn .icon { width: 0; height: 0; border-style: solid; border-width: 6px 0 6px 9px; border-color: transparent transparent transparent currentColor; }
        .play-btn.is-playing .icon { width: 9px; height: 12px; border: none; background: linear-gradient(currentColor, currentColor) left/3px 100% no-repeat, linear-gradient(currentColor, currentColor) right/3px 100% no-repeat; background-color: transparent; }
        .mixer-footer { margin-top: 0.8rem; font-family: 'DM Mono', monospace; font-size: 0.58rem; letter-spacing: 0.18em; text-transform: uppercase; opacity: 0.45; }
        @media (max-width: 900px) {
          .mixer { padding: 3.5rem 1.25rem 4.5rem; }
          .mixer-panel { grid-template-columns: 1fr; padding: 1.5rem 1.2rem; gap: 1.6rem; }
          .mixer-sliders { min-height: 220px; }
          .mixer-right { min-width: 0; }
        }
      `}</style>

      <div className="mixer-head">
        <h2 className="mixer-headline reveal">PLAY THE NIGHT</h2>
        <p className="mixer-sub reveal reveal-d1">
          Drag the sliders. Twist the tempo. Five knobs, four chords, one excuse to play DJ.
        </p>
      </div>

      <div className="mixer-panel reveal reveal-d2">
        <div className="mixer-sliders">
          <SliderColumn label="Drive"   value={sliders.drive}   onChange={setSlider('drive')} />
          <SliderColumn label="Bass"    value={sliders.bass}    onChange={setSlider('bass')} />
          <SliderColumn label="Melody"  value={sliders.melody}  onChange={setSlider('melody')} />
          <SliderColumn label="Shuffle" value={sliders.shuffle} onChange={setSlider('shuffle')} />
          <SliderColumn label="Echo"    value={sliders.echo}    onChange={setSlider('echo')} />
        </div>

        <div className="mixer-right">
          <Knob
            label="Tempo"
            value={bpm}
            min={BPM_MIN}
            max={BPM_MAX}
            step={1}
            onChange={(v) => setBpm(Math.round(v))}
            suffix="BPM"
          />

          <div className="mixer-meta-row">
            <span className="label">Chord</span>
            <span className="value">{PROGRESSION[bar].name}</span>
          </div>
          <div className="mixer-meta-row">
            <span className="label">Beat</span>
            <div className="beats" aria-label="beat indicator">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className={`beat${beat === i ? ' lit' : ''}`} />
              ))}
            </div>
          </div>

          <div>
            <button
              type="button"
              className={`play-btn${playing ? ' is-playing' : ''}`}
              onClick={() => (playing ? stop() : start())}
            >
              <span>{playing ? 'Stop' : 'Play'}</span>
              <span className="icon" aria-hidden="true" />
            </button>
            <p className="mixer-footer">No samples — every note synthesized live.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

function SliderColumn({
  label, value, onChange,
}: { label: string; value: number; onChange: (v: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const updateFromY = (clientY: number) => {
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    const v = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    onChange(v)
  }
  return (
    <div className="slider-col">
      <div className="slider-val">{Math.round(value * 100).toString().padStart(2, '0')}</div>
      <div
        ref={trackRef}
        className="slider-track"
        role="slider"
        aria-label={label}
        aria-valuenow={Math.round(value * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); updateFromY(e.clientY) }}
        onPointerMove={(e) => { if (e.buttons === 1) updateFromY(e.clientY) }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp')   onChange(Math.min(1, value + 0.05))
          if (e.key === 'ArrowDown') onChange(Math.max(0, value - 0.05))
        }}
      >
        <div className="slider-fill" style={{ height: `${value * 100}%` }} />
        <div className="slider-handle" style={{ bottom: `${value * 100}%` }} />
      </div>
      <div className="slider-label">{label}</div>
    </div>
  )
}

function Knob({
  label, value, min, max, step, onChange, suffix,
}: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; suffix?: string;
}) {
  const startYRef = useRef(0)
  const startValRef = useRef(0)
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    startYRef.current = e.clientY
    startValRef.current = value
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return
    const dy = startYRef.current - e.clientY
    const range = max - min
    const sensitivity = e.shiftKey ? 360 : 140
    let next = startValRef.current + (dy / sensitivity) * range
    next = Math.max(min, Math.min(max, next))
    if (step) next = Math.round(next / step) * step
    onChange(next)
  }
  const norm = (value - min) / (max - min)
  const angle = -135 + norm * 270
  return (
    <div className="knob-wrap">
      <div className="knob-label">{label}</div>
      <div
        className="knob"
        role="slider"
        aria-label={label}
        aria-valuenow={Math.round(value)}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp')   onChange(Math.min(max, value + (step ?? 1)))
          if (e.key === 'ArrowDown') onChange(Math.max(min, value - (step ?? 1)))
        }}
      >
        <div className="knob-indicator" style={{ ['--angle' as string]: `${angle}deg` }} />
      </div>
      <div className="knob-value">{Math.round(value)}</div>
      {suffix && <div className="knob-suffix">{suffix}</div>}
    </div>
  )
}
