import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Sealed cookie values (decision D16): AES-256-GCM under a key derived from CONSOLE_SESSION_SECRET, so
 * the browser holds the session but can neither read nor change it. Nothing is stored on the server
 * (D6); a restart with the same secret keeps sessions, a new secret ends them all.
 */
const VERSION = "v1";

function keyOf(secret: string): Buffer {
  return createHash("sha256").update(`builder-console session ${secret}`).digest();
}

export function seal(secret: string, value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyOf(secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

/** The sealed value, or null when it was tampered with, sealed under another secret, or malformed. */
export function unseal(secret: string, sealed: string): unknown {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !body) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyOf(secret), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const text = Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
