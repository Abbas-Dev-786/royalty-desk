export interface AgentInteractionStep {
  readonly role: string;
  readonly agentId: string;
  readonly content: string;
  readonly model: string;
  readonly outputHash: string;
  readonly createdAtMs?: number;
  readonly source?: "release-linked" | "archived-concept";
}

export interface SplitOffer {
  readonly kind: "proposal" | "counter" | "acceptance";
  readonly lyricistBasisPoints: number;
  readonly composerBasisPoints: number;
  readonly agentId: string;
  readonly outputHash: string;
}

export const agentRoleNames: Readonly<Record<string, string>> = {
  lyrics: "Lyricist", revision: "Lyricist", composition: "Composer", review: "Reviewer",
  split_proposal: "Lyricist", split_response: "Composer"
};

export const agentActionNames: Readonly<Record<string, string>> = {
  lyrics: "Wrote the lyrics", revision: "Revised the lyrics", composition: "Planned the composition",
  review: "Reviewed the work", split_proposal: "Answered the credit split", split_response: "Answered the credit split"
};

export function parseSplitOffer(step: AgentInteractionStep): SplitOffer | null {
  if (step.role !== "split_proposal" && step.role !== "split_response") return null;
  let fields: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(step.content);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) fields = parsed as Record<string, unknown>;
  } catch { /* Older live replies used a labelled text format. */ }
  const lyricist = fields.lyricistBasisPoints ?? fields.lyricist_bp ?? /lyricistBasisPoints:\s*(\d+)/i.exec(step.content)?.[1];
  const composer = fields.composerBasisPoints ?? fields.composer_bp ?? /composerBasisPoints:\s*(\d+)/i.exec(step.content)?.[1];
  const lyricistBasisPoints = typeof lyricist === "number" || typeof lyricist === "string" ? Number(lyricist) : NaN;
  const composerBasisPoints = typeof composer === "number" || typeof composer === "string" ? Number(composer) : NaN;
  if (!Number.isInteger(lyricistBasisPoints) || !Number.isInteger(composerBasisPoints) || lyricistBasisPoints < 0 || composerBasisPoints < 0 || lyricistBasisPoints + composerBasisPoints !== 10_000) return null;
  const decision = String(fields.decision ?? /^Decision:\s*(ACCEPT|COUNTER)/i.exec(step.content)?.[1] ?? "").toLowerCase();
  const kind = decision === "accept" ? "acceptance" : decision === "counter" ? "counter" : step.role === "split_proposal" ? "proposal" : null;
  return kind ? { kind, lyricistBasisPoints, composerBasisPoints, agentId: step.agentId, outputHash: step.outputHash } : null;
}

export function acceptedSplit(steps: readonly AgentInteractionStep[]): SplitOffer | null {
  let offered: SplitOffer | null = null;
  let accepted: SplitOffer | null = null;
  for (const step of steps) {
    const offer = parseSplitOffer(step);
    if (!offer) continue;
    if (offer.kind === "proposal" || offer.kind === "counter") { offered = offer; accepted = null; }
    else if (offered && offered.lyricistBasisPoints === offer.lyricistBasisPoints && offered.composerBasisPoints === offer.composerBasisPoints) accepted = offer;
  }
  return accepted;
}

export function handoffLabel(step: AgentInteractionStep): string | null {
  switch (step.role) {
    case "lyrics": return "Passed to Composer";
    case "composition": return "Passed to Reviewer";
    case "revision": return "Returned to Reviewer";
    case "review": return step.content.startsWith("REVISE:") ? "Feedback to Lyricist" : step.content.startsWith("ACCEPT:") ? "Approved for credit discussion" : null;
    case "split_proposal": return parseSplitOffer(step)?.kind === "acceptance" ? "Acceptance reply saved" : "Offer to Composer";
    case "split_response": return parseSplitOffer(step)?.kind === "counter" ? "Counteroffer to Lyricist" : parseSplitOffer(step)?.kind === "acceptance" ? "Acceptance reply saved" : null;
    default: return null;
  }
}
