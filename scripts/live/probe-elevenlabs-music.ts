import { createHash } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateMusicMp3 } from "../../apps/worker/src/studio/media-validation.ts";

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey || /replace|placeholder|your-key/i.test(apiKey)) throw new Error("ELEVENLABS_API_KEY is not configured");
const directory = resolve("private/studio-v2/live-provider-probes");
await mkdir(directory, { recursive: true });
const priorFiles = (await readdir(directory)).filter((name) => /^[a-f0-9]{64}\.mp3$/.test(name));
if (priorFiles.length > 0) {
  console.log(JSON.stringify({ status: "already_verified", files: priorFiles.length, message: "Existing valid Music API probe retained; no credits spent." }));
  process.exit(0);
}
if (!process.argv.includes("--execute")) {
  console.log(JSON.stringify({ status: "dry_run", model: "music_v2_5", durationMs: 10_000, message: "No credits spent. Pass --execute for one live probe." }));
  process.exit(0);
}

const response = await fetch("https://api.elevenlabs.io/v1/music", {
  method: "POST",
  headers: {
    "xi-api-key": apiKey,
    "content-type": "application/json",
    accept: "audio/mpeg"
  },
  body: JSON.stringify({
    prompt: "An original 10-second gentle acoustic folk song with clear English sung vocals. Sing: Morning light is on the river, and the day begins anew. Warm guitar, soft strings, no imitation of any existing artist or song.",
    music_length_ms: 10_000,
    model_id: "music_v2_5",
    force_instrumental: false
  }),
  signal: AbortSignal.timeout(180_000)
});

if (!response.ok) {
  const body = (await response.text()).slice(0, 1500);
  let detail: unknown = body;
  try { detail = JSON.parse(body) as unknown; } catch { /* Keep bounded plain-text error. */ }
  console.log(JSON.stringify({ status: "rejected", httpStatus: response.status, requestId: response.headers.get("request-id") ?? response.headers.get("x-request-id"), detail }));
  process.exitCode = 1;
} else {
  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
  if (contentType !== "audio/mpeg" && contentType !== "audio/mp3" && contentType !== "application/octet-stream") throw new Error(`Unexpected content type: ${contentType}`);
  const inspected = await validateMusicMp3(bytes, 10_000);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const path = resolve(directory, `${hash}.mp3`);
  await writeFile(path, bytes, { flag: "wx" }).catch((error: unknown) => {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
  });
  console.log(JSON.stringify({ status: "working", httpStatus: response.status, provider: "elevenlabs", model: "music_v2_5", assetHash: hash, path, contentType, durationMs: inspected.durationMs, sizeBytes: inspected.sizeBytes, requestId: response.headers.get("request-id") ?? response.headers.get("x-request-id") }));
}
