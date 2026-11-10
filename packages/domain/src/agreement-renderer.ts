import type { AgreementRules } from "./types.ts";

export interface RenderedAgreement {
  readonly markdown: string;
  readonly bytes: Uint8Array;
}

export function renderAgreementMarkdown(rules: AgreementRules, templateVersion = "agreement-template/v1"): RenderedAgreement {
  const participantLines = rules.participants.map((participant) => `- ${participant.ownerId}: ${participant.basisPoints} basis points`).join("\n");
  const recoupment = rules.recoupment ? `- Recoupment: ${rules.recoupment.capYocto} yoctoNEAR to ${rules.recoupment.beneficiaryId} (${rules.recoupment.code})` : "- Recoupment: none";
  const markdown = [
    `# Royalty agreement — ${rules.releaseId}`,
    "",
    `Template: ${templateVersion}`,
    `Recording: ${rules.recordingId}`,
    `Effective period: ${rules.effectivePeriod}`,
    "",
    "## Participants",
    participantLines,
    "",
    "## Settlement rules",
    recoupment,
    "",
    "This document is frozen by its exact UTF-8 bytes and the corresponding structured-rules commitment.",
    ""
  ].join("\n");
  return { markdown, bytes: new TextEncoder().encode(markdown) };
}
