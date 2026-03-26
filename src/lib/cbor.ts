// Minimal CBOR encoder for eth-sign-request.
// Only supports the types needed: uint, bytes, text, array, map (integer keys), bool, tag.

function majorType(major: number, n: number): number[] {
  const base = major << 5;
  if (n <= 23) return [base | n];
  if (n <= 0xff) return [base | 0x18, n];
  if (n <= 0xffff) return [base | 0x19, (n >> 8) & 0xff, n & 0xff];
  return [
    base | 0x1a,
    (n >> 24) & 0xff,
    (n >> 16) & 0xff,
    (n >> 8) & 0xff,
    n & 0xff,
  ];
}

export function encodeItem(value: unknown): number[] {
  if (typeof value === "boolean") {
    return [value ? 0xf5 : 0xf4];
  }
  if (typeof value === "number") {
    return majorType(0, value);
  }
  if (value instanceof Uint8Array) {
    return [...majorType(2, value.length), ...value];
  }
  if (typeof value === "string") {
    const bytes = new TextEncoder().encode(value);
    return [...majorType(3, bytes.length), ...bytes];
  }
  if (Array.isArray(value)) {
    return [...majorType(4, value.length), ...value.flatMap(encodeItem)];
  }
  if (value instanceof CborTag) {
    return [...majorType(6, value.tag), ...encodeItem(value.value)];
  }
  if (value instanceof Map) {
    const entries = [...value.entries()];
    return [
      ...majorType(5, entries.length),
      ...entries.flatMap(([k, v]) => [...encodeItem(k), ...encodeItem(v)]),
    ];
  }
  throw new Error(`Unsupported CBOR value: ${typeof value}`);
}

export class CborTag {
  tag: number;
  value: unknown;
  constructor(tag: number, value: unknown) {
    this.tag = tag;
    this.value = value;
  }
}

export function encode(value: unknown): Uint8Array {
  return new Uint8Array(encodeItem(value));
}
