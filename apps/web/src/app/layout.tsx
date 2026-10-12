import type { Metadata, Viewport } from 'next';
import { Inter, Manrope } from 'next/font/google';
import { Toaster } from 'sonner';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: { default: 'Estene — Parcel delivery across Abuja', template: '%s · Estene' },
  description: 'Send parcels across Abuja with tracked pickup, QR-tagged handling and PIN-secured delivery. Instant quotes, same-day options.',
  openGraph: { type: 'website', siteName: 'Estene Logistics', locale: 'en_NG' },
};

export const viewport: Viewport = { themeColor: '#1f47d6' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG" className={`${inter.variable} ${manrope.variable}`}>
      <body className="flex min-h-dvh flex-col bg-white">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
