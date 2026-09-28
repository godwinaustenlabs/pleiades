/**
 * Opaque single-use tokens, and the hash they are stored as.
 *
 * Lifted out of `src/routes/auth.ts` when the password-reset flow gained an
 * email delivery step, because a second copy of "how a reset token is made and
 * hashed" is the kind of duplication that ends with one half being 16 bytes and
 * the other 32, and nobody noticing which one guards what.
 */

/**
 * A cryptographically random URL-safe token — 32 bytes, hex-encoded.
 *
 * Hex rather than base64url so it survives being pasted, retyped off a phone
 * screen, or mangled by a mail client that decides a `+` was a space.
 */
export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * SHA-256, hex.
 *
 * What gets stored, never the token itself. Plain SHA-256 is right here and
 * PBKDF2 would not be: this is a 256-bit random value with no structure to
 * guess, so there is nothing for a slow hash to defend against — unlike a
 * password, where the whole threat is that people choose them.
 *
 * The property that matters is that a database read yields no usable token,
 * which matters more now than it did: once mail is stored in D1, a reset link
 * and the hash that validates it would otherwise both live in the same database.
 */
export async function sha256hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
