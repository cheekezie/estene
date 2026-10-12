'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Search } from 'lucide-react';
import { cn } from '@estene/lib/utils';

export function TrackForm({ defaultValue = '', size = 'md' }: { defaultValue?: string; size?: 'md' | 'lg' }) {
  const [value, setValue] = useState(defaultValue);
  const router = useRouter();
  const tn = value.trim().toUpperCase();

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (tn.length >= 6) router.push(`/track/${encodeURIComponent(tn)}`);
      }}
      className={cn('flex w-full items-center gap-2 rounded-xl bg-white p-1.5 shadow-lg ring-1 ring-slate-900/5', size === 'lg' && 'p-2')}
    >
      <Search className="ml-3 size-5 shrink-0 text-slate-400" aria-hidden />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Enter tracking number, e.g. EST7K3M9Q2XA"
        aria-label="Tracking number"
        autoCapitalize="characters"
        spellCheck={false}
        className={cn('min-w-0 flex-1 bg-transparent font-mono text-slate-900 uppercase placeholder:font-sans placeholder:normal-case placeholder:text-slate-400 focus:outline-none', size === 'lg' ? 'h-12 text-base' : 'h-10 text-sm')}
      />
      <button
        type="submit"
        disabled={tn.length < 6}
        className={cn('inline-flex items-center gap-2 rounded-lg bg-accent font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-60', size === 'lg' ? 'h-12 px-5' : 'h-10 px-4 text-sm')}
      >
        Track <ArrowRight className="size-4" />
      </button>
    </form>
  );
}
