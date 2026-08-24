/**
 * Password hashing.
 *
 * Passwords were previously stored as a plain, unsalted SHA-256 digest. That is
 * a single fast hash with no per-user salt: identical passwords produce
 * identical digests, and the whole space is precomputable with rainbow tables.
 * Several such digests are also present in committed SQL dumps.
 *
 * New hashes use PBKDF2-HMAC-SHA256 with a per-user random salt and a high
 * iteration count. Legacy digests are still *verified* so nobody is locked out,
 * and are transparently upgraded on the next successful login — the only moment
 * the plaintext is available to rehash.
 */

/** OWASP's recommended floor for PBKDF2-HMAC-SHA256. */
const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

const fromHex = (hex: string) =>
  new Uint8Array((hex.match(/.{1,2}/g) || []).map((b) => parseInt(b, 16)));

/** Legacy scheme: a bare 64-char hex SHA-256 digest with no salt or prefix. */
const LEGACY_SHA256 = /^[0-9a-f]{64}$/i;

async function sha256hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input)));
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    key,
    KEY_BITS,
  );
  return toHex(bits);
}

/** Constant-time compare of two equal-length hex strings. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Hashes a password for storage.
 * Format: `pbkdf2$<iterations>$<saltHex>$<derivedKeyHex>` — self-describing, so
 * the iteration count can be raised later without breaking existing hashes.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt.buffer as ArrayBuffer)}$${derived}`;
}

/**
 * Verifies a password against a stored hash of either scheme.
 *
 * `needsUpgrade` is true when the stored hash used the legacy scheme (or a lower
 * iteration count); callers should rehash and persist while they still hold the
 * plaintext.
 */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<{ valid: boolean; needsUpgrade: boolean }> {
  if (!stored) return { valid: false, needsUpgrade: false };

  if (LEGACY_SHA256.test(stored)) {
    const valid = timingSafeEqualHex(await sha256hex(password), stored.toLowerCase());
    return { valid, needsUpgrade: valid };
  }

  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return { valid: false, needsUpgrade: false };

  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations <= 0) return { valid: false, needsUpgrade: false };

  const derived = await pbkdf2(password, fromHex(parts[2]), iterations);
  const valid = timingSafeEqualHex(derived, parts[3]);
  return { valid, needsUpgrade: valid && iterations < PBKDF2_ITERATIONS };
}
