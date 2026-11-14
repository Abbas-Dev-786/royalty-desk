import "server-only";
import { currentUser } from "./runtime";
import { requireStudioAdmin } from "./studio-admin";
import { openStudioCatalogueDatabase, studioContractClient } from "./studio-catalogue";
import type { StudioProjectAccess } from "@/lib/studio-album-access";

interface AlbumOwner {
  readonly studio_id: string;
  readonly project_title: string;
  readonly account_id: string | null;
  readonly concept: string | null;
  readonly lyricist_id: string | null;
  readonly composer_id: string | null;
  readonly reviewer_id: string | null;
}

export async function requireStudioProjectAccess(projectId: string): Promise<StudioProjectAccess> {
  const user = await currentUser();
  if (!user || user.networkId !== "testnet") throw new Error("ERR_UNAUTHORIZED");
  const database = openStudioCatalogueDatabase();
  let row: AlbumOwner | undefined;
  try {
    row = database.prepare(`SELECT p.studio_id, p.title AS project_title, a.account_id, a.concept, a.lyricist_id, a.composer_id, a.reviewer_id
      FROM studio_projects p JOIN studios s ON s.id = p.studio_id
      LEFT JOIN studio_user_album_projects a ON a.project_id = p.id
      WHERE p.id = ? AND s.admin_account_id = ?`).get(projectId, studioContractClient().contractId) as AlbumOwner | undefined;
  } finally { database.close(); }
  if (!row) throw new Error("ERR_PROJECT_SCOPE");
  if (row.account_id === user.accountId && row.concept && row.lyricist_id && row.composer_id && row.reviewer_id) {
    return { kind: "album_owner", studioId: row.studio_id, accountId: user.accountId, title: row.project_title, concept: row.concept, lyricistId: row.lyricist_id, composerId: row.composer_id, reviewerId: row.reviewer_id };
  }
  const admin = await requireStudioAdmin();
  if (admin.studioId !== row.studio_id) throw new Error("ERR_FORBIDDEN");
  return { kind: "admin", studioId: row.studio_id, accountId: admin.accountId };
}
