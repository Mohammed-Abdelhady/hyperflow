/**
 * Session token mint — crypto-random, URL-safe.
 */
import { randomBytes } from "node:crypto";

/** Token byte length before base64url encoding. */
export const TOKEN_BYTES = 24;

/** Alphabet is base64url (A–Z a–z 0–9 - _). */
export function mintSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function resolveToken(explicit?: string | undefined): string {
  if (explicit !== undefined && explicit.length > 0) return explicit;
  return mintSessionToken();
}
