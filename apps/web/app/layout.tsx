import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';

export const metadata: Metadata = {
  title: 'JustTLD — создай свою зону',
  description:
    'JustTLD — платформа пользовательских доменных зон, поддоменов, встроенного хостинга сайтов и DNS.',
  applicationName: 'JustTLD',
  keywords: ['TLD', 'blockchain', 'registry', 'web3', 'domains', 'JustTLD', 'DNS'],
  authors: [{ name: 'JustTLD' }],
  openGraph: {
    title: 'JustTLD — создай свою зону',
    description: 'Собственные доменные зоны, поддомены, сайты и DNS в один клик.',
    type: 'website',
    images: [{ url: '/brand/logo-wide.png', width: 1440, height: 720, alt: 'JustTLD' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f9fafb' },
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <Providers>
          <div className="flex min-h-screen flex-col">
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </div>
        </Providers>
      </body>
    </html>
  );
}
