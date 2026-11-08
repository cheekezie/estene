export { formatNaira } from '@estene/contracts/money';

/** +2348031234567 → 0803 123 4567 (same as @estene/lib/utils, which pulls in web-only deps). */
export const formatPhone = (e164: string) => {
  const local = e164.replace(/^\+234/, '0');
  return local.length === 11 ? `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}` : e164;
};

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' });

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

export const formatKm = (km: number) =>
  km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
