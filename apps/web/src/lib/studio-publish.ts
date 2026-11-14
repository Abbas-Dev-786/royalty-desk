/** Poll one worker operation; HTTP 202 is progress, never completion. */
export async function finishStudioPublication(projectId: string): Promise<Response> {
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    const response = await fetch("/api/studio/guest/song", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId, action: "publish" }), signal: AbortSignal.timeout(15_000)
    });
    if (response.status !== 202) return response;
    await response.body?.cancel();
    await new Promise<void>((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error("Publication is still processing. Your recording is saved. Refresh progress before trying Publish again.");
}
