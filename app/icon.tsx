import { ImageResponse } from 'next/og'

// Browser-tab favicon — bold white "D5" on the brand dark, generated as a
// 32×32 PNG at the edge and cached by Vercel.
export const runtime = 'edge'
export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#0a0a0a',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#f5f3ee',
          fontSize: 28,
          fontWeight: 900,
          // Tight letter-spacing mimics the compressed Archivo Black feel
          // of the brand mark at this small size.
          letterSpacing: '-0.09em',
          lineHeight: 1,
        }}
      >
        D5
      </div>
    ),
    { ...size },
  )
}
