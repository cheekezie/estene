import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@estene/lib/utils';

/** A one-time secret (API key, signing secret) with copy-to-clipboard. */
export function SecretReveal({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={cn('bg-accent-soft rounded-lg border border-amber-300 p-4', className)}>
      <p className="text-xs font-medium text-amber-800">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="bg-card min-w-0 flex-1 truncate rounded px-2 py-1.5 font-mono text-sm">
          {value}
        </code>
        <button
          type="button"
          className="hover:bg-card rounded-md p-2"
          aria-label="Copy to clipboard"
          onClick={() => navigator.clipboard.writeText(value).then(() => setCopied(true))}
        >
          {copied ? <Check className="text-success size-4" /> : <Copy className="size-4" />}
        </button>
      </div>
    </div>
  );
}
