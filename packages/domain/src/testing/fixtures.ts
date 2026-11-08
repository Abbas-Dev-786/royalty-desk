import { readFileSync } from "node:fs";

export function loadJsonFixture<T>(url: URL, validate: (value: unknown) => T): T {
  const parsed = JSON.parse(readFileSync(url, "utf8")) as unknown;
  return validate(parsed);
}

export function loadTextFixture(url: URL): string {
  return readFileSync(url, "utf8");
}
