import { DomainError } from "../errors.ts";
import { U128_MAX } from "../limits.ts";
import type { ParticipantShare } from "../types.ts";

export interface AllocationInput {
  readonly grossYocto: bigint;
  readonly remainingRecoupmentYocto: bigint;
  readonly recoupmentBeneficiaryId: string | null;
  readonly participants: readonly ParticipantShare[];
}

export interface Entitlement {
  readonly ownerId: string;
  readonly amountYocto: bigint;
}

export interface AllocationResult {
  readonly grossYocto: bigint;
  readonly recoupedYocto: bigint;
  readonly distributableYocto: bigint;
  readonly entitlements: readonly Entitlement[];
}

interface ProvisionalShare {
  readonly ownerId: string;
  readonly floor: bigint;
  readonly remainder: bigint;
}

export function allocateEntitlements(input: AllocationInput): AllocationResult {
  if (input.grossYocto <= 0n || input.grossYocto > U128_MAX) {
    throw new DomainError("ERR_AMOUNT_OVERFLOW", "Payable gross must be positive and within u128", "$allocation.grossYocto");
  }
  if (input.remainingRecoupmentYocto < 0n || input.remainingRecoupmentYocto > U128_MAX) {
    throw new DomainError("ERR_AMOUNT_OVERFLOW", "Remaining recoupment is outside u128", "$allocation.remainingRecoupmentYocto");
  }
  if (input.participants.length < 2 || new Set(input.participants.map((entry) => entry.ownerId)).size !== input.participants.length) {
    throw new DomainError("ERR_PARTICIPANTS", "Allocation participants must be unique", "$allocation.participants");
  }
  const totalBasisPoints = input.participants.reduce((sum, entry) => sum + BigInt(entry.basisPoints), 0n);
  if (totalBasisPoints !== 10_000n) {
    throw new DomainError("ERR_BASIS_POINTS", "Allocation shares must total 10000", "$allocation.participants");
  }
  if (input.remainingRecoupmentYocto > 0n && !input.recoupmentBeneficiaryId) {
    throw new DomainError("ERR_RECOUPMENT", "Positive recoupment requires a beneficiary", "$allocation.recoupmentBeneficiaryId");
  }
  if (input.recoupmentBeneficiaryId && !input.participants.some((entry) => entry.ownerId === input.recoupmentBeneficiaryId)) {
    throw new DomainError("ERR_RECOUPMENT", "Recoupment beneficiary is not a participant", "$allocation.recoupmentBeneficiaryId");
  }

  const recoupedYocto = input.grossYocto < input.remainingRecoupmentYocto ? input.grossYocto : input.remainingRecoupmentYocto;
  const distributableYocto = input.grossYocto - recoupedYocto;
  const provisional: ProvisionalShare[] = input.participants.map((participant) => {
    const product = distributableYocto * BigInt(participant.basisPoints);
    return { ownerId: participant.ownerId, floor: product / 10_000n, remainder: product % 10_000n };
  });
  const allocatedFloor = provisional.reduce((sum, entry) => sum + entry.floor, 0n);
  const leftover = distributableYocto - allocatedFloor;
  if (leftover < 0n || leftover > BigInt(provisional.length)) {
    throw new DomainError("ERR_BASIS_POINTS", "Largest-remainder allocation is inconsistent", "$allocation");
  }
  const ranked = [...provisional].sort((left, right) => {
    if (left.remainder !== right.remainder) return left.remainder > right.remainder ? -1 : 1;
    return left.ownerId < right.ownerId ? -1 : left.ownerId > right.ownerId ? 1 : 0;
  });
  const bonus = new Set(ranked.slice(0, Number(leftover)).map((entry) => entry.ownerId));
  const entitlements = provisional
    .map((entry) => ({
      ownerId: entry.ownerId,
      amountYocto: entry.floor + (bonus.has(entry.ownerId) ? 1n : 0n) + (entry.ownerId === input.recoupmentBeneficiaryId ? recoupedYocto : 0n)
    }))
    .sort((left, right) => left.ownerId < right.ownerId ? -1 : left.ownerId > right.ownerId ? 1 : 0);
  const allocated = entitlements.reduce((sum, entry) => sum + entry.amountYocto, 0n);
  if (allocated !== input.grossYocto) throw new DomainError("ERR_AMOUNT_OVERFLOW", "Allocation does not conserve gross", "$allocation");
  return { grossYocto: input.grossYocto, recoupedYocto, distributableYocto, entitlements };
}
