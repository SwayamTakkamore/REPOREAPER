import type { Metadata, Viewport } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'REPOREAPER — Software Archaeology & Revival Engine',
  description:
    'Excavate any public GitHub repository. Score documentation, dependencies, maintenance, testing, and code quality — then receive an evidence-backed AI revival roadmap.',
  applicationName: 'REPOREAPER',
  keywords: [
    'repository analysis',
    'code health',
    'open source',
    'revival roadmap',
    'static analysis',
    'software archaeology',
  ],
  authors: [{ name: 'REPOREAPER' }],
  openGraph: {
    title: 'REPOREAPER — Software Archaeology & Revival Engine',
    description:
      'Deterministic repository health scoring plus an AI revival roadmap. Static analysis only, nothing is executed.',
    type: 'website',
    siteName: 'REPOREAPER',
  },
  twitter: {
    card: 'summary',
    title: 'REPOREAPER — Software Archaeology & Revival Engine',
    description:
      'Score any public GitHub repository across five dimensions and receive a phased revival roadmap.',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#05070D',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <div className="grid-backdrop" aria-hidden="true" />
        <div className="scanlines" aria-hidden="true" />
        <div className="noise" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
