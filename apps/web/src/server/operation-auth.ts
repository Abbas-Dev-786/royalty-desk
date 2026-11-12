import { getMembership } from "@royaltydesk/persistence";
import { currentUser, getAppDatabase } from "./runtime";

export async function requireOperationSigner(releaseId: string, operationType: string): Promise<string> {
  const user = await currentUser();
  if (!user) throw new Error("ERR_UNAUTHORIZED");
  if (operationType === "create_release") return user.accountId;
  const membership = getMembership(getAppDatabase(), releaseId, user.accountId, undefined, operationType === "accept_membership" ? undefined : "accepted");
  if (!membership || (operationType === "accept_membership" && membership.role !== "owner")) throw new Error("ERR_FORBIDDEN");
  return user.accountId;
}
