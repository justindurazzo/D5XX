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
const BARS = 4 // chord progression length (Am → F → C → G)

// Arrangement form: 16-bar cycle.
// Bars  0–7  → DROP       (full mix, lead plays the hook)
// Bars  8–11 → BREAKDOWN  (drums drop out, pad swells, lead silent)
// Bars 12–15 → BUILD      (snare roll accelerates, 4-bar riser, lead at half-vol)
// Then back to DROP. The chord progression cycles 4× within one arrangement.
const ARR_BARS = 16
const ARR_STEPS = STEPS_PER_BAR * ARR_BARS // 256

const SECTION_NAMES = ['DROP', 'BREAKDOWN', 'BUILD'] as const
function getSection(arrBar: number): 0 | 1 | 2 {
  if (arrBar < 8) return 0
  if (arrBar < 12) return 1
  return 2
}

// 8 eighth-note slots per bar; null = rest. Sparse 4-note hook — the rhythm shape is
// the same every bar (slots 0, 2, 5, 6) so it reads as a memorable hook, while the
// pitches move. Values index the current chord's melodyNotes (5 entries each).
const LEAD_PATTERNS: ReadonlyArray<ReadonlyArray<number | null>> = [
  [3, null, 4, null, null, 3, 2, null], // bar 1 of progression
  [2, null, 3, null, null, 2, 1, null], // bar 2
  [3, null, 4, null, null, 4, 2, null], // bar 3
  [3, null, 2, null, null, 1, 2, null], // bar 4 — leads back to bar 1
]

// Am → F → C → G (i-VI-III-VII in A natural minor — the "All My Friends" / "Dance Yrself Clean" vibe).
const PROGRESSION = [
  { name: 'Am', bassRoot: 110.00, chord: [220.00, 261.63, 329.63, 392.00], melodyNotes: [440.00, 523.25, 587.33, 659.25, 783.99] },
  { name: 'F',  bassRoot: 87.31,  chord: [174.61, 220.00, 261.63, 329.63], melodyNotes: [349.23, 392.00, 440.00, 523.25, 659.25] },
  { name: 'C',  bassRoot: 130.81, chord: [261.63, 329.63, 392.00, 493.88], melodyNotes: [523.25, 587.33, 659.25, 783.99, 987.77] },
  { name: 'G',  bassRoot: 98.00,  chord: [196.00, 246.94, 293.66, 391.99], melodyNotes: [392.00, 440.00, 493.88, 587.33, 783.99] },
] as const

const INITIAL_SLIDERS: Sliders = {
  drive: 0.74,  // more analog grit/drive — LCD Soundsystem rawness
  bass: 0.62,   // driving, insistent low end
  melody: 0.4,  // lead sits in the groove, not on top of it
  shuffle: 0.45,
  echo: 0.48,   // dub-style delay
}
const INITIAL_BPM = 114 // groovy, propulsive — danceable but not bright pop
const BPM_MIN = 80
const BPM_MAX = 160

// 0 = Lafayette, 0.5 = Wall Street, 1 = The World. Start at Wall Street (full mix).
const INITIAL_SCENE = 0.5
const SCENE_LABELS = ['Lafayette', 'Wall Street', 'The World'] as const

// ───────── Audio helpers ─────────

// Procedural impulse responses for the three scene reverbs. Spring is intimate and
// twangy (Lafayette), plate is bright and dense (Wall Street), chamber is woody and
// deep (The World). No external IR files — everything is synthesized at startup.
type IRType = 'spring' | 'plate' | 'chamber'
function makeIR(ctx: BaseAudioContext, type: IRType): AudioBuffer {
  const sr = ctx.sampleRate
  const durSec = type === 'spring' ? 1.2 : type === 'plate' ? 1.8 : 2.0
  const buf = ctx.createBuffer(2, Math.floor(sr * durSec), sr)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < d.length; i++) {
      const t = i / sr
      if (type === 'spring') {
        const env = Math.exp(-t * 3.5)
        const click = (Math.random() * 2 - 1) * env
        const ring1 = Math.sin(2 * Math.PI * 1200 * t + ch * 0.3) * env * 0.4
        const ring2 = Math.sin(2 * Math.PI * 1850 * t) * env * 0.25
        const chirp = Math.sin(2 * Math.PI * (300 + 800 * Math.exp(-t * 8)) * t) * env * 0.5
        d[i] = (click * 0.6 + ring1 + ring2 + chirp) * 0.4
      } else if (type === 'plate') {
        if (t < 0.008) { d[i] = 0; continue }
        const env = Math.exp(-t * 2.2)
        const noise = (Math.random() * 2 - 1) * env
        const hi = Math.sin(2 * Math.PI * 4500 * t) * env * 0.1
        d[i] = (noise + hi) * 0.5
      } else {
        if (t < 0.015) { d[i] = 0; continue }
        const env = Math.exp(-t * 1.8)
        const n = Math.random() * 2 - 1
        const woody =
          Math.sin(2 * Math.PI * 180 * t) * 0.3 +
          Math.sin(2 * Math.PI * 420 * t) * 0.2 +
          Math.sin(2 * Math.PI * 760 * t) * 0.15
        d[i] = (n * 0.7 + woody) * env * 0.5
      }
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

// Bit-crusher curve: quantizes amplitude to 2^bits steps. 16 = effectively transparent;
// 3 = obvious lo-fi crunch. Combined with a lowpass downstream (to fake aliasing/SR
// reduction), this gives a convincing "cassette / old sampler" feel.
function makeBitCrushCurve(bits: number, samples = 4096) {
  const step = 2 / Math.pow(2, bits)
  const curve = new Float32Array(samples)
  for (let i = 0; i < samples; i++) {
    const x = (i / samples) * 2 - 1
    curve[i] = Math.round(x / step) * step
  }
  return curve
}

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

// Vinyl-crackle bed — sparse random transient clicks over near-silence. Raising the
// amplitude to the 4th power keeps most clicks faint with the occasional louder pop,
// the way real surface noise sits; looped under the mix it adds tape/record character.
function makeCrackleBuffer(ctx: AudioContext, seconds: number) {
  const sr = ctx.sampleRate
  const len = Math.floor(sr * seconds)
  const buf = ctx.createBuffer(2, len, sr)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    let i = 0
    while (i < len) {
      // Gap to the next click — 4–94ms, so density averages roughly ~20/sec.
      i += Math.floor(sr * (0.004 + Math.random() * 0.09))
      if (i >= len) break
      // A click: a short decaying spike, random polarity, 4th-power amplitude skew.
      const amp = Math.pow(Math.random(), 4) * (Math.random() < 0.5 ? -1 : 1)
      const clickLen = 1 + Math.floor(Math.random() * 5)
      for (let j = 0; j < clickLen && i + j < len; j++) {
        d[i + j] += amp * Math.exp(-j * 0.7)
      }
      i += clickLen
    }
  }
  return buf
}

// Equal-power three-way blend across two segments (Lafayette → Wall Street → The World).
// Combined RMS stays ≈ 1 at every fader position; only one adjacent pair is non-zero at a time.
function threeBlend(s: number): [number, number, number] {
  if (s <= 0.5) {
    const t = s * 2
    return [Math.cos(t * Math.PI / 2), Math.sin(t * Math.PI / 2), 0]
  }
  const t = (s - 0.5) * 2
  return [0, Math.cos(t * Math.PI / 2), Math.sin(t * Math.PI / 2)]
}

const jitter = () => (Math.random() - 0.5) * 0.008
const velJ   = (v: number) => v * (0.9 + Math.random() * 0.2)

// Slow random LFO → detune. Gives sustained voices a subtle pitch "breathing" so they
// don't sit dead-still — the trick that separates a warm synth from a toy one.
function attachDrift(ctx: AudioContext, targets: AudioParam[], t: number, stopAt: number, cents: number) {
  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.value = 0.15 + Math.random() * 0.35
  const depth = ctx.createGain(); depth.gain.value = cents
  lfo.connect(depth)
  targets.forEach(p => depth.connect(p))
  lfo.start(t)
  lfo.stop(stopAt)
}

// Built once at module load. Reused for every bass note's per-voice waveshaper.
// (Module-level so its inferred type is Float32Array<ArrayBuffer>, which is what
// WaveShaperNode.curve expects — a ref-typed Float32Array widens to ArrayBufferLike.)
const BASS_DRIVE_CURVE = makeTanhCurve(1.2)
// Gentle saturation for the euphoric supersaw motif — warms the saw stack.
const SUPERSAW_DRIVE = makeTanhCurve(1.6)

type MixerProps = {
  /** When true, the mixer starts playing automatically (with a master gain fade-in). */
  autoplay?: boolean
  /** Delay (ms) between autoplay becoming true and the audio actually starting. */
  autoplayDelay?: number
}

