import { validateMusicPlan, type ElevenLabsSongRequest, type MusicPlanChunk } from "./elevenlabs-music-provider.ts";

const section = /^(?:\[([^\]]+)\]|(verse|pre-chorus|chorus|final chorus|bridge|intro|outro|coda)(?:\s+\d+)?:?)$/i;

/** Preserve every approved lyric line while respecting ElevenLabs' per-chunk limits. */
export function buildSongPlan(lyrics: string, composition: string): ElevenLabsSongRequest {
  const lines = lyrics.replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length || lines.some((line) => line.length > 200)) throw new Error("ERR_SONG_LYRICS_FORMAT");
  const groups: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    const match = section.exec(line);
    const normalized = match ? `[${match[1] ?? line.replace(/:$/, "")}]` : line;
    if (match && current.length) { groups.push(current); current = []; }
    current.push(normalized);
  }
  if (current.length) groups.push(current);
  const texts: string[] = [];
  for (const group of groups) {
    let chunk: string[] = [];
    for (const line of group) {
      if (chunk.length === 30 || [...chunk, line].join("\n").length > 4000) {
        texts.push(chunk.join("\n"));
        chunk = [];
      }
      chunk.push(line);
    }
    if (chunk.length) texts.push(chunk.join("\n"));
  }
  const style = composition.replace(/\s+/g, " ").trim().slice(0, 160);
  if (!style) throw new Error("ERR_SONG_COMPOSITION_EMPTY");
  const chunks: MusicPlanChunk[] = texts.map((text) => ({
    text,
    durationMs: Math.min(120_000, Math.max(3000, text.split("\n").filter((line) => !section.test(line)).length * 4000)),
    positiveStyles: [style, "clear sung vocals", "polished original recording"],
    negativeStyles: ["spoken word", "named artist imitation", "existing song melody"],
    contextAdherence: "high"
  }));
  // Give a short lyric enough room for a musical intro and ending.
  if (chunks.length === 1) chunks[0] = { ...chunks[0]!, durationMs: Math.max(20_000, chunks[0]!.durationMs) };
  const plan: ElevenLabsSongRequest = { model: "music_v2_5", chunks };
  validateMusicPlan(plan);
  return plan;
}
