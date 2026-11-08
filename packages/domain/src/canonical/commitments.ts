import { createHash } from "node:crypto";
import type { AgreementRules } from "../types.ts";
import { canonicalBytes, canonicalJson, type CanonicalValue } from "./canonical-json.ts";

export interface AgreementApprovalContext {
  readonly networkId: string;
  readonly contractId: string;
  readonly releaseId: string;
  readonly agreementVersion: string;
}

export interface AgreementCommitment {
  readonly rulesBytes: string;
  readonly rulesHash: string;
  readonly documentHash: string;
  readonly approvalBytes: string;
  readonly approvalDigest: string;
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createAgreementCommitment(
  rules: AgreementRules,
  renderedDocument: Uint8Array,
  context: AgreementApprovalContext
): AgreementCommitment {
  const rulesValue = rules as unknown as CanonicalValue;
  const rulesBytes = canonicalJson(rulesValue);
  const rulesHash = sha256Hex(canonicalBytes(rulesValue));
  const documentHash = sha256Hex(renderedDocument);
  const approvalValue: CanonicalValue = {
    application: "royaltydesk",
    schema: "agreement-approval/v1",
    networkId: context.networkId,
    contractId: context.contractId,
    releaseId: context.releaseId,
    agreementVersion: context.agreementVersion,
    rulesHash,
    documentHash
  };
  const approvalBytes = canonicalJson(approvalValue);
  return { rulesBytes, rulesHash, documentHash, approvalBytes, approvalDigest: sha256Hex(canonicalBytes(approvalValue)) };
}
