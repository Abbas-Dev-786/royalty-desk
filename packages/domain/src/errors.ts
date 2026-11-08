export type DomainErrorCode =
  | "ERR_SCHEMA_TYPE"
  | "ERR_SCHEMA_REQUIRED"
  | "ERR_SCHEMA_BOUND"
  | "ERR_ACCOUNT_ID"
  | "ERR_IDENTIFIER"
  | "ERR_PERIOD"
  | "ERR_AMOUNT_FORMAT"
  | "ERR_AMOUNT_OVERFLOW"
  | "ERR_BASIS_POINTS"
  | "ERR_PARTICIPANTS"
  | "ERR_RECOUPMENT"
  | "ERR_DIGEST"
  | "ERR_CANONICAL_VALUE"
  | "ERR_CSV_SIZE"
  | "ERR_CSV_PARSE"
  | "ERR_CSV_HEADER"
  | "ERR_CSV_ROWS"
  | "ERR_CSV_DUPLICATE"
  | "ERR_CSV_VALUE";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly path: string;

  constructor(code: DomainErrorCode, message: string, path = "$") {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.path = path;
  }
}
