import { parseBuffer } from "music-metadata";
import { MPEGDecoder } from "mpg123-decoder";

export interface ValidatedMusicAudio {
  readonly mimeType: "audio/mpeg";
  readonly durationMs: number;
  readonly sampleRate: number;
  readonly channels: number;
  readonly codec: string;
  readonly sizeBytes: number;
  readonly rmsLevel: number;
  readonly peakLevel: number;
}

export async function validateMusicMp3(bytes: Uint8Array, expectedDurationMs?: number): Promise<ValidatedMusicAudio> {
  if (bytes.byteLength < 4096 || bytes.byteLength > 50_000_000) throw new Error("ERR_MUSIC_SIZE");
  if (expectedDurationMs !== undefined && (!Number.isSafeInteger(expectedDurationMs) || expectedDurationMs < 3000 || expectedDurationMs > 600_000)) throw new Error("ERR_MUSIC_EXPECTED_DURATION");
  let parsed;
  try {
    parsed = await parseBuffer(bytes, { mimeType: "audio/mpeg", size: bytes.byteLength }, { duration: true, skipCovers: true, maxMemoryAllocation: 2_000_000, maxMetadataEntries: 1000 });
  } catch {
    throw new Error("ERR_MUSIC_CORRUPT");
  }
  const { container, codec, duration, sampleRate, numberOfChannels } = parsed.format;
  if (!container?.toUpperCase().includes("MPEG") || !codec || !/LAYER\s*(?:3|III)|MP3/i.test(codec)) throw new Error("ERR_MUSIC_UNSUPPORTED_CODEC");
  if (duration === undefined || !Number.isFinite(duration) || duration < 3 || duration > 600 || !sampleRate || sampleRate < 8000 || !numberOfChannels || numberOfChannels < 1 || numberOfChannels > 2) throw new Error("ERR_MUSIC_INVALID_FORMAT");
  const durationMs = Math.round(duration * 1000);
  if (expectedDurationMs !== undefined && Math.abs(durationMs - expectedDurationMs) > Math.max(3000, Math.round(expectedDurationMs * 0.2))) throw new Error("ERR_MUSIC_DURATION_MISMATCH");
  const decoder = new MPEGDecoder();
  let rmsLevel: number;
  let peakLevel: number;
  try {
    await decoder.ready;
    const decoded = decoder.decode(bytes);
    if (decoded.errors.length || decoded.sampleRate !== sampleRate || decoded.channelData.length < 1 || decoded.channelData.length > 2 || decoded.samplesDecoded < sampleRate * 3) throw new Error("ERR_MUSIC_DECODE");
    let squares = 0;
    let count = 0;
    let peak = 0;
    for (const channel of decoded.channelData) {
      for (const sample of channel) {
        if (!Number.isFinite(sample)) throw new Error("ERR_MUSIC_DECODE");
        squares += sample * sample;
        peak = Math.max(peak, Math.abs(sample));
        count += 1;
      }
    }
    rmsLevel = Math.sqrt(squares / count);
    peakLevel = peak;
    if (rmsLevel < 0.001 || peakLevel < 0.005) throw new Error("ERR_MUSIC_SILENT");
  } finally { decoder.free(); }
  return { mimeType: "audio/mpeg", durationMs, sampleRate, channels: numberOfChannels, codec, sizeBytes: bytes.byteLength, rmsLevel, peakLevel };
}
