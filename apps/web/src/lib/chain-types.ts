export interface ChainAgreement {
  readonly version: string;
  readonly approval_digest: string;
  readonly document_hash: string;
  readonly rules_hash: string;
  readonly active: boolean;
  readonly superseded: boolean;
  readonly participants: readonly { readonly owner_id: string; readonly basis_points: number }[];
}

export interface ChainMandate {
  readonly owner_id: string;
  readonly agent_id: string;
  readonly agreement_version: string;
  readonly actions: readonly string[];
  readonly max_gross_yocto: string;
  readonly expires_at_nanoseconds: string;
  readonly revoked: boolean;
}

export interface ChainRelease {
  readonly release_id: string;
  readonly recording_id: string;
  readonly administrator_id: string;
  readonly funder_id: string;
  readonly invited_owner_ids: readonly string[];
  readonly accepted_owner_ids: readonly string[];
  readonly active_agreement_version: string | null;
  readonly agreements: readonly ChainAgreement[];
  readonly mandates: readonly ChainMandate[];
}

export interface ChainSettlement {
  readonly period: string;
  readonly revision: string;
  readonly agreement_version: string;
  readonly normalized_statement_hash: string;
  readonly gross_yocto: string;
  readonly deduction_evidence_hash: string;
  readonly allocation_preview_hash: string;
  readonly status: string;
  readonly total_deposited_yocto: string;
  readonly refundable_yocto: string;
  readonly unpaid_entitlements_yocto: string;
  readonly in_flight_yocto: string;
  readonly successful_payouts_yocto: string;
  readonly entitlements: readonly { readonly owner_id: string; readonly amount_yocto: string; readonly status: string }[];
}
