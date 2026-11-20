import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';

export const metadata: Metadata = {
  title: 'JustTLD — создай свою зону',
  description:
    'JustTLD — децентрализованный реестр пользовательских TLD-зон: регистрация, передача и продление напрямую с кошелька.',
  applicationName: 'JustTLD',
  keywords: ['TLD', 'blockchain', 'registry', 'web3', 'domains', 'JustTLD'],
  authors: [{ name: 'JustTLD' }],
  openGraph: {
    title: 'JustTLD — создай свою зону',
    description: 'Реестр пользовательских TLD-зон на блокчейне.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1020' },
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
