import { DomainError } from "../errors.ts";

export type CanonicalValue = null | boolean | string | readonly CanonicalValue[] | Readonly<{ [key: string]: CanonicalValue }>;

function encode(value: unknown, path: string): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value.normalize("NFC"));
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) throw new DomainError("ERR_CANONICAL_VALUE", "Sparse arrays are not canonical", `${path}[${index}]`);
    }
    return `[${value.map((entry, index) => encode(entry, `${path}[${index}]`)).join(",")}]`;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new DomainError("ERR_CANONICAL_VALUE", "Only plain objects are canonical", path);
    }
    const record = value as Readonly<Record<string, unknown>>;
    const normalizedEntries = Object.entries(record).map(([key, entry]) => [key.normalize("NFC"), entry] as const);
    if (new Set(normalizedEntries.map(([key]) => key)).size !== normalizedEntries.length) {
      throw new DomainError("ERR_CANONICAL_VALUE", "Object keys collide after NFC normalization", path);
    }
    normalizedEntries.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return `{${normalizedEntries.map(([key, entry]) => `${JSON.stringify(key)}:${encode(entry, `${path}.${key}`)}`).join(",")}}`;
  }
  throw new DomainError("ERR_CANONICAL_VALUE", `Unsupported canonical value type: ${typeof value}`, path);
}

export function canonicalJson(value: CanonicalValue): string {
  return encode(value, "$");
}

export function canonicalBytes(value: CanonicalValue): Uint8Array {
  return new TextEncoder().encode(canonicalJson(value));
}
