import { DomainError } from "../errors.ts";

export function parseStrictCsv(text: string): readonly (readonly string[])[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let fieldStarted = false;

  const pushField = (): void => {
    row.push(field);
    field = "";
    fieldStarted = false;
  };
  const pushRow = (): void => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (character === '"') {
        if (next === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      if (fieldStarted || field.length > 0) throw new DomainError("ERR_CSV_PARSE", "Quote must start a field", "$statement");
      quoted = true;
      fieldStarted = true;
    } else if (character === ",") {
      pushField();
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && next === "\n") index += 1;
      pushRow();
    } else {
      if (character === "\u0000") throw new DomainError("ERR_CSV_PARSE", "NUL is not allowed in CSV", "$statement");
      field += character;
      fieldStarted = true;
    }
  }
  if (quoted) throw new DomainError("ERR_CSV_PARSE", "Unclosed quoted field", "$statement");
  if (field.length > 0 || fieldStarted || row.length > 0) pushRow();
  return rows;
}
