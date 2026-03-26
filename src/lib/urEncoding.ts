import { UR, UREncoder } from "@ngraveio/bc-ur";

export function encodeURParts(
  cbor: Uint8Array,
  type: string,
  maxFragmentLength = 200,
): string[] {
  const ur = new UR(Buffer.from(cbor), type);
  const encoder = new UREncoder(ur, maxFragmentLength);

  return Array.from({ length: encoder.fragmentsLength }, () =>
    encoder.nextPart().toUpperCase(),
  );
}

export function encodeURFirstPart(
  cbor: Uint8Array,
  type: string,
  maxFragmentLength = 200,
): string {
  return encodeURParts(cbor, type, maxFragmentLength)[0];
}
