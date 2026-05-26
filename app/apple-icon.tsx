import { ImageResponse } from 'next/og'

// Apple touch icon (iOS home-screen) — same D5 mark, 180×180.
export const runtime = 'edge'
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
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
          fontSize: 156,
          fontWeight: 900,
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