export default function Mixer2({ autoplay = false, autoplayDelay = 400 }: MixerProps = {}) {
  const [playing, setPlaying] = useState(false)
  const [sliders, setSliders] = useState<Sliders>(INITIAL_SLIDERS)
  const [bpm, setBpm] = useState(INITIAL_BPM)
  const [scene, setScene] = useState(INITIAL_SCENE)
  const [beat, setBeat] = useState(-1)
  const [bar, setBar] = useState(0)
  const [arrBarUI, setArrBarUI] = useState(-1) // -1 = stopped
  const [section, setSection] = useState<0 | 1 | 2>(0)

  // User-controlled filter macro (0..100; 100 = fully open). Maps to 80Hz..18kHz exponentially.
  const [filterPct, setFilterPct] = useState(100)
  // Reverb wet (0..1). Default matches the previous fixed value so first play sounds the same.
  const [reverbAmt, setReverbAmt] = useState(0.7)
  // Lo-fi bit crusher (0..100; 0 = transparent, 100 = obvious crunch).
  const [crushPct, setCrushPct] = useState(0)
  // One-shot "drag me" prompt on the X-Y pad after autoplay-reveal.
  const [nudgeXY, setNudgeXY] = useState(false)

  // Click-to-mute state for the activity LEDs. Categories map to multiple underlying voices.
  type MuteKey = 'KICK' | 'CLAP' | 'HAT' | 'BASS' | 'LEAD' | 'PAD'
  const [mutes, setMutes] = useState<Record<MuteKey, boolean>>({
    KICK: false, CLAP: false, HAT: false, BASS: false, LEAD: false, PAD: false,
  })

  const audioCtxRef     = useRef<AudioContext | null>(null)
  const masterRef       = useRef<GainNode | null>(null)

  // Wall Street buses
  const drumsBusRef     = useRef<GainNode | null>(null)
  const bassBusRef      = useRef<GainNode | null>(null)
  const melodyBusRef    = useRef<GainNode | null>(null)
  const sidechainRef    = useRef<GainNode | null>(null)

  // Lafayette + World buses
  const lafBusRef       = useRef<GainNode | null>(null)
  const atmosBusRef     = useRef<GainNode | null>(null)

  // Scene crossfade taps
  const sceneLafRef     = useRef<GainNode | null>(null)
  const sceneWallRef    = useRef<GainNode | null>(null)
  const sceneWorldRef   = useRef<GainNode | null>(null)

  // Effects
  const delayInRef      = useRef<GainNode | null>(null)
  const delayLRef       = useRef<DelayNode | null>(null)
  const delayRRef       = useRef<DelayNode | null>(null)
  const delayWetRef     = useRef<GainNode | null>(null)
  const delayFbRef      = useRef<GainNode | null>(null)
  const reverbInRef     = useRef<GainNode | null>(null)
  const reverbWetRef    = useRef<GainNode | null>(null)
  const mixFilterRef    = useRef<BiquadFilterNode | null>(null)
  const userFilterRef   = useRef<BiquadFilterNode | null>(null)
  const lofiCrushRef    = useRef<WaveShaperNode | null>(null)
  const lofiLowpassRef  = useRef<BiquadFilterNode | null>(null)
  const bassSidechainRef = useRef<GainNode | null>(null)
  // Master-bus tape stage (wow/flutter) — depth + tone are driven off the Crush knob.
  const tapeWowDepthRef     = useRef<GainNode | null>(null)
  const tapeFlutterDepthRef = useRef<GainNode | null>(null)
  const tapeToneRef         = useRef<BiquadFilterNode | null>(null)
  // Scene-mapped reverb: three convolvers crossfaded by the scene fader.
  const reverbSpringRef  = useRef<GainNode | null>(null)
  const reverbPlateRef   = useRef<GainNode | null>(null)
  const reverbChamberRef = useRef<GainNode | null>(null)
  const mutesRef        = useRef<Record<MuteKey, boolean>>(mutes)
  // (bassDriveCurveRef removed — BASS_DRIVE_CURVE module const used instead, see top of file)

  // Activity LED DOM refs — direct manipulation avoids React re-render churn on every voice fire.
  const ledRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const slidersRef      = useRef<Sliders>(sliders)
  const bpmRef          = useRef<number>(bpm)
  const sceneRef        = useRef<number>(scene)
  const schedulerRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const nextNoteTimeRef = useRef(0)
  const stepRef         = useRef(0)
  // Last lead note frequency — lets the monophonic lead glide (portamento) into each note.
  const lastLeadHzRef   = useRef<number | null>(null)

  useEffect(() => { slidersRef.current = sliders }, [sliders])
  useEffect(() => { sceneRef.current = scene }, [scene])
  useEffect(() => { mutesRef.current = mutes }, [mutes])

  // Reverb wet — driven by the X-Y pad's Y axis. Range 0..1 maps directly to the wet bus gain.
  useEffect(() => {
    const ctx = audioCtxRef.current
    const node = reverbWetRef.current
    if (!ctx || !node) return
    node.gain.setTargetAtTime(reverbAmt, ctx.currentTime, 0.04)
  }, [reverbAmt])

  // Lo-fi crush: bit-depth quantization + lowpass cutoff that closes as crush rises.
  // 0% = 16-bit / 18kHz (transparent); 100% = 3-bit / 2.4kHz (cassette / SP-303 territory).
  // The Crush knob also drives the master tape stage — wow/flutter depth and tape tone —
  // so it doubles as a "tape character" macro without adding a new visible control.
  useEffect(() => {
    const ctx = audioCtxRef.current
    const shaper = lofiCrushRef.current
    const lp = lofiLowpassRef.current
    if (!ctx || !shaper || !lp) return
    const v = crushPct / 100
    const bits = 16 - v * 13
    shaper.curve = makeBitCrushCurve(bits)
    const cutoff = 18000 * Math.pow(2400 / 18000, v) // exponential 18kHz → 2.4kHz
    lp.frequency.setTargetAtTime(cutoff, ctx.currentTime, 0.04)

    // Tape character: subtle at 0 (baseline shimmer), pronounced lo-fi wobble at 100.
    const wow = tapeWowDepthRef.current
    const flutter = tapeFlutterDepthRef.current
    const tone = tapeToneRef.current
    if (wow && flutter && tone) {
      wow.gain.setTargetAtTime(0.0004 + v * 0.0011, ctx.currentTime, 0.05)
      flutter.gain.setTargetAtTime(0.00001 + v * 0.00003, ctx.currentTime, 0.05)
      tone.frequency.setTargetAtTime(16000 - v * 8000, ctx.currentTime, 0.05)
    }
  }, [crushPct])

  // Filter macro: exponential map of 0..100 to 80Hz..18kHz. Q opens with the cut for resonant
  // DJ-sweep character (the classic "filter brings out the howl as you close it").
  useEffect(() => {
    const ctx = audioCtxRef.current
    const node = userFilterRef.current
    if (!ctx || !node) return
    const v = filterPct / 100
    const cutoff = 80 * Math.pow(225, v) // v=0 → 80Hz, v=1 → 18000Hz
    const Q = 1.2 + (1 - v) * 4.5
    node.frequency.setTargetAtTime(cutoff, ctx.currentTime, 0.025)
    node.Q.setTargetAtTime(Q, ctx.currentTime, 0.025)
  }, [filterPct])

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

  useEffect(() => {
    const ctx = audioCtxRef.current
    if (!ctx || !sceneLafRef.current || !sceneWallRef.current || !sceneWorldRef.current) return
    const t = ctx.currentTime
    const [gL, gW, gWorld] = threeBlend(scene)
    sceneLafRef.current.gain.setTargetAtTime(gL, t, 0.04)
    sceneWallRef.current.gain.setTargetAtTime(gW, t, 0.04)
    sceneWorldRef.current.gain.setTargetAtTime(gWorld, t, 0.04)
    // Crossfade the reverb IRs with the same equal-power blend — spring (Lafayette),
    // plate (Wall St), chamber (The World) — so the room character tracks the scene.
    if (reverbSpringRef.current && reverbPlateRef.current && reverbChamberRef.current) {
      reverbSpringRef.current.gain.setTargetAtTime(gL, t, 0.04)
      reverbPlateRef.current.gain.setTargetAtTime(gW, t, 0.04)
      reverbChamberRef.current.gain.setTargetAtTime(gWorld, t, 0.04)
    }
  }, [scene])

  // ───────── Audio graph ─────────
  const initAudio = useCallback(() => {
    if (audioCtxRef.current) return
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    audioCtxRef.current = ctx

    // Master chain
    const masterSat = ctx.createWaveShaper()
    masterSat.curve = makeTanhCurve(1.3)
    masterSat.oversample = '4x'

    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -10
    comp.knee.value = 18
    comp.ratio.value = 6
    comp.attack.value = 0.003
    comp.release.value = 0.14

    // Mix-bus lowpass: rolls off the whole mix during BREAKDOWN, sweeps open during BUILD.
    // Default fully open at 18kHz.
    const mixFilter = ctx.createBiquadFilter()
    mixFilter.type = 'lowpass'
    mixFilter.Q.value = 0.8
    mixFilter.frequency.value = 18000
    mixFilterRef.current = mixFilter

    // User filter macro — in series after the mix filter. Knob controls it directly.
    const userFilter = ctx.createBiquadFilter()
    userFilter.type = 'lowpass'
    userFilter.Q.value = 1.2 + (1 - 1.0) * 4.5
    userFilter.frequency.value = 80 * Math.pow(225, 1.0) // 18000 Hz at default
    userFilterRef.current = userFilter

    // Lo-fi crush stage at the end of the chain (we WANT the aliasing artifacts from
    // bit quantization, so oversample stays at 'none'). 16-bit / 18kHz = pass-through.
    const lofiCrush = ctx.createWaveShaper()
    lofiCrush.curve = makeBitCrushCurve(16)
    lofiCrush.oversample = 'none'
    const lofiLowpass = ctx.createBiquadFilter()
    lofiLowpass.type = 'lowpass'
    lofiLowpass.Q.value = 0.6
    lofiLowpass.frequency.value = 18000
    lofiCrushRef.current = lofiCrush
    lofiLowpassRef.current = lofiLowpass

    // ── TAPE: master-bus wow + flutter. A short modulated delay whose delayTime is
    // wobbled by a slow wow LFO + a fast flutter LFO; a tape-tone lowpass rolls the
    // top off. Depth + tone are driven by the Crush knob (see the crush useEffect),
    // so even at Crush=0 there's a faint shimmer and at 100% it goes properly lo-fi.
    const tapeDelay = ctx.createDelay(0.05)
    tapeDelay.delayTime.value = 0.004
    const tapeWow = ctx.createOscillator(); tapeWow.type = 'sine'; tapeWow.frequency.value = 0.4
    const tapeWowDepth = ctx.createGain(); tapeWowDepth.gain.value = 0.0004
    tapeWow.connect(tapeWowDepth); tapeWowDepth.connect(tapeDelay.delayTime)
    const tapeFlutter = ctx.createOscillator(); tapeFlutter.type = 'sine'; tapeFlutter.frequency.value = 6
    const tapeFlutterDepth = ctx.createGain(); tapeFlutterDepth.gain.value = 0.00001
    tapeFlutter.connect(tapeFlutterDepth); tapeFlutterDepth.connect(tapeDelay.delayTime)
    tapeWow.start(); tapeFlutter.start()
    const tapeTone = ctx.createBiquadFilter(); tapeTone.type = 'lowpass'; tapeTone.Q.value = 0.5
    // Master top end — warm and analog, but bright enough for the hats to cut (LCD-ish).
    tapeTone.frequency.value = 14000
    tapeWowDepthRef.current = tapeWowDepth
    tapeFlutterDepthRef.current = tapeFlutterDepth
    tapeToneRef.current = tapeTone

    const master = ctx.createGain()
    master.gain.value = 0.72
    // Saturation now runs BEFORE the filters (was: filters → masterSat). This is the
    // brief's #1 change — the Filter knob now sweeps saturated harmonics in and out of
    // the band instead of filtering an already-clean signal, so sweeps feel musical.
    master.connect(masterSat); masterSat.connect(mixFilter); mixFilter.connect(userFilter); userFilter.connect(comp)
    comp.connect(lofiCrush); lofiCrush.connect(lofiLowpass)
    lofiLowpass.connect(tapeDelay); tapeDelay.connect(tapeTone); tapeTone.connect(ctx.destination)
    masterRef.current = master

    // Scene buses (equal-power initial weights)
    const [gL0, gW0, gWorld0] = threeBlend(INITIAL_SCENE)
    const sceneLaf   = ctx.createGain(); sceneLaf.gain.value = gL0;     sceneLaf.connect(master);   sceneLafRef.current   = sceneLaf
    const sceneWall  = ctx.createGain(); sceneWall.gain.value = gW0;    sceneWall.connect(master);  sceneWallRef.current  = sceneWall
    const sceneWorld = ctx.createGain(); sceneWorld.gain.value = gWorld0; sceneWorld.connect(master); sceneWorldRef.current = sceneWorld

    // Stereo ping-pong delay with TAPE character:
    //   - darker damping (2200Hz lowpass) for each feedback pass
    //   - tanh waveshaper in the feedback path → harmonic richness builds over repeats
    //   - slow 0.35Hz LFO wobble on both delay times → tape wow/flutter
    const delayIn = ctx.createGain(); delayIn.gain.value = 1.0
    const delayL  = ctx.createDelay(2.0); delayL.delayTime.value = (60 / INITIAL_BPM) * 0.75
    const delayR  = ctx.createDelay(2.0); delayR.delayTime.value = (60 / INITIAL_BPM) * 0.75
    const damp    = ctx.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 2200
    const fbSat   = ctx.createWaveShaper(); fbSat.curve = makeTanhCurve(1.8); fbSat.oversample = '2x'
    const panL    = ctx.createStereoPanner(); panL.pan.value = -0.85
    const panR    = ctx.createStereoPanner(); panR.pan.value = 0.85
    const fb      = ctx.createGain(); fb.gain.value = 0.22 + INITIAL_SLIDERS.echo * 0.55
    const wet     = ctx.createGain(); wet.gain.value = INITIAL_SLIDERS.echo * 0.75

    // Tape wow/flutter — slow LFO modulates both delay times by ±0.8ms.
    const wobble = ctx.createOscillator(); wobble.type = 'sine'; wobble.frequency.value = 0.35
    const wobbleDepth = ctx.createGain(); wobbleDepth.gain.value = 0.0008
    wobble.connect(wobbleDepth)
    wobbleDepth.connect(delayL.delayTime)
    wobbleDepth.connect(delayR.delayTime)
    wobble.start()

    delayIn.connect(delayL)
    delayL.connect(panL); panL.connect(wet)
    delayL.connect(delayR)
    delayR.connect(panR); panR.connect(wet)
    delayR.connect(damp); damp.connect(fbSat); fbSat.connect(fb); fb.connect(delayL)
    wet.connect(master)

    delayInRef.current = delayIn
    delayLRef.current = delayL
    delayRRef.current = delayR
    delayWetRef.current = wet
    delayFbRef.current = fb

    // Scene-mapped convolution reverb: three procedural IRs (spring / plate / chamber)
    // fed in parallel from reverbIn, each through its own crossfade gain, summed into
    // reverbWet. The scene fader crossfades the three gains so Lafayette → Wall St →
    // The World changes the *character* of the tail. XY pad Y still drives wet/dry.
    const convSpring  = ctx.createConvolver(); convSpring.buffer  = makeIR(ctx, 'spring')
    const convPlate   = ctx.createConvolver(); convPlate.buffer   = makeIR(ctx, 'plate')
    const convChamber = ctx.createConvolver(); convChamber.buffer = makeIR(ctx, 'chamber')
    const reverbIn = ctx.createGain(); reverbIn.gain.value = 1.0
    const reverbWet = ctx.createGain(); reverbWet.gain.value = 0.74
    const springGain  = ctx.createGain(); springGain.gain.value  = gL0
    const plateGain   = ctx.createGain(); plateGain.gain.value   = gW0
    const chamberGain = ctx.createGain(); chamberGain.gain.value = gWorld0
    reverbIn.connect(convSpring);  convSpring.connect(springGain);   springGain.connect(reverbWet)
    reverbIn.connect(convPlate);   convPlate.connect(plateGain);     plateGain.connect(reverbWet)
    reverbIn.connect(convChamber); convChamber.connect(chamberGain); chamberGain.connect(reverbWet)
    reverbWet.connect(master)
    reverbInRef.current = reverbIn
    reverbWetRef.current = reverbWet
    reverbSpringRef.current = springGain
    reverbPlateRef.current = plateGain
    reverbChamberRef.current = chamberGain

    // ── WALL STREET buses → sceneWall ──
    const drumComp = ctx.createDynamicsCompressor()
    drumComp.threshold.value = -16
    drumComp.knee.value = 6
    drumComp.ratio.value = 6
    drumComp.attack.value = 0.001
    drumComp.release.value = 0.08
    const drumSat = ctx.createWaveShaper()
    drumSat.curve = makeTanhCurve(2.5)
    drumSat.oversample = '2x'
    const drums = ctx.createGain(); drums.gain.value = 0.99
    drums.connect(drumComp); drumComp.connect(drumSat); drumSat.connect(sceneWall)
    // Whole-kit room send — a little reverb off the drum bus glues the beats into a
    // space, so the kit reads as recorded-in-a-room rather than dry and synthetic.
    const drumRoom = ctx.createGain(); drumRoom.gain.value = 0.14
    drumSat.connect(drumRoom); drumRoom.connect(reverbIn)
    drumsBusRef.current = drums

    const bassSat = ctx.createWaveShaper()
    bassSat.curve = makeTanhCurve(1.5) // gentle — round warmth, not grit
    bassSat.oversample = '2x'
    // Bass sidechain — gentler than the melody bus (only ducks to 0.75) so the bass keeps weight.
    const bassSidechain = ctx.createGain(); bassSidechain.gain.value = 1.0
    bassSidechainRef.current = bassSidechain
    const bassBus = ctx.createGain(); bassBus.gain.value = 0.62
    bassBus.connect(bassSat); bassSat.connect(bassSidechain); bassSidechain.connect(sceneWall)
    bassBusRef.current = bassBus

    const melSat = ctx.createWaveShaper()
    melSat.curve = makeTanhCurve(1.6)
    melSat.oversample = '2x'
    const sidechain = ctx.createGain(); sidechain.gain.value = 1.0
    sidechain.connect(melSat); melSat.connect(sceneWall)
    sidechainRef.current = sidechain

    const mel = ctx.createGain(); mel.gain.value = 0.5
    mel.connect(sidechain)
    melodyBusRef.current = mel

    // ── LAFAYETTE bus → sceneLaf ── (dub character: a touch of grit + bias toward delay)
    const lafSat = ctx.createWaveShaper()
    lafSat.curve = makeTanhCurve(1.9)
    lafSat.oversample = '2x'
    const lafBus = ctx.createGain(); lafBus.gain.value = 0.85
    lafBus.connect(lafSat); lafSat.connect(sceneLaf)
    lafBusRef.current = lafBus

    // ── ATMOS bus (pad + mallet + world voices) → sceneWorld ──
    const atmosSat = ctx.createWaveShaper()
    atmosSat.curve = makeTanhCurve(1.3) // very gentle — preserve dynamics for the big sound
    atmosSat.oversample = '2x'
    const atmos = ctx.createGain(); atmos.gain.value = 0.85
    atmos.connect(atmosSat); atmosSat.connect(sceneWorld)
    atmosBusRef.current = atmos

    // Vinyl hiss bed (independent of scenes)
    const vinylSrc = ctx.createBufferSource()
    vinylSrc.buffer = makePinkNoiseBuffer(ctx, 4)
    vinylSrc.loop = true
    const vinylBp = ctx.createBiquadFilter(); vinylBp.type = 'bandpass'; vinylBp.frequency.value = 3500; vinylBp.Q.value = 0.4
    const vinylG = ctx.createGain(); vinylG.gain.value = 0.06
    vinylSrc.connect(vinylBp); vinylBp.connect(vinylG); vinylG.connect(master)
    vinylSrc.start()

    // Vinyl crackle bed — sparse transient clicks (record/tape surface noise),
    // band-limited and kept low so it reads as texture under the mix, not a distraction.
    const crackleSrc = ctx.createBufferSource()
    crackleSrc.buffer = makeCrackleBuffer(ctx, 8)
    crackleSrc.loop = true
    const crackleHp = ctx.createBiquadFilter()
    crackleHp.type = 'highpass'; crackleHp.frequency.value = 1100; crackleHp.Q.value = 0.5
    const crackleLp = ctx.createBiquadFilter()
    crackleLp.type = 'lowpass'; crackleLp.frequency.value = 7800; crackleLp.Q.value = 0.5
    const crackleG = ctx.createGain(); crackleG.gain.value = 0.42
    crackleSrc.connect(crackleHp); crackleHp.connect(crackleLp)
    crackleLp.connect(crackleG); crackleG.connect(master)
    crackleSrc.start()
  }, [])

  // ═══════════ WALL STREET voices (current full-mix palette) ═══════════

  const kick = useCallback((t: number, vel: number) => {
    const ctx = audioCtxRef.current!
    const drums = drumsBusRef.current!

    // Softer kick — longer pitch sweep, lower click amplitude. More "thud", less "techno tick".
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 48
    const subG = ctx.createGain()
    subG.gain.setValueAtTime(0.0001, t)
    subG.gain.exponentialRampToValueAtTime(vel * 0.95, t + 0.006)
    subG.gain.exponentialRampToValueAtTime(0.0001, t + 0.62)
    sub.connect(subG); subG.connect(drums)

    const o = ctx.createOscillator(); o.type = 'sine'
    o.frequency.setValueAtTime(170, t)
    o.frequency.exponentialRampToValueAtTime(44, t + 0.16) // longer sweep
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vel), t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
    o.connect(g); g.connect(drums)

    // Soft click — kept low so the kick is a round thud, not a digital tick.
    const len = Math.floor(ctx.sampleRate * 0.013)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len)
    const src = ctx.createBufferSource(); src.buffer = buf
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1300
    const cg = ctx.createGain(); cg.gain.value = vel * 0.22
    src.connect(hp); hp.connect(cg); cg.connect(drums)
    src.start(t)

    sub.start(t); sub.stop(t + 0.68)
    o.start(t); o.stop(t + 0.53)

    const sc = sidechainRef.current
    if (sc) {
      sc.gain.cancelScheduledValues(t)
      sc.gain.setValueAtTime(sc.gain.value, t)
      sc.gain.linearRampToValueAtTime(0.22, t + 0.012)
      sc.gain.exponentialRampToValueAtTime(1.0, t + 0.28)
    }
    // Bass sidechain — lighter duck so the low end stays present but ungumes the kick.
    const bsc = bassSidechainRef.current
    if (bsc) {
      bsc.gain.cancelScheduledValues(t)
      bsc.gain.setValueAtTime(bsc.gain.value, t)
      bsc.gain.linearRampToValueAtTime(0.75, t + 0.008)
      bsc.gain.exponentialRampToValueAtTime(1.0, t + 0.18)
    }
  }, [])

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
      const sp = ctx.createStereoPanner(); sp.pan.value = i * 0.06 - 0.09
      src.connect(bp); bp.connect(hp); hp.connect(g); g.connect(sp); sp.connect(drums)
      const rSend = ctx.createGain(); rSend.gain.value = last ? 0.55 : 0.25
      g.connect(rSend); rSend.connect(reverbInRef.current!)
      src.start(t + off)
    })
  }, [])

  const snare = useCallback((t: number, vel: number) => {
    const ctx = audioCtxRef.current!
    const drums = drumsBusRef.current!
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 195
    o.frequency.setValueAtTime(220, t)
    o.frequency.exponentialRampToValueAtTime(160, t + 0.05)
    const og = ctx.createGain()
    og.gain.setValueAtTime(0.0001, t)
    og.gain.exponentialRampToValueAtTime(vel * 0.4, t + 0.002)
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
    o.connect(og); og.connect(drums)

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

  // Woodblock — a soft pitched "tock" for the polyrhythmic counter-percussion. A triangle
  // blip with a fast pitch drop through a resonant bandpass; synthesizes cleanly, so it
  // adds organic tension without the toy quality of a synthesized kick or snare. Routed
  // to the drum bus, with a send to the atmos bus so it carries into the World scene.
  const woodblock = useCallback((t: number, vel: number, pan: number) => {
    const ctx = audioCtxRef.current!
    const o = ctx.createOscillator(); o.type = 'triangle'
    o.frequency.setValueAtTime(1150, t)
    o.frequency.exponentialRampToValueAtTime(720, t + 0.022)
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'
    bp.frequency.value = 900; bp.Q.value = 4.5
    const amp = ctx.createGain()
    amp.gain.setValueAtTime(0.0001, t)
    amp.gain.exponentialRampToValueAtTime(Math.max(0.001, vel), t + 0.003)
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.1)
    const sp = ctx.createStereoPanner(); sp.pan.value = pan
    o.connect(bp); bp.connect(amp); amp.connect(sp)
    sp.connect(drumsBusRef.current!)
    const wSend = ctx.createGain(); wSend.gain.value = 0.6
    sp.connect(wSend); wSend.connect(atmosBusRef.current!)
    const rSend = ctx.createGain(); rSend.gain.value = 0.3
    amp.connect(rSend); rSend.connect(reverbInRef.current!)
    o.start(t); o.stop(t + 0.13)
  }, [])

  // Brushed hat: filtered noise (no FM) with a gentle peaking shelf. Soft and airy
  // rather than crisp/metallic, with a slower attack and a touch more reverb so it
  // sits in the room instead of clicking on top of the mix.
  const hat = useCallback((t: number, vel: number, openish: boolean, step: number) => {
    const ctx = audioCtxRef.current!
    const dur = openish ? 0.2 : 0.045
    const len = Math.floor(ctx.sampleRate * dur)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource(); src.buffer = buf
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = openish ? 6800 : 7800
    // Gentle peaking shelf — a touch of air without the metallic sizzle.
    const peak = ctx.createBiquadFilter(); peak.type = 'peaking'
    peak.frequency.value = 10500; peak.gain.value = 1.6; peak.Q.value = 0.9
    const amp = ctx.createGain()
    amp.gain.setValueAtTime(0.0001, t)
    amp.gain.exponentialRampToValueAtTime(Math.max(0.001, vel * 0.26), t + 0.004) // 4ms attack — brushed
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    const panV = ((step % 4) - 1.5) / 1.5 * 0.45
    const sp = ctx.createStereoPanner(); sp.pan.value = panV
    src.connect(hp); hp.connect(peak); peak.connect(amp); amp.connect(sp); sp.connect(drumsBusRef.current!)
    const dSend = ctx.createGain(); dSend.gain.value = openish ? 0.32 : 0.18; amp.connect(dSend); dSend.connect(delayInRef.current!)
    const rSend = ctx.createGain(); rSend.gain.value = openish ? 0.36 : 0.2; amp.connect(rSend); rSend.connect(reverbInRef.current!)
    src.start(t)
  }, [])

  // Deep, round, sub-focused bass. No saws — they were the buzzy, mid-forward "obnoxious"
  // edge. A dominant sine sub you feel more than hear, plus a quiet triangle through a
  // dark filter for just enough articulation. Floating Points / Four Tet low end.
  const bass = useCallback((t: number, hz: number, vel: number, cutoff: number) => {
    const ctx = audioCtxRef.current!
    const bus = bassBusRef.current!

    // Sine sub — the dominant layer. Goes clean to the bus (a sine has nothing to filter).
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = hz / 2
    const subAmp = ctx.createGain()
    subAmp.gain.setValueAtTime(0.0001, t)
    subAmp.gain.exponentialRampToValueAtTime(vel * 0.9, t + 0.018) // softer attack — no pluck
    subAmp.gain.exponentialRampToValueAtTime(0.0001, t + 0.6)
    sub.connect(subAmp); subAmp.connect(bus)

    // Triangle at pitch — gentle odd harmonics so the note articulates on small speakers,
    // without the saw buzz. Through a dark, low-resonance filter.
    const tri = ctx.createOscillator(); tri.type = 'triangle'; tri.frequency.value = hz
    attachDrift(ctx, [sub.detune, tri.detune], t, t + 0.62, 2)

    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.4
    lp.frequency.setValueAtTime(cutoff * 1.6, t)
    lp.frequency.exponentialRampToValueAtTime(cutoff * 0.85, t + 0.14)

    // Very gentle saturation — warmth, not grit.
    const drive = ctx.createWaveShaper()
    drive.curve = BASS_DRIVE_CURVE
    drive.oversample = '2x'

    const triAmp = ctx.createGain()
    triAmp.gain.setValueAtTime(0.0001, t)
    triAmp.gain.exponentialRampToValueAtTime(vel * 0.3, t + 0.022)
    triAmp.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)

    tri.connect(lp); lp.connect(drive); drive.connect(triAmp); triAmp.connect(bus)

    sub.start(t); tri.start(t)
    sub.stop(t + 0.64); tri.stop(t + 0.54)
  }, [])

  // Rhodes/electric piano: additive integer harmonics (not FM). Slight per-partial detuning gives
  // the "chorused" warmth of a real EP; per-partial decay times mean it dies naturally.
  const rhodes = useCallback((t: number, freqs: readonly number[], vel: number) => {
    const ctx = audioCtxRef.current!
    const bus = melodyBusRef.current!
    const partials: Array<{ mult: number; gain: number; decay: number }> = [
      { mult: 1, gain: 1.0,  decay: 1.2 },
      { mult: 2, gain: 0.55, decay: 0.9 }, // 2nd harmonic prominent — EP character
      { mult: 3, gain: 0.22, decay: 0.6 },
      { mult: 4, gain: 0.10, decay: 0.4 },
    ]
    freqs.forEach((hz, i) => {
      const mix = ctx.createGain(); mix.gain.value = 0.18
      const driftTargets: AudioParam[] = []
      partials.forEach(({ mult, gain, decay }) => {
        const o = ctx.createOscillator()
        o.type = 'sine'
        // Tiny random detune per partial — warmth, like a slightly out-of-tune instrument
        const detune = 1 + (Math.random() - 0.5) * 0.0008
        o.frequency.value = hz * mult * detune
        driftTargets.push(o.detune)
        const pg = ctx.createGain()
        pg.gain.setValueAtTime(0.0001, t)
        pg.gain.exponentialRampToValueAtTime(gain, t + 0.014) // 14ms attack — soft
        pg.gain.exponentialRampToValueAtTime(0.0001, t + decay)
        o.connect(pg); pg.connect(mix)
        o.start(t); o.stop(t + decay + 0.05)
      })
      attachDrift(ctx, driftTargets, t, t + 1.3, 2.5)
      const amp = ctx.createGain(); amp.gain.value = vel
      const pan = ((i / Math.max(1, freqs.length - 1)) - 0.5) * 0.7
      const sp = ctx.createStereoPanner(); sp.pan.value = pan
      mix.connect(amp); amp.connect(sp); sp.connect(bus)
      const dSend = ctx.createGain(); dSend.gain.value = 0.25; amp.connect(dSend); dSend.connect(delayInRef.current!)
      const rSend = ctx.createGain(); rSend.gain.value = 0.5;  amp.connect(rSend); rSend.connect(reverbInRef.current!)
    })
  }, [])

  // ═══════════ LAFAYETTE voices (intimate / dub / sparse) ═══════════

  // Tight, short kick — less sub tail, sharper transient.
  const clubKick = useCallback((t: number, vel: number) => {
    const ctx = audioCtxRef.current!
    const bus = lafBusRef.current!

    const o = ctx.createOscillator(); o.type = 'sine'
    o.frequency.setValueAtTime(155, t)
    o.frequency.exponentialRampToValueAtTime(58, t + 0.08)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vel * 0.85, t + 0.003)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26)
    o.connect(g); g.connect(bus)

    const len = Math.floor(ctx.sampleRate * 0.01)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len)
    const src = ctx.createBufferSource(); src.buffer = buf
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800
    const cg = ctx.createGain(); cg.gain.value = vel * 0.5
    src.connect(hp); hp.connect(cg); cg.connect(bus)
    src.start(t)

    o.start(t); o.stop(t + 0.3)
  }, [])

  // Closed hi-hat — short, no shuffle/density variance, basic 8th-note tick.
  const closedHat = useCallback((t: number, vel: number) => {
    const ctx = audioCtxRef.current!
    const len = Math.floor(ctx.sampleRate * 0.03)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const ch = buf.getChannelData(0)
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource(); src.buffer = buf
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 8200
    const amp = ctx.createGain()
    amp.gain.setValueAtTime(0.0001, t)
    amp.gain.exponentialRampToValueAtTime(vel * 0.32, t + 0.001)
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.03)
    src.connect(hp); hp.connect(amp); amp.connect(lafBusRef.current!)
    src.start(t)
  }, [])

  // Sub bass — just a sub sine, focused and clean.
  const subBass = useCallback((t: number, hz: number, vel: number) => {
    const ctx = audioCtxRef.current!
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = hz / 2
    const amp = ctx.createGain()
    amp.gain.setValueAtTime(0.0001, t)
    amp.gain.exponentialRampToValueAtTime(vel * 0.55, t + 0.008)
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
    sub.connect(amp); amp.connect(lafBusRef.current!)
    sub.start(t); sub.stop(t + 0.4)
  }, [])

  // Dub stab — single inharmonic FM note (low/mid range) with massive delay send.
  const dubStab = useCallback((t: number, hz: number, vel: number) => {
    const ctx = audioCtxRef.current!
    const c = ctx.createOscillator(); c.type = 'sine'; c.frequency.value = hz
    const m = ctx.createOscillator(); m.type = 'sine'; m.frequency.value = hz * 2.05
    const mg = ctx.createGain()
    mg.gain.setValueAtTime(hz * 3.5, t)
    mg.gain.exponentialRampToValueAtTime(hz * 0.4, t + 0.08)
    m.connect(mg); mg.connect(c.frequency)
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500; lp.Q.value = 2
    const amp = ctx.createGain()
    amp.gain.setValueAtTime(0.0001, t)
    amp.gain.exponentialRampToValueAtTime(Math.max(0.001, vel * 0.32), t + 0.004)
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.32)
    c.connect(lp); lp.connect(amp); amp.connect(lafBusRef.current!)
    // HEAVY delay = the dub character
    const dSend = ctx.createGain(); dSend.gain.value = 0.85
    amp.connect(dSend); dSend.connect(delayInRef.current!)
    const rSend = ctx.createGain(); rSend.gain.value = 0.25
    amp.connect(rSend); rSend.connect(reverbInRef.current!)
    c.start(t); m.start(t); c.stop(t + 0.38); m.stop(t + 0.38)
  }, [])

  // ═══════════ THE WORLD voices (transcendent / Floating Points) ═══════════

  // Wooden mallet: additive with integer harmonics, slight inharmonicity on the top partial,
  // tiny pitch settle on attack (the "thud" of a mallet hitting wood). Each partial has its own
  // decay so the upper harmonics die first — exactly how real instruments behave.
  const mallet = useCallback((t: number, hz: number, vel: number, pan: number) => {
    const ctx = audioCtxRef.current!
    const partials: Array<{ mult: number; gain: number; decay: number }> = [
      { mult: 1,   gain: 1.0,  decay: 0.7  },
      { mult: 2,   gain: 0.42, decay: 0.5  },
      { mult: 3,   gain: 0.18, decay: 0.35 },
      { mult: 4.1, gain: 0.08, decay: 0.22 }, // slight inharmonicity = woody character
    ]
    const mix = ctx.createGain(); mix.gain.value = 0.28
    const driftTargets: AudioParam[] = []
    partials.forEach(({ mult, gain, decay }) => {
      const o = ctx.createOscillator()
      o.type = 'sine'
      // Tiny pitch settle (0.3% drop over 30ms) — the wood "give"
      o.frequency.setValueAtTime(hz * mult * 1.003, t)
      o.frequency.exponentialRampToValueAtTime(hz * mult, t + 0.03)
      driftTargets.push(o.detune)
      const pg = ctx.createGain()
      pg.gain.setValueAtTime(0.0001, t)
      pg.gain.exponentialRampToValueAtTime(gain, t + 0.008) // 8ms attack — softer than FM
      pg.gain.exponentialRampToValueAtTime(0.0001, t + decay)
      o.connect(pg); pg.connect(mix)
      o.start(t); o.stop(t + decay + 0.05)
    })
    attachDrift(ctx, driftTargets, t, t + 0.8, 2)
    const amp = ctx.createGain(); amp.gain.value = vel
    const sp = ctx.createStereoPanner(); sp.pan.value = pan
    mix.connect(amp); amp.connect(sp); sp.connect(atmosBusRef.current!)
    const dSend = ctx.createGain(); dSend.gain.value = 0.45; amp.connect(dSend); dSend.connect(delayInRef.current!)
    const rSend = ctx.createGain(); rSend.gain.value = 0.72; amp.connect(rSend); rSend.connect(reverbInRef.current!)
  }, [])

  // EUPHORIC MOTIF — a detuned 7-saw supersaw stack (the Four Tet / Bicep world).
  // Wide unison detune with per-voice stereo spread for cinematic width, a soft filter
  // bloom on the attack, gentle saturation, slow pitch drift, and a big pre-delayed
  // reverb send. Monophonic, so it glides (portamento) from the previous note.
  const lead = useCallback((t: number, hz: number, vel: number, pan: number) => {
    const ctx = audioCtxRef.current!
    const bus = melodyBusRef.current!

    // 7 unison voices: wide detune in cents, spread across the stereo field.
    const spread = [-24, -15, -8, 0, 8, 15, 24]
    const mix = ctx.createGain(); mix.gain.value = 0.12
    const prevHz = lastLeadHzRef.current
    const driftTargets: AudioParam[] = []
    spread.forEach((cents, i) => {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.detune.value = cents + (Math.random() - 0.5) * 6 // jitter — no two notes identical
      // Glide from the previous note over 90ms.
      if (prevHz) {
        o.frequency.setValueAtTime(prevHz, t)
        o.frequency.exponentialRampToValueAtTime(hz, t + 0.09)
      } else {
        o.frequency.value = hz
      }
      driftTargets.push(o.detune)
      const vp = ctx.createStereoPanner()
      vp.pan.value = (i / (spread.length - 1)) * 2 - 1 // -1 .. +1
      o.connect(vp); vp.connect(mix)
      o.start(t); o.stop(t + 0.85)
    })
    lastLeadHzRef.current = hz
    attachDrift(ctx, driftTargets, t, t + 0.87, 3)

    // Lowpass with a soft filter bloom — opens over 260ms on attack, then settles.
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3
    lp.frequency.setValueAtTime(520, t)
    lp.frequency.linearRampToValueAtTime(3600, t + 0.26)
    lp.frequency.exponentialRampToValueAtTime(1400, t + 0.7)

    // Gentle saturation to warm the saw stack.
    const drive = ctx.createWaveShaper()
    drive.curve = SUPERSAW_DRIVE
    drive.oversample = '2x'

    const amp = ctx.createGain()
    amp.gain.setValueAtTime(0.0001, t)
    amp.gain.exponentialRampToValueAtTime(Math.max(0.001, vel * 0.24), t + 0.055) // 55ms soft attack
    amp.gain.setValueAtTime(Math.max(0.001, vel * 0.24), t + 0.3)
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.78) // long-ish release — gentle overlap

    const sp = ctx.createStereoPanner(); sp.pan.value = pan * 0.4
    mix.connect(lp); lp.connect(drive); drive.connect(amp); amp.connect(sp); sp.connect(bus)
    const dSend = ctx.createGain(); dSend.gain.value = 0.4; amp.connect(dSend); dSend.connect(delayInRef.current!)
    // Big pre-delayed reverb send — the cloudy, washed-out bloom.
    const rSend = ctx.createGain(); rSend.gain.value = 0.85
    const rPre = ctx.createDelay(0.2); rPre.delayTime.value = 0.05
    amp.connect(rSend); rSend.connect(rPre); rPre.connect(reverbInRef.current!)
  }, [])

  // Bigger pad: wider voicings, longer attack, heavier reverb send. The atmospheric floor.
  const pad = useCallback((t: number, chord: readonly number[], dur: number, vel: number) => {
    const ctx = audioCtxRef.current!
    const bus = atmosBusRef.current!
    // Extend the chord with octave + 9th for richness
    const extended = [...chord, chord[0] * 2, chord[1] * 0.5]
    extended.forEach((hz, i) => {
      const f = hz / 2
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = f
      const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f * (1.005 + i * 0.0012)
      // Third saw +7 cents at -3dB — the BMSR/Radiohead chorused-pad shimmer.
      const o3 = ctx.createOscillator(); o3.type = 'sawtooth'; o3.frequency.value = f
      o3.detune.value = 7
      const o3g = ctx.createGain(); o3g.gain.value = 0.7
      o3.connect(o3g)
      attachDrift(ctx, [o1.detune, o2.detune, o3.detune], t, t + dur + 0.15, 3)
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2
      lp.frequency.setValueAtTime(260, t)
      lp.frequency.linearRampToValueAtTime(2000, t + dur * 0.5)
      lp.frequency.linearRampToValueAtTime(500, t + dur)
      const amp = ctx.createGain()
      amp.gain.setValueAtTime(0.0001, t)
      amp.gain.linearRampToValueAtTime(vel * 0.05, t + dur * 0.3)
      amp.gain.linearRampToValueAtTime(0.0001, t + dur)
      const pan = ((i / Math.max(1, extended.length - 1)) - 0.5) * 1.7
      const sp = ctx.createStereoPanner(); sp.pan.value = pan
      o1.connect(lp); o2.connect(lp); o3g.connect(lp); lp.connect(amp); amp.connect(sp); sp.connect(bus)
      // Pre-delayed reverb send — 50ms gap lets the dry pad speak before the wash arrives.
      const rSend = ctx.createGain(); rSend.gain.value = 0.85
      const rPre = ctx.createDelay(0.2); rPre.delayTime.value = 0.05
      amp.connect(rSend); rSend.connect(rPre); rPre.connect(reverbInRef.current!)
      o1.start(t); o2.start(t); o3.start(t)
      o1.stop(t + dur + 0.1); o2.stop(t + dur + 0.1); o3.stop(t + dur + 0.1)
    })
  }, [])

  // Sub drone — slow-attack sustained sine pair (slight detune for natural beating).
  const subDrone = useCallback((t: number, hz: number, dur: number, vel: number) => {
    const ctx = audioCtxRef.current!
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = hz / 2
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = hz / 2 * 1.003
    attachDrift(ctx, [o1.detune, o2.detune], t, t + dur + 0.15, 1.8)
    const amp = ctx.createGain()
    amp.gain.setValueAtTime(0.0001, t)
    amp.gain.linearRampToValueAtTime(vel * 0.16, t + dur * 0.25)
    amp.gain.linearRampToValueAtTime(0.0001, t + dur)
    o1.connect(amp); o2.connect(amp); amp.connect(atmosBusRef.current!)
    o1.start(t); o2.start(t)
    o1.stop(t + dur + 0.1); o2.stop(t + dur + 0.1)
  }, [])

  // 4-bar filtered-noise riser — used at the start of the BUILD section to land back into DROP.
  const noiseSweep = useCallback((t: number, durSec: number) => {
    const ctx = audioCtxRef.current!
    const len = Math.max(1, Math.floor(ctx.sampleRate * durSec))
    const buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch)
      for (let j = 0; j < len; j++) data[j] = Math.random() * 2 - 1
    }
    const src = ctx.createBufferSource(); src.buffer = buf
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 4
    lp.frequency.setValueAtTime(120, t)
    lp.frequency.exponentialRampToValueAtTime(10000, t + durSec)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.18, t + durSec * 0.95)
    g.gain.exponentialRampToValueAtTime(0.0001, t + durSec + 0.05)
    src.connect(lp); lp.connect(g); g.connect(masterRef.current!)
    const rSend = ctx.createGain(); rSend.gain.value = 0.45
    g.connect(rSend); rSend.connect(reverbInRef.current!)
    src.start(t)
    src.stop(t + durSec + 0.1)
  }, [])

  // Choir pad — detuned saws through vowel-formant bandpasses for "aaah" character.
  const choirPad = useCallback((t: number, chord: readonly number[], dur: number, vel: number) => {
    const ctx = audioCtxRef.current!
    const bus = atmosBusRef.current!
    chord.forEach((hz, i) => {
      const oscs = [hz, hz * 1.005, hz * 0.997].map(f => {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f
        return o
      })
      attachDrift(ctx, oscs.map(o => o.detune), t, t + dur + 0.15, 3)
      const mix = ctx.createGain(); mix.gain.value = 0.5
      const bp1 = ctx.createBiquadFilter(); bp1.type = 'bandpass'; bp1.frequency.value = 720; bp1.Q.value = 7
      const bp2 = ctx.createBiquadFilter(); bp2.type = 'bandpass'; bp2.frequency.value = 1180; bp2.Q.value = 5
      oscs.forEach(o => { o.connect(bp1); o.connect(bp2) })
      bp1.connect(mix); bp2.connect(mix)

      const amp = ctx.createGain()
      amp.gain.setValueAtTime(0.0001, t)
      amp.gain.linearRampToValueAtTime(vel * 0.035, t + dur * 0.4)
      amp.gain.linearRampToValueAtTime(0.0001, t + dur)
      const pan = ((i / Math.max(1, chord.length - 1)) - 0.5) * 1.4
      const sp = ctx.createStereoPanner(); sp.pan.value = pan
      mix.connect(amp); amp.connect(sp); sp.connect(bus)
      // Pre-delayed reverb send so the choir's dry "aaah" lands before the tail.
      const rSend = ctx.createGain(); rSend.gain.value = 0.9
      const rPre = ctx.createDelay(0.2); rPre.delayTime.value = 0.045
      amp.connect(rSend); rSend.connect(rPre); rPre.connect(reverbInRef.current!)
      oscs.forEach(o => { o.start(t); o.stop(t + dur + 0.1) })
    })
  }, [])

  // High-octave 16th-note arp — World adds density when fader is far right.
  const worldArp = useCallback((t: number, hz: number, vel: number, pan: number) => {
    const ctx = audioCtxRef.current!
    const c = ctx.createOscillator(); c.type = 'sine'; c.frequency.value = hz
    const m = ctx.createOscillator(); m.type = 'sine'; m.frequency.value = hz * 4.1
    const mg = ctx.createGain()
    mg.gain.setValueAtTime(hz * 4, t)
    mg.gain.exponentialRampToValueAtTime(hz * 0.15, t + 0.04)
    m.connect(mg); mg.connect(c.frequency)
    const amp = ctx.createGain()
    amp.gain.setValueAtTime(0.0001, t)
    amp.gain.exponentialRampToValueAtTime(Math.max(0.001, vel * 0.18), t + 0.001)
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.32)
    const sp = ctx.createStereoPanner(); sp.pan.value = pan
    c.connect(amp); amp.connect(sp); sp.connect(atmosBusRef.current!)
    // HUGE echo + reverb
    const dSend = ctx.createGain(); dSend.gain.value = 0.65; amp.connect(dSend); dSend.connect(delayInRef.current!)
    const rSend = ctx.createGain(); rSend.gain.value = 0.8;  amp.connect(rSend); rSend.connect(reverbInRef.current!)
    c.start(t); m.start(t); c.stop(t + 0.4); m.stop(t + 0.4)
  }, [])

  // Flash an activity LED briefly. Direct DOM manipulation (no setState) so we don't trigger
  // a React re-render every 16th of a beat.
  const flashLed = useCallback((name: string, delayMs: number) => {
    if (delayMs > 1) {
      window.setTimeout(() => {
        const el = ledRefs.current[name]
        if (!el) return
        el.classList.add('lit')
        window.setTimeout(() => el?.classList.remove('lit'), 90)
      }, delayMs)
      return
    }
    const el = ledRefs.current[name]
    if (!el) return
    el.classList.add('lit')
    window.setTimeout(() => el?.classList.remove('lit'), 90)
  }, [])

  // ───────── Sequencer ─────────
  const scheduleStep = useCallback((step: number, time: number) => {
    const s = slidersRef.current
    const sc = sceneRef.current
    const m = mutesRef.current
    const stepInBar = step % STEPS_PER_BAR
    const arrBar = Math.floor(step / STEPS_PER_BAR) % ARR_BARS
    const barIdx = arrBar % BARS               // chord progression index (0..3)
    const chord = PROGRESSION[barIdx]
    const sub = stepInBar % 4
    const beatInBar = Math.floor(stepInBar / 4)
    const sect = getSection(arrBar)            // 0 = DROP, 1 = BREAKDOWN, 2 = BUILD
    const inDrop      = sect === 0
    const inBreakdown = sect === 1
    const inBuild     = sect === 2

    const ctxNow = audioCtxRef.current!
    const delayMsFor = (t: number) => Math.max(0, (t - ctxNow.currentTime) * 1000)

    // ───── Mix-bus filter automation at section transitions ─────
    // DROP starts wide open; BREAKDOWN rolls everything off; BUILD sweeps back open over 4 bars.
    if (stepInBar === 0) {
      const mf = mixFilterRef.current
      if (mf) {
        if (arrBar === 0) {
          mf.frequency.cancelScheduledValues(time)
          mf.frequency.setValueAtTime(18000, time)
        } else if (arrBar === 8) {
          mf.frequency.cancelScheduledValues(time)
          mf.frequency.setTargetAtTime(2200, time, 0.2)
        } else if (arrBar === 12) {
          mf.frequency.cancelScheduledValues(time)
          mf.frequency.setValueAtTime(2200, time)
          const buildDur = (60 / bpmRef.current) * 16
          mf.frequency.exponentialRampToValueAtTime(18000, time + buildDur * 0.97)
        }
      }
    }

    // ───── LAFAYETTE PALETTE (always fires; audible only when fader ≤ Wall Street) ─────
    // Drops drum elements during breakdown for consistency with Wall Street.
    if (!m.KICK && !inBreakdown && sub === 0) clubKick(time, 0.85)
    if (sub === 0 || sub === 2) {
      if (!m.HAT && !inBreakdown) closedHat(time + jitter(), velJ(inBuild ? 0.45 : 0.55))
      if (!m.BASS) subBass(time + jitter() * 0.5, chord.bassRoot, velJ(0.65))
    }
    if (!m.BASS && !inBuild && (stepInBar === 4 || stepInBar === 12)) {
      dubStab(time + jitter(), chord.bassRoot * 2, velJ(inBreakdown ? 0.55 : 0.75))
    }

    // ───── WALL STREET PALETTE ─────
    // Pad always plays — it's the bed across all sections.
    if (!m.PAD && stepInBar === 0) {
      const barSec = (60 / bpmRef.current) * 4
      pad(time, chord.chord, barSec, 0.35 + s.melody * 0.65)
      flashLed('PAD', delayMsFor(time))
    }

    // KICK — on the grid except in breakdown
    if (!m.KICK && !inBreakdown && sub === 0) {
      kick(time, 0.92)
      flashLed('KICK', delayMsFor(time))
    }

    // CLAP + SNARE — only in DROP (breakdown is silent, build has its own roll)
    if (!m.CLAP && inDrop && (stepInBar === 4 || stepInBar === 12)) {
      clap(time + jitter() * 0.4, velJ(0.85))
      snare(time, velJ(0.55))
      flashLed('CLAP', delayMsFor(time))
    }

    // CLAVE — drive-driven colour, DROP only (percussion → HAT mute group)
    if (!m.HAT && inDrop) {
      if (s.drive > 0.5 && stepInBar === 10) clave(time + jitter(), velJ(s.drive * 0.5))
      if (s.drive > 0.8 && stepInBar === 6)  clave(time + jitter(), velJ(s.drive * 0.4))
    }

    // SHAKER — DROP only (percussion → HAT mute group)
    if (!m.HAT && inDrop && (sub === 0 || sub === 2)) {
      const sShake = s.shuffle * 0.018 * (sub === 2 ? 1 : 0)
      shaker(time + sShake + jitter(), velJ(0.5 + s.shuffle * 0.3))
    }

    // HATS — continue in breakdown (quieter) so the breakdown still has pulse
    const playHat =
      sub === 0 ||
      sub === 2 ||
      (s.shuffle > 0.28 && sub === 3 && !inBreakdown) ||
      (s.shuffle > 0.6 && sub === 1 && !inBreakdown && Math.random() < 0.65)
    if (!m.HAT && playHat) {
      const swingMs = sub === 3 ? s.shuffle * 0.045 : sub === 1 ? s.shuffle * 0.022 : 0
      const accent = sub === 0 ? 1 : sub === 2 ? 0.6 : 0.4
      const sectionDuck = inBreakdown ? 0.45 : 1
      const vel = velJ(accent * (0.55 + s.shuffle * 0.5) * sectionDuck)
      const openish = inDrop && s.shuffle > 0.75 && sub === 2 && beatInBar === 3 && Math.random() < 0.45
      hat(time + swingMs + jitter(), vel, openish, step)
      flashLed('HAT', delayMsFor(time))
    }

    // WOODBLOCK — 3-against-4 counter-percussion. Hits every 3rd sixteenth so it phases
    // against the 4/4 grid, adding rolling tension against the kick and hook. Quiet by
    // default; leans a touch louder as the fader moves toward The World.
    if (!m.HAT && !inBreakdown && step % 3 === 0) {
      const worldLean = Math.max(0, (sc - 0.5) * 2) // 0 at Wall St, 1 at The World
      const wbVel = velJ(0.26 + worldLean * 0.16)
      const wbPan = ((step % 6) / 5 - 0.5) * 0.7
      woodblock(time + jitter(), wbVel, wbPan)
    }

    // BASS — continues across all sections (the spine of the song)
    if (!m.BASS && (sub === 0 || sub === 2)) {
      // Root-driven hypnotic riff: insistent root with two rests for groove and a
      // single stable fifth lift late in the bar — no b7 leading tone, no octave
      // jumps, so it reads as a relentless pulse rather than a pop hook. null = rest.
      const pat: (number | null)[] = [0, 0, null, 0, 0, 0, null, 7]
      const idx = Math.floor(step / 2) % pat.length
      const off = pat[idx]
      if (inBuild) {
        // BUILD: drop the riff, lock to a steady root pulse for tension/repetition.
        const vel = velJ(0.6 + s.bass * 0.4)
        bass(time + jitter() * 0.5, chord.bassRoot, vel, 260 + s.bass * 2400)
        flashLed('BASS', delayMsFor(time))
      } else if (off !== null) {
        const hz = chord.bassRoot * Math.pow(2, off / 12)
        const vel = velJ((inBreakdown ? 0.45 : 0.6) + s.bass * 0.4)
        const cutoff = 260 + s.bass * 2400
        bass(time + jitter() * 0.5, hz, vel, cutoff)
        flashLed('BASS', delayMsFor(time))
      }
    }

    // RHODES — DROP only (drops out in BUILD for anticipation; sustains in BREAKDOWN)
    if (!m.LEAD && !inBuild) {
      const pianoLevel = Math.max(0, 1 - s.melody * 1.4)
      const sectionDuck = inBreakdown ? 0.7 : 1
      if (pianoLevel > 0.1 && (stepInBar === 0 || stepInBar === 8)) {
        rhodes(time + jitter(), chord.chord, velJ(pianoLevel * 0.8 * sectionDuck))
        flashLed('LEAD', delayMsFor(time))
      }
    }

    // ───── LEAD SYNTH (the hook) ─────
    // DROP: 8th notes following LEAD_PATTERNS, full volume.
    // BUILD: quarter notes only (sparser, half volume) — teases the hook.
    // BREAKDOWN: silent — absence builds anticipation.
    const leadFires =
      (inDrop  && (sub === 0 || sub === 2)) ||
      (inBuild && sub === 0)
    if (!m.LEAD && leadFires) {
      const noteIdx = Math.floor(stepInBar / 2)
      const idx = LEAD_PATTERNS[barIdx][noteIdx]
      if (idx !== null) {
        const hz = chord.melodyNotes[idx]
        const baseVel = inBuild ? 0.4 : 0.85
        const pan = ((stepInBar / 16) - 0.5) * 0.5
        lead(time + jitter(), hz, velJ(baseVel), pan)
        flashLed('LEAD', delayMsFor(time))
      }
    }

    // ───── SNARE ROLL (BUILD only) — accelerates across the 4 build bars ─────
    if (inBuild) {
      const buildBar = arrBar - 12 // 0..3
      let fire = false
      if (buildBar === 0) fire = sub === 0                  // quarter notes
      if (buildBar === 1) fire = sub === 0 || sub === 2      // eighth notes
      if (buildBar === 2) fire = true                        // sixteenth notes
      if (buildBar === 3) fire = true                        // sixteenth (full density)
      if (!m.CLAP && fire) {
        const vel = velJ(0.35 + (buildBar / 3) * 0.55)
        snare(time + jitter(), vel)
        flashLed('CLAP', delayMsFor(time))
      }
    }

    // ───── 4-BAR NOISE RISER (start of BUILD) ─────
    if (arrBar === 12 && stepInBar === 0) {
      const barSec = (60 / bpmRef.current) * 4
      noiseSweep(time, barSec * 4)
    }

    // ───── THE WORLD PALETTE ─────
    if (!m.PAD && stepInBar === 0) {
      const barSec = (60 / bpmRef.current) * 4
      subDrone(time, chord.bassRoot, barSec, 0.7)
      choirPad(time, chord.chord, barSec, 0.5 + s.melody * 0.5)
    }
    if (!m.PAD && s.melody > 0.18 && (sub === 0 || sub === 2)) {
      const notes = chord.melodyNotes
      const seqIdx = Math.floor(step / 2) % (notes.length * 2)
      const noteIdx = seqIdx < notes.length ? seqIdx : (notes.length * 2 - 1 - seqIdx)
      const hz = notes[noteIdx]
      const swing = s.shuffle * 0.022 * (sub === 2 ? 1 : 0)
      const malletPan = ((Math.floor(step / 2) % 4) - 1.5) / 1.5 * 0.55
      const sectionDuck = inBreakdown ? 1.1 : inBuild ? 0.7 : 1 // breakdown is the mallet moment
      mallet(time + swing + jitter(), hz, velJ(s.melody * 0.7 * sectionDuck), malletPan)
    }
    // World arp — only when fader is right; silent in build (riser takes that role)
    if (!m.PAD && sc > 0.45 && !inBuild) {
      const notes = chord.melodyNotes
      const idx = step % notes.length
      const hz = notes[idx] * 2
      const pan = ((step % 4) - 1.5) / 1.5 * 0.7
      worldArp(time + jitter(), hz, velJ(0.55), pan)
    }

    // UI updates — beat + chord + section + arrangement bar
    if (sub === 0) {
      const delayMs = delayMsFor(time)
      window.setTimeout(() => {
        setBeat(beatInBar)
        if (beatInBar === 0) {
          setBar(barIdx)
          setSection(sect)
          setArrBarUI(arrBar)
        }
      }, delayMs)
    }
  }, [clubKick, closedHat, subBass, dubStab, kick, clap, snare, shaker, clave, hat, bass, rhodes, lead, pad, subDrone, choirPad, mallet, worldArp, noiseSweep, flashLed])

  const tick = useCallback(() => {
    const ctx = audioCtxRef.current
    if (!ctx) return
    while (nextNoteTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD_S) {
      scheduleStep(stepRef.current, nextNoteTimeRef.current)
      nextNoteTimeRef.current += (60 / bpmRef.current) / 4
      stepRef.current = (stepRef.current + 1) % ARR_STEPS
    }
  }, [scheduleStep])

  const start = useCallback(async (opts: { fadeIn?: boolean } = {}) => {
    initAudio()
    const ctx = audioCtxRef.current!
    const m = masterRef.current
    // If fading in, snap master to ~0 BEFORE resuming so the first transient isn't full-volume.
    if (opts.fadeIn && m) {
      m.gain.cancelScheduledValues(ctx.currentTime)
      m.gain.setValueAtTime(0.0001, ctx.currentTime)
    }
    if (ctx.state === 'suspended') await ctx.resume()
    if (opts.fadeIn && m) {
      // Smooth exponential ramp up to the normal master gain over ~1.6s.
      m.gain.exponentialRampToValueAtTime(0.72, ctx.currentTime + 1.6)
    }
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
    setArrBarUI(-1)
  }, [])

  // ───── Autoplay (when revealed by parent gate) ─────
  // Fires once: when `autoplay` flips true, schedule start(...) with a master fade-in, then
  // light up the X-Y pad nudge so the user notices the chaos pad.
  useEffect(() => {
    if (!autoplay) return
    const playT = window.setTimeout(() => { start({ fadeIn: true }) }, autoplayDelay)
    const nudgeOn  = window.setTimeout(() => setNudgeXY(true),  autoplayDelay + 1300)
    const nudgeOff = window.setTimeout(() => setNudgeXY(false), autoplayDelay + 4900)
    return () => {
      clearTimeout(playT)
      clearTimeout(nudgeOn)
      clearTimeout(nudgeOff)
    }
  }, [autoplay, autoplayDelay, start])

  useEffect(() => () => {
    if (schedulerRef.current) clearInterval(schedulerRef.current)
    audioCtxRef.current?.close().catch(() => {})
  }, [])

  const setSlider = (key: keyof Sliders) => (value: number) => {
    setSliders(prev => ({ ...prev, [key]: value }))
  }

  // Which named position is closest, for highlighting the crossfader label.
  const closestScene = scene < 0.25 ? 0 : scene < 0.75 ? 1 : 2

  return (
    <section id="mixer" className="mixer">
      <style>{`
        /* Fill the frame below the 38px topbar and center the contents, so the whole
           mixer — headline, panel, scene fader — fits without running below the fold. */
        .mixer { background: #f5f3ee; color: #0a0a0a; padding: 0.9rem 2.5rem; border-top: 1px solid rgba(10,10,10,0.08); --accent: #00FF63; box-sizing: border-box; min-height: calc(100vh - 38px); display: flex; flex-direction: column; justify-content: center; }
        .mixer-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 2rem; margin-bottom: 1.15rem; flex-wrap: wrap; }
        .mixer-headline {
          font-family: 'Archivo Black', sans-serif; font-size: clamp(26px, 3vw, 40px);
          line-height: 0.95; letter-spacing: -0.015em; transform: scaleX(1.1); transform-origin: left center;
        }
        .mixer-sub {
          font-family: 'DM Mono', monospace; font-size: 0.68rem;
          letter-spacing: 0.18em; text-transform: uppercase;
          max-width: 54ch;
          opacity: 0;
          transition: opacity 1.5s ease;
        }
        /* Fades in over 1.5s once the mixer is revealed (autoplay) — draws the eye
           to the instructions so people know to play with it. */
        .mixer-sub.mixer-sub-in { opacity: 0.55; }

        .mixer-panel { border: 1px solid rgba(10,10,10,0.85); padding: 0.9rem 1.4rem; display: grid; grid-template-columns: 1fr auto; gap: 1.6rem; align-items: stretch; background: #f5f3ee; }
        .mixer-left { display: flex; flex-direction: column; gap: 0.6rem; }

        /* ─── Sliders: tighter spacing, wider tracks, NO transition lag ─── */
        .mixer-sliders {
          display: grid;
          grid-template-columns: repeat(5, 1fr) 1px auto;
          gap: 0.35rem;
          min-height: 110px;
          flex: 1;
          align-items: stretch;
        }
        .slider-divider {
          background: rgba(10,10,10,0.18);
          margin: 1rem 0.45rem;
        }
        .slider-knobs {
          display: flex; flex-direction: column;
          align-items: center; justify-content: space-around;
          padding: 0.2rem 0.2rem 0.2rem 0.5rem;
          min-width: 84px;
          gap: 0.3rem;
        }
        .slider-col { display: flex; flex-direction: column; align-items: center; gap: 0.55rem; }
        .slider-val { font-family: 'DM Mono', monospace; font-size: 0.62rem; letter-spacing: 0.16em; opacity: 0.55; height: 12px; }
        .slider-track {
          position: relative; flex: 1; width: 20px;
          background: #fff; border: 1px solid #0a0a0a;
          touch-action: none; cursor: none;
        }
        /* No position transitions — these were the source of the "sticky" lag. */
        .slider-fill { position: absolute; left: 0; right: 0; bottom: 0; background: #0a0a0a; }
        .slider-handle {
          position: absolute; left: -14px; right: -14px; height: 14px;
          background: #0a0a0a; transform: translateY(50%);
          pointer-events: none;
          transition: width 0.09s ease, height 0.09s ease, left 0.09s ease, right 0.09s ease;
        }
        .slider-track:hover  .slider-handle { left: -18px; right: -18px; height: 16px; }
        .slider-track:active .slider-handle { left: -22px; right: -22px; height: 22px; }
        .slider-label { font-family: 'DM Mono', monospace; font-size: 0.62rem; letter-spacing: 0.22em; text-transform: uppercase; }

        /* ─── Crossfader (Lafayette | Wall Street | The World) ─── */
        .crossfader-3 {
          display: flex; flex-direction: column; gap: 0.55rem;
          padding-top: 0.5rem;
          border-top: 1px solid rgba(10,10,10,0.12);
          margin-top: 0.4rem;
        }
        .cf3-labels {
          display: grid; grid-template-columns: 1fr 1fr 1fr;
          font-family: 'DM Mono', monospace; font-size: 0.62rem;
          letter-spacing: 0.22em; text-transform: uppercase;
        }
        .cf3-labels span { transition: opacity 0.2s, font-weight 0.2s; opacity: 0.55; color: var(--accent); }
        .cf3-labels span.active { opacity: 1; }
        .cf3-labels span:nth-child(1) { text-align: left; }
        .cf3-labels span:nth-child(2) { text-align: center; }
        .cf3-labels span:nth-child(3) { text-align: right; }
        .cf3-track {
          position: relative; height: 16px;
          background: #fff; border: 1px solid #0a0a0a;
          touch-action: none; cursor: none;
        }
        .cf3-detent {
          position: absolute; width: 1px; top: -4px; bottom: -4px;
          background: rgba(10,10,10,0.45);
        }
        .cf3-handle {
          position: absolute; width: 18px; top: -8px; bottom: -8px;
          background: #0a0a0a; transform: translateX(-50%);
          pointer-events: none;
          transition: width 0.09s ease, top 0.09s ease, bottom 0.09s ease;
        }
        .cf3-track:hover  .cf3-handle { width: 22px; top: -10px; bottom: -10px; }
        .cf3-track:active .cf3-handle { width: 26px; top: -12px; bottom: -12px; }

        /* ─── Right column ─── */
        .mixer-right { display: flex; flex-direction: column; justify-content: space-between; align-items: stretch; min-width: 220px; gap: 0.7rem; }
        .knob-wrap { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; }

        /* ─── X-Y Pad ─── */
        .xy-pad-wrap { display: flex; flex-direction: column; gap: 0.4rem; }
        .xy-pad-head {
          display: flex; justify-content: space-between; align-items: baseline;
          font-family: 'DM Mono', monospace; font-size: 0.55rem;
          letter-spacing: 0.22em; text-transform: uppercase;
        }
        .xy-pad-name { opacity: 0.6; }
        .xy-pad-read { color: var(--accent); font-variant-numeric: tabular-nums; }
        .xy-pad {
          position: relative;
          width: 100%;
          height: 128px;
          background: #fff;
          border: 1px solid #0a0a0a;
          cursor: none;
          touch-action: none;
          overflow: hidden;
        }
        .xy-grid {
          position: absolute; inset: 0; pointer-events: none;
          background:
            linear-gradient(to right, rgba(10,10,10,0.08) 1px, transparent 1px) 0 0 / 25% 100%,
            linear-gradient(to bottom, rgba(10,10,10,0.08) 1px, transparent 1px) 0 0 / 100% 25%;
        }
        .xy-axis-h {
          position: absolute; left: 0; right: 0; height: 1px;
          background: rgba(0,255,99,0.35);
          pointer-events: none;
        }
        .xy-axis-v {
          position: absolute; top: 0; bottom: 0; width: 1px;
          background: rgba(0,255,99,0.35);
          pointer-events: none;
        }
        .xy-dot {
          position: absolute;
          width: 14px; height: 14px;
          border-radius: 50%;
          background: var(--accent);
          border: 2px solid #0a0a0a;
          transform: translate(-50%, 50%);
          pointer-events: none;
          box-shadow: 0 0 0 1px rgba(0,255,99,0.25), 0 0 10px rgba(0,255,99,0.45);
        }
        .xy-pad:active .xy-dot { width: 18px; height: 18px; }

        /* ─── XY nudge — fires once after autoplay-reveal to say "drag me" ─── */
        .xy-nudge .xy-pad {
          animation: xyPadPulse 1.4s ease-in-out 3 both;
        }
        .xy-nudge .xy-dot {
          animation: xyDotPulse 1.4s ease-in-out 3 both;
        }
        @keyframes xyPadPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(0,255,99,0); }
          50%       { box-shadow: 0 0 0 4px rgba(0,255,99,0.22), 0 0 32px 4px rgba(0,255,99,0.35); }
        }
        @keyframes xyDotPulse {
          0%, 100% { transform: translate(-50%, 50%) scale(1); }
          30%      { transform: translate(-50%, 50%) scale(1.55); }
          70%      { transform: translate(-50%, 50%) scale(0.92); }
        }
        .xy-hint {
          position: absolute;
          top: 8px; right: 10px;
          font-family: 'DM Mono', monospace;
          font-size: 0.55rem;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--accent);
          pointer-events: none;
          animation: xyHintIn 4.2s ease-in-out both;
        }
        @keyframes xyHintIn {
          0%, 100% { opacity: 0; transform: translateY(2px); }
          20%, 82% { opacity: 1; transform: translateY(0); }
        }
        .xy-corner {
          position: absolute;
          font-family: 'DM Mono', monospace; font-size: 0.5rem;
          letter-spacing: 0.22em; text-transform: uppercase;
          opacity: 0.45;
          pointer-events: none;
        }
        .xy-corner-x { bottom: 4px; right: 6px; }
        .xy-corner-y { top: 4px; left: 6px; writing-mode: vertical-rl; }
        .xy-pad:focus-visible { outline: 1px solid var(--accent); outline-offset: 2px; }

        /* Centered "click & drag" instruction. Pulses to draw the eye; dims away on hover/active. */
        .xy-instruct {
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          font-family: 'DM Mono', monospace;
          font-size: 0.58rem;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(10,10,10,0.55);
          pointer-events: none;
          white-space: nowrap;
          transition: opacity 0.2s ease;
          animation: xyInstructPulse 2.4s ease-in-out infinite;
        }
        @keyframes xyInstructPulse {
          0%, 100% { opacity: 0.28; }
          50%      { opacity: 0.7; }
        }
        .xy-pad:hover  .xy-instruct,
        .xy-pad:active .xy-instruct { opacity: 0; animation: none; }
        @media (prefers-reduced-motion: reduce) {
          .xy-instruct { animation: none; opacity: 0.4; }
        }
        /* Desktop-default visible; touch-text hidden. Flip on touch devices. */
        .xy-instruct-touch { display: none; }
        @media (hover: none) and (pointer: coarse) {
          .xy-instruct-mouse { display: none; }
          .xy-instruct-touch { display: inline; }
        }
        .knob-label { font-family: 'DM Mono', monospace; font-size: 0.62rem; letter-spacing: 0.22em; text-transform: uppercase; opacity: 0.6; }
        .knob { width: 46px; height: 46px; border-radius: 50%; border: 1px solid #0a0a0a; background: #f5f3ee; position: relative; touch-action: none; cursor: none; }
        .knob::before { content: ''; position: absolute; inset: 6px; border-radius: 50%; background: #fff; border: 1px solid rgba(10,10,10,0.4); }
        .knob-indicator { position: absolute; inset: 0; pointer-events: none; transform: rotate(var(--angle)); }
        .knob-indicator::after { content: ''; position: absolute; top: 8px; left: 50%; width: 2px; height: 14px; background: #0a0a0a; transform: translateX(-50%); }
        .knob-value { font-family: 'Archivo Black', sans-serif; font-size: 1.05rem; letter-spacing: -0.01em; line-height: 1; }
        .knob-suffix { font-family: 'DM Mono', monospace; font-size: 0.6rem; letter-spacing: 0.22em; text-transform: uppercase; opacity: 0.6; margin-top: -2px; }

        .mixer-meta-row { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding-top: 0.5rem; border-top: 1px solid rgba(10,10,10,0.18); }
        .mixer-meta-row .label { font-family: 'DM Mono', monospace; font-size: 0.55rem; letter-spacing: 0.22em; text-transform: uppercase; opacity: 0.6; }
        .mixer-meta-row .value { font-family: 'Archivo Black', sans-serif; font-size: 1.05rem; letter-spacing: -0.005em; }

        .beats { display: flex; gap: 6px; }
        .beat { width: 12px; height: 12px; border: 1px solid #0a0a0a; background: #fff; transition: background 0.07s linear, transform 0.07s linear, box-shadow 0.07s linear; }
        .beat.lit { background: var(--accent); border-color: var(--accent); transform: scale(1.1); box-shadow: 0 0 6px rgba(0,255,99,0.55); }

        .play-btn { background: #0a0a0a; color: #f5f3ee; border: 1px solid #0a0a0a; font-family: 'DM Mono', monospace; font-size: 0.72rem; letter-spacing: 0.3em; text-transform: uppercase; padding: 0.85rem 1.2rem; cursor: none; display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; transition: background 0.2s, color 0.2s, border-color 0.2s, box-shadow 0.2s; width: 100%; }
        .play-btn:hover { background: #f5f3ee; color: #0a0a0a; }
        .play-btn .icon { width: 0; height: 0; border-style: solid; border-width: 6px 0 6px 9px; border-color: transparent transparent transparent currentColor; }
        .play-btn.is-playing { background: var(--accent); color: #0a0a0a; border-color: var(--accent); box-shadow: 0 0 0 1px rgba(0,255,99,0.25), 0 0 12px rgba(0,255,99,0.35); }
        .play-btn.is-playing:hover { background: #0a0a0a; color: var(--accent); box-shadow: none; }
        .play-btn.is-playing .icon { width: 9px; height: 12px; border: none; background: linear-gradient(currentColor, currentColor) left/3px 100% no-repeat, linear-gradient(currentColor, currentColor) right/3px 100% no-repeat; background-color: transparent; }

        /* ─── Section value gets the accent so you can read the song state at a glance ─── */
        .section-value { color: var(--accent); }

        /* ─── Activity LEDs ─── */
        .led-row {
          display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.5rem;
          padding-top: 0.5rem;
          border-top: 1px solid rgba(10,10,10,0.12);
        }
        .led-cell {
          display: flex; flex-direction: column; align-items: center; gap: 5px;
          cursor: none; /* keep the gold-dot follower as the cursor */
          padding: 4px 0;
          transition: transform 0.1s;
        }
        .led-cell:hover { transform: translateY(-1px); }
        .led-cell:focus-visible { outline: 1px solid var(--accent); outline-offset: 2px; }
        .led {
          width: 9px; height: 9px; border-radius: 50%;
          border: 1px solid rgba(10,10,10,0.55);
          background: #fff;
          transition: background 0.04s linear, box-shadow 0.08s linear, border-color 0.06s linear, transform 0.08s linear;
        }
        .led.lit {
          background: var(--accent);
          border-color: var(--accent);
          box-shadow: 0 0 5px var(--accent), 0 0 11px rgba(0,255,99,0.55);
        }
        .led-cell:hover .led:not(.muted):not(.lit) {
          background: rgba(0,255,99,0.18);
          border-color: var(--accent);
        }
        /* Muted state — LED stays dark; voice is silenced */
        .led.muted {
          background: rgba(10,10,10,0.55) !important;
          border-color: rgba(10,10,10,0.55) !important;
          box-shadow: none !important;
        }
        .led-cell.muted .led-label { opacity: 0.25; }
        .led-cell.muted:hover .led { transform: scale(1.1); }
        .led-label {
          font-family: 'DM Mono', monospace; font-size: 0.5rem;
          letter-spacing: 0.2em; text-transform: uppercase; opacity: 0.55;
          transition: opacity 0.1s;
        }

        /* ─── Arrangement strip — 16 segments with section colouring + playhead ─── */
        .arr-strip {
          display: grid; grid-template-columns: repeat(16, 1fr); gap: 2px;
          height: 6px;
          margin-top: 0.2rem;
        }
        .arr-seg {
          background: rgba(10,10,10,0.12);
          transition: background 0.18s, box-shadow 0.18s, transform 0.18s;
        }
        .arr-seg-drop  { background: rgba(10,10,10,0.22); }
        .arr-seg-break { background: rgba(10,10,10,0.10); }
        .arr-seg-build { background: rgba(0,255,99,0.20); }
        .arr-seg.active {
          background: var(--accent);
          box-shadow: 0 0 8px var(--accent);
          transform: scaleY(1.6);
        }

        .mixer-footer { margin-top: 0.5rem; font-family: 'DM Mono', monospace; font-size: 0.55rem; letter-spacing: 0.18em; text-transform: uppercase; opacity: 0.45; }
        .mixer-footer-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          margin-top: 0.55rem;
        }
        .mixer-credit {
          margin: 0;
          font-family: 'DM Mono', monospace;
          font-size: 0.55rem;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: #0a0a0a;
          opacity: 0.45;
          text-align: right;
        }
        .mixer-credit-left { text-align: left; }
        .credit-tm {
          font-size: 0.55em;
          letter-spacing: 0;
          vertical-align: super;
          margin-left: 2px;
        }

        @media (max-width: 900px) {
          .mixer { padding: 2.5rem 1.1rem 3rem; min-height: 0; display: block; }
          .mixer-panel {
            grid-template-columns: 1fr;
            padding: 1.2rem 1rem;
            gap: 1.2rem;
            overscroll-behavior: contain;
            max-width: 100%;
          }
          /* Slider grid: 5 columns of sliders only; divider + knobs flow below as full-width rows.
             Explicit row height for the slider row so they don't compress when divider+knobs
             eat into the grid's auto-sized space. */
          .mixer-sliders {
            grid-template-columns: repeat(5, 1fr);
            grid-template-rows: 230px auto auto;
            gap: 0.65rem;
            min-height: 0;
          }
          .slider-track { width: 20px; }
          .slider-handle { left: -8px; right: -8px; height: 16px; }
          .slider-track:hover  .slider-handle,
          .slider-track:active .slider-handle { left: -12px; right: -12px; height: 22px; }
          .slider-divider {
            grid-column: 1 / -1;
            height: 1px;
            width: 100%;
            margin: 0.4rem 0 0;
          }
          .slider-knobs {
            grid-column: 1 / -1;
            flex-direction: row;
            justify-content: space-around;
            padding: 0.6rem 0 0;
            min-width: 0;
            gap: 1.5rem;
          }
          .mixer-right { min-width: 0; }
          /* Belt-and-suspenders: lock touch action on every interactive control */
          .slider-track, .slider-col, .cf3-track, .knob, .xy-pad {
            touch-action: none;
          }
        }

        /* ───────────────── DARK THEME OVERRIDES ───────────────── */
        /* Transparent so the FlickerBackground shows through on the homepage embed. */
        .mix-page[data-theme="dark"] .mixer { background: transparent; color: #f5f3ee; }
        .mix-page[data-theme="dark"] .mixer-panel {
          background: #0a0a0a;
          border-color: rgba(245,243,238,0.85);
        }
        .mix-page[data-theme="dark"] .slider-divider { background: rgba(245,243,238,0.18); }
        .mix-page[data-theme="dark"] .slider-track {
          background: #1a1a1a; border-color: rgba(245,243,238,0.65);
        }
        .mix-page[data-theme="dark"] .slider-fill { background: #f5f3ee; }
        .mix-page[data-theme="dark"] .slider-handle { background: #f5f3ee; }

        .mix-page[data-theme="dark"] .crossfader-3 { border-top-color: rgba(245,243,238,0.18); }
        .mix-page[data-theme="dark"] .cf3-track {
          background: #1a1a1a; border-color: rgba(245,243,238,0.65);
        }
        .mix-page[data-theme="dark"] .cf3-detent { background: rgba(245,243,238,0.45); }
        .mix-page[data-theme="dark"] .cf3-handle { background: #f5f3ee; }

        .mix-page[data-theme="dark"] .knob {
          background: #1a1a1a; border-color: rgba(245,243,238,0.65);
        }
        .mix-page[data-theme="dark"] .knob::before {
          background: #0a0a0a; border-color: rgba(245,243,238,0.4);
        }
        .mix-page[data-theme="dark"] .knob-indicator::after { background: #f5f3ee; }

        .mix-page[data-theme="dark"] .xy-pad {
          background: #1a1a1a; border-color: rgba(245,243,238,0.65);
        }
        .mix-page[data-theme="dark"] .xy-grid {
          background:
            linear-gradient(to right, rgba(245,243,238,0.08) 1px, transparent 1px) 0 0 / 25% 100%,
            linear-gradient(to bottom, rgba(245,243,238,0.08) 1px, transparent 1px) 0 0 / 100% 25%;
        }
        .mix-page[data-theme="dark"] .xy-instruct { color: rgba(245,243,238,0.55); }
        .mix-page[data-theme="dark"] .xy-dot { border-color: #0a0a0a; }

        .mix-page[data-theme="dark"] .mixer-meta-row {
          border-top-color: rgba(245,243,238,0.18);
        }
        .mix-page[data-theme="dark"] .beat {
          background: #1a1a1a; border-color: rgba(245,243,238,0.65);
        }
        .mix-page[data-theme="dark"] .led-row { border-top-color: rgba(245,243,238,0.18); }
        .mix-page[data-theme="dark"] .led {
          background: #1a1a1a; border-color: rgba(245,243,238,0.55);
        }
        .mix-page[data-theme="dark"] .led.muted {
          background: rgba(245,243,238,0.18) !important;
          border-color: rgba(245,243,238,0.18) !important;
        }
        .mix-page[data-theme="dark"] .led-cell:hover .led:not(.muted):not(.lit) {
          background: rgba(0,255,99,0.18); border-color: var(--accent);
        }

        .mix-page[data-theme="dark"] .arr-seg { background: rgba(245,243,238,0.12); }
        .mix-page[data-theme="dark"] .arr-seg-drop { background: rgba(245,243,238,0.22); }
        .mix-page[data-theme="dark"] .arr-seg-break { background: rgba(245,243,238,0.10); }
        /* arr-seg-build keeps the green tint */

        .mix-page[data-theme="dark"] .play-btn {
          background: #f5f3ee; color: #0a0a0a; border-color: #f5f3ee;
        }
        .mix-page[data-theme="dark"] .play-btn:hover {
          background: #0a0a0a; color: #f5f3ee; border-color: #f5f3ee;
        }
        .mix-page[data-theme="dark"] .play-btn.is-playing {
          background: var(--accent); color: #0a0a0a; border-color: var(--accent);
        }
        .mix-page[data-theme="dark"] .mixer-credit {
          color: var(--accent); opacity: 0.7;
        }
      `}</style>

      <div className="mixer-head">
        <h2 className="mixer-headline reveal">BITS &amp; BOBS</h2>
        <p className={`mixer-sub${autoplay ? ' mixer-sub-in' : ''}`}>
          Slide the fader from Lafayette to The World. Mix the sliders. Three knobs, three scenes, infinite versions of the same song.
        </p>
      </div>

      <div className="mixer-panel reveal reveal-d2">
        <div className="mixer-left">
          <div className="mixer-sliders">
            <SliderColumn label="Drive"   value={sliders.drive}   onChange={setSlider('drive')} />
            <SliderColumn label="Bass"    value={sliders.bass}    onChange={setSlider('bass')} />
            <SliderColumn label="Melody"  value={sliders.melody}  onChange={setSlider('melody')} />
            <SliderColumn label="Shuffle" value={sliders.shuffle} onChange={setSlider('shuffle')} />
            <SliderColumn label="Echo"    value={sliders.echo}    onChange={setSlider('echo')} />
            <div className="slider-divider" aria-hidden="true" />
            <div className="slider-knobs">
              <Knob
                label="Tempo"
                value={bpm}
                min={BPM_MIN}
                max={BPM_MAX}
                step={1}
                onChange={(v) => setBpm(Math.round(v))}
                suffix="BPM"
              />
              <Knob
                label="Filter"
                value={filterPct}
                min={0}
                max={100}
                step={1}
                onChange={(v) => setFilterPct(Math.round(v))}
                suffix="%"
              />
              <Knob
                label="Crush"
                value={crushPct}
                min={0}
                max={100}
                step={1}
                onChange={(v) => setCrushPct(Math.round(v))}
                suffix="%"
              />
            </div>
          </div>

          <Crossfader3
            value={scene}
            onChange={setScene}
            labels={SCENE_LABELS}
            active={closestScene}
          />

          {/* Activity LEDs — flash when their voice fires; click to mute that voice family */}
          <div className="led-row">
            {(['KICK', 'CLAP', 'HAT', 'BASS', 'LEAD', 'PAD'] as const).map(name => {
              const muted = mutes[name]
              return (
                <div
                  key={name}
                  className={`led-cell${muted ? ' muted' : ''}`}
                  role="switch"
                  aria-checked={!muted}
                  aria-label={`${name} ${muted ? 'muted' : 'armed'}`}
                  tabIndex={0}
                  onClick={() => setMutes(prev => ({ ...prev, [name]: !prev[name] }))}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault()
                      setMutes(prev => ({ ...prev, [name]: !prev[name] }))
                    }
                  }}
                >
                  <div
                    ref={(el) => { ledRefs.current[name] = el }}
                    className={`led${muted ? ' muted' : ''}`}
                  />
                  <span className="led-label">{name}</span>
                </div>
              )
            })}
          </div>

          {/* Arrangement strip — 16 segments showing position in the song */}
          <div className="arr-strip" aria-label="Arrangement position">
            {Array.from({ length: 16 }, (_, i) => {
              const segKind = i < 8 ? 'drop' : i < 12 ? 'break' : 'build'
              const active = i === arrBarUI
              return <div key={i} className={`arr-seg arr-seg-${segKind}${active ? ' active' : ''}`} />
            })}
          </div>
        </div>

        <div className="mixer-right">
          <XYPad
            x={filterPct / 100}
            y={reverbAmt}
            onChange={(nx, ny) => {
              setFilterPct(Math.round(nx * 100))
              setReverbAmt(ny)
            }}
            labelX="Filter"
            labelY="Reverb"
            nudge={nudgeXY}
          />

          <div className="mixer-meta-row">
            <span className="label">Section</span>
            <span className="value section-value">{SECTION_NAMES[section]}</span>
          </div>
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

      <div className="mixer-footer-row">
        <p className="mixer-credit mixer-credit-left">DOS Engineering<sup className="credit-tm">™</sup></p>
        <p className="mixer-credit">Love, Durazzo</p>
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

