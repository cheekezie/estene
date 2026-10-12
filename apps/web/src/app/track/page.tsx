import type { Metadata } from 'next';
import { TrackForm } from '@/components/TrackForm';

export const metadata: Metadata = { title: 'Track a parcel' };

export default function TrackPage() {
  return (
    <section className="bg-blue-950 py-24">
      <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
        <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">Track your parcel</h1>
        <p className="mt-3 text-blue-200">Your tracking number is in your booking SMS and starts with EST.</p>
        <div className="mt-8"><TrackForm size="lg" /></div>
      </div>
    </section>
  );
}
