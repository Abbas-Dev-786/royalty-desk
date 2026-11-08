import { DomainError } from "../errors.ts";
import { U128_MAX, YOCTO_PER_NEAR } from "../limits.ts";

const AMOUNT_PATTERN = /^(?:0|[1-9]\d*)(?:\.(\d{1,24}))?$/;

export function parseNearAmount(value: string): bigint {
  if (value.length > 40) throw new DomainError("ERR_AMOUNT_OVERFLOW", "Amount exceeds the maximum decimal length", "$amount");
  const match = AMOUNT_PATTERN.exec(value);
  if (!match) throw new DomainError("ERR_AMOUNT_FORMAT", "Amount must be a canonical nonnegative NEAR decimal", "$amount");
  const [wholeText, fractionText = ""] = value.split(".");
  const whole = BigInt(wholeText ?? "0");
  const fraction = BigInt(fractionText.padEnd(24, "0") || "0");
  const amount = whole * YOCTO_PER_NEAR + fraction;
  if (amount > U128_MAX) throw new DomainError("ERR_AMOUNT_OVERFLOW", "Amount exceeds u128", "$amount");
  return amount;
}

export function formatNearAmount(amountYocto: bigint): string {
  if (amountYocto < 0n || amountYocto > U128_MAX) {
    throw new DomainError("ERR_AMOUNT_OVERFLOW", "Yocto amount is outside u128", "$amountYocto");
  }
  const whole = amountYocto / YOCTO_PER_NEAR;
  const fraction = (amountYocto % YOCTO_PER_NEAR).toString().padStart(24, "0").replace(/0+$/, "");
  return fraction.length === 0 ? whole.toString() : `${whole}.${fraction}`;
}
