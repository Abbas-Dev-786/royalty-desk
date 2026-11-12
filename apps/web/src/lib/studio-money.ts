const scale = 10n ** 24n;
export function yoctoToNear(value: string): string {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error("Invalid yoctoNEAR amount");
  const amount = BigInt(value);
  const fraction = (amount % scale).toString().padStart(24, "0").replace(/0+$/, "");
  return `${amount / scale}${fraction ? `.${fraction}` : ""}`;
}
export function nearToYocto(value: string): string {
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,24})?$/.test(value)) throw new Error("Enter a decimal NEAR amount with at most 24 places");
  const [whole, fractional = ""] = value.split(".");
  return (BigInt(whole ?? "0") * scale + BigInt((fractional + "0".repeat(24)).slice(0, 24))).toString();
}
