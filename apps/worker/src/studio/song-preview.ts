const heading = /^(?:(?:verse|pre-chorus|chorus|final chorus|bridge|intro|outro|coda)(?:\s+\d+)?:?|\[[^\]]+\])$/i;
const chorusHeading = /^(?:chorus(?:\s+\d+)?:?|\[chorus(?:\s+\d+)?\])$/i;

/** Keep a 20-second preview to a few sung lines from the first chorus. */
export function selectSongPreviewLyrics(lyrics: string): string {
  const lines = lyrics.replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean);
  const chorusIndex = lines.findIndex((line) => chorusHeading.test(line));
  const excerpt: string[] = [];
  if (chorusIndex >= 0) {
    for (const line of lines.slice(chorusIndex + 1)) {
      if (heading.test(line) || excerpt.length === 4) break;
      excerpt.push(line.slice(0, 200));
    }
  }
  const selected = excerpt.length >= 2 ? excerpt : lines.filter((line) => !heading.test(line)).slice(0, 4).map((line) => line.slice(0, 200));
  if (!selected.length) throw new Error("ERR_SONG_PREVIEW_LYRICS");
  return `[${excerpt.length >= 2 ? "Chorus" : "Verse"}]\n${selected.join("\n")}`;
}
