import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const hashPattern = /^[a-f0-9]{64}$/;

/** Content-addressed media on a persistent local volume. Access control belongs to the API layer. */
export class StudioMediaStore {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
    mkdirSync(this.root, { recursive: true });
  }

  put(bytes: Uint8Array): { readonly hash: string; readonly sizeBytes: number } {
    if (bytes.byteLength < 1 || bytes.byteLength > 500_000_000) throw new Error("Invalid media size");
    const hash = createHash("sha256").update(bytes).digest("hex");
    const destination = join(this.root, `${hash}.bin`);
    const temporary = join(this.root, `${hash}.${randomBytes(8).toString("hex")}.tmp`);
    try {
      writeFileSync(temporary, bytes, { flag: "wx", mode: 0o600 });
      renameSync(temporary, destination);
    } finally {
      rmSync(temporary, { force: true });
    }
    return { hash, sizeBytes: bytes.byteLength };
  }

  get(hash: string): Uint8Array {
    if (!hashPattern.test(hash)) throw new Error("Invalid media hash");
    const bytes = readFileSync(join(this.root, `${hash}.bin`));
    if (createHash("sha256").update(bytes).digest("hex") !== hash) throw new Error("Media hash mismatch");
    return Uint8Array.from(bytes);
  }
}
