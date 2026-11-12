export interface ByteRange { readonly start: number; readonly end: number; }

export function parseSingleByteRange(header: string | null, size: number): ByteRange | null {
  if (header === null) return null;
  if (!Number.isSafeInteger(size) || size < 1) throw new Error("Invalid media size");
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) throw new Error("Invalid byte range");
  const left = match[1];
  const right = match[2];
  if (!left) {
    const suffix = Number(right);
    if (!Number.isSafeInteger(suffix) || suffix < 1) throw new Error("Invalid byte suffix");
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(left);
  const end = right ? Number(right) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) throw new Error("Unsatisfiable byte range");
  return { start, end: Math.min(end, size - 1) };
}
