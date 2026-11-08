import type { Metadata, Viewport } from 'next';
import { Inter, Manrope } from 'next/font/google';
import { Toaster } from 'sonner';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? 'http://localhost:3100'),
  title: {
    default: 'Estene — Parcel delivery across Abuja, interstate and by air',
    template: '%s · Estene',
  },
  description:
    'Send parcels across Abuja, to other states by road, or by flight. Tracked pickup, QR-tagged handling and PIN-secured delivery. Instant quotes, same-day options.',
  openGraph: { type: 'website', siteName: 'Estene Logistics', locale: 'en_NG' },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = { themeColor: '#3230aa' };

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
