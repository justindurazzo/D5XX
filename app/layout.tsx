import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'D5XX — Droga5 Turns Twenty',
  description: 'An invitation-only evening celebrating two decades of Droga5. October 3rd, 2026.',
  openGraph: {
    title: 'D5XX — Droga5 Turns Twenty',
    description: 'An invitation-only evening celebrating two decades of Droga5.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:ital,wght@0,300;0,400;1,300&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
