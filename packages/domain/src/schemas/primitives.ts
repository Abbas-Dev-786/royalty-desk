import { DomainError } from "../errors.ts";
import { DOMAIN_LIMITS, U64_MAX, U128_MAX } from "../limits.ts";

export function expectRecord(value: unknown, path: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DomainError("ERR_SCHEMA_TYPE", "Expected an object", path);
  }
  return value as Readonly<Record<string, unknown>>;
}

export function expectArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new DomainError("ERR_SCHEMA_TYPE", "Expected an array", path);
  return value;
}

export function expectString(value: unknown, path: string, maxLength: number = DOMAIN_LIMITS.maxLabelLength): string {
  if (typeof value !== "string") throw new DomainError("ERR_SCHEMA_TYPE", "Expected a string", path);
  const normalized = value.normalize("NFC");
  if (normalized.length === 0 || normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new DomainError("ERR_SCHEMA_BOUND", "String is empty, too long, or contains controls", path);
  }
  return normalized;
}

export function expectIdentifier(value: unknown, path: string): string {
  const identifier = expectString(value, path, DOMAIN_LIMITS.maxIdentifierLength);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(identifier)) {
    throw new DomainError("ERR_IDENTIFIER", "Identifier has unsupported characters", path);
  }
  return identifier;
}

export function expectAccountId(value: unknown, path: string): string {
  const accountId = expectString(value, path, 64);
  if (!/^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(accountId)) {
    throw new DomainError("ERR_ACCOUNT_ID", "Invalid NEAR account id", path);
  }
  return accountId;
}

export function expectPeriod(value: unknown, path: string): string {
  const period = expectString(value, path, 7);
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(period)) {
    throw new DomainError("ERR_PERIOD", "Period must be YYYY-MM", path);
  }
  return period;
}

export function expectUnsignedDecimal(
  value: unknown,
  path: string,
  maximum: bigint = U64_MAX
): string {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/.test(value)) {
    throw new DomainError("ERR_SCHEMA_TYPE", "Expected an unsigned canonical decimal string", path);
  }
  if (value.length > maximum.toString().length) throw new DomainError("ERR_SCHEMA_BOUND", "Decimal exceeds its bound", path);
  if (BigInt(value) > maximum) throw new DomainError("ERR_SCHEMA_BOUND", "Decimal exceeds its bound", path);
  return value;
}

export function expectYocto(value: unknown, path: string): string {
  return expectUnsignedDecimal(value, path, U128_MAX);
}

export function expectHexDigest(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new DomainError("ERR_DIGEST", "Expected a lowercase SHA-256 digest", path);
  }
  return value;
}

export function rejectUnknownKeys(record: Readonly<Record<string, unknown>>, allowed: readonly string[], path: string): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(record).find((key) => !allowedSet.has(key));
  if (unknown) throw new DomainError("ERR_SCHEMA_TYPE", `Unknown field: ${unknown}`, `${path}.${unknown}`);
}
