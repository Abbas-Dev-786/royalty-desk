import { openDatabase } from "@royaltydesk/persistence";
import type { AgentModel } from "../../src/agents/types.ts";
import { runCreativeModelStep } from "../../src/studio/creative-model.ts";

const databasePath = process.argv[2];
if (!databasePath) throw new Error("Database path required");
const database = openDatabase(databasePath);
const model: AgentModel = {
  mode: "fixture",
  complete: async () => {
    process.stdout.write("MODEL_STARTED\n");
    setInterval(() => undefined, 1000);
    return new Promise(() => undefined);
  }
};
await runCreativeModelStep(database, model, { projectId: "project-a", agentId: "lyricist", role: "lyrics", revision: 0, brief: "Original song", context: "Verse", maxCalls: 1, maxOutputTokens: 100 });
