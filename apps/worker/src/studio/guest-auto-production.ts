import { openDatabase } from "@studio/persistence";
import type { StudioSongProductionService } from "./song-production.ts";

interface PendingGuestSong {
  readonly project_id: string;
  readonly brief: string;
  readonly title: string;
  readonly lyricist_id: string;
  readonly composer_id: string;
  readonly reviewer_id: string;
}

/** Complete accepted guest sessions even when the visitor has closed the page. */
export async function producePendingGuestSongs(databasePath: string, service: Pick<StudioSongProductionService, "generate">, blocked: Set<string>, canGenerate: () => Promise<boolean>): Promise<readonly { projectId: string; error: string }[]> {
  const database = openDatabase(databasePath);
  let pending: PendingGuestSong[];
  try {
    pending = database.prepare(`SELECT g.project_id, g.brief, g.title, g.lyricist_id, g.composer_id, g.reviewer_id
      FROM studio_guest_songs g JOIN jobs j ON j.id = g.session_id
      WHERE g.work_id IS NULL AND g.auto_generate = 1 AND j.state = 'awaiting_human' AND json_extract(j.result_json, '$.status') = 'awaiting_acceptance'
      ORDER BY g.created_at_ms LIMIT 10`).all() as unknown as PendingGuestSong[];
  } finally { database.close(); }
  const eligible = pending.filter((guest) => !blocked.has(guest.project_id));
  if (!eligible.length || !(await canGenerate())) return [];
  const errors: { projectId: string; error: string }[] = [];
  for (const guest of eligible) {
    try {
      const song = await service.generate({ projectId: guest.project_id, brief: guest.brief, title: guest.title, lyricistId: guest.lyricist_id, composerId: guest.composer_id, reviewerId: guest.reviewer_id });
      const updated = openDatabase(databasePath);
      try {
        const result = updated.prepare("UPDATE studio_guest_songs SET work_id = ? WHERE project_id = ? AND (work_id IS NULL OR work_id = ?)").run(song.workId, guest.project_id, song.workId);
        if (result.changes !== 1) throw new Error("ERR_GUEST_WORK_MISMATCH");
        updated.prepare("UPDATE jobs SET error_code = NULL WHERE id = (SELECT session_id FROM studio_guest_songs WHERE project_id = ?)").run(guest.project_id);
      } finally { updated.close(); }
    } catch (error) {
      blocked.add(guest.project_id);
      const message = error instanceof Error ? error.message : "ERR_GUEST_AUDIO";
      const failed = openDatabase(databasePath);
      try { failed.prepare("UPDATE jobs SET error_code = ? WHERE id = (SELECT session_id FROM studio_guest_songs WHERE project_id = ?)").run(message.slice(0, 128), guest.project_id); }
      finally { failed.close(); }
      errors.push({ projectId: guest.project_id, error: message });
    }
  }
  return errors;
}
