interface WeightedRecipient { readonly id: string; readonly basisPoints: number; }

/** Mirrors the studio contract: integer division, with remaining dust given to the last recipient. */
export function allocateContractShares(amountYocto: string, recipients: readonly WeightedRecipient[]): readonly { id: string; amountYocto: string }[] {
  if (!/^(0|[1-9][0-9]*)$/.test(amountYocto) || !recipients.length || new Set(recipients.map((item) => item.id)).size !== recipients.length || recipients.some((item) => !item.id || !Number.isSafeInteger(item.basisPoints) || item.basisPoints <= 0) || recipients.reduce((total, item) => total + item.basisPoints, 0) !== 10_000) throw new Error("ERR_AGENT_ALLOCATION_INPUT");
  const total = BigInt(amountYocto);
  let remaining = total;
  return recipients.map((recipient, index) => {
    const amount = index === recipients.length - 1 ? remaining : total * BigInt(recipient.basisPoints) / 10_000n;
    remaining -= amount;
    return { id: recipient.id, amountYocto: amount.toString() };
  });
}