function XYPad({
  x, y, onChange, labelX, labelY, nudge,
}: {
  x: number; y: number;
  onChange: (nx: number, ny: number) => void;
  labelX: string; labelY: string;
  nudge?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null)
  const update = (clientX: number, clientY: number) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const nx = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    // Flip Y so up = 1, down = 0 (more intuitive than screen-Y).
    const ny = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height))
    onChange(nx, ny)
  }
  return (
    <div className={`xy-pad-wrap${nudge ? ' xy-nudge' : ''}`}>
      <div className="xy-pad-head">
        <span className="xy-pad-name">XY · {labelX} × {labelY}</span>
        <span className="xy-pad-read">{Math.round(x * 100).toString().padStart(2, '0')} · {Math.round(y * 100).toString().padStart(2, '0')}</span>
      </div>
      <div
        ref={ref}
        className="xy-pad"
        role="application"
        aria-label={`${labelX}-${labelY} touch pad`}
        tabIndex={0}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          update(e.clientX, e.clientY)
        }}
        onPointerMove={(e) => { if (e.buttons === 1) update(e.clientX, e.clientY) }}
        onKeyDown={(e) => {
          const step = 0.04
          if (e.key === 'ArrowLeft')  onChange(Math.max(0, x - step), y)
          if (e.key === 'ArrowRight') onChange(Math.min(1, x + step), y)
          if (e.key === 'ArrowUp')    onChange(x, Math.min(1, y + step))
          if (e.key === 'ArrowDown')  onChange(x, Math.max(0, y - step))
        }}
      >
        <div className="xy-grid" aria-hidden="true" />
        <div className="xy-axis-h" style={{ bottom: `${y * 100}%` }} />
        <div className="xy-axis-v" style={{ left: `${x * 100}%` }} />
        <div className="xy-dot" style={{ left: `${x * 100}%`, bottom: `${y * 100}%` }} />
        <span className="xy-corner xy-corner-x">{labelX}</span>
        <span className="xy-corner xy-corner-y">{labelY}</span>
        <span className="xy-instruct" aria-hidden="true">
          <span className="xy-instruct-mouse">Click &amp; Drag</span>
          <span className="xy-instruct-touch">Touch &amp; Drag</span>
        </span>
        {nudge && <span className="xy-hint" aria-hidden="true">drag me</span>}
      </div>
    </div>
  )
}

