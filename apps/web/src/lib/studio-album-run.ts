export interface AlbumRun {
  readonly accountId: string;
  readonly projectId: string;
  readonly title: string;
  readonly concept: string;
  readonly lyricistId: string;
  readonly composerId: string;
  readonly reviewerId: string;
  readonly deadlines: readonly [number, number];
  readonly stage: number;
  readonly songIds: readonly string[];
  readonly albumId?: string;
}

export const albumRunStorageKey = "studioAlbumRunV1";

export function trackBrief(concept: string, track: 0 | 1): string {
  return `${concept.trim()}\n\nThis is track ${track + 1} of a two-song album. ${track === 0 ? "Make an opening song that introduces the album's central image and leaves room for the story to develop." : "Make a distinct closing song that answers or transforms the opening track's central image. Use a different musical energy while keeping the album coherent."}`;
}

export function trackTitle(title: string, track: 0 | 1): string {
  return `${title.trim().slice(0, 146)} — ${track === 0 ? "I" : "II"}`;
}

export function isAlbumRun(value: unknown, accountId: string): value is AlbumRun {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const run = value as Record<string, unknown>;
  return run.accountId === accountId && typeof run.projectId === "string" && /^project-album-[0-9a-f-]{36}$/.test(run.projectId) && typeof run.title === "string" && run.title.length >= 3 && run.title.length <= 120 && typeof run.concept === "string" && run.concept.length >= 20 && run.concept.length <= 1600 && typeof run.lyricistId === "string" && typeof run.composerId === "string" && typeof run.reviewerId === "string" && Array.isArray(run.deadlines) && run.deadlines.length === 2 && run.deadlines.every((deadline) => Number.isSafeInteger(deadline)) && Number.isInteger(run.stage) && Number(run.stage) >= 0 && Number(run.stage) <= 6 && Array.isArray(run.songIds) && run.songIds.every((id) => typeof id === "string") && (run.albumId === undefined || typeof run.albumId === "string");
}
