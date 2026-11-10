import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

export class EncryptedFileStore {
  readonly #root: string;
  readonly #key: Buffer;

  constructor(root: string, secret: string) {
    if (!isAbsolute(root) || secret.length < 32) throw new Error("Encrypted file store requires an absolute path and a 32-character secret");
    this.#root = resolve(root);
    this.#key = createHash("sha256").update(secret).digest();
    mkdirSync(this.#root, { recursive: true, mode: 0o700 });
  }

  put(storageKey: string, plaintext: Uint8Array): void {
    if (!/^[a-f0-9]{32,128}$/.test(storageKey) || plaintext.byteLength > 1_048_576) throw new Error("Invalid private document");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    const file = join(this.#root, `${storageKey}.bin`);
    if (!resolve(file).startsWith(`${this.#root}${process.platform === "win32" ? "\\" : "/"}`)) throw new Error("Invalid storage path");
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    writeFileSync(file, Buffer.concat([iv, tag, ciphertext]), { mode: 0o600 });
  }

  get(storageKey: string): Uint8Array {
    if (!/^[a-f0-9]{32,128}$/.test(storageKey)) throw new Error("Invalid private document");
    const payload = readFileSync(join(this.#root, `${storageKey}.bin`));
    if (payload.byteLength < 28) throw new Error("Encrypted document is corrupt");
    const decipher = createDecipheriv("aes-256-gcm", this.#key, payload.subarray(0, 12));
    decipher.setAuthTag(payload.subarray(12, 28));
    return new Uint8Array(Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]));
  }
}
