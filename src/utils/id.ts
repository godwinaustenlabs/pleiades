/**
 * Generates a URL-safe unique ID for use as primary keys.
 * Uses the Web Crypto API which is available in Cloudflare Workers.
 */
export function generateId(prefix?: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return prefix ? `${prefix}_${hex}` : hex;
}
