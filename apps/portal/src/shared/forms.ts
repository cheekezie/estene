import type { ZodError } from 'zod';

/** Zod issues → `{ 'recipient.phone': 'message' }`, first message per field. */
export function fieldErrors(error: ZodError) {
  const map: Record<string, string> = {};
  for (const i of error.issues) map[i.path.join('.')] ??= i.message;
  return map;
}

export const blank = (v: string) => v.trim() || undefined;
