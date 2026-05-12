import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'D5XX — 20 Years of Droga5',
  description: 'An invitation-only music night celebrating 20 years of Droga5. June 9 at The Box, NYC.',
  openGraph: {
    title: 'D5XX — 20 Years of Droga5',
    description: 'Celebrate with a music night to remember. June 9 · The Box · NYC.',
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
          href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Bowlby+One&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