function Crossfader3({
  value, onChange, labels, active,
}: {
  value: number; onChange: (v: number) => void;
  labels: readonly [string, string, string]; active: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const updateFromX = (clientX: number) => {
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    let v = (clientX - rect.left) / rect.width
    v = Math.max(0, Math.min(1, v))
    // Soft snap to each named position within a ±2% dead zone.
    if (Math.abs(v - 0) < 0.02) v = 0
    if (Math.abs(v - 0.5) < 0.02) v = 0.5
    if (Math.abs(v - 1) < 0.02) v = 1
    onChange(v)
  }
  return (
    <div className="crossfader-3">
      <div className="cf3-labels">
        <span className={active === 0 ? 'active' : ''}>{labels[0]}</span>
        <span className={active === 1 ? 'active' : ''}>{labels[1]}</span>
        <span className={active === 2 ? 'active' : ''}>{labels[2]}</span>
      </div>
      <div
        ref={trackRef}
        className="cf3-track"
        role="slider"
        aria-label="Scene crossfader"
        aria-valuenow={Math.round(value * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); updateFromX(e.clientX) }}
        onPointerMove={(e) => { if (e.buttons === 1) updateFromX(e.clientX) }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft')  onChange(Math.max(0, value - 0.04))
          if (e.key === 'ArrowRight') onChange(Math.min(1, value + 0.04))
          if (e.key === 'Home')       onChange(0)
          if (e.key === 'End')        onChange(1)
          if (e.key === '1')          onChange(0)
          if (e.key === '2')          onChange(0.5)
          if (e.key === '3')          onChange(1)
        }}
      >
        <div className="cf3-detent" style={{ left: '0%' }} />
        <div className="cf3-detent" style={{ left: '50%' }} />
        <div className="cf3-detent" style={{ left: '100%' }} />
        <div className="cf3-handle" style={{ left: `${value * 100}%` }} />
      </div>
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
