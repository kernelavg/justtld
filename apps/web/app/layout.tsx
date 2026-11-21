import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'JustTLD — твоя зона в сети',
  description:
    'JustTLD — минималистичная платформа доменных зон, поддоменов, встроенного хостинга и DNS.',
  applicationName: 'JustTLD',
  keywords: ['TLD', 'domains', 'hosting', 'DNS', 'web3', 'JustTLD'],
  authors: [{ name: 'JustTLD' }],
  openGraph: {
    title: 'JustTLD — твоя зона в сети',
    description: 'Собственные доменные зоны, поддомены, сайты и DNS за минуту.',
    type: 'website',
    images: [{ url: '/brand/logo-wide.png', width: 1440, height: 720, alt: 'JustTLD' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafafa' },
    { media: '(prefers-color-scheme: dark)', color: '#050507' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ru"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
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
