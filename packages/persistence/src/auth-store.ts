import { createHash, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export interface AuthChallenge {
  readonly nonce: string;
  readonly accountId: string | null;
  readonly publicKey: string | null;
  readonly domain: string;
  readonly networkId: string;
  readonly message: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
}

export interface UserRecord { readonly id: string; readonly networkId: string; readonly accountId: string; readonly publicKey: string; }

function mapUser(row: unknown): UserRecord | undefined {
  if (typeof row !== "object" || row === null) return undefined;
  const value = row as Record<string, unknown>;
  if (typeof value.id !== "string" || typeof value.network_id !== "string" || typeof value.account_id !== "string" || typeof value.public_key !== "string") return undefined;
  return { id: value.id, networkId: value.network_id, accountId: value.account_id, publicKey: value.public_key };
}

export function createChallenge(database: DatabaseSync, input: { readonly accountId?: string; readonly nonce?: string; readonly domain: string; readonly networkId: string; readonly message: string; readonly nowMs?: number; readonly ttlMs?: number }): AuthChallenge {
  const nowMs = input.nowMs ?? Date.now();
  const expiresAtMs = nowMs + (input.ttlMs ?? 5 * 60_000);
  const nonce = input.nonce ?? randomBytes(32).toString("base64url");
  database.prepare(`INSERT INTO auth_challenges (nonce, account_id, domain, network_id, message, issued_at_ms, expires_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(nonce, input.accountId ?? null, input.domain, input.networkId, input.message, nowMs, expiresAtMs);
  return { nonce, accountId: input.accountId ?? null, publicKey: null, domain: input.domain, networkId: input.networkId, message: input.message, issuedAtMs: nowMs, expiresAtMs };
}

export function consumeChallenge(database: DatabaseSync, nonce: string, nowMs = Date.now()): AuthChallenge | undefined {
  const row = database.prepare(`SELECT nonce, account_id, public_key, domain, network_id, message, issued_at_ms, expires_at_ms FROM auth_challenges WHERE nonce = ? AND consumed_at_ms IS NULL AND expires_at_ms > ?`).get(nonce, nowMs) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  const result = database.prepare(`UPDATE auth_challenges SET consumed_at_ms = ? WHERE nonce = ? AND consumed_at_ms IS NULL AND expires_at_ms > ?`).run(nowMs, nonce, nowMs);
  if (result.changes !== 1) return undefined;
  return { nonce: String(row.nonce), accountId: typeof row.account_id === "string" ? row.account_id : null, publicKey: typeof row.public_key === "string" ? row.public_key : null, domain: String(row.domain), networkId: String(row.network_id), message: String(row.message), issuedAtMs: Number(row.issued_at_ms), expiresAtMs: Number(row.expires_at_ms) };
}

export function upsertUser(database: DatabaseSync, input: { readonly networkId: string; readonly accountId: string; readonly publicKey: string; readonly nowMs?: number }): UserRecord {
  const nowMs = input.nowMs ?? Date.now();
  const id = createHash("sha256").update(`${input.networkId}:${input.accountId}`).digest("hex").slice(0, 32);
  database.prepare(`INSERT INTO users(id, network_id, account_id, public_key, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(network_id, account_id) DO UPDATE SET public_key = excluded.public_key, updated_at_ms = excluded.updated_at_ms`).run(id, input.networkId, input.accountId, input.publicKey, nowMs, nowMs);
  const user = mapUser(database.prepare(`SELECT id, network_id, account_id, public_key FROM users WHERE id = ?`).get(id));
  if (!user) throw new Error("User was not persisted");
  return user;
}

export function createSession(database: DatabaseSync, userId: string, ttlMs = 7 * 24 * 60 * 60_000, nowMs = Date.now()): { readonly token: string; readonly expiresAtMs: number } {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAtMs = nowMs + ttlMs;
  database.prepare(`INSERT INTO sessions(token_hash, user_id, created_at_ms, expires_at_ms) VALUES (?, ?, ?, ?)`).run(tokenHash, userId, nowMs, expiresAtMs);
  return { token, expiresAtMs };
}

export function findSession(database: DatabaseSync, token: string, nowMs = Date.now()): UserRecord | undefined {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return mapUser(database.prepare(`SELECT u.id, u.network_id, u.account_id, u.public_key FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.revoked_at_ms IS NULL AND s.expires_at_ms > ?`).get(tokenHash, nowMs));
}

export function revokeSession(database: DatabaseSync, token: string, nowMs = Date.now()): void {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  database.prepare(`UPDATE sessions SET revoked_at_ms = ? WHERE token_hash = ? AND revoked_at_ms IS NULL`).run(nowMs, tokenHash);
}
