import { trackBrief, trackTitle } from "./studio-album-run.ts";

export type StudioProjectAccess =
  | { readonly kind: "album_owner"; readonly studioId: string; readonly accountId: string; readonly title: string; readonly concept: string; readonly lyricistId: string; readonly composerId: string; readonly reviewerId: string }
  | { readonly kind: "admin"; readonly studioId: string; readonly accountId: string };

export function requireAlbumTrackAccess(access: StudioProjectAccess, brief: string, lyricistId: string, composerId: string, reviewerId: string, title?: string): void {
  if (access.kind !== "album_owner") return;
  if (lyricistId !== access.lyricistId || composerId !== access.composerId || reviewerId !== access.reviewerId) throw new Error("ERR_ALBUM_AGENT_SCOPE");
  const track = ([0, 1] as const).find((index) => brief === trackBrief(access.concept, index) && (title === undefined || title === trackTitle(access.title, index)));
  if (track === undefined) throw new Error("ERR_ALBUM_TRACK_SCOPE");
}
