import "server-only";
import { currentUser } from "./runtime";
import { openStudioCatalogueDatabase, studioContractClient } from "./studio-catalogue";

export async function requireStudioAdmin(): Promise<{ readonly accountId: string; readonly studioId: string }> {
  const user = await currentUser();
  if (!user) throw new Error("ERR_UNAUTHORIZED");
  if (await studioContractClient().admin() !== user.accountId) throw new Error("ERR_FORBIDDEN");
  const database = openStudioCatalogueDatabase();
  try {
    const row = database.prepare("SELECT id FROM studios WHERE admin_account_id = ? LIMIT 1").get(user.accountId) as { id: string } | undefined;
    if (!row) throw new Error("STUDIO_LOCAL_ADMIN_MISSING");
    return { accountId: user.accountId, studioId: row.id };
  } finally { database.close(); }
}
