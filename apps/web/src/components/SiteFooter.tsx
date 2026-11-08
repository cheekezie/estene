import Link from 'next/link';
import { Logo } from '@estene/ui/Logo';

export function SiteFooter() {
  return (
    <footer className="bg-blue-950 text-blue-200">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo inverted />
          <p className="mt-4 max-w-sm text-sm leading-relaxed">
            Parcel pickup and delivery across Abuja, to other states and by air. Every parcel
            tagged, tracked and handed over only to the right person.
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Send</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/send" className="hover:text-white">
                Book a delivery
              </Link>
            </li>
            <li>
              <Link href="/track" className="hover:text-white">
                Track a parcel
              </Link>
            </li>
            <li>
              <Link href="/#interstate" className="hover:text-white">
                Interstate &amp; flight delivery
              </Link>
            </li>
            <li>
              <Link href="/#coverage" className="hover:text-white">
                Where we deliver
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Company</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/ride" className="hover:text-white">
                Ride with Estene
              </Link>
            </li>
            <li>
              <a href="mailto:hello@estene.ng" className="hover:text-white">
                hello@estene.ng
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-blue-900">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-blue-300 sm:px-6">
          © {new Date().getFullYear()} Estene Logistics Ltd. Abuja, Nigeria.
        </p>
      </div>
    </footer>
  );
}
