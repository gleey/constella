import crypto from "node:crypto";

/**
 * Admin password hashing with Node's built-in scrypt.
 *
 * Why scrypt and not bcrypt/argon2:
 *   - Zero extra dependencies (crypto is in Node core), so no supply-chain or
 *     native-build risk for a single-credential check.
 *   - scrypt is memory-hard and the recommended KDF when argon2 is unavailable.
 *
 * Stored format:  scrypt:N:r:p:<salt-hex>:<hash-hex>
 *
 * The separator is ":" rather than the bcrypt-style "$" because Next.js's env
 * loader (@next/env) interpolates "$VAR" inside double-quoted .env values,
 * which silently mangles a "$"-separated hash. ":" has no special meaning in
 * .env, so the hash round-trips intact. The parameters are embedded so a hash
 * stays verifiable even if we later raise the work factors for *new* hashes.
 */

const SCRYPT_N = 16384; // CPU/memory cost
const SCRYPT_R = 8; // block size
const SCRYPT_P = 1; // parallelization
const KEY_LEN = 64;
const SALT_LEN = 16;

export function hashAdminPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_LEN);
  const derived = crypto.scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifyAdminPassword(password: string, stored: string): boolean {
  try {
    const parts = stored.split(":");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const salt = Buffer.from(parts[4], "hex");
    const expected = Buffer.from(parts[5], "hex");
    if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
    const derived = crypto.scryptSync(password, salt, expected.length, { N, r, p });
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
