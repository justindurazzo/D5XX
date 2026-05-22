'use client'

import { useEffect, useRef } from 'react'

// Subtle animated white flicker / analog-tape static, drawn on a WebGL
// fullscreen quad. Sits behind the mixer as a faint "video channel" backdrop.
// If WebGL is unavailable it renders nothing — the section just stays black.
export default function FlickerBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
    })
    if (!gl) return

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      return sh
    }

    const vs = compile(gl.VERTEX_SHADER, `
      attribute vec2 p;
      void main() { gl_Position = vec4(p, 0.0, 1.0); }
    `)
    const fs = compile(gl.FRAGMENT_SHADER, `
      precision highp float;
      uniform float uTime;
      float hash(vec2 v) {
        return fract(sin(dot(v, vec2(12.9898, 78.233))) * 43758.5453);
      }
      void main() {
        vec2 frag = gl_FragCoord.xy;
        float t = floor(uTime * 16.0);                       // chunky tape frames
        float grain = smoothstep(0.80, 1.0, hash(frag + t * 1.7));   // sparse specks
        float fl = 0.45 + 0.55 * hash(vec2(t, 11.0));         // global flicker
        float scan = 0.62 + 0.38 * sin((frag.y + uTime * 26.0) * 0.30);
        float band = smoothstep(0.975, 1.0, hash(vec2(floor(frag.y / 3.0), t)));
        float v = grain * fl * scan + band * 0.45 * fl;
        gl_FragColor = vec4(1.0, 1.0, 1.0, v * 0.16);
      }
    `)
    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const uTime = gl.getUniformLocation(prog, 'uTime')

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        gl.viewport(0, 0, w, h)
      }
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const start = performance.now()
    let raf = 0
    let visible = true

    const draw = (now: number) => {
      resize()
      gl.uniform1f(uTime, (now - start) / 1000)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      // Reduced-motion: render a single static grain frame, then stop.
      raf = visible && !reduced ? requestAnimationFrame(draw) : 0
    }
    raf = requestAnimationFrame(draw)

    // Pause the GPU loop while the mixer is scrolled out of view.
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible && !reduced && !raf) raf = requestAnimationFrame(draw)
    })
    io.observe(canvas)

    const onResize = () => resize()
    window.addEventListener('resize', onResize)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      io.disconnect()
      window.removeEventListener('resize', onResize)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
        display: 'block',
      }}
    />
  )
}
