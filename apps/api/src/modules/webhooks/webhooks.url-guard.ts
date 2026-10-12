import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { isProd } from '../../config/env';

/**
 * Blocks webhook URLs that would make our servers call into private
 * networks (SSRF): loopback, RFC 1918, link-local (cloud metadata at
 * 169.254.169.254), CGNAT, ULA. Checked at send time, after DNS resolution,
 * so a hostname can't be re-pointed at an internal address later.
 * Development allows localhost so integrations can be tested locally.
 */
function isPrivateAddress(ip: string) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number];
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7));
  return (
    v6 === '::1' ||
    v6 === '::' ||
    v6.startsWith('fc') ||
    v6.startsWith('fd') ||
    v6.startsWith('fe80')
  );
}

export async function assertSafeWebhookUrl(raw: string) {
  const url = new URL(raw);
  if (isProd && url.protocol !== 'https:') throw new Error('Webhook URLs must use https');
  if (!isProd) return;
  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true });
  if (addresses.some((a) => isPrivateAddress(a.address)))
    throw new Error('Webhook URL resolves to a private network address');
}

export const _test = { isPrivateAddress };
