import Link from 'next/link';
import { Logo } from '@estene/ui/Logo';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="Estene home">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1 text-sm font-medium sm:gap-2">
          <Link href="/track" className="rounded-md px-3 py-2 text-slate-600 hover:text-slate-900">
            Track
          </Link>
          <Link
            href="/#interstate"
            className="hidden rounded-md px-3 py-2 text-slate-600 hover:text-slate-900 md:block"
          >
            Interstate
          </Link>
          <Link
            href="/#how-it-works"
            className="hidden rounded-md px-3 py-2 text-slate-600 hover:text-slate-900 sm:block"
          >
            How it works
          </Link>
          <Link
            href="/#riders"
            className="hidden rounded-md px-3 py-2 text-slate-600 hover:text-slate-900 sm:block"
          >
            Ride with us
          </Link>
          <Link
            href="/send"
            className="bg-primary hover:bg-primary-hover ml-1 rounded-md px-4 py-2 text-white shadow-sm"
          >
            Send a parcel
          </Link>
        </nav>
      </div>
    </header>
  );
}
