import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Autonomous AI Company Simulator',
  description: 'A multi-agent boardroom that plans, hires, builds and hands over software projects.',
};

export const viewport: Viewport = {
  themeColor: '#09090b',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 font-sans text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
