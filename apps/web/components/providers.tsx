'use client';

import * as React from 'react';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { I18nProvider } from '@/lib/i18n';
import { WalletProvider } from '@/lib/wallet';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <I18nProvider>
        <WalletProvider>
          {children}
          <Toaster position="top-right" richColors closeButton />
        </WalletProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
