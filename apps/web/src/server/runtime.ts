import "server-only";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { openDatabase, type UserRecord } from "@studio/persistence";
import { findSession } from "@studio/persistence";
import { cookies } from "next/headers";

let database: ReturnType<typeof openDatabase> | undefined;

export function getAppDatabase(): ReturnType<typeof openDatabase> {
  if (!database) {
    // The database location is intentionally runtime-configurable and is never bundled as an asset.
    const path = resolve(/* turbopackIgnore: true */ process.cwd(), "../..", process.env.STUDIO_APP_DB_PATH ?? "data/studio-app.sqlite");
    mkdirSync(dirname(path), { recursive: true });
    database = openDatabase(path);
  }
  return database;
}

export async function currentUser(): Promise<UserRecord | undefined> {
  const token = (await cookies()).get("studio_session")?.value;
  return token ? findSession(getAppDatabase(), token) : undefined;
}

export function requireOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new Error("ERR_CSRF_ORIGIN");
}

export function configuredNetwork(): "testnet" {
  const network = process.env.NEXT_PUBLIC_NEAR_NETWORK ?? "testnet";
  if (network !== "testnet") throw new Error("Studio supports testnet only");
  return network;
}

export function authOrigin(request: Request): string {
  return process.env.STUDIO_AUTH_ORIGIN ?? new URL(request.url).origin;
}
