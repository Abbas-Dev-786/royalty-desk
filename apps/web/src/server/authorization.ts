import { getMembership, type Membership } from "@royaltydesk/persistence";
import { currentUser, getAppDatabase } from "./runtime";

export async function requireMembership(releaseId: string, allowedRoles?: readonly Membership["role"][]): Promise<{ readonly accountId: string; readonly membership: Membership }> {
  const user = await currentUser();
  if (!user) throw new Error("ERR_UNAUTHORIZED");
  const membership = getMembership(getAppDatabase(), releaseId, user.accountId, allowedRoles, "accepted");
  if (!membership) throw new Error("ERR_FORBIDDEN");
  return { accountId: user.accountId, membership };
}
