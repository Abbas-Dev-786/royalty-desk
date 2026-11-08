import { DomainError } from "../errors.ts";
import { DOMAIN_LIMITS } from "../limits.ts";
import { normalizeStatementRecords, type StatementImportResult } from "./normalize.ts";
import { parseStrictCsv } from "./strict-parser.ts";

function decodeCsv(input: string | Uint8Array): { readonly text: string; readonly bytes: Uint8Array } {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  if (bytes.byteLength > DOMAIN_LIMITS.maxStatementBytes) {
    throw new DomainError("ERR_CSV_SIZE", "Statement exceeds 1 MiB", "$statement");
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), bytes };
  } catch {
    throw new DomainError("ERR_CSV_PARSE", "Statement must be valid UTF-8", "$statement");
  }
}

export function importStatementCsv(
  input: string | Uint8Array,
  approvedRecoupmentCode: string | null = null
): StatementImportResult {
  const { text, bytes } = decodeCsv(input);
  return normalizeStatementRecords(parseStrictCsv(text), bytes, approvedRecoupmentCode);
}
