import type { ScannedUR } from "./types";
import { decode as cborDecode, type TagDecoder } from "cborg";

export interface BtcSignatureResult {
  /** Base64-encoded compact signature (65 bytes) */
  signature: string;
  /** Hex-encoded compressed public key (33 bytes) */
  publicKey: string;
}

export function parseBtcSignature(scanned: ScannedUR): BtcSignatureResult {
  if (scanned.type !== "btc-signature") {
    throw new Error(`Expected btc-signature, got: ${scanned.type}`);
  }

  const map = cborDecode(scanned.cbor, {
    useMaps: true,
    tags: Object.assign([] as TagDecoder[], { 37: (v: unknown) => v }),
  }) as Map<number, unknown>;

  const sigBytes = map.get(2) as Uint8Array | undefined;
  const pubKeyBytes = map.get(3) as Uint8Array | undefined;

  if (!sigBytes || sigBytes.length < 64) {
    throw new Error("Invalid or missing signature bytes");
  }

  const signature = btoa(String.fromCharCode(...sigBytes));
  const publicKey = pubKeyBytes
    ? [...pubKeyBytes].map((b) => b.toString(16).padStart(2, "0")).join("")
    : "";

  return { signature, publicKey };
}
