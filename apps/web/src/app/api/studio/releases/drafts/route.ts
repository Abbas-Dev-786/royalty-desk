import { requireOrigin } from "@/server/runtime";
import { requireStudioAdmin } from "@/server/studio-admin";
import { acceptedStudioReleaseInput } from "@/server/studio-release-draft";
import { studioContractClient } from "@/server/studio-catalogue";

export async function POST(request: Request): Promise<Response> {
  try {
    requireOrigin(request);
    const { studioId } = await requireStudioAdmin();
    const body = await request.json() as { workId?: unknown; version?: unknown };
    if (typeof body.workId !== "string" || !Number.isSafeInteger(body.version)) return Response.json({ error: "ERR_RELEASE_INPUT" }, { status: 400 });
    const chain = studioContractClient();
    const policy = await chain.policy();
    if (policy.paused) return Response.json({ error: "ERR_STUDIO_PAUSED" }, { status: 409 });
    const input = acceptedStudioReleaseInput(studioId, body.workId, Number(body.version), policy.epoch);
    if (input.kind === "album") {
      for (const track of input.tracks) {
        const song = await chain.release(track.song_id, track.song_version);
        if (!song?.published) return Response.json({ error: `ERR_ALBUM_SONG_UNPUBLISHED:${track.song_id}:v${track.song_version}` }, { status: 409 });
      }
    }
    const existing = await chain.release(input.work_id, input.version);
    if (existing) {
      const same = (Object.keys(input) as (keyof typeof input)[]).every((key) => JSON.stringify(existing[key]) === JSON.stringify(input[key]));
      if (!same) throw new Error("ERR_RELEASE_CHAIN_MISMATCH");
    }
    return Response.json({ input, contractId: chain.contractId, existsOnChain: Boolean(existing), commitment: existing?.commitment ?? null }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERR_RELEASE_DRAFT";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : message === "ERR_FORBIDDEN" ? 403 : 409 });
  }
}
