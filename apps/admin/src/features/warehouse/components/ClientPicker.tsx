import { Select } from '@estene/ui/select';
import { useWarehousingClients } from '../warehouse.queries';

/** Picks one of the clients with warehousing switched on. */
export function ClientPicker({
  value,
  onChange,
  placeholder = 'Choose a client',
  className = 'w-64',
}: {
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const q = useWarehousingClients();
  return (
    <Select
      className={className}
      aria-label="Client"
      placeholder={q.isLoading ? 'Loading clients…' : placeholder}
      options={(q.data ?? []).map((c) => ({ value: c.id, label: `${c.name} · ${c.office.code}` }))}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
