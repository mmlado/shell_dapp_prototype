import type { ScannedUR } from "./types";
import { decode as cborDecode, type TagDecoder } from "cborg";

export function parseEthSignature(scanned: ScannedUR): string {
  if (scanned.type !== "eth-signature") {
    throw new Error(`Expected eth-signature, got: ${scanned.type}`);
  }

  const passthrough = (v: unknown) => v;
  const map = cborDecode(scanned.cbor, {
    useMaps: true,
    tags: Object.assign([] as TagDecoder[], { 37: passthrough }), // UUID tag on request-id
  }) as Map<number, unknown>;
  const sigBytes = map.get(2) as Uint8Array | undefined;

  if (!sigBytes || sigBytes.length < 64) {
    throw new Error("Invalid or missing signature bytes");
  }

  return (
    "0x" + [...sigBytes].map((b) => b.toString(16).padStart(2, "0")).join("")
  );
}
